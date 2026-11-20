import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useWakeLock } from "@/composables/useWakeLock";
import type { PresetItem, TimerConfig, TimerPhase, TimerStatus } from "@/types/timer";
import { playChime, unlockAudio } from "@/utils/chime";
import {
  clampDurationSeconds,
  computeAutoThresholds,
  computeTimerPhase,
  DEFAULT_TIMER_CONFIG,
  formatClockTime,
  formatRemainingTime,
  normalizeThresholds,
  parseQueryConfig,
  TECHRAMEN_PRESETS,
} from "@/utils/timerLogic";

const STORAGE_KEY = "techramen-2026-session-timer:v1";

function loadInitialConfig(): TimerConfig {
  let base: TimerConfig = { ...DEFAULT_TIMER_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TimerConfig>;
      base = { ...base, ...parsed };
    }
  } catch {
    // ignore storage errors
  }

  if (typeof window !== "undefined" && window.location.search) {
    const fromQuery = parseQueryConfig(window.location.search);
    base = { ...base, ...fromQuery };
  }

  const durationSeconds = clampDurationSeconds(base.durationSeconds);
  const thresholds = base.autoThresholds
    ? computeAutoThresholds(durationSeconds)
    : normalizeThresholds(durationSeconds, base.warnSeconds, base.criticalSeconds);

  return {
    ...base,
    durationSeconds,
    warnSeconds: thresholds.warnSeconds,
    criticalSeconds: thresholds.criticalSeconds,
  };
}

export function useTimer() {
  const config = reactive<TimerConfig>(loadInitialConfig());
  const status = ref<TimerStatus>("idle");
  const remainingMs = ref<number>(config.durationSeconds * 1000);
  const nowMs = ref<number>(Date.now());
  const activePresetId = ref<string | null>(findMatchingPresetId(config));

  const wakeLock = useWakeLock();

  let targetEndMs = 0;
  let rafId = 0;
  let intervalId = 0;
  let lastPhase: TimerPhase = "ready";

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
      return formatClockTime(nowMs.value + config.durationSeconds * 1000);
    }
    if (remainingMs.value <= 0) {
      return formatClockTime(nowMs.value);
    }
    return formatClockTime(nowMs.value + remainingMs.value);
  });

  function maybePlayPhaseChime(nextPhase: TimerPhase, prevPhase: TimerPhase): void {
    if (nextPhase === prevPhase || config.chimeMode === "off") return;

    if (nextPhase === "warning" && config.chimeMode === "warn-and-end") {
      playChime("warning");
    } else if (nextPhase === "critical" && config.chimeMode === "warn-and-end") {
      playChime("critical");
    } else if (nextPhase === "overtime") {
      playChime("overtime");
    }
  }

  function syncTick(): void {
    const current = Date.now();
    nowMs.value = current;

    if (status.value === "running") {
      const nextRemaining = targetEndMs - current;
      const prevPhase = lastPhase;
      remainingMs.value = nextRemaining;
      const nextPhase = computeTimerPhase(
        "running",
        nextRemaining,
        config.warnSeconds,
        config.criticalSeconds,
      );
      lastPhase = nextPhase;
      maybePlayPhaseChime(nextPhase, prevPhase);
    }
  }

  function startLoop(): void {
    stopLoop();
    const step = () => {
      syncTick();
      if (status.value === "running") {
        rafId = window.requestAnimationFrame(step);
      }
    };
    rafId = window.requestAnimationFrame(step);
    // Backup interval when tab/screen dims or rAF throttles
    intervalId = window.setInterval(syncTick, 250);
  }

  function stopLoop(): void {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = 0;
    }
  }

  function start(): void {
    unlockAudio();
    if (status.value === "running") return;

    const current = Date.now();
    nowMs.value = current;
    if (status.value === "idle") {
      remainingMs.value = config.durationSeconds * 1000;
    }
    targetEndMs = current + remainingMs.value;
    status.value = "running";
    lastPhase = computeTimerPhase(
      "running",
      remainingMs.value,
      config.warnSeconds,
      config.criticalSeconds,
    );
    startLoop();
    void wakeLock.acquire();
  }

  function pause(): void {
    if (status.value !== "running") return;
    syncTick();
    status.value = "paused";
    stopLoop();
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
    stopLoop();
    status.value = "idle";
    remainingMs.value = config.durationSeconds * 1000;
    lastPhase = "ready";
    nowMs.value = Date.now();
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
      targetEndMs += deltaMs;
      syncTick();
    } else {
      remainingMs.value += deltaMs;
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

  function testChime(): void {
    unlockAudio();
    playChime("test");
  }

  watch(
    () => ({ ...config }),
    (next) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    { deep: true },
  );

  let clockTimerId = 0;

  onMounted(() => {
    nowMs.value = Date.now();
    clockTimerId = window.setInterval(() => {
      if (status.value !== "running") {
        nowMs.value = Date.now();
      }
    }, 5000);
  });

  onBeforeUnmount(() => {
    stopLoop();
    if (clockTimerId) {
      window.clearInterval(clockTimerId);
    }
  });

  return {
    config,
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
    testChime,
  };
}
