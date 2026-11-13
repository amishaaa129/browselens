
import {
  classifyDomain,
  getCategoryType,
} from "./classification";

export type FocusMode = "off" | "study" | "work";

export interface FocusSettings {
  mode: FocusMode;
  thresholdMinutes: number;
  cooldownMinutes: number;
  excludedDomains: string[];
}

const SETTINGS_KEY = "browselens_focus_settings";
const LAST_ALERT_KEY = "browselens_last_focus_alert";

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  mode: "off",
  thresholdMinutes: 10,
  cooldownMinutes: 15,
  excludedDomains: [],
};

export async function getFocusSettings(): Promise<FocusSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);

  return {
    ...DEFAULT_FOCUS_SETTINGS,
    ...(data[SETTINGS_KEY] ?? {}),
  };
}

export async function updateFocusSettings(
  updates: Partial<FocusSettings>
): Promise<FocusSettings> {
  const current = await getFocusSettings();

  const updated: FocusSettings = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({
    [SETTINGS_KEY]: updated,
  });

  return updated;
}

function isExcluded(
  domain: string,
  excludedDomains: string[]
): boolean {
  const normalized = domain.toLowerCase();

  return excludedDomains.some(excluded => {
    const item = excluded.toLowerCase().trim();

    return normalized === item ||
      normalized.endsWith(`.${item}`);
  });
}

export async function checkFocusDistraction(
  domain: string,
  startedAt: number
): Promise<void> {
  const settings = await getFocusSettings();

  console.log("[Focus Guardian] Settings:", settings);

  if (settings.mode === "off") {
    console.log("[Focus Guardian] Mode is off");
    return;
  }

  if (isExcluded(domain, settings.excludedDomains)) {
    console.log("[Focus Guardian] Excluded domain:", domain);
    return;
  }

  const category = classifyDomain(domain);
  const categoryType = getCategoryType(category);

  console.log("[Focus Guardian] Domain:", domain);
  console.log("[Focus Guardian] Category:", category);
  console.log("[Focus Guardian] Category type:", categoryType);

  if (categoryType !== "distraction") {
    console.log("[Focus Guardian] Not a distracting website");
    return;
  }

  const elapsedMinutes =
    (Date.now() - startedAt) / 60000;

  console.log(
    "[Focus Guardian] Elapsed:",
    elapsedMinutes.toFixed(2),
    "minutes"
  );

  if (elapsedMinutes < settings.thresholdMinutes) {
    console.log("[Focus Guardian] Threshold not reached");
    return;
  }

  const data = await chrome.storage.local.get(LAST_ALERT_KEY);

  const lastAlert = data[LAST_ALERT_KEY] as
    | { domain: string; timestamp: number }
    | undefined;

  if (
    lastAlert &&
    lastAlert.domain === domain &&
    Date.now() - lastAlert.timestamp <
      settings.cooldownMinutes * 60000
  ) {
    console.log("[Focus Guardian] Cooldown active");
    return;
  }

  try {
    const notificationId = await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "BrowseLens Focus Guardian",
      message:
        `You've spent ${Math.floor(elapsedMinutes)} minutes on ${domain}. ` +
        `Get back to your ${settings.mode} session!`,
      priority: 2,
    });

    console.log(
      "[Focus Guardian] Notification created:",
      notificationId
    );

    await chrome.storage.local.set({
      [LAST_ALERT_KEY]: {
        domain,
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error(
      "[Focus Guardian] Notification failed:",
      error
    );
  }
}
