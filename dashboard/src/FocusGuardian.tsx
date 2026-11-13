
import { useEffect, useState } from "react";
import { ShieldCheck, Plus, X, Save } from "lucide-react";

type FocusMode = "off" | "study" | "work";

interface FocusSettings {
  mode: FocusMode;
  thresholdMinutes: number;
  cooldownMinutes: number;
  excludedDomains: string[];
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

export default function FocusGuardian() {
  const [settings, setSettings] =
    useState<FocusSettings>(DEFAULT_SETTINGS);

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

        if (response?.error) {
          throw new Error(response.error);
        }

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
              : "Could not load Focus Guardian settings."
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

    if (
      !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)
    ) {
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

      if (response?.error) {
        throw new Error(response.error);
      }

      setSettings({
        ...DEFAULT_SETTINGS,
        ...response?.settings,
      });

      setSuccess("Focus Guardian settings saved successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save Focus Guardian settings."
      );
    } finally {
      setSaving(false);
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
          <p>Stay focused while browsing the web.</p>
        </div>

        <span className={`focus-badge ${settings.mode}`}>
          {settings.mode === "off"
            ? "Disabled"
            : `${settings.mode} mode`}
        </span>
      </div>

      <div className="focus-mode-grid">
        {(["off", "study", "work"] as FocusMode[]).map(mode => (
          <button
            key={mode}
            className={`focus-mode-button ${
              settings.mode === mode ? "selected" : ""
            }`}
            onClick={() => updateSetting("mode", mode)}
            type="button"
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
          <label htmlFor="threshold">
            Distraction alert threshold
          </label>
          <strong>{settings.thresholdMinutes} min</strong>
        </div>

        <input
          id="threshold"
          type="range"
          min="1"
          max="60"
          value={settings.thresholdMinutes}
          onChange={event =>
            updateSetting(
              "thresholdMinutes",
              Number(event.target.value)
            )
          }
        />

        <p>Alert me after spending this long on a distracting website.</p>
      </div>

      <div className="focus-setting">
        <div className="focus-setting-heading">
          <label htmlFor="cooldown">
            Notification cooldown
          </label>
          <strong>{settings.cooldownMinutes} min</strong>
        </div>

        <input
          id="cooldown"
          type="range"
          min="1"
          max="60"
          value={settings.cooldownMinutes}
          onChange={event =>
            updateSetting(
              "cooldownMinutes",
              Number(event.target.value)
            )
          }
        />

        <p>Wait this long before another alert for the same website.</p>
      </div>

      <div className="focus-setting">
        <h3>Excluded websites</h3>
        <p>
          These domains will not trigger Focus Guardian alerts.
        </p>

        <div className="exclude-input-row">
          <input
            type="text"
            placeholder="example.com"
            value={domainInput}
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
            <Plus size={16} />
            Add
          </button>
        </div>

        <div className="excluded-domain-list">
          {settings.excludedDomains.length === 0 ? (
            <p className="muted">
              No excluded websites yet.
            </p>
          ) : (
            settings.excludedDomains.map(domain => (
              <div className="excluded-domain" key={domain}>
                <span>{domain}</span>
                <button
                  type="button"
                  aria-label={`Remove ${domain}`}
                  onClick={() => removeDomain(domain)}
                >
                  <X size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {success && <div className="focus-success">{success}</div>}

      <button
        type="button"
        className="focus-save-button"
        onClick={saveSettings}
        disabled={saving}
      >
        <Save size={16} />
        {saving ? "Saving..." : "Save Focus Settings"}
      </button>
    </section>
  );
}
