
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Clock,
  Globe,
  Pause,
  Play,
  Trash2,
  Tags,
  Repeat2,
  TrendingUp,
} from "lucide-react";
import { openDB, type DBSchema } from "idb";

type WebsiteCategory =
  | "Development"
  | "Education"
  | "Productivity"
  | "Social Media"
  | "Entertainment"
  | "News"
  | "Shopping"
  | "Other";

interface ActivityRecord {
  id?: number;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  category?: WebsiteCategory;
}

interface BrowseLensDB extends DBSchema {
  activities: {
    key: number;
    value: ActivityRecord;
    indexes: { startedAt: number };
  };
}

const DB_NAME = "BrowseLensDB";
const OVERRIDES_KEY = "browselens_category_overrides";

const CATEGORIES: WebsiteCategory[] = [
  "Development",
  "Education",
  "Productivity",
  "Social Media",
  "Entertainment",
  "News",
  "Shopping",
  "Other",
];

const CATEGORY_DOMAINS: Record<WebsiteCategory, string[]> = {
  Development: [
    "github.com",
    "gitlab.com",
    "stackoverflow.com",
    "developer.mozilla.org",
    "npmjs.com",
    "vercel.com",
    "docker.com",
    "nodejs.org",
  ],
  Education: [
    "sporcle.com",
    "coursera.org",
    "edx.org",
    "khanacademy.org",
    "wikipedia.org",
    "udemy.com",
    "leetcode.com",
    "geeksforgeeks.org",
  ],
  Productivity: [
    "notion.so",
    "trello.com",
    "asana.com",
    "docs.google.com",
    "drive.google.com",
    "figma.com",
    "linear.app",
  ],
  "Social Media": [
    "instagram.com",
    "facebook.com",
    "reddit.com",
    "x.com",
    "twitter.com",
    "threads.net",
    "linkedin.com",
  ],
  Entertainment: [
    "youtube.com",
    "netflix.com",
    "twitch.tv",
    "spotify.com",
    "pinterest.com",
  ],
  News: [
    "bbc.com",
    "bbc.co.uk",
    "reuters.com",
    "theguardian.com",
    "cnn.com",
    "nytimes.com",
  ],
  Shopping: [
    "amazon.com",
    "amazon.in",
    "flipkart.com",
    "ebay.com",
    "etsy.com",
  ],
  Other: [],
};

function classifyDomain(domain: string): WebsiteCategory {
  const normalized = domain.toLowerCase().replace(/^www\./, "");

  for (const category of CATEGORIES) {
    if (
      CATEGORY_DOMAINS[category].some(
        candidate =>
          normalized === candidate ||
          normalized.endsWith(`.${candidate}`)
      )
    ) {
      return category;
    }
  }

  return "Other";
}

function getDefaultType(
  category: WebsiteCategory
): "productive" | "distraction" | "neutral" {
  if (
    ["Development", "Education", "Productivity"].includes(category)
  ) {
    return "productive";
  }

  if (["Social Media", "Entertainment"].includes(category)) {
    return "distraction";
  }

  return "neutral";
}

function sendToExtension(message: object): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error("BrowseLens extension API is unavailable."));
      return;
    }

    chrome.runtime.sendMessage(message, response => {
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
          autoIncrement: true,
        });
        store.createIndex("startedAt", "startedAt");
      }
    },
  });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 1) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${seconds}s`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isToday(timestamp: number): boolean {
  return new Date(timestamp).toDateString() === new Date().toDateString();
}

function readOverrides(): Record<string, WebsiteCategory> {
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [extensionAvailable, setExtensionAvailable] = useState(false);
  const [error, setError] = useState("");
  const [overrides, setOverrides] =
    useState<Record<string, WebsiteCategory>>(readOverrides);

  const refresh = useCallback(async () => {
    try {
      if (!globalThis.chrome?.runtime?.sendMessage) {
        setExtensionAvailable(false);
        setError("BrowseLens extension is not connected.");
        return;
      }

      const response = await sendToExtension({ type: "GET_ACTIVITIES" });

      if (response?.error) {
        throw new Error(response.error);
      }

      setActivities(response?.activities ?? []);
      setError("");
    } catch (err) {
      console.error("BrowseLens refresh failed:", err);
      setError("Could not retrieve activity. Reload the extension and dashboard.");
    }
  }, []);

  const readStatus = useCallback(async () => {
    try {
      const status = await sendToExtension({ type: "GET_STATUS" });
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

  function changeCategory(domain: string, category: WebsiteCategory) {
    const updated = { ...overrides, [domain]: category };
    setOverrides(updated);
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(updated));
  }

  function categoryFor(row: ActivityRecord): WebsiteCategory {
    return overrides[row.domain] ?? row.category ?? classifyDomain(row.domain);
  }

  const today = useMemo(
    () => activities.filter(row => isToday(row.startedAt)),
    [activities]
  );

  const todayDuration = today.reduce((sum, row) => sum + row.durationMs, 0);
  const uniqueDomains = new Set(today.map(row => row.domain)).size;

  const analytics = useMemo(() => {
    const totals = new Map<WebsiteCategory, number>();
    let productiveMs = 0;
    let distractionMs = 0;
    let neutralMs = 0;

    for (const row of today) {
      const category = categoryFor(row);
      totals.set(category, (totals.get(category) ?? 0) + row.durationMs);

      const type = getDefaultType(category);
      if (type === "productive") productiveMs += row.durationMs;
      else if (type === "distraction") distractionMs += row.durationMs;
      else neutralMs += row.durationMs;
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);

    let contextSwitches = 0;
    const sortedSessions = [...today].sort((a, b) => a.startedAt - b.startedAt);

    for (let i = 1; i < sortedSessions.length; i++) {
      const previous = sortedSessions[i - 1];
      const current = sortedSessions[i];
      if (!previous || !current) continue;

      const gap = current.startedAt - previous.endedAt;
      if (
        previous.domain !== current.domain &&
        gap >= 0 &&
        gap <= 30 * 60 * 1000
      ) {
        contextSwitches++;
      }
    }

    return {
      productiveMs,
      distractionMs,
      neutralMs,
      contextSwitches,
      categories: sorted,
    };
  }, [today, overrides]);

  async function toggleTracking() {
    try {
      const response = await sendToExtension({
        type: "SET_TRACKING",
        enabled: !enabled,
      });

      setEnabled(response.enabled);
      setError("");
    } catch {
      setError("Extension not connected. Reload it in chrome://extensions.");
    }
  }

  async function clearHistory() {
    if (!window.confirm("Delete all BrowseLens activity history?")) return;

    try {
      const db = await database();
      await db.clear("activities");
      await db.close();
      await refresh();
    } catch (err) {
      console.error("Could not clear BrowseLens history:", err);
      setError("Could not clear history. Please try again.");
    }
  }

  const productivePercent = todayDuration
    ? (analytics.productiveMs / todayDuration) * 100
    : 0;
  const distractionPercent = todayDuration
    ? (analytics.distractionMs / todayDuration) * 100
    : 0;

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
          Open the packaged BrowseLens dashboard in Chrome to use tracking controls.
        </section>
      )}

      {error && <section className="notice error">{error}</section>}

      <section className="welcome">
        <p className="eyebrow">PHASE 2 · CLASSIFICATION & ANALYTICS</p>
        <h2>Your browsing, made visible.</h2>
        <p>Website categories and time analytics are calculated locally.</p>
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

      <section className="history phase2-panel">
        <div className="section-heading">
          <div>
            <h2><TrendingUp size={19} /> Today's analytics</h2>
            <p>Based on your completed sessions</p>
          </div>
        </div>

        <div className="analytics-grid">
          <article className="analytics-card">
            <span>Productive time</span>
            <strong>{formatDuration(analytics.productiveMs)}</strong>
            <div className="progress-track">
              <div className="progress-fill productive-fill" style={{ width: `${productivePercent}%` }} />
            </div>
            <small>{productivePercent.toFixed(0)}% of tracked time</small>
          </article>

          <article className="analytics-card">
            <span>Distraction time</span>
            <strong>{formatDuration(analytics.distractionMs)}</strong>
            <div className="progress-track">
              <div className="progress-fill distraction-fill" style={{ width: `${distractionPercent}%` }} />
            </div>
            <small>{distractionPercent.toFixed(0)}% of tracked time</small>
          </article>

          <article className="analytics-card">
            <Repeat2 size={18} />
            <span>Context switches</span>
            <strong>{analytics.contextSwitches}</strong>
            <small>Between recorded website sessions</small>
          </article>
        </div>

        <h3 className="analytics-subheading"><Tags size={17} /> Time by category</h3>
        {analytics.categories.length === 0 ? (
          <p className="muted">Browse some websites to see your category breakdown.</p>
        ) : (
          <div className="category-list">
            {analytics.categories.map(([category, duration]) => (
              <div className="category-item" key={category}>
                <span>{category}</span>
                <div className="progress-track">
                  <div
                    className="progress-fill category-fill"
                    style={{ width: `${todayDuration ? (duration / todayDuration) * 100 : 0}%` }}
                  />
                </div>
                <strong>{formatDuration(duration)}</strong>
              </div>
            ))}
          </div>
        )}

        <p className="analytics-note">
          Categories are estimates. “Productive” and “distraction” are default groupings,
          and can be adjusted per website below.
        </p>
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
            {activities.slice(0, 50).map((row, index) => {
              const category = categoryFor(row);

              return (
                <article className="activity-row" key={row.id ?? index}>
                  <div className="site-icon">{row.domain.charAt(0).toUpperCase()}</div>
                  <div className="site-info">
                    <strong>{row.domain}</strong>
                    <span>{new Date(row.startedAt).toLocaleString()}</span>
                    <span className="category-label">{category}</span>
                    <select
                      aria-label={`Category for ${row.domain}`}
                      className="category-select"
                      value={category}
                      onChange={event =>
                        changeCategory(row.domain, event.target.value as WebsiteCategory)
                      }
                    >
                      {CATEGORIES.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <span className="duration">{formatDuration(row.durationMs)}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer>
        BrowseLens · Local-first by design · Phase 2
      </footer>
    </main>
  );
}
