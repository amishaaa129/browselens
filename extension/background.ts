
import { createActivity, sanitizeDomain } from "./tracker";
import type { ActiveSession } from "./tracker";
import { getActivities, saveActivity } from "./storage";
import { classifyDomain } from "./classification";
import {
  checkFocusDistraction,
  getFocusSettings,
  updateFocusSettings,
} from "./focusGuardian";

const SESSION_KEY = "browselens_active_session";
const ENABLED_KEY = "browselens_enabled";
const FOCUS_ALARM = "browselens_focus_check";

let currentSession: ActiveSession | null = null;
let trackingEnabled = true;
let initialized = false;
let transitionQueue: Promise<void> = Promise.resolve();

chrome.runtime.onStartup.addListener(() => {
  console.log("BrowseLens: onStartup()");
});

function enqueue(task: () => Promise<void>): void {
  transitionQueue = transitionQueue
    .then(task)
    .catch(error => console.error("BrowseLens tracking error:", error));
}

async function loadState(): Promise<void> {
  const data = await chrome.storage.local.get([
    SESSION_KEY,
    ENABLED_KEY,
  ]);

  trackingEnabled = data[ENABLED_KEY] !== false;

  const savedSession = data[SESSION_KEY] as ActiveSession | undefined;
  currentSession = savedSession ?? null;

  initialized = true;

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });

  if (!trackingEnabled || !tab?.url) {
    await finishSession();
    return;
  }

  const domain = sanitizeDomain(tab.url);

  if (!domain) {
    await finishSession();
    return;
  }

  // Preserve the original start time if the active domain is unchanged.
  if (currentSession?.domain === domain) {
    return;
  }

  await finishSession();
  await startSession(tab.url);
}

async function finishSession(): Promise<void> {
  const session = currentSession;
  currentSession = null;

  await chrome.storage.local.remove(SESSION_KEY);

  if (!session) return;

  const activity = createActivity(session, Date.now());

  if (activity) {
    activity.category = classifyDomain(activity.domain);
    await saveActivity(activity);
  }
}

async function startSession(url: string | undefined): Promise<void> {
  if (!trackingEnabled || !url) return;

  const domain = sanitizeDomain(url);
  if (!domain) return;

  currentSession = {
    domain,
    startedAt: Date.now(),
  };

  await chrome.storage.local.set({
    [SESSION_KEY]: currentSession,
  });
}


async function changeActiveTab(url?: string): Promise<void> {
  if (!initialized) return;

  if (!trackingEnabled || !url) {
    await finishSession();
    return;
  }

  const domain = sanitizeDomain(url);

  if (!domain) {
    await finishSession();
    return;
  }

  // Preserve the timer when the user is still on the same domain.
  if (currentSession?.domain === domain) {
    console.log(
      "[BrowseLens] Same domain detected. Preserving session:",
      domain
    );
    return;
  }

  await finishSession();
  await startSession(url);
}


chrome.runtime.onStartup.addListener(() => {
  enqueue(loadState);
});

chrome.runtime.onInstalled.addListener(() => {
  enqueue(loadState);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  enqueue(async () => {
    const tab = await chrome.tabs.get(tabId);
    await changeActiveTab(tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;

  enqueue(async () => {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });

    if (activeTab?.id === tabId) {
      await changeActiveTab(tab.url);
    }
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  // Ignore temporary loss of focus.
  // Do not destroy the active browsing session.
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log("[BrowseLens] No focused window. Preserving session.");
    return;
  }

  enqueue(async () => {
    if (!trackingEnabled) {
      await finishSession();
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      windowId,
    });

    if (tab?.url) {
      await changeActiveTab(tab.url);
    }
  });
});

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    // Retrieve recorded activities.
    if (message?.type === "GET_ACTIVITIES") {
      transitionQueue
        .then(() => getActivities())
        .then(activities => sendResponse({ activities }))
        .catch(error => {
          console.error("Failed to read activities:", error);
          sendResponse({
            activities: [],
            error: "Storage read failed",
          });
        });

      return true;
    }

    // Retrieve tracking status.
    if (message?.type === "GET_STATUS") {
      sendResponse({ enabled: trackingEnabled });
      return;
    }

    // Enable or disable activity tracking.
    if (message?.type === "SET_TRACKING") {
      enqueue(async () => {
        trackingEnabled = Boolean(message.enabled);

        await chrome.storage.local.set({
          [ENABLED_KEY]: trackingEnabled,
        });

        await finishSession();

        if (trackingEnabled) {
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });

          await startSession(tab?.url);
        }

        sendResponse({ enabled: trackingEnabled });
      });

      return true;
    }

    // Retrieve Focus Guardian settings.
    if (message?.type === "GET_FOCUS_SETTINGS") {
      getFocusSettings()
        .then(settings => sendResponse({ settings }))
        .catch(error => {
          console.error("Failed to get focus settings:", error);
          sendResponse({
            error: "Could not load focus settings",
          });
        });

      return true;
    }

    // Update Focus Guardian settings.
    if (message?.type === "SET_FOCUS_SETTINGS") {
      updateFocusSettings(message.settings)
        .then(settings => sendResponse({ settings }))
        .catch(error => {
          console.error("Failed to update focus settings:", error);
          sendResponse({
            error: "Could not update focus settings",
          });
        });

      return true;
    }
  }
);

// Open the dashboard when the extension icon is clicked.
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard/index.html"),
  });
});

// Check for distractions every minute.
chrome.alarms.onAlarm.addListener(alarm => {
  console.log("[BrowseLens] Alarm fired:", alarm.name);

  if (alarm.name !== FOCUS_ALARM) return;

  enqueue(async () => {
    console.log("[BrowseLens] Current session:", currentSession);

    if (!initialized || !trackingEnabled || !currentSession) {
      console.log("[BrowseLens] Cannot check distraction");
      return;
    }

    await checkFocusDistraction(
      currentSession.domain,
      currentSession.startedAt
    );
  });
});

// Ensure the alarm exists after the service worker starts.
chrome.alarms.create(FOCUS_ALARM, {
  periodInMinutes: 1,
});

// Initialize tracking.
enqueue(loadState);
