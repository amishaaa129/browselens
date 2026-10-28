import { createActivity, sanitizeDomain } from "./tracker";
import type { ActiveSession } from "./tracker";
import { getActivities, saveActivity } from "./storage";
import { classifyDomain } from "./classification";

const SESSION_KEY = "browselens_active_session";
const ENABLED_KEY = "browselens_enabled";

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

  // Restore the saved session instead of discarding it.
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

  // If the active website is unchanged, preserve its original start time.
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
    startedAt: Date.now()
  };

  await chrome.storage.local.set({
    [SESSION_KEY]: currentSession
  });
}

async function changeActiveTab(url?: string): Promise<void> {
  if (!initialized) return;

  await finishSession();

  if (trackingEnabled) {
    await startSession(url);
  }
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
      lastFocusedWindow: true
    });

    if (activeTab?.id === tabId) {
      await changeActiveTab(tab.url);
    }
  });
});

chrome.windows.onFocusChanged.addListener(windowId => {
  enqueue(async () => {
    await finishSession();

    if (windowId === chrome.windows.WINDOW_ID_NONE || !trackingEnabled) {
      return;
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      windowId
    });

    await startSession(tab?.url);
  });
});

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    
if (message?.type === "GET_ACTIVITIES") {
  transitionQueue
    .then(() => getActivities())
    .then(activities => sendResponse({ activities }))
    .catch(error => {
      console.error("Failed to read activities:", error);
      sendResponse({ activities: [], error: "Storage read failed" });
    });

  return true;
}


    if (message?.type === "GET_STATUS") {
      sendResponse({ enabled: trackingEnabled });
      return;
    }

    if (message?.type === "SET_TRACKING") {
      enqueue(async () => {
        trackingEnabled = Boolean(message.enabled);

        await chrome.storage.local.set({
          [ENABLED_KEY]: trackingEnabled
        });

        await finishSession();

        if (trackingEnabled) {
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true
          });

          await startSession(tab?.url);
        }

        sendResponse({ enabled: trackingEnabled });
      });

      return true;
    }
  }
);

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard/index.html"),
  });
});

enqueue(loadState);
