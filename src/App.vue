<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import BowlMark from "@/components/BowlMark.vue";
import PaperIcons from "@/components/PaperIcons.vue";
import SetupDrawer from "@/components/SetupDrawer.vue";
import { usePwaInstall } from "@/composables/usePwaInstall";
import { useTimer } from "@/composables/useTimer";
import type { TimerPhase } from "@/types/timer";
import { formatDurationLabel, TECHRAMEN_PRESETS } from "@/utils/timerLogic";

const {
  config,
  status,
  phase,
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
} = useTimer();

const { isStandalone, canInstallPrompt, isIosOrIpadOs, hasUpdate, triggerInstall, reloadToUpdate } =
  usePwaInstall();

const drawerOpen = ref(false);
const previewPhase = ref<TimerPhase | null>(null);
const isLocked = ref(false);
const isUnlocking = ref(false);
const isFullscreen = ref(false);
const supportsFullscreen = ref(false);

let unlockTimerId = 0;

const effectivePhase = computed<TimerPhase>(() => previewPhase.value ?? phase.value);

const PHASE_LABELS: Record<TimerPhase, string> = {
  ready: "準備中",
  normal: "進行中",
  warning: "残りわずか",
  critical: "まもなく終了",
  overtime: "時間超過",
};

const phaseBadgeText = computed(() => {
  if (previewPhase.value) {
    return `プレビュー: ${PHASE_LABELS[previewPhase.value]}`;
  }
  if (status.value === "paused") {
    return `一時停止 ・ ${PHASE_LABELS[phase.value]}`;
  }
  return PHASE_LABELS[phase.value];
});

const primaryBtnLabel = computed(() => {
  if (status.value === "running") return "一時停止";
  if (status.value === "paused") return "再開";
  return "スタート";
});

const quickPresets = computed(() => TECHRAMEN_PRESETS.slice(0, 4));

function handlePrimaryClick(): void {
  if (isLocked.value) return;
  previewPhase.value = null;
  toggleStartPause();
}

function handleLockPressStart(): void {
  if (!isLocked.value) {
    isLocked.value = true;
    drawerOpen.value = false;
    return;
  }
  isUnlocking.value = true;
  clearTimeout(unlockTimerId);
  unlockTimerId = window.setTimeout(() => {
    isLocked.value = false;
    isUnlocking.value = false;
  }, 800);
}

function handleLockPressCancel(): void {
  if (!isUnlocking.value) return;
  isUnlocking.value = false;
  clearTimeout(unlockTimerId);
}

async function toggleFullscreen(): Promise<void> {
  if (!supportsFullscreen.value) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // ignore fullscreen permission errors
  }
}

function syncFullscreenState(): void {
  isFullscreen.value = Boolean(document.fullscreenElement);
}

function handleKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    return;
  }

  if (event.key === "Escape" && drawerOpen.value) {
    drawerOpen.value = false;
    return;
  }

  if (event.key.toLowerCase() === "l") {
    event.preventDefault();
    isLocked.value = !isLocked.value;
    if (isLocked.value) drawerOpen.value = false;
    return;
  }

  if (event.key.toLowerCase() === "f" && supportsFullscreen.value) {
    event.preventDefault();
    void toggleFullscreen();
    return;
  }

  if (isLocked.value || drawerOpen.value) return;

  if (event.code === "Space") {
    event.preventDefault();
    handlePrimaryClick();
  } else if (event.key.toLowerCase() === "r") {
    if (status.value !== "idle") {
      event.preventDefault();
      reset();
    }
  } else if (event.key === "+" || event.key === "=" || event.key === "ArrowUp") {
    event.preventDefault();
    adjustSeconds(60);
  } else if (event.key === "-" || event.key === "ArrowDown") {
    event.preventDefault();
    adjustSeconds(-60);
  }
}

onMounted(() => {
  supportsFullscreen.value = Boolean(document.fullscreenEnabled);
  document.addEventListener("fullscreenchange", syncFullscreenState);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  clearTimeout(unlockTimerId);
  document.removeEventListener("fullscreenchange", syncFullscreenState);
  window.removeEventListener("keydown", handleKeydown);
});

defineExpose({
  status,
  phase,
  formatted,
  isLocked,
  start,
  pause,
  reset,
});
</script>

<template>
  <div class="stage" :data-phase="effectivePhase" :data-status="status">
    <!-- 手描き風の微細歪みフィルタ（ボタンや装飾のみに使用） -->
    <svg width="0" height="0" aria-hidden="true" focusable="false" class="svg-defs">
      <defs>
        <filter id="rough-ink">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.035"
            numOctaves="2"
            seed="4"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" />
        </filter>
      </defs>
    </svg>

    <!-- 上部 HUD -->
    <header class="hud-top">
      <div class="brand">
        <div class="brand__emblem">
          <BowlMark />
        </div>
        <div class="brand__text">
          <span class="brand__kicker hand">TechRAMEN 2026</span>
          <span class="brand__title">{{ config.sessionTitle || "Session Timer" }}</span>
        </div>
      </div>

      <div class="hud-meta">
        <span
          class="stamp-badge phase-pill"
          :class="{ 'is-overtime': effectivePhase === 'overtime' }"
        >
          <span class="phase-dot" aria-hidden="true" />
          {{ phaseBadgeText }}
        </span>

        <span v-if="config.showClock || config.showEndEta" class="hud-chip clock-chip">
          <PaperIcons name="clock" size="0.95rem" />
          <span v-if="config.showClock">{{ currentClock }}</span>
          <span v-if="config.showClock && config.showEndEta" class="clock-sep">→</span>
          <span v-if="config.showEndEta">終了 {{ endEtaClock }}</span>
        </span>

        <span v-if="wakeLock.isActive.value" class="hud-chip wake-chip" title="画面スリープ防止中">
          スリープ防止ON
        </span>

        <button
          v-if="hasUpdate"
          type="button"
          class="hud-btn hud-btn--accent"
          @click="reloadToUpdate"
        >
          更新あり・再読込
        </button>

        <button
          v-if="supportsFullscreen && !isLocked"
          type="button"
          class="hud-btn"
          :aria-label="isFullscreen ? '全画面を終了' : '全画面表示'"
          @click="toggleFullscreen"
        >
          <PaperIcons :name="isFullscreen ? 'exit-fullscreen' : 'fullscreen'" size="1rem" />
        </button>

        <button
          type="button"
          class="hud-btn lock-btn"
          :class="{ 'is-locked': isLocked, 'is-unlocking': isUnlocking }"
          :aria-pressed="isLocked"
          :title="isLocked ? '長押しでロック解除' : '誤操作防止ロック'"
          @pointerdown="handleLockPressStart"
          @pointerup="handleLockPressCancel"
          @pointerleave="handleLockPressCancel"
          @pointercancel="handleLockPressCancel"
        >
          <PaperIcons :name="isLocked ? 'lock' : 'unlock'" size="1rem" />
          <span class="hud-btn__label">
            {{ isUnlocking ? "解除中..." : isLocked ? "長押しで解除" : "ロック" }}
          </span>
        </button>
      </div>
    </header>

    <!-- 中央 タイマー本体 -->
    <main class="stage-main">
      <!-- プレビュー解除バナー -->
      <div v-if="previewPhase !== null" class="preview-banner">
        <span>ステージ色プレビュー中（実際の進行には影響しません）</span>
        <button type="button" class="preview-banner__btn" @click="previewPhase = null">
          プレビュー終了
        </button>
      </div>

      <!-- 待機中のワンタップ・プリセット帯 -->
      <div v-if="status === 'idle' && !isLocked" class="quick-presets" aria-label="セッション枠">
        <button
          v-for="preset in quickPresets"
          :key="preset.id"
          type="button"
          class="quick-ticket"
          :class="{ 'is-active': activePresetId === preset.id }"
          @click="applyPreset(preset)"
        >
          <span class="quick-ticket__tag">{{ preset.tag }}</span>
          <span class="quick-ticket__len">{{ preset.label }}</span>
        </button>
      </div>

      <!-- 巨大カウントダウン数字 -->
      <div class="digits-wrap" aria-live="off">
        <p class="digits-caption hand">
          <template v-if="effectivePhase === 'overtime'">Overtime</template>
          <template v-else-if="effectivePhase === 'ready'">Ready</template>
          <template v-else>Remaining</template>
        </p>
        <div
          class="digits"
          :class="{ 'is-overtime': formatted.isOvertime, 'is-long': formatted.digits.length > 5 }"
          role="timer"
          :aria-label="`残り時間 ${formatted.digits}`"
        >
          {{ formatted.digits }}
        </div>
      </div>

      <!-- 進行ゲージ / しきい値ガイド -->
      <div class="gauge-area">
        <div
          class="gauge-track"
          role="progressbar"
          :aria-valuenow="Math.round(progressRatio * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="gauge-fill" :style="{ transform: `scaleX(${progressRatio})` }" />
          <span
            class="gauge-marker gauge-marker--warn"
            :style="{ left: `${warnRatio * 100}%` }"
            title="残りわずか（黄）"
          />
          <span
            class="gauge-marker gauge-marker--critical"
            :style="{ left: `${criticalRatio * 100}%` }"
            title="まもなく終了（赤）"
          />
        </div>
        <p class="gauge-summary">
          設定 {{ formatDurationLabel(config.durationSeconds) }}
          <span aria-hidden="true">・</span>
          黄 {{ formatDurationLabel(config.warnSeconds) }}
          <span aria-hidden="true">・</span>
          赤 {{ formatDurationLabel(config.criticalSeconds) }}
        </p>
      </div>
    </main>

    <!-- 下部 操作ドック -->
    <footer class="hud-bottom">
      <div v-if="isLocked" class="locked-notice">
        <PaperIcons name="lock" size="1rem" />
        <span>誤操作防止ロック中（右上の鍵ボタンを長押しで解除）</span>
      </div>

      <div v-else class="controls-dock">
        <button
          type="button"
          class="paper-btn ctrl-btn ctrl-btn--ghost"
          aria-label="1分減らす"
          @click="adjustSeconds(-60)"
        >
          -1分
        </button>

        <button
          type="button"
          class="paper-btn ctrl-btn ctrl-btn--primary"
          @click="handlePrimaryClick"
        >
          <PaperIcons :name="status === 'running' ? 'pause' : 'play'" size="1.2rem" />
          <span>{{ primaryBtnLabel }}</span>
        </button>

        <button
          type="button"
          class="paper-btn ctrl-btn ctrl-btn--ghost"
          aria-label="1分増やす"
          @click="adjustSeconds(60)"
        >
          +1分
        </button>

        <button
          type="button"
          class="paper-btn ctrl-btn ctrl-btn--ghost"
          :disabled="status === 'idle'"
          @click="reset"
        >
          <PaperIcons name="reset" size="1.05rem" />
          <span>リセット</span>
        </button>

        <button type="button" class="paper-btn ctrl-btn ctrl-btn--ghost" @click="drawerOpen = true">
          <PaperIcons name="sliders" size="1.05rem" />
          <span>設定</span>
        </button>
      </div>
    </footer>

    <SetupDrawer
      :open="drawerOpen"
      :config="config"
      :active-preset-id="activePresetId"
      :preview-phase="previewPhase"
      :is-standalone="isStandalone"
      :can-install-prompt="canInstallPrompt"
      :is-ios-or-ipad-os="isIosOrIpadOs"
      @close="drawerOpen = false"
      @select-preset="applyPreset"
      @apply-duration="applyDuration"
      @update-thresholds="setThresholds"
      @toggle-auto-thresholds="setAutoThresholds"
      @update-config="(patch) => Object.assign(config, patch)"
      @set-preview-phase="(p) => (previewPhase = p)"
      @install-pwa="triggerInstall"
    />
  </div>
</template>

<style scoped>
.svg-defs {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

.stage {
  position: relative;
  min-height: 100dvh;
  height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  padding: max(0.85rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  background-color: var(--stage-bg);
  background-image: var(--stage-bg-accent);
  color: var(--stage-fg);
  overflow: hidden;
  transition:
    background-color 0.45s var(--ease-settle),
    color 0.3s ease;
}

/* 時間超過時の外周警告リング */
.stage[data-phase="overtime"]::after {
  content: "";
  position: absolute;
  inset: 0.45rem;
  border-radius: 20px;
  border: 4px solid var(--stage-ring);
  pointer-events: none;
  animation: pulse-ring 1.35s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}

/* ---------- 上部 HUD ---------- */
.hud-top {
  position: relative;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem 1rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}

.brand__emblem {
  width: clamp(2.2rem, 4vw, 2.75rem);
  height: clamp(2.2rem, 4vw, 2.75rem);
  flex: none;
  filter: url(#rough-ink);
}

.brand__text {
  display: grid;
  line-height: 1.1;
  min-width: 0;
}

.brand__kicker {
  font-size: clamp(0.95rem, 2vw, 1.15rem);
  color: var(--stage-fg-muted);
}

.brand__title {
  font-size: clamp(0.98rem, 2.2vw, 1.25rem);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hud-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
}

.phase-pill {
  font-size: clamp(0.78rem, 1.6vw, 0.92rem);
  background: var(--stage-pill-bg);
  color: var(--stage-pill-fg);
  border-color: var(--stage-pill-border);
}

.phase-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: currentColor;
}

.phase-pill.is-overtime .phase-dot {
  animation: pulse-ring 0.8s ease-in-out infinite;
}

.hud-chip,
.hud-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.42rem 0.78rem;
  border-radius: 999px;
  border: 1.5px solid var(--stage-pill-border);
  background: var(--stage-pill-bg);
  color: var(--stage-pill-fg);
  font-size: clamp(0.78rem, 1.5vw, 0.88rem);
  font-weight: 700;
  line-height: 1.2;
}

.hud-btn {
  cursor: pointer;
  user-select: none;
  transition: transform 0.12s var(--ease-settle);
}

.hud-btn:active {
  transform: scale(0.96);
}

.hud-btn--accent {
  background: var(--gold);
  color: var(--ink);
  border-color: transparent;
}

.clock-chip {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.clock-sep {
  opacity: 0.6;
}

.lock-btn.is-locked {
  border-color: currentColor;
}

.lock-btn.is-unlocking {
  transform: scale(0.95);
  box-shadow: 0 0 0 3px var(--gold);
}

/* ---------- 中央 タイマー ---------- */
.stage-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(0.75rem, 2.4dvh, 1.8rem);
  min-height: 0;
  padding-block: 0.5rem;
}

.preview-banner {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.45rem 0.9rem;
  border-radius: 12px;
  background: rgba(251, 244, 230, 0.92);
  color: var(--ink);
  font-size: 0.85rem;
  font-weight: 700;
  box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.4);
}

.preview-banner__btn {
  border: 0;
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  background: var(--grape);
  color: var(--snow);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.quick-presets {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.55rem;
  max-width: 48rem;
}

.quick-ticket {
  display: inline-flex;
  align-items: baseline;
  gap: 0.45rem;
  padding: 0.48rem 0.9rem;
  border-radius: 10px 8px 11px 9px;
  border: 1.5px solid rgba(110, 139, 61, 0.4);
  background-color: var(--ticket-ground);
  color: var(--ink);
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 12px -8px rgba(46, 40, 38, 0.45);
  transition:
    transform 0.14s var(--ease-settle),
    border-color 0.14s ease;
}

.quick-ticket.is-active {
  border-color: var(--wine);
  background: var(--paper-card);
  box-shadow:
    inset 0 0 0 1.5px var(--wine),
    0 8px 16px -10px rgba(123, 44, 58, 0.5);
}

.quick-ticket__tag {
  font-size: 0.76rem;
  color: var(--wine);
}

.quick-ticket__len {
  font-size: 0.96rem;
}

.digits-wrap {
  display: grid;
  justify-items: center;
  text-align: center;
  user-select: none;
}

.digits-caption {
  margin: 0 0 0.1em;
  font-size: clamp(1.3rem, 3.2vw, 2.2rem);
  line-height: 1;
  color: var(--stage-fg-muted);
}

.digits {
  font-family: var(--font-mono);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  line-height: 0.94;
  font-size: min(23.5vw, 37dvh, 21rem);
  text-shadow: 0 8px 28px rgba(24, 14, 12, 0.12);
}

.digits.is-long {
  font-size: min(17.5vw, 32dvh, 16rem);
}

.gauge-area {
  width: min(100%, 46rem);
  display: grid;
  gap: 0.45rem;
}

.gauge-track {
  position: relative;
  height: 0.72rem;
  border-radius: 999px;
  background: var(--stage-gauge-track);
  overflow: hidden;
}

.gauge-fill {
  position: absolute;
  inset: 0;
  transform-origin: left center;
  background: var(--stage-gauge-fill);
  border-radius: inherit;
  transition: transform 0.2s linear;
}

.gauge-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  opacity: 0.7;
  transform: translateX(-1px);
}

.gauge-marker--warn {
  background: #f6c453;
}

.gauge-marker--critical {
  background: #e25668;
}

.gauge-summary {
  margin: 0;
  text-align: center;
  font-size: clamp(0.78rem, 1.5vw, 0.92rem);
  font-weight: 500;
  color: var(--stage-fg-muted);
}

/* ---------- 下部 操作ドック ---------- */
.hud-bottom {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 3.6rem;
}

.controls-dock {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: clamp(0.45rem, 1.4vw, 0.8rem);
}

.ctrl-btn {
  min-height: 3rem;
  font-size: clamp(0.92rem, 1.8vw, 1.05rem);
}

.ctrl-btn--primary {
  min-width: clamp(8.5rem, 20vw, 11.5rem);
  padding-inline: 1.8em;
  background: var(--stage-btn-primary-bg);
  color: var(--stage-btn-primary-fg);
}

.ctrl-btn--ghost {
  background: var(--stage-btn-ghost-bg);
  color: var(--stage-btn-ghost-fg);
  border: 1.5px solid var(--stage-pill-border);
}

.locked-notice {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.95rem;
  border-radius: 999px;
  background: var(--stage-pill-bg);
  border: 1px solid var(--stage-pill-border);
  color: var(--stage-fg-muted);
  font-size: 0.82rem;
  font-weight: 700;
}

@media (max-width: 639px) {
  .hud-btn__label {
    display: none;
  }
  .wake-chip {
    display: none;
  }
}
</style>
