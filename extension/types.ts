
export interface ActivityRecord {
  id?: number;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface TrackingSettings {
  enabled: boolean;
}

export const DEFAULT_SETTINGS: TrackingSettings = {
  enabled: true
};
