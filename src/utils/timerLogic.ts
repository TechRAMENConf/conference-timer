import type {
  FormattedTime,
  PresetItem,
  TimerConfig,
  TimerPhase,
  TimerStatus,
} from "@/types/timer";

export const TECHRAMEN_PRESETS: readonly PresetItem[] = [
  {
    id: "lt-5",
    label: "5分",
    tag: "［立ち食い］LT",
    seconds: 5 * 60,
    warnSeconds: 60,
    criticalSeconds: 30,
  },
  {
    id: "talk-20",
    label: "20分",
    tag: "［一杯］トーク",
    seconds: 20 * 60,
    warnSeconds: 5 * 60,
    criticalSeconds: 60,
  },
  {
    id: "talk-40",
    label: "40分",
    tag: "［餃子セット］トーク",
    seconds: 40 * 60,
    warnSeconds: 5 * 60,
    criticalSeconds: 60,
  },
  {
    id: "handson-40",
    label: "40分",
    tag: "［麺打ち］ハンズオン",
    seconds: 40 * 60,
    warnSeconds: 10 * 60,
    criticalSeconds: 2 * 60,
  },
  {
    id: "short-15",
    label: "15分",
    tag: "15分セッション",
    seconds: 15 * 60,
    warnSeconds: 3 * 60,
    criticalSeconds: 60,
  },
  {
    id: "keynote-60",
    label: "60分",
    tag: "基調講演・特別枠",
    seconds: 60 * 60,
    warnSeconds: 10 * 60,
    criticalSeconds: 2 * 60,
  },
];

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  durationSeconds: 20 * 60,
  warnSeconds: 5 * 60,
  criticalSeconds: 60,
  autoThresholds: true,
  sessionTitle: "",
  showClock: true,
  showEndEta: true,
  countUpOvertime: true,
};

export function clampDurationSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 60;
  return Math.max(10, Math.min(180 * 60, Math.round(seconds)));
}

export function computeAutoThresholds(durationSeconds: number): {
  warnSeconds: number;
  criticalSeconds: number;
} {
  const safe = clampDurationSeconds(durationSeconds);
  let warn = 5 * 60;
  let critical = 60;

  if (safe <= 60) {
    warn = Math.max(5, Math.floor(safe * 0.4));
    critical = Math.max(3, Math.floor(safe * 0.15));
  } else if (safe <= 180) {
    warn = 60;
    critical = 20;
  } else if (safe <= 360) {
    warn = 60;
    critical = 30;
  } else if (safe <= 900) {
    warn = 3 * 60;
    critical = 60;
  } else if (safe <= 2700) {
    warn = 5 * 60;
    critical = 60;
  } else {
    warn = 10 * 60;
    critical = 2 * 60;
  }

  warn = Math.min(warn, Math.max(2, safe - 2));
  critical = Math.min(critical, Math.max(1, warn - 1));
  return { warnSeconds: warn, criticalSeconds: critical };
}

export function normalizeThresholds(
  durationSeconds: number,
  warnSeconds: number,
  criticalSeconds: number,
): { warnSeconds: number; criticalSeconds: number } {
  const safeDuration = clampDurationSeconds(durationSeconds);
  const safeWarn = Math.max(2, Math.min(safeDuration - 1, Math.round(warnSeconds)));
  const safeCritical = Math.max(1, Math.min(safeWarn - 1, Math.round(criticalSeconds)));
  return { warnSeconds: safeWarn, criticalSeconds: safeCritical };
}

export function computeTimerPhase(
  status: TimerStatus,
  remainingMs: number,
  warnSeconds: number,
  criticalSeconds: number,
): TimerPhase {
  if (status === "idle") {
    return "ready";
  }
  if (remainingMs <= 0) {
    return "overtime";
  }
  const ceilSeconds = Math.ceil(remainingMs / 1000);
  if (ceilSeconds <= criticalSeconds) {
    return "critical";
  }
  if (ceilSeconds <= warnSeconds) {
    return "warning";
  }
  return "normal";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatRemainingTime(remainingMs: number, countUpOvertime = true): FormattedTime {
  if (remainingMs <= 0) {
    const overSec = Math.floor(Math.abs(remainingMs) / 1000);
    if (!countUpOvertime || overSec === 0) {
      return {
        digits: "00:00",
        isOvertime: true,
        totalWholeSeconds: 0,
      };
    }
    const mins = Math.floor(overSec / 60);
    const secs = overSec % 60;
    return {
      digits: `+${pad2(mins)}:${pad2(secs)}`,
      isOvertime: true,
      totalWholeSeconds: -overSec,
    };
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  if (totalSec >= 100 * 60) {
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return {
      digits: `${hours}:${pad2(mins)}:${pad2(secs)}`,
      isOvertime: false,
      totalWholeSeconds: totalSec,
    };
  }

  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return {
    digits: `${pad2(mins)}:${pad2(secs)}`,
    isOvertime: false,
    totalWholeSeconds: totalSec,
  };
}

export function formatClockTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDurationLabel(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins === 0) return `${secs}秒`;
  if (secs === 0) return `${mins}分`;
  return `${mins}分${secs}秒`;
}

export function parseQueryConfig(search: string): Partial<TimerConfig> {
  if (!search) return {};
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const patch: Partial<TimerConfig> = {};

  const presetId = params.get("preset");
  if (presetId) {
    const found = TECHRAMEN_PRESETS.find((p) => p.id === presetId);
    if (found) {
      patch.durationSeconds = found.seconds;
      patch.warnSeconds = found.warnSeconds;
      patch.criticalSeconds = found.criticalSeconds;
      patch.autoThresholds = false;
    }
  }

  const minsParam = params.get("m");
  const secsParam = params.get("s");
  if (minsParam !== null || secsParam !== null) {
    const m = minsParam !== null ? Number(minsParam) : 0;
    const s = secsParam !== null ? Number(secsParam) : 0;
    if (Number.isFinite(m) && Number.isFinite(s) && m * 60 + s >= 10) {
      patch.durationSeconds = clampDurationSeconds(m * 60 + s);
      patch.autoThresholds = true;
    }
  }

  const warnParam = params.get("warn");
  if (warnParam !== null && Number.isFinite(Number(warnParam))) {
    patch.warnSeconds = Math.max(2, Math.round(Number(warnParam)));
    patch.autoThresholds = false;
  }

  const criticalParam = params.get("critical");
  if (criticalParam !== null && Number.isFinite(Number(criticalParam))) {
    patch.criticalSeconds = Math.max(1, Math.round(Number(criticalParam)));
    patch.autoThresholds = false;
  }

  const titleParam = params.get("title");
  if (titleParam !== null) {
    patch.sessionTitle = titleParam.slice(0, 60);
  }

  return patch;
}
