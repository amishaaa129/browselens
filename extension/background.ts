
import { createActivity, sanitizeDomain } from "./tracker";
import type { ActiveSession } from "./tracker";
import { getActivities, saveActivity } from "./storage";
import { classifyDomain } from "./classification";

import {
  checkFocusDistraction,
  getFocusSettings,
  updateFocusSettings,
  updateProductivityRules,
  snoozeFocus,
} from "./focusGuardian";

// --------------------------------------------------
// CONSTANTS
// --------------------------------------------------

const SESSION_KEY = "browselens_active_session";
const ENABLED_KEY = "browselens_enabled";
const FOCUS_ALARM = "browselens_focus_check";
const LAST_SEEN_KEY = "browselens_last_seen";

const RECOVERY_THRESHOLD = 2 * 60 * 1000;

// --------------------------------------------------
// STATE
// --------------------------------------------------

let currentSession: ActiveSession | null = null;
let trackingEnabled = true;
let initialized = false;

let transitionQueue: Promise<void> = Promise.resolve();

// --------------------------------------------------
// QUEUE
// --------------------------------------------------

function enqueue(task: () => Promise<void>): void {
  transitionQueue = transitionQueue
    .then(task)
    .catch(error => {
      console.error("[BrowseLens] Tracking error:", error);
    });
}

// --------------------------------------------------
// FINISH SESSION
// --------------------------------------------------

async function finishSession(
  endTime = Date.now()
): Promise<void> {
  const session = currentSession;

  currentSession = null;

  await chrome.storage.local.remove([
    SESSION_KEY,
    LAST_SEEN_KEY,
  ]);

  if (!session) return;

  const activity = createActivity(session, endTime);

  if (activity) {
    activity.category = classifyDomain(activity.domain);

    await saveActivity(activity);

    console.log(
      "[BrowseLens] Session saved:",
      activity.domain
    );
  }
}

// --------------------------------------------------
// START SESSION
// --------------------------------------------------

async function startSession(
  url: string | undefined
): Promise<void> {
  if (!trackingEnabled || !url) return;

  const domain = sanitizeDomain(url);

  if (!domain) return;

  const now = Date.now();

  currentSession = {
    domain,
    startedAt: now,
  };

  await chrome.storage.local.set({
    [SESSION_KEY]: currentSession,
    [LAST_SEEN_KEY]: now,
  });

  console.log("[BrowseLens] Session started:", domain);
}

// --------------------------------------------------
// LOAD / RECOVER STATE
// --------------------------------------------------

async function loadState(): Promise<void> {
  const data = await chrome.storage.local.get([
    SESSION_KEY,
    ENABLED_KEY,
    LAST_SEEN_KEY,
  ]);

  trackingEnabled = data[ENABLED_KEY] !== false;

  const savedSession = data[SESSION_KEY] as
    | ActiveSession
    | undefined;

  const lastSeen = Number(data[LAST_SEEN_KEY] ?? 0);

  currentSession = savedSession ?? null;

  // Recover stale sessions after a long interruption.
  // The previous session is closed at its last recorded
  // activity time rather than counting the offline gap.
  if (
    currentSession &&
    lastSeen &&
    Date.now() - lastSeen > RECOVERY_THRESHOLD
  ) {
    console.log(
      "[BrowseLens] Recovering stale session:",
      currentSession.domain
    );

    const recoveredEndTime = Math.max(
      currentSession.startedAt,
      lastSeen
    );

    await finishSession(recoveredEndTime);
  }

  initialized = true;

  // Find the currently active browser tab.
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

  // Preserve the original session if the domain
  // is unchanged and the session was not recovered.
  if (currentSession?.domain === domain) {
    await chrome.storage.local.set({
      [LAST_SEEN_KEY]: Date.now(),
    });

    console.log(
      "[BrowseLens] Restored existing session:",
      domain
    );

    return;
  }

  await finishSession();
  await startSession(tab.url);
}

// --------------------------------------------------
// CHANGE ACTIVE TAB
// --------------------------------------------------

async function changeActiveTab(
  url?: string
): Promise<void> {
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

  // Do not restart the timer for the same domain.
  if (currentSession?.domain === domain) {
    await chrome.storage.local.set({
      [LAST_SEEN_KEY]: Date.now(),
    });

    return;
  }

  await finishSession();
  await startSession(url);
}

// --------------------------------------------------
// EXTENSION LIFECYCLE
// --------------------------------------------------

chrome.runtime.onStartup.addListener(() => {
  console.log("[BrowseLens] Browser started.");

  enqueue(loadState);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[BrowseLens] Extension installed or updated.");

  enqueue(loadState);
});

// --------------------------------------------------
// TAB ACTIVATION
// --------------------------------------------------

chrome.tabs.onActivated.addListener(({ tabId }) => {
  enqueue(async () => {
    const tab = await chrome.tabs.get(tabId);

    await changeActiveTab(tab.url);
  });
});

// --------------------------------------------------
// TAB URL UPDATE
// --------------------------------------------------

chrome.tabs.onUpdated.addListener(
  (tabId, changeInfo, tab) => {
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
  }
);

// --------------------------------------------------
// WINDOW FOCUS
// --------------------------------------------------

chrome.windows.onFocusChanged.addListener(windowId => {
  // Preserve the session when Chrome temporarily loses focus.
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    console.log(
      "[BrowseLens] No focused window. Preserving session."
    );

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

// --------------------------------------------------
// MESSAGE HANDLING
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {

    // ----------------------------------------------
    // GET ACTIVITIES
    // ----------------------------------------------

    if (message?.type === "GET_ACTIVITIES") {
      transitionQueue
        .then(() => getActivities())
        .then(activities => {
          sendResponse({ activities });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to read activities:",
            error
          );

          sendResponse({
            activities: [],
            error: "Storage read failed",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // GET TRACKING STATUS
    // ----------------------------------------------

    if (message?.type === "GET_STATUS") {
      sendResponse({
        enabled: trackingEnabled,
      });

      return;
    }

    // ----------------------------------------------
    // GET ACTIVE SESSION
    // ----------------------------------------------

    if (message?.type === "GET_ACTIVE_SESSION") {
      transitionQueue
        .then(() => {
          sendResponse({
            session: currentSession,
            enabled: trackingEnabled,
          });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to retrieve session:",
            error
          );

          sendResponse({
            session: null,
            error: "Could not retrieve active session",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // ENABLE / DISABLE TRACKING
    // ----------------------------------------------

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

        sendResponse({
          enabled: trackingEnabled,
        });
      });

      return true;
    }

    // ----------------------------------------------
    // GET FOCUS SETTINGS
    // ----------------------------------------------

    if (message?.type === "GET_FOCUS_SETTINGS") {
      getFocusSettings()
        .then(settings => {
          sendResponse({ settings });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to get focus settings:",
            error
          );

          sendResponse({
            error: "Could not load focus settings",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // UPDATE FOCUS SETTINGS
    // ----------------------------------------------

    if (message?.type === "SET_FOCUS_SETTINGS") {
      updateFocusSettings(message.settings)
        .then(settings => {
          sendResponse({ settings });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to update focus settings:",
            error
          );

          sendResponse({
            error: "Could not update focus settings",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // UPDATE PRODUCTIVITY RULES
    // ----------------------------------------------

    if (message?.type === "SET_PRODUCTIVITY_RULES") {
      updateProductivityRules(message.rules)
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to update productivity rules:",
            error
          );

          sendResponse({
            error: "Could not save productivity rules",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // SNOOZE FOCUS NOTIFICATIONS
    // ----------------------------------------------

    if (message?.type === "SNOOZE_FOCUS") {
      const minutes = Math.min(
        60,
        Math.max(1, Number(message.minutes) || 10)
      );

      snoozeFocus(minutes)
        .then(snoozeUntil => {
          sendResponse({ snoozeUntil });
        })
        .catch(error => {
          console.error(
            "[BrowseLens] Failed to snooze notifications:",
            error
          );

          sendResponse({
            error: "Could not snooze notifications",
          });
        });

      return true;
    }

    // ----------------------------------------------
    // CLEAR ALL LOCAL DATA
    // ----------------------------------------------

    if (message?.type === "CLEAR_ALL_DATA") {
      enqueue(async () => {
        // Stop the active session without saving it.
        // The user explicitly requested deletion.
        currentSession = null;

        await chrome.storage.local.clear();

        // Reset tracking to its default state.
        trackingEnabled = true;
        initialized = true;

        await chrome.storage.local.set({
          [ENABLED_KEY]: true,
        });

        // Remove any existing Focus Guardian alert.
        await chrome.notifications.clear(
          "browselens-focus-alert"
        );

        sendResponse({
          success: true,
        });

        console.log(
          "[BrowseLens] All local extension data cleared."
        );
      });

      return true;
    }

    return;
  }
);

// --------------------------------------------------
// EXTENSION ICON
// --------------------------------------------------

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({
    url: chrome.runtime.getURL(
      "dashboard/index.html"
    ),
  });
});

// --------------------------------------------------
// FOCUS GUARDIAN ALARM
// --------------------------------------------------

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== FOCUS_ALARM) return;

  enqueue(async () => {
    if (
      !initialized ||
      !trackingEnabled ||
      !currentSession
    ) {
      return;
    }

    console.log(
      "[BrowseLens] Checking focus:",
      currentSession.domain
    );

    await checkFocusDistraction(
      currentSession.domain,
      currentSession.startedAt
    );

    await chrome.storage.local.set({
      [LAST_SEEN_KEY]: Date.now(),
    });
  });
});

// --------------------------------------------------
// CREATE ALARM
// --------------------------------------------------

chrome.alarms.create(FOCUS_ALARM, {
  periodInMinutes: 1,
});

// --------------------------------------------------
// INITIALIZE
// --------------------------------------------------

enqueue(loadState);
