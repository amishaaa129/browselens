
import type { ActivityRecord } from "./types";
import {
  classifyDomain,
  getCategoryType,
  type WebsiteCategory,
} from "./classification";

export interface CategorySummary {
  category: WebsiteCategory;
  durationMs: number;
  percentage: number;
}

export interface DailyAnalytics {
  date: string;
  totalMs: number;
  productiveMs: number;
  distractionMs: number;
  neutralMs: number;
  sessionCount: number;
  contextSwitches: number;
  averageSessionMs: number;
  categories: CategorySummary[];
}

export function calculateAnalytics(
  activities: ActivityRecord[],
  now = Date.now()
): DailyAnalytics {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = startOfDay.getTime() + 24 * 60 * 60 * 1000;

  const today = activities
    .filter(
      activity =>
        activity.startedAt >= startOfDay.getTime() &&
        activity.startedAt < endOfDay
    )
    .sort((a, b) => a.startedAt - b.startedAt);

  let productiveMs = 0;
  let distractionMs = 0;
  let neutralMs = 0;

  const totals = new Map<WebsiteCategory, number>();

  for (const activity of today) {
    const category =
      activity.category ?? classifyDomain(activity.domain);

    totals.set(
      category,
      (totals.get(category) ?? 0) + activity.durationMs
    );

    const type = getCategoryType(category);

    if (type === "productive") {
      productiveMs += activity.durationMs;
    } else if (type === "distraction") {
      distractionMs += activity.durationMs;
    } else {
      neutralMs += activity.durationMs;
    }
  }

  const totalMs = productiveMs + distractionMs + neutralMs;

  const categories = [...totals.entries()]
    .map(([category, durationMs]) => ({
      category,
      durationMs,
      percentage:
        totalMs > 0 ? (durationMs / totalMs) * 100 : 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  // Count transitions between consecutive recorded sessions.
  // A gap of over 30 minutes is treated as a separate period.
  let contextSwitches = 0;

  
for (let i = 1; i < today.length; i++) {
  const previous = today[i - 1];
  const current = today[i];

  if (!previous || !current) continue;

  const gapMs = current.startedAt - previous.endedAt;

  if (
    previous.domain !== current.domain &&
    gapMs >= 0 &&
    gapMs <= 30 * 60 * 1000
  ) {
    contextSwitches++;
  }
}


  return {
    date: startOfDay.toLocaleDateString(),
    totalMs,
    productiveMs,
    distractionMs,
    neutralMs,
    sessionCount: today.length,
    contextSwitches,
    averageSessionMs:
      today.length > 0 ? totalMs / today.length : 0,
    categories,
  };
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
