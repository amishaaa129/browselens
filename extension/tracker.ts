
import type { ActivityRecord } from "./types";

export interface ActiveSession {
  domain: string;
  startedAt: number;
}

export function sanitizeDomain(url: string): string | null {
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

export function createActivity(
  session: ActiveSession,
  endedAt: number
): ActivityRecord | null {
  const durationMs = Math.max(0, endedAt - session.startedAt);

  // Ignore extremely short sessions to reduce noisy records.
  if (durationMs < 1000) return null;

  return {
    domain: session.domain,
    startedAt: session.startedAt,
    endedAt,
    durationMs
  };
}
