
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  Plus,
  X,
  Save,
  Clock,
  Moon,
  Trash2,
} from "lucide-react";

type FocusMode = "off" | "study" | "work";

interface FocusSettings {
  mode: FocusMode;
  thresholdMinutes: number;
  cooldownMinutes: number;
  excludedDomains: string[];
}

interface ActiveSession {
  domain: string;
  startedAt: number;
}

interface Props {
  onClearAllData: () => Promise<void>;
}

const DEFAULT_SETTINGS: FocusSettings = {
  mode: "off",
  thresholdMinutes: 10,
  cooldownMinutes: 15,
  excludedDomains: [],
};

function sendMessage(message: object): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      reject(new Error("BrowseLens extension is not connected."));
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

function formatElapsed(startedAt: number): string {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - startedAt) / 1000)
  );

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(remainingSeconds).padStart(2, "0"),
  ].join(":");
}

export default function FocusGuardian({ onClearAllData }: Props) {
  const [settings, setSettings] =
    useState<FocusSettings>(DEFAULT_SETTINGS);

  const [session, setSession] =
    useState<ActiveSession | null>(null);

  const [elapsed, setElapsed] = useState("00:00:00");
  const [domainInput, setDomainInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const response = await sendMessage({
          type: "GET_FOCUS_SETTINGS",
        });

        if (response?.error) throw new Error(response.error);

        if (mounted) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...response?.settings,
          });
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load settings."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  // Fetch the active session and update the timer every second.
  useEffect(() => {
    let mounted = true;

    async function refreshSession() {
      try {
        const response = await sendMessage({
          type: "GET_ACTIVE_SESSION",
        });

        if (!mounted) return;

        setSession(response?.session ?? null);
      } catch (err) {
        console.error("Could not retrieve active session:", err);
      }
    }

    void refreshSession();

    const poll = window.setInterval(() => {
      void refreshSession();
    }, 3000);

    return () => {
      mounted = false;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setElapsed("00:00:00");
      return;
    }

    const update = () => {
      setElapsed(formatElapsed(session.startedAt));
    };

    update();

    const timer = window.setInterval(update, 1000);

    return () => window.clearInterval(timer);
  }, [session]);

  function updateSetting<K extends keyof FocusSettings>(
    key: K,
    value: FocusSettings[K]
  ) {
    setSettings(previous => ({
      ...previous,
      [key]: value,
    }));

    setSuccess("");
  }

  function addDomain() {
    const domain = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    if (!domain) return;

    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
      setError("Enter a valid domain, such as example.com.");
      return;
    }

    if (settings.excludedDomains.includes(domain)) {
      setError("This domain is already excluded.");
      return;
    }

    updateSetting("excludedDomains", [
      ...settings.excludedDomains,
      domain,
    ]);

    setDomainInput("");
    setError("");
  }

  function removeDomain(domain: string) {
    updateSetting(
      "excludedDomains",
      settings.excludedDomains.filter(item => item !== domain)
    );
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await sendMessage({
        type: "SET_FOCUS_SETTINGS",
        settings,
      });

      if (response?.error) throw new Error(response.error);

      setSettings({
        ...DEFAULT_SETTINGS,
        ...response?.settings,
      });

      setSuccess("Focus settings saved.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save settings."
      );
    } finally {
      setSaving(false);
    }
  }

  async function snooze(minutes: number) {
    setError("");
    setSuccess("");

    try {
      const response = await sendMessage({
        type: "SNOOZE_FOCUS",
        minutes,
      });

      if (response?.error) throw new Error(response.error);

      setSuccess(`Focus alerts snoozed for ${minutes} minutes.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not snooze alerts."
      );
    }
  }

  async function clearData() {
    const confirmed = window.confirm(
      "Delete all BrowseLens activity, settings, and locally stored browsing data? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      await onClearAllData();

      setSettings(DEFAULT_SETTINGS);
      setSession(null);
      setSuccess("All BrowseLens local data has been deleted.");
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete data."
      );
    }
  }

  if (loading) {
    return (
      <section className="history focus-guardian">
        <p>Loading Focus Guardian...</p>
      </section>
    );
  }

  return (
    <section className="history focus-guardian">
      <div className="section-heading">
        <div>
          <h2>
            <ShieldCheck size={20} />
            Focus Guardian
          </h2>
          <p>Manage distractions and protect your focus.</p>
        </div>

        <span className={`focus-badge ${settings.mode}`}>
          {settings.mode === "off" ? "Disabled" : `${settings.mode} mode`}
        </span>
      </div>

      <div className="live-focus-card">
        <div className="live-focus-heading">
          <span><Clock size={17} /> Live browsing session</span>
          <span className="live-indicator">LIVE</span>
        </div>

        {session ? (
          <>
            <strong>{session.domain}</strong>
            <div className="live-timer">{elapsed}</div>
            <p>Time spent on the current website</p>
          </>
        ) : (
          <p>No active browsing session detected.</p>
        )}
      </div>

      <h3>Focus mode</h3>

      <div className="focus-mode-grid">
        {(["off", "study", "work"] as FocusMode[]).map(mode => (
          <button
            key={mode}
            type="button"
            className={`focus-mode-button ${
              settings.mode === mode ? "selected" : ""
            }`}
            onClick={() => updateSetting("mode", mode)}
          >
            {mode === "off"
              ? "Off"
              : mode === "study"
                ? "Study Mode"
                : "Work Mode"}
          </button>
        ))}
      </div>

      <div className="focus-setting">
        <div className="focus-setting-heading">
          <label htmlFor="threshold">Distraction threshold</label>
          <strong>{settings.thresholdMinutes} min</strong>
        </div>

        <input
          id="threshold"
          type="range"
          min="1"
          max="60"
          value={settings.thresholdMinutes}
          onChange={event =>
            updateSetting("thresholdMinutes", Number(event.target.value))
          }
        />
      </div>

      <div className="focus-setting">
        <div className="focus-setting-heading">
          <label htmlFor="cooldown">Notification cooldown</label>
          <strong>{settings.cooldownMinutes} min</strong>
        </div>

        <input
          id="cooldown"
          type="range"
          min="1"
          max="60"
          value={settings.cooldownMinutes}
          onChange={event =>
            updateSetting("cooldownMinutes", Number(event.target.value))
          }
        />
      </div>

      <div className="focus-setting">
        <h3>Excluded websites</h3>

        <div className="exclude-input-row">
          <input
            value={domainInput}
            placeholder="example.com"
            onChange={event => setDomainInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") addDomain();
            }}
          />

          <button
            type="button"
            className="focus-add-button"
            onClick={addDomain}
          >
            <Plus size={16} /> Add
          </button>
        </div>

        <div className="excluded-domain-list">
          {settings.excludedDomains.map(domain => (
            <div className="excluded-domain" key={domain}>
              <span>{domain}</span>
              <button
                type="button"
                onClick={() => removeDomain(domain)}
                aria-label={`Remove ${domain}`}
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="focus-save-button"
        onClick={saveSettings}
        disabled={saving}
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save Focus Settings"}
      </button>

      <div className="focus-setting">
        <h3><Moon size={17} /> Snooze notifications</h3>
        <div className="snooze-actions">
          <button type="button" onClick={() => void snooze(5)}>
            Snooze 5 min
          </button>
          <button type="button" onClick={() => void snooze(10)}>
            Snooze 10 min
          </button>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {success && <div className="focus-success">{success}</div>}

      <div className="privacy-section">
        <h3><ShieldCheck size={17} /> Privacy controls</h3>
        <p>Delete your locally stored BrowseLens data.</p>

        <button
          type="button"
          className="privacy-delete-button"
          onClick={() => void clearData()}
        >
          <Trash2 size={16} />
          Delete all my data
        </button>
      </div>
    </section>
  );
}
