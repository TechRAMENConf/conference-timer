import { computed, onBeforeUnmount, onMounted, reactive, readonly, ref, watch } from "vue";
import { useWakeLock } from "@/composables/useWakeLock";
import type { PresetItem, TimerConfig, TimerPhase, TimerStatus } from "@/types/timer";
import {
  clampDurationSeconds,
  computeAutoThresholds,
  computeTimerPhase,
  DEFAULT_TIMER_CONFIG,
  formatClockTime,
  formatRemainingTime,
  normalizeThresholds,
  parseQueryConfig,
  sanitizeConfig,
  TECHRAMEN_PRESETS,
} from "@/utils/timerLogic";

const CONFIG_STORAGE_KEY = "techramen-2026-session-timer:v1";
const RUNTIME_STORAGE_KEY = "techramen-2026-session-timer:runtime:v1";
const MAX_RESTORE_AGE_MS = 12 * 60 * 60 * 1000;

interface PersistedRuntimeState {
  status: "running" | "paused";
  durationSeconds: number;
  endWallMs?: number;
  remainingMs?: number;
  savedAt: number;
}

function getMonoNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function loadInitialConfig(): { config: TimerConfig; hasQueryOverride: boolean } {
  let base: TimerConfig = { ...DEFAULT_TIMER_CONFIG };
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      base = sanitizeConfig(JSON.parse(raw));
    }
  } catch {
    // ignore storage errors
  }

  let hasQueryOverride = false;
  if (typeof window !== "undefined" && window.location.search) {
    const fromQuery = parseQueryConfig(window.location.search);
    if (Object.keys(fromQuery).length > 0) {
      hasQueryOverride = true;
      base = sanitizeConfig({ ...base, ...fromQuery });
    }
  }

  return { config: base, hasQueryOverride };
}

function loadPersistedRuntimeState(durationSeconds: number): {
  status: TimerStatus;
  remainingMs: number;
  endWallMs: number | null;
} {
  try {
    const raw = localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (!raw) {
      return { status: "idle", remainingMs: durationSeconds * 1000, endWallMs: null };
    }
    const parsed = JSON.parse(raw) as Partial<PersistedRuntimeState>;
    const now = Date.now();
    if (
      typeof parsed.savedAt !== "number" ||
      !Number.isFinite(parsed.savedAt) ||
      now - parsed.savedAt > MAX_RESTORE_AGE_MS ||
      parsed.durationSeconds !== durationSeconds
    ) {
      return { status: "idle", remainingMs: durationSeconds * 1000, endWallMs: null };
    }

    if (
      parsed.status === "paused" &&
      typeof parsed.remainingMs === "number" &&
      Number.isFinite(parsed.remainingMs)
    ) {
      return {
        status: "paused",
        remainingMs: parsed.remainingMs,
        endWallMs: null,
      };
    }

    if (
      parsed.status === "running" &&
      typeof parsed.endWallMs === "number" &&
      Number.isFinite(parsed.endWallMs)
    ) {
      const rem = parsed.endWallMs - now;
      // Ignore stale sessions that ended hours ago
      if (rem < -4 * 60 * 60 * 1000) {
        return { status: "idle", remainingMs: durationSeconds * 1000, endWallMs: null };
      }
      return {
        status: "running",
        remainingMs: rem,
        endWallMs: parsed.endWallMs,
      };
    }
  } catch {
    // ignore corrupted storage
  }

  return { status: "idle", remainingMs: durationSeconds * 1000, endWallMs: null };
}

function savePersistedRuntimeState(state: PersistedRuntimeState | null): void {
  try {
    if (!state) {
      localStorage.removeItem(RUNTIME_STORAGE_KEY);
    } else {
      localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // ignore storage errors
  }
}

export function useTimer() {
  const { config: initialConfig, hasQueryOverride } = loadInitialConfig();
  const config = reactive<TimerConfig>(initialConfig);

  const restored = hasQueryOverride
    ? { status: "idle" as TimerStatus, remainingMs: config.durationSeconds * 1000, endWallMs: null }
    : loadPersistedRuntimeState(config.durationSeconds);

  const status = ref<TimerStatus>(restored.status);
  const remainingMs = ref<number>(restored.remainingMs);
  const nowMs = ref<number>(Date.now());
  const expectedEndWallMs = ref<number | null>(restored.endWallMs);
  const activePresetId = ref<string | null>(findMatchingPresetId(config));

  const wakeLock = useWakeLock();

  // Monotonic clock target prevents NTP clock jumps from warping active countdowns
  let endMonoMs = restored.status === "running" ? getMonoNow() + restored.remainingMs : 0;
  let tickTimeoutId = 0;
  let clockIntervalId = 0;

  function findMatchingPresetId(cfg: TimerConfig): string | null {
    const matched = TECHRAMEN_PRESETS.find(
      (p) =>
        p.seconds === cfg.durationSeconds &&
        p.warnSeconds === cfg.warnSeconds &&
        p.criticalSeconds === cfg.criticalSeconds,
    );
    return matched ? matched.id : null;
  }

  const phase = computed<TimerPhase>(() =>
    computeTimerPhase(status.value, remainingMs.value, config.warnSeconds, config.criticalSeconds),
  );

  const formatted = computed(() => formatRemainingTime(remainingMs.value, config.countUpOvertime));

  const progressRatio = computed(() => {
    const totalMs = config.durationSeconds * 1000;
    if (totalMs <= 0) return 0;
    if (status.value === "idle") return 1;
    return Math.max(0, Math.min(1, remainingMs.value / totalMs));
  });

  const warnRatio = computed(() => {
    if (config.durationSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, config.warnSeconds / config.durationSeconds));
  });

  const criticalRatio = computed(() => {
    if (config.durationSeconds <= 0) return 0;
    return Math.max(0, Math.min(1, config.criticalSeconds / config.durationSeconds));
  });

  const currentClock = computed(() => formatClockTime(nowMs.value));

  const endEtaClock = computed(() => {
    if (status.value === "idle") {
      return formatClockTime(nowMs.value + config.durationSeconds * 1000, true);
    }
    if (status.value === "running" && expectedEndWallMs.value !== null) {
      return formatClockTime(expectedEndWallMs.value, true);
    }
    return formatClockTime(nowMs.value + remainingMs.value, true);
  });

  function persistRuntime(): void {
    if (status.value === "idle") {
      savePersistedRuntimeState(null);
      return;
    }
    if (status.value === "running") {
      savePersistedRuntimeState({
        status: "running",
        durationSeconds: config.durationSeconds,
        endWallMs: expectedEndWallMs.value ?? Date.now() + remainingMs.value,
        savedAt: Date.now(),
      });
      return;
    }
    savePersistedRuntimeState({
      status: "paused",
      durationSeconds: config.durationSeconds,
      remainingMs: remainingMs.value,
      savedAt: Date.now(),
    });
  }

  function clearTickTimer(): void {
    if (tickTimeoutId) {
      window.clearTimeout(tickTimeoutId);
      tickTimeoutId = 0;
    }
  }

  function scheduleNextTick(): void {
    clearTickTimer();
    if (status.value !== "running") return;

    const rem = endMonoMs - getMonoNow();
    let delayMs: number;
    if (rem > 0) {
      const mod = rem % 1000;
      delayMs = mod === 0 ? 1000 : mod;
    } else {
      const mod = Math.abs(rem) % 1000;
      delayMs = 1000 - mod;
    }

    tickTimeoutId = window.setTimeout(
      () => {
        syncTick();
        scheduleNextTick();
      },
      Math.max(4, delayMs),
    );
  }

  function syncTick(): void {
    nowMs.value = Date.now();
    if (status.value === "running") {
      remainingMs.value = endMonoMs - getMonoNow();
    }
  }

  function start(): void {
    if (status.value === "running") return;

    const monoNow = getMonoNow();
    const wallNow = Date.now();
    nowMs.value = wallNow;

    if (status.value === "idle") {
      remainingMs.value = config.durationSeconds * 1000;
    }
    endMonoMs = monoNow + remainingMs.value;
    expectedEndWallMs.value = wallNow + remainingMs.value;
    status.value = "running";
    persistRuntime();
    scheduleNextTick();
    void wakeLock.acquire();
  }

  function pause(): void {
    if (status.value !== "running") return;
    syncTick();
    clearTickTimer();
    expectedEndWallMs.value = null;
    status.value = "paused";
    persistRuntime();
    void wakeLock.release();
  }

  function toggleStartPause(): void {
    if (status.value === "running") {
      pause();
    } else {
      start();
    }
  }

  function reset(): void {
    clearTickTimer();
    expectedEndWallMs.value = null;
    status.value = "idle";
    remainingMs.value = config.durationSeconds * 1000;
    nowMs.value = Date.now();
    persistRuntime();
    void wakeLock.release();
  }

  function adjustSeconds(deltaSeconds: number): void {
    const deltaMs = deltaSeconds * 1000;
    if (status.value === "idle") {
      const nextDuration = clampDurationSeconds(config.durationSeconds + deltaSeconds);
      applyDuration(nextDuration, config.autoThresholds);
      return;
    }
    if (status.value === "running") {
      endMonoMs += deltaMs;
      if (expectedEndWallMs.value !== null) {
        expectedEndWallMs.value += deltaMs;
      }
      syncTick();
      scheduleNextTick();
      persistRuntime();
    } else {
      remainingMs.value += deltaMs;
      persistRuntime();
    }
  }

  function applyPreset(preset: PresetItem): void {
    config.durationSeconds = preset.seconds;
    config.warnSeconds = preset.warnSeconds;
    config.criticalSeconds = preset.criticalSeconds;
    config.autoThresholds = false;
    activePresetId.value = preset.id;
    reset();
  }

  function applyDuration(seconds: number, keepAuto = config.autoThresholds): void {
    const safe = clampDurationSeconds(seconds);
    config.durationSeconds = safe;
    config.autoThresholds = keepAuto;
    if (keepAuto) {
      const auto = computeAutoThresholds(safe);
      config.warnSeconds = auto.warnSeconds;
      config.criticalSeconds = auto.criticalSeconds;
    } else {
      const norm = normalizeThresholds(safe, config.warnSeconds, config.criticalSeconds);
      config.warnSeconds = norm.warnSeconds;
      config.criticalSeconds = norm.criticalSeconds;
    }
    activePresetId.value = findMatchingPresetId(config);
    reset();
  }

  function setThresholds(warnSeconds: number, criticalSeconds: number): void {
    config.autoThresholds = false;
    const norm = normalizeThresholds(config.durationSeconds, warnSeconds, criticalSeconds);
    config.warnSeconds = norm.warnSeconds;
    config.criticalSeconds = norm.criticalSeconds;
    activePresetId.value = findMatchingPresetId(config);
  }

  function setAutoThresholds(enabled: boolean): void {
    config.autoThresholds = enabled;
    if (enabled) {
      const auto = computeAutoThresholds(config.durationSeconds);
      config.warnSeconds = auto.warnSeconds;
      config.criticalSeconds = auto.criticalSeconds;
    }
    activePresetId.value = findMatchingPresetId(config);
  }

  function updateConfig(patch: Partial<TimerConfig>): void {
    if (typeof patch.sessionTitle === "string") {
      config.sessionTitle = patch.sessionTitle.slice(0, 60);
    }
    if (typeof patch.showClock === "boolean") {
      config.showClock = patch.showClock;
    }
    if (typeof patch.showEndEta === "boolean") {
      config.showEndEta = patch.showEndEta;
    }
    if (typeof patch.countUpOvertime === "boolean") {
      config.countUpOvertime = patch.countUpOvertime;
    }
  }

  watch(
    config,
    (next) => {
      try {
        localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    { deep: true },
  );

  function handleVisibilityChange(): void {
    if (document.visibilityState !== "visible") return;
    nowMs.value = Date.now();
    if (status.value === "running") {
      syncTick();
      scheduleNextTick();
    }
  }

  onMounted(() => {
    nowMs.value = Date.now();
    if (status.value === "running") {
      syncTick();
      scheduleNextTick();
      void wakeLock.acquire();
    }

    clockIntervalId = window.setInterval(() => {
      if (status.value !== "running") {
        nowMs.value = Date.now();
      }
    }, 1000);

    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    clearTickTimer();
    if (clockIntervalId) {
      window.clearInterval(clockIntervalId);
    }
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });

  return {
    config: readonly(config),
    status,
    phase,
    remainingMs,
    formatted,
    progressRatio,
    warnRatio,
    criticalRatio,
    currentClock,
    endEtaClock,
    activePresetId,
    wakeLock,
    start,
    pause,
    toggleStartPause,
    reset,
    adjustSeconds,
    applyPreset,
    applyDuration,
    setThresholds,
    setAutoThresholds,
    updateConfig,
  };
}
