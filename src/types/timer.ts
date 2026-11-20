export type TimerStatus = "idle" | "running" | "paused";

export type TimerPhase = "ready" | "normal" | "warning" | "critical" | "overtime";

export type ChimeMode = "off" | "end-only" | "warn-and-end";

export interface PresetItem {
  id: string;
  label: string;
  tag: string;
  seconds: number;
  warnSeconds: number;
  criticalSeconds: number;
}

export interface TimerConfig {
  durationSeconds: number;
  warnSeconds: number;
  criticalSeconds: number;
  autoThresholds: boolean;
  chimeMode: ChimeMode;
  sessionTitle: string;
  showClock: boolean;
  showEndEta: boolean;
  countUpOvertime: boolean;
}

export interface FormattedTime {
  digits: string;
  isOvertime: boolean;
  totalWholeSeconds: number;
}
