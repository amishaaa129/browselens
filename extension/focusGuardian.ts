
import {
  classifyDomain,
  getCategoryType,
  type WebsiteCategory,
  type CategoryType,
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
const SNOOZE_KEY = "browselens_focus_snooze";
const RULES_KEY = "browselens_productivity_rules";

const NOTIFICATION_ID = "browselens-focus-alert";

export const DEFAULT_SETTINGS: FocusSettings = {
  mode: "off",
  thresholdMinutes: 10,
  cooldownMinutes: 15,
  excludedDomains: [],
};

type ProductivityRules = Partial<
  Record<WebsiteCategory, CategoryType>
>;

export async function getFocusSettings(): Promise<FocusSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);

  return {
    ...DEFAULT_SETTINGS,
    ...(data[SETTINGS_KEY] ?? {}),
  };
}

export async function updateFocusSettings(
  updates: Partial<FocusSettings>
): Promise<FocusSettings> {
  const current = await getFocusSettings();

  const updated = {
    ...current,
    ...updates,
  };

  await chrome.storage.local.set({
    [SETTINGS_KEY]: updated,
  });

  return updated;
}

export async function updateProductivityRules(
  rules: ProductivityRules
): Promise<void> {
  await chrome.storage.local.set({
    [RULES_KEY]: rules,
  });
}

export async function getProductivityRules(): Promise<ProductivityRules> {
  const data = await chrome.storage.local.get(RULES_KEY);
  return data[RULES_KEY] ?? {};
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

export async function snoozeFocus(minutes: number): Promise<number> {
  const snoozeUntil = Date.now() + minutes * 60 * 1000;

  await chrome.storage.local.set({
    [SNOOZE_KEY]: snoozeUntil,
  });

  await chrome.notifications.clear(NOTIFICATION_ID);

  return snoozeUntil;
}

export async function checkFocusDistraction(
  domain: string,
  startedAt: number
): Promise<void> {
  const settings = await getFocusSettings();

  if (settings.mode === "off") return;

  if (isExcluded(domain, settings.excludedDomains)) return;

  const category = classifyDomain(domain);

  const rules = await getProductivityRules();

  const categoryType =
    rules[category] ?? getCategoryType(category);

  if (categoryType !== "distraction") return;

  const now = Date.now();

  // Check snooze.
  const data = await chrome.storage.local.get([
    SNOOZE_KEY,
    LAST_ALERT_KEY,
  ]);

  const snoozeUntil = Number(data[SNOOZE_KEY] ?? 0);

  if (now < snoozeUntil) return;

  // Check threshold.
  const elapsedMinutes = (now - startedAt) / 60000;

  if (elapsedMinutes < settings.thresholdMinutes) return;

  // Check cooldown.
  const lastAlert = data[LAST_ALERT_KEY] as
    | { domain: string; timestamp: number }
    | undefined;

  if (
    lastAlert &&
    lastAlert.domain === domain &&
    now - lastAlert.timestamp <
      settings.cooldownMinutes * 60000
  ) {
    return;
  }

  try {
    await chrome.notifications.clear(NOTIFICATION_ID);

    await chrome.notifications.create(NOTIFICATION_ID, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "BrowseLens Focus Guardian",
      message:
        `You've spent ${Math.floor(elapsedMinutes)} minutes on ${domain}. ` +
        `Time to return to your ${settings.mode} session?`,
      priority: 2,
      buttons: [
        { title: "Back to work" },
        { title: "Snooze 10 min" },
      ],
    });

    await chrome.storage.local.set({
      [LAST_ALERT_KEY]: {
        domain,
        timestamp: now,
      },
    });

    console.log("[Focus Guardian] Notification created.");
  } catch (error) {
    console.error("[Focus Guardian] Notification error:", error);
  }
}

// Handle notification button clicks.
chrome.notifications.onButtonClicked.addListener(
  (notificationId, buttonIndex) => {
    if (notificationId !== NOTIFICATION_ID) return;

    if (buttonIndex === 0) {
      // Acknowledge the alert.
      void chrome.notifications.clear(NOTIFICATION_ID);
    }

    if (buttonIndex === 1) {
      void snoozeFocus(10);
    }
  }
);

// Clicking the notification itself acknowledges it.
chrome.notifications.onClicked.addListener(notificationId => {
  if (notificationId === NOTIFICATION_ID) {
    void chrome.notifications.clear(NOTIFICATION_ID);
  }
});
