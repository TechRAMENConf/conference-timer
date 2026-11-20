<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import PaperIcons from "@/components/PaperIcons.vue";
import type { PresetItem, TimerConfig, TimerPhase } from "@/types/timer";
import { formatDurationLabel, TECHRAMEN_PRESETS } from "@/utils/timerLogic";

const props = defineProps<{
  open: boolean;
  isTimerActive: boolean;
  config: TimerConfig;
  activePresetId: string | null;
  previewPhase: TimerPhase | null;
  isStandalone: boolean;
  canInstallPrompt: boolean;
  isIosOrIpadOs: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "select-preset": [preset: PresetItem];
  "apply-duration": [seconds: number];
  "update-thresholds": [warnSeconds: number, criticalSeconds: number];
  "toggle-auto-thresholds": [enabled: boolean];
  "update-config": [patch: Partial<TimerConfig>];
  "set-preview-phase": [phase: TimerPhase | null];
  "install-pwa": [];
}>();

const dialogEl = useTemplateRef<HTMLDialogElement>("dialogEl");

const customMinutes = ref<number | string>(Math.floor(props.config.durationSeconds / 60));
const customSeconds = ref<number | string>(props.config.durationSeconds % 60);

const warnMinutes = ref<number | string>(Math.floor(props.config.warnSeconds / 60));
const warnRemSeconds = ref<number | string>(props.config.warnSeconds % 60);

const criticalMinutes = ref<number | string>(Math.floor(props.config.criticalSeconds / 60));
const criticalRemSeconds = ref<number | string>(props.config.criticalSeconds % 60);

type PendingChange =
  | { kind: "preset"; preset: PresetItem; label: string }
  | { kind: "duration"; seconds: number; label: string };

const pendingChange = ref<PendingChange | null>(null);

function syncFormFromProps(): void {
  customMinutes.value = Math.floor(props.config.durationSeconds / 60);
  customSeconds.value = props.config.durationSeconds % 60;
  warnMinutes.value = Math.floor(props.config.warnSeconds / 60);
  warnRemSeconds.value = props.config.warnSeconds % 60;
  criticalMinutes.value = Math.floor(props.config.criticalSeconds / 60);
  criticalRemSeconds.value = props.config.criticalSeconds % 60;
}

watch(
  () => [
    props.open,
    props.config.durationSeconds,
    props.config.warnSeconds,
    props.config.criticalSeconds,
  ],
  ([isOpen], prev) => {
    const wasOpen = prev?.[0];
    if (isOpen && !wasOpen) {
      pendingChange.value = null;
      syncFormFromProps();
      const el = dialogEl.value;
      if (el && !el.open) {
        if (typeof el.showModal === "function") {
          el.showModal();
        } else {
          el.setAttribute("open", "");
        }
      }
    } else if (!isOpen && wasOpen) {
      pendingChange.value = null;
      const el = dialogEl.value;
      if (el?.open) {
        if (typeof el.close === "function") {
          el.close();
        } else {
          el.removeAttribute("open");
        }
      }
    } else if (isOpen) {
      syncFormFromProps();
    }
  },
  { flush: "post" },
);

const previewOptions: { phase: TimerPhase; label: string; swatch: string }[] = [
  { phase: "ready", label: "待機", swatch: "#f3e8d8" },
  { phase: "normal", label: "進行中", swatch: "#3e5e22" },
  { phase: "warning", label: "残りわずか", swatch: "#d99b26" },
  { phase: "critical", label: "まもなく終了", swatch: "#8d1f32" },
  { phase: "overtime", label: "時間超過", swatch: "#3b0d17" },
];

const quickRoomTags = ["2F 大ホール", "1F ラウンジ", "LT大会", "Keynote"];

const autoThresholdSummary = computed(
  () =>
    `黄 ${formatDurationLabel(props.config.warnSeconds)} / 赤 ${formatDurationLabel(props.config.criticalSeconds)}`,
);

function toBoundedInt(raw: number | string, min: number, max: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function requestPreset(preset: PresetItem): void {
  if (props.isTimerActive) {
    pendingChange.value = {
      kind: "preset",
      preset,
      label: `${preset.tag}（${preset.label}）`,
    };
    return;
  }
  emit("select-preset", preset);
}

function submitCustomDuration(): void {
  const m = toBoundedInt(customMinutes.value, 0, 180);
  const s = toBoundedInt(customSeconds.value, 0, 59);
  const total = Math.max(10, Math.min(180 * 60, m * 60 + s));
  customMinutes.value = Math.floor(total / 60);
  customSeconds.value = total % 60;

  if (props.isTimerActive) {
    pendingChange.value = {
      kind: "duration",
      seconds: total,
      label: formatDurationLabel(total),
    };
    return;
  }
  emit("apply-duration", total);
}

function confirmPendingChange(): void {
  const change = pendingChange.value;
  if (!change) return;
  pendingChange.value = null;
  if (change.kind === "preset") {
    emit("select-preset", change.preset);
  } else {
    emit("apply-duration", change.seconds);
  }
}

function submitCustomThresholds(): void {
  const wm = toBoundedInt(warnMinutes.value, 0, 179);
  const ws = toBoundedInt(warnRemSeconds.value, 0, 59);
  const cm = toBoundedInt(criticalMinutes.value, 0, 179);
  const cs = toBoundedInt(criticalRemSeconds.value, 0, 59);
  emit("update-thresholds", wm * 60 + ws, cm * 60 + cs);
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === dialogEl.value) {
    emit("close");
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="drawer-dialog"
    aria-label="タイマー設定"
    @cancel.prevent="emit('close')"
    @click="handleBackdropClick"
  >
    <div v-if="open" class="drawer-sheet">
      <span class="tape-strip" aria-hidden="true" />

      <header class="drawer-head">
        <div>
          <p class="drawer-eyebrow hand">Session Setup</p>
          <h2 class="drawer-title">セッションタイマー設定</h2>
        </div>
        <button type="button" class="drawer-close" aria-label="設定を閉じる" @click="emit('close')">
          <PaperIcons name="close" size="1.25rem" />
        </button>
      </header>

      <div class="drawer-body">
        <!-- 稼働中のリセット確認バナー -->
        <div v-if="pendingChange" class="confirm-banner" role="alert">
          <p class="confirm-banner__text">
            タイマー進行中です。リセットして
            <strong>{{ pendingChange.label }}</strong> に切り替えますか？
          </p>
          <div class="confirm-banner__actions">
            <button
              type="button"
              class="paper-btn apply-btn apply-btn--sm"
              @click="confirmPendingChange"
            >
              リセットして切替
            </button>
            <button type="button" class="tag-pill" @click="pendingChange = null">キャンセル</button>
          </div>
        </div>

        <!-- 1. プリセット -->
        <section class="panel-block">
          <h3 class="block-title">セッション枠プリセット</h3>
          <div class="preset-grid">
            <button
              v-for="preset in TECHRAMEN_PRESETS"
              :key="preset.id"
              type="button"
              class="preset-ticket"
              :class="{ 'is-active': activePresetId === preset.id }"
              @click="requestPreset(preset)"
            >
              <span class="preset-ticket__tag">{{ preset.tag }}</span>
              <strong class="preset-ticket__time">{{ preset.label }}</strong>
              <span class="preset-ticket__meta">
                黄 {{ formatDurationLabel(preset.warnSeconds) }}・赤
                {{ formatDurationLabel(preset.criticalSeconds) }}
              </span>
            </button>
          </div>
        </section>

        <!-- 2. カスタム時間 -->
        <section class="panel-block">
          <h3 class="block-title">自由な時間に設定</h3>
          <form class="inline-form" @submit.prevent="submitCustomDuration">
            <label class="num-field">
              <input
                v-model.number="customMinutes"
                type="number"
                min="0"
                max="180"
                inputmode="numeric"
              />
              <span>分</span>
            </label>
            <label class="num-field">
              <input
                v-model.number="customSeconds"
                type="number"
                min="0"
                max="59"
                inputmode="numeric"
              />
              <span>秒</span>
            </label>
            <button type="submit" class="paper-btn apply-btn">この時間でセット</button>
          </form>
        </section>

        <!-- 3. 背景色が変わるタイミング & プレビュー -->
        <section class="panel-block">
          <div class="block-head-row">
            <h3 class="block-title">背景色が変わる残り時間</h3>
            <label class="toggle-chip">
              <input
                type="checkbox"
                :checked="config.autoThresholds"
                @change="
                  emit('toggle-auto-thresholds', ($event.target as HTMLInputElement).checked)
                "
              />
              <span>枠に合わせて自動</span>
            </label>
          </div>

          <p v-if="config.autoThresholds" class="hint-text">
            現在の自動設定: <strong>{{ autoThresholdSummary }}</strong>
          </p>

          <form v-else class="threshold-grid" @submit.prevent="submitCustomThresholds">
            <div class="threshold-row">
              <span class="swatch-dot swatch-dot--warn" />
              <span class="threshold-label">残りわずか（黄）</span>
              <label class="num-field num-field--sm">
                <input v-model.number="warnMinutes" type="number" min="0" max="179" />
                <span>分</span>
              </label>
              <label class="num-field num-field--sm">
                <input v-model.number="warnRemSeconds" type="number" min="0" max="59" />
                <span>秒</span>
              </label>
            </div>
            <div class="threshold-row">
              <span class="swatch-dot swatch-dot--critical" />
              <span class="threshold-label">まもなく終了（赤）</span>
              <label class="num-field num-field--sm">
                <input v-model.number="criticalMinutes" type="number" min="0" max="179" />
                <span>分</span>
              </label>
              <label class="num-field num-field--sm">
                <input v-model.number="criticalRemSeconds" type="number" min="0" max="59" />
                <span>秒</span>
              </label>
            </div>
            <button type="submit" class="paper-btn apply-btn apply-btn--sm">しきい値を反映</button>
          </form>

          <div class="preview-strip">
            <span class="preview-strip__label">
              <PaperIcons name="eye" size="1rem" /> ステージ色プレビュー:
            </span>
            <div class="preview-chips">
              <button
                v-for="item in previewOptions"
                :key="item.phase"
                type="button"
                class="preview-chip"
                :class="{ 'is-selected': previewPhase === item.phase }"
                @click="emit('set-preview-phase', previewPhase === item.phase ? null : item.phase)"
              >
                <span class="swatch-dot" :style="{ backgroundColor: item.swatch }" />
                {{ item.label }}
              </button>
              <button
                v-if="previewPhase !== null"
                type="button"
                class="preview-chip preview-chip--clear"
                @click="emit('set-preview-phase', null)"
              >
                戻す
              </button>
            </div>
          </div>
        </section>

        <!-- 4. 会場・セッション表示 -->
        <section class="panel-block">
          <h3 class="block-title">画面表示</h3>

          <label class="text-field">
            <span class="text-field__label">会場・セッション名（任意・画面上部に表示）</span>
            <input
              type="text"
              :value="config.sessionTitle"
              maxlength="60"
              placeholder="例: 2F 大ホール / LT大会"
              @input="
                emit('update-config', {
                  sessionTitle: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </label>
          <div class="quick-tags">
            <button
              v-for="tag in quickRoomTags"
              :key="tag"
              type="button"
              class="tag-pill"
              @click="emit('update-config', { sessionTitle: tag })"
            >
              {{ tag }}
            </button>
            <button
              v-if="config.sessionTitle"
              type="button"
              class="tag-pill tag-pill--clear"
              @click="emit('update-config', { sessionTitle: '' })"
            >
              クリア
            </button>
          </div>

          <div class="check-list">
            <label class="toggle-chip">
              <input
                type="checkbox"
                :checked="config.showClock"
                @change="
                  emit('update-config', {
                    showClock: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>現在時刻を表示</span>
            </label>
            <label class="toggle-chip">
              <input
                type="checkbox"
                :checked="config.showEndEta"
                @change="
                  emit('update-config', {
                    showEndEta: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>終了予定を表示</span>
            </label>
            <label class="toggle-chip">
              <input
                type="checkbox"
                :checked="config.countUpOvertime"
                @change="
                  emit('update-config', {
                    countUpOvertime: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              <span>00:00 以降も超過時間をカウント</span>
            </label>
          </div>
        </section>

        <!-- 5. タブレット PWA 案内 -->
        <section v-if="!isStandalone" class="panel-block pwa-card">
          <h3 class="block-title">タブレットへのインストール（PWA）</h3>
          <p class="hint-text">
            ホーム画面に追加すると、ブラウザの枠なしで全画面表示され、オフライン会場でも動作します。
          </p>
          <div v-if="canInstallPrompt" class="pwa-actions">
            <button type="button" class="paper-btn apply-btn" @click="emit('install-pwa')">
              <PaperIcons name="download" size="1.05rem" /> アプリをインストール
            </button>
          </div>
          <p v-else-if="isIosOrIpadOs" class="hint-text hint-text--steps">
            iPad / iPhone の Safari では、画面上部の <strong>共有ボタン（□↑）</strong> →
            <strong>「ホーム画面に追加」</strong> をタップしてください。
          </p>
          <p v-else class="hint-text">
            ブラウザのメニューから「ホーム画面に追加」または「アプリをインストール」を選択できます。
          </p>
        </section>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.drawer-dialog {
  margin: auto;
  padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
    max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
  border: 0;
  background: transparent;
  max-width: none;
  max-height: none;
  width: min(100%, 46rem);
  overflow: visible;
}

.drawer-dialog::backdrop {
  background: rgba(28, 20, 18, 0.56);
  backdrop-filter: blur(4px);
}

.drawer-sheet {
  position: relative;
  width: 100%;
  max-height: min(90dvh, 52rem);
  display: flex;
  flex-direction: column;
  background-color: var(--paper-card);
  background-image: radial-gradient(
    120% 100% at 20% 10%,
    rgba(207, 155, 62, 0.12),
    transparent 60%
  );
  color: var(--ink);
  border-radius: 18px 13px 20px 14px / 14px 19px 13px 17px;
  border: 2px solid rgba(96, 60, 28, 0.22);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 24px 60px -16px rgba(20, 12, 10, 0.55);
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem 1.5rem 0.9rem;
  border-bottom: 1.5px dashed rgba(91, 42, 78, 0.24);
}

.drawer-eyebrow {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--wine);
}

.drawer-title {
  margin: 0.1rem 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--grape);
}

.drawer-close {
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 1.5px solid rgba(91, 42, 78, 0.25);
  border-radius: 50%;
  background: var(--paper);
  color: var(--ink);
  cursor: pointer;
}

.drawer-body {
  overflow-y: auto;
  padding: 1rem 1.5rem 1.6rem;
  display: grid;
  gap: 1.25rem;
}

.confirm-banner {
  display: grid;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: #fdf0d5;
  border: 1.5px solid var(--wine);
}

.confirm-banner__text {
  margin: 0;
  font-size: 0.88rem;
  color: var(--ink);
}

.confirm-banner__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.panel-block {
  display: grid;
  gap: 0.65rem;
  padding-bottom: 1.1rem;
  border-bottom: 1px dashed rgba(46, 40, 38, 0.16);
}

.panel-block:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.block-head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.block-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--grape);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
  gap: 0.65rem;
}

.preset-ticket {
  display: grid;
  gap: 0.2rem;
  text-align: left;
  padding: 0.75rem 0.9rem;
  border-radius: 10px;
  border: 1.5px solid rgba(110, 139, 61, 0.35);
  background-color: var(--ticket-ground);
  background-image: repeating-linear-gradient(
    135deg,
    rgba(110, 139, 61, 0.08) 0 1px,
    transparent 1px 7px
  );
  cursor: pointer;
  transition:
    transform 0.12s var(--ease-settle),
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.preset-ticket.is-active {
  border-color: var(--wine);
  background-color: #fbf0e4;
  box-shadow:
    inset 0 0 0 1.5px var(--wine),
    0 6px 14px -8px rgba(123, 44, 58, 0.45);
}

.preset-ticket:active {
  transform: scale(0.98);
}

.preset-ticket__tag {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--wine);
}

.preset-ticket__time {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--ink);
}

.preset-ticket__meta {
  font-size: 0.75rem;
  color: var(--ink-soft);
}

.inline-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.num-field {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.7rem;
  border: 1.5px solid rgba(46, 40, 38, 0.24);
  border-radius: 10px;
  background: var(--snow);
  font-weight: 700;
}

.num-field input {
  width: 3.4rem;
  border: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: 700;
  text-align: right;
  outline: none;
}

.num-field--sm input {
  width: 2.7rem;
  font-size: max(16px, 1rem);
}

.apply-btn {
  background: var(--grape);
  color: var(--snow);
  padding: 0.65rem 1.15rem;
  font-size: 0.92rem;
}

.apply-btn--sm {
  justify-self: start;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
}

.threshold-grid {
  display: grid;
  gap: 0.6rem;
}

.threshold-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.threshold-label {
  min-width: 9.2rem;
  font-size: 0.9rem;
  font-weight: 700;
}

.swatch-dot {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 50%;
  border: 1px solid rgba(46, 40, 38, 0.35);
  display: inline-block;
  flex: none;
}

.swatch-dot--warn {
  background: #d99b26;
}

.swatch-dot--critical {
  background: #8d1f32;
}

.preview-strip {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  background: rgba(231, 216, 191, 0.45);
}

.preview-strip__label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--ink-soft);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.preview-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  border: 1.5px solid rgba(46, 40, 38, 0.2);
  background: var(--snow);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.preview-chip.is-selected {
  border-color: var(--grape);
  box-shadow: 0 0 0 2px rgba(91, 42, 78, 0.25);
}

.preview-chip--clear {
  background: var(--paper-deep);
}

.text-field {
  display: grid;
  gap: 0.3rem;
}

.text-field__label {
  font-size: 0.84rem;
  color: var(--ink-soft);
  font-weight: 700;
}

.text-field input {
  width: 100%;
  padding: 0.55rem 0.8rem;
  border: 1.5px solid rgba(46, 40, 38, 0.24);
  border-radius: 10px;
  background: var(--snow);
  font-size: max(16px, 1rem);
}

.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-pill {
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(91, 42, 78, 0.26);
  background: var(--paper);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.tag-pill--clear {
  background: transparent;
  color: var(--ink-soft);
}

.check-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.1rem;
}

.toggle-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
}

.toggle-chip input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--grape);
}

.hint-text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--ink-soft);
  line-height: 1.55;
}

.pwa-card {
  padding: 0.95rem 1rem;
  border-radius: 12px;
  background: rgba(238, 240, 222, 0.85);
  border: 1.5px dashed rgba(110, 139, 61, 0.45);
}

.pwa-actions {
  display: flex;
  gap: 0.5rem;
}
</style>
