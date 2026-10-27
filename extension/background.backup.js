"use strict";
(() => {
  // extension/tracker.ts
  function sanitizeDomain(url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  function createActivity(session, endedAt) {
    const durationMs = Math.max(0, endedAt - session.startedAt);
    if (durationMs < 1e3) return null;
    return {
      domain: session.domain,
      startedAt: session.startedAt,
      endedAt,
      durationMs
    };
  }

  // extension/storage.ts
  var DB_NAME = "BrowseLensDB";
  var DB_VERSION = 1;
  var STORE_NAME = "activities";
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id",
            autoIncrement: true
          });
          store.createIndex("startedAt", "startedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function saveActivity(activity) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).add(activity);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }
  async function getActivities() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        db.close();
        resolve(
          request.result.sort(
            (a, b) => b.startedAt - a.startedAt
          )
        );
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  }

  // extension/background.ts
  var SESSION_KEY = "browselens_active_session";
  var ENABLED_KEY = "browselens_enabled";
  var currentSession = null;
  var trackingEnabled = true;
  var initialized = false;
  var transitionQueue = Promise.resolve();
  function enqueue(task) {
    transitionQueue = transitionQueue.then(task).catch((error) => console.error("BrowseLens tracking error:", error));
  }
  async function loadState() {
    const data = await chrome.storage.local.get([
      SESSION_KEY,
      ENABLED_KEY
    ]);
    trackingEnabled = data[ENABLED_KEY] !== false;
    currentSession = null;
    await chrome.storage.local.remove(SESSION_KEY);
    initialized = true;
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    if (trackingEnabled && tab?.url) {
      await startSession(tab.url);
    }
  }
  async function finishSession() {
    const session = currentSession;
    currentSession = null;
    await chrome.storage.local.remove(SESSION_KEY);
    if (!session) return;
    const activity = createActivity(session, Date.now());
    if (activity) {
      await saveActivity(activity);
    }
  }
  async function startSession(url) {
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
  async function changeActiveTab(url) {
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
  chrome.windows.onFocusChanged.addListener((windowId) => {
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
  chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
    if (message?.type === "GET_ACTIVITIES") {
      getActivities().then((activities) => sendResponse({ activities })).catch((error) => {
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
  });
  enqueue(loadState);
})();
