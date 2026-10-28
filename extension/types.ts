
import type { WebsiteCategory } from "./classification";

export interface ActivityRecord {
  id?: number;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  category?: WebsiteCategory;
}

export interface TrackingSettings {
  enabled: boolean;
}

export const DEFAULT_SETTINGS: TrackingSettings = {
  enabled: true,
};
