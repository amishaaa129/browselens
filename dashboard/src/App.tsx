
import { useCallback, useEffect, useState } from "react";
import { Activity, Clock, Globe, Pause, Play, Trash2 } from "lucide-react";
import { openDB, type DBSchema } from "idb";

interface ActivityRecord {
  id?: number;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

interface BrowseLensDB extends DBSchema {
  activities: {
    key: number;
    value: ActivityRecord;
    indexes: { startedAt: number };
  };
}

const DB_NAME = "BrowseLensDB";
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID;


function sendToExtension(message: object): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error("BrowseLens extension API is unavailable."));
      return;
    }

    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

async function database() {
  return openDB<BrowseLensDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("activities")) {
        const store = db.createObjectStore("activities", {
          keyPath: "id",
          autoIncrement: true
        });
        store.createIndex("startedAt", "startedAt");
      }
    }
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const today = new Date();

  return date.toDateString() === today.toDateString();
}

export default function App() {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
  try {
    if (!("chrome" in window) || !chrome.runtime?.sendMessage) {
      setExtensionAvailable(false);
      setError("BrowseLens extension is not connected.");
      return;
    }

    const response = await sendToExtension({
  type: "GET_ACTIVITIES"
});

    if (response?.error) {
      throw new Error(response.error);
    }

    setActivities(response?.activities ?? []);
    setError("");
  } catch (error) {
    console.error("BrowseLens refresh failed:", error);
    setError(
      "Could not retrieve activity. Reload the extension and dashboard."
    );
  }
}, []);

  const readStatus = useCallback(async () => {
    if (!("chrome" in window) || !chrome.runtime?.sendMessage) {
      setExtensionAvailable(false);
      return;
    }

    try {
     const status = await sendToExtension({
  type: "GET_STATUS"
});
      setEnabled(status?.enabled !== false);
      setExtensionAvailable(true);
    } catch {
      setExtensionAvailable(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void readStatus();

    const interval = window.setInterval(() => {
      void refresh();
      void readStatus();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [refresh, readStatus]);

  async function toggleTracking() {
    try {
      const response = await sendToExtension({
  type: "SET_TRACKING",
  enabled: !enabled
});

      setEnabled(response.enabled);
    } catch {
      setError("Extension not connected. Reload it in chrome://extensions.");
    }
  }

  async function clearHistory() {
    if (!window.confirm("Delete all BrowseLens activity history?")) return;

    const db = await database();
    await db.clear("activities");
    await db.close();

    await refresh();
  }

  const today = activities.filter(row => isToday(row.startedAt));
  const todayDuration = today.reduce((sum, row) => sum + row.durationMs, 0);
  const uniqueDomains = new Set(today.map(row => row.domain)).size;

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <div className="brand-icon"><Activity size={24} /></div>
          <div>
            <h1>BrowseLens</h1>
            <p>Understand your browsing habits.</p>
          </div>
        </div>

        <span className={`status ${enabled ? "on" : "off"}`}>
          {enabled ? "Tracking on" : "Tracking paused"}
        </span>
      </header>

      {!extensionAvailable && (
        <section className="notice">
          Dashboard storage is local. Load the extension in Chrome to enable
          live tracking controls.
        </section>
      )}

      {error && <section className="notice error">{error}</section>}

      <section className="welcome">
        <p className="eyebrow">PHASE 1 · BROWSER ACTIVITY</p>
        <h2>Your browsing, made visible.</h2>
        <p>Only website domains and time intervals are stored.</p>
        <button
          className="primary-button"
          onClick={toggleTracking}
          disabled={!extensionAvailable}
        >
          {enabled ? <Pause size={17} /> : <Play size={17} />}
          {enabled ? "Pause tracking" : "Resume tracking"}
        </button>
      </section>

      <section className="stats">
        <article className="stat-card">
          <Clock size={21} />
          <p>Tracked today</p>
          <strong>{formatDuration(todayDuration)}</strong>
        </article>
        <article className="stat-card">
          <Globe size={21} />
          <p>Websites today</p>
          <strong>{uniqueDomains}</strong>
        </article>
        <article className="stat-card">
          <Activity size={21} />
          <p>Recorded sessions</p>
          <strong>{today.length}</strong>
        </article>
      </section>

      <section className="history">
        <div className="section-heading">
          <div>
            <h2>Recent activity</h2>
            <p>Latest tracked website sessions</p>
          </div>
          <button className="clear-button" onClick={clearHistory}>
            <Trash2 size={16} /> Clear history
          </button>
        </div>

        {activities.length === 0 ? (
          <div className="empty">
            <Globe size={32} />
            <h3>No activity recorded yet</h3>
            <p>Browse a website in Chrome, then return here.</p>
          </div>
        ) : (
          <div className="activity-list">
            {activities.slice(0, 50).map((row, index) => (
              <article className="activity-row" key={row.id ?? index}>
                <div className="site-icon">{row.domain.charAt(0).toUpperCase()}</div>
                <div className="site-info">
                  <strong>{row.domain}</strong>
                  <span>{new Date(row.startedAt).toLocaleString()}</span>
                </div>
                <span className="duration">{formatDuration(row.durationMs)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer>
        BrowseLens · Local-first by design · Phase 1 foundation
      </footer>
    </main>
  );
}
