
import type { ActivityRecord } from "./App";
import type { WebsiteCategory, ProductivityType } from "./preferences";

export type CategoryResolver = (
  row: ActivityRecord
) => WebsiteCategory;

export interface FocusScoreBreakdown {
  score: number;
  productiveTimeScore: number;
  sessionContinuityScore: number;
  contextStabilityScore: number;
  lowDistractionScore: number;
}

export interface DailyInsight {
  date: string;
  label: string;
  focusScore: number;
  productiveMs: number;
  distractionMs: number;
  neutralMs: number;
  totalMs: number;
  contextSwitches: number;
  sessions: number;
}

export interface WebsiteInsight {
  domain: string;
  durationMs: number;
}

export interface HourInsight {
  hour: number;
  label: string;
  productiveMs: number;
}

export interface BrowseLensInsights {
  focusScore: FocusScoreBreakdown;
  weeklyTrend: DailyInsight[];
  topDistractions: WebsiteInsight[];
  peakProductivityHour: HourInsight | null;
  recommendations: string[];
  today: DailyInsight;
}

const TARGET_FOCUSED_SESSION_MS = 45 * 60 * 1000;
const MAX_CONTEXT_SWITCHES_FOR_ZERO_SCORE = 20;
const CONTEXT_GAP_LIMIT_MS = 30 * 60 * 1000;

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function startOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
}

function dateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getProductivityType(
  row: ActivityRecord,
  categoryFor: CategoryResolver,
  rules: Record<WebsiteCategory, ProductivityType>
): ProductivityType {
  return rules[categoryFor(row)] ?? "neutral";
}

function calculateContextSwitches(
  sessions: ActivityRecord[]
): number {
  const sorted = [...sessions].sort(
    (a, b) => a.startedAt - b.startedAt
  );

  let switches = 0;

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];

    if (!previous || !current) continue;

    const gap = current.startedAt - previous.endedAt;

    if (
      previous.domain !== current.domain &&
      gap >= 0 &&
      gap <= CONTEXT_GAP_LIMIT_MS
    ) {
      switches++;
    }
  }

  return switches;
}

function calculateFocusScore(
  productiveMs: number,
  distractionMs: number,
  neutralMs: number,
  productiveSessions: ActivityRecord[],
  contextSwitches: number
): FocusScoreBreakdown {
  const totalMs = productiveMs + distractionMs + neutralMs;

  if (totalMs <= 0) {
    return {
      score: 0,
      productiveTimeScore: 0,
      sessionContinuityScore: 0,
      contextStabilityScore: 0,
      lowDistractionScore: 0,
    };
  }

  // PTS: productive time / total active time.
  const productiveTimeScore = clamp(
    (productiveMs / totalMs) * 100
  );

  // SCS: average productive session compared with a 45-minute target.
  const averageFocusedSession =
    productiveSessions.length > 0
      ? productiveSessions.reduce(
          (sum, row) => sum + row.durationMs,
          0
        ) / productiveSessions.length
      : 0;

  const sessionContinuityScore = clamp(
    (averageFocusedSession / TARGET_FOCUSED_SESSION_MS) * 100
  );

  // CSS: reduce the score by 5 points per context switch.
  const contextStabilityScore = clamp(
    100 -
      (contextSwitches / MAX_CONTEXT_SWITCHES_FOR_ZERO_SCORE) * 100
  );

  // DS: 100 means no distraction time.
  const lowDistractionScore = clamp(
    100 - (distractionMs / totalMs) * 100
  );

  const score =
    productiveTimeScore * 0.4 +
    sessionContinuityScore * 0.25 +
    contextStabilityScore * 0.2 +
    lowDistractionScore * 0.15;

  return {
    score: Math.round(score),
    productiveTimeScore: Math.round(productiveTimeScore),
    sessionContinuityScore: Math.round(sessionContinuityScore),
    contextStabilityScore: Math.round(contextStabilityScore),
    lowDistractionScore: Math.round(lowDistractionScore),
  };
}

function getDailyInsight(
  sessions: ActivityRecord[],
  date: Date,
  categoryFor: CategoryResolver,
  rules: Record<WebsiteCategory, ProductivityType>
): DailyInsight {
  const key = dateKey(date.getTime());

  const rows = sessions.filter(
    row => dateKey(row.startedAt) === key
  );

  let productiveMs = 0;
  let distractionMs = 0;
  let neutralMs = 0;

  const productiveSessions: ActivityRecord[] = [];

  for (const row of rows) {
    const type = getProductivityType(row, categoryFor, rules);

    if (type === "productive") {
      productiveMs += row.durationMs;
      productiveSessions.push(row);
    } else if (type === "distraction") {
      distractionMs += row.durationMs;
    } else {
      neutralMs += row.durationMs;
    }
  }

  const contextSwitches = calculateContextSwitches(rows);

  const score = calculateFocusScore(
    productiveMs,
    distractionMs,
    neutralMs,
    productiveSessions,
    contextSwitches
  );

  return {
    date: key,
    label: date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
    }),
    focusScore: score.score,
    productiveMs,
    distractionMs,
    neutralMs,
    totalMs: productiveMs + distractionMs + neutralMs,
    contextSwitches,
    sessions: rows.length,
  };
}

function getTopDistractions(
  sessions: ActivityRecord[],
  categoryFor: CategoryResolver,
  rules: Record<WebsiteCategory, ProductivityType>
): WebsiteInsight[] {
  const totals = new Map<string, number>();

  for (const row of sessions) {
    if (getProductivityType(row, categoryFor, rules) !== "distraction") {
      continue;
    }

    totals.set(
      row.domain,
      (totals.get(row.domain) ?? 0) + row.durationMs
    );
  }

  return [...totals.entries()]
    .map(([domain, durationMs]) => ({ domain, durationMs }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5);
}

function getPeakProductivityHour(
  sessions: ActivityRecord[],
  categoryFor: CategoryResolver,
  rules: Record<WebsiteCategory, ProductivityType>
): HourInsight | null {
  const totals = new Map<number, number>();

  for (const row of sessions) {
    if (getProductivityType(row, categoryFor, rules) !== "productive") {
      continue;
    }

    // Attribute a session to its starting hour.
    const hour = new Date(row.startedAt).getHours();

    totals.set(
      hour,
      (totals.get(hour) ?? 0) + row.durationMs
    );
  }

  if (totals.size === 0) return null;

  const [hour, productiveMs] = [...totals.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0]!;

  return {
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    productiveMs,
  };
}

function generateRecommendations(
  today: DailyInsight,
  topDistractions: WebsiteInsight[],
  peakHour: HourInsight | null,
  score: FocusScoreBreakdown
): string[] {
  const recommendations: string[] = [];

  if (today.totalMs === 0) {
    return ["Browse normally with tracking enabled to start generating insights."];
  }

  if (today.distractionMs > today.productiveMs) {
    recommendations.push(
      "Distraction time is higher than productive time. Try enabling Study Mode or Work Mode."
    );
  }

  if (today.contextSwitches >= 8) {
    recommendations.push(
      `You switched between websites ${today.contextSwitches} times. Try grouping similar tasks into focused blocks.`
    );
  }

  if (score.sessionContinuityScore < 50) {
    recommendations.push(
      "Your productive sessions are relatively short. Try one uninterrupted 25-minute focus block."
    );
  }

  if (topDistractions.length > 0) {
    recommendations.push(
  `${topDistractions[0]!.domain} is your biggest distraction today. Try setting a browsing limit for it during focused work.`
);
  }

  if (peakHour) {
    recommendations.push(
      `Your strongest productive browsing hour today is around ${peakHour.label}. Consider scheduling demanding tasks around this time.`
    );
  }

  if (score.score >= 80) {
    recommendations.push(
      "Great work! Your browsing pattern shows strong productivity today."
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Keep tracking your sessions. BrowseLens will identify more patterns as your history grows."
    );
  }

  return recommendations.slice(0, 5);
}

export function generateBrowseLensInsights(
  activities: ActivityRecord[],
  categoryFor: CategoryResolver,
  rules: Record<WebsiteCategory, ProductivityType>,
  now = new Date()
): BrowseLensInsights {
  const todayDate = startOfDay(now);

  const today = getDailyInsight(
    activities,
    todayDate,
    categoryFor,
    rules
  );

  const todayRows = activities.filter(
    row => dateKey(row.startedAt) === today.date
  );

  let productiveMs = 0;
  let distractionMs = 0;
  let neutralMs = 0;
  const productiveSessions: ActivityRecord[] = [];

  for (const row of todayRows) {
    const type = getProductivityType(row, categoryFor, rules);

    if (type === "productive") {
      productiveMs += row.durationMs;
      productiveSessions.push(row);
    } else if (type === "distraction") {
      distractionMs += row.durationMs;
    } else {
      neutralMs += row.durationMs;
    }
  }

  const focusScore = calculateFocusScore(
    productiveMs,
    distractionMs,
    neutralMs,
    productiveSessions,
    today.contextSwitches
  );

  const weeklyTrend: DailyInsight[] = [];

  for (let offset = 6; offset >= 0; offset--) {
    const date = new Date(todayDate);
    date.setDate(todayDate.getDate() - offset);

    weeklyTrend.push(
      getDailyInsight(activities, date, categoryFor, rules)
    );
  }

  const topDistractions = getTopDistractions(
    todayRows,
    categoryFor,
    rules
  );

  const peakProductivityHour = getPeakProductivityHour(
    todayRows,
    categoryFor,
    rules
  );

  return {
    focusScore,
    weeklyTrend,
    topDistractions,
    peakProductivityHour,
    recommendations: generateRecommendations(
      today,
      topDistractions,
      peakProductivityHour,
      focusScore
    ),
    today,
  };
}
