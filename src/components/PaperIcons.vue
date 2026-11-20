<script setup lang="ts">
export type PaperIconName =
  | "play"
  | "pause"
  | "reset"
  | "sliders"
  | "lock"
  | "unlock"
  | "fullscreen"
  | "exit-fullscreen"
  | "download"
  | "clock"
  | "close"
  | "eye";

withDefaults(
  defineProps<{
    name: PaperIconName;
    size?: string;
  }>(),
  {
    size: "1.1em",
  },
);
</script>

<template>
  <svg
    class="paper-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'play'">
      <path d="M7 5.2 L18.6 12 L7 18.8 Z" fill="currentColor" stroke-linejoin="round" />
    </template>
    <template v-else-if="name === 'pause'">
      <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
    </template>
    <template v-else-if="name === 'reset'">
      <path d="M4.5 11.5 A7.5 7.5 0 1 1 6.7 16.8" />
      <path d="M4.5 5.8 V11.5 H10.2" />
    </template>
    <template v-else-if="name === 'sliders'">
      <path d="M4 7 H20 M4 12 H20 M4 17 H20" />
      <circle cx="9" cy="7" r="2.2" fill="var(--stage-bg, #f3e8d8)" />
      <circle cx="15" cy="12" r="2.2" fill="var(--stage-bg, #f3e8d8)" />
      <circle cx="10" cy="17" r="2.2" fill="var(--stage-bg, #f3e8d8)" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5 V7.5 A4 4 0 0 1 16 7.5 V10.5" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'unlock'">
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5 V7.5 A4 4 0 0 1 15.6 6" />
    </template>
    <template v-else-if="name === 'fullscreen'">
      <path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />
    </template>
    <template v-else-if="name === 'exit-fullscreen'">
      <path d="M9 4 V9 H4 M20 9 H15 V4 M15 20 V15 H20 M4 15 H9 V20" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 4 V14.5 M7.8 10.8 L12 15 L16.2 10.8" />
      <path d="M5 18.5 H19" />
    </template>
    <template v-else-if="name === 'clock'">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7 V12.3 L15.6 14.4" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="M6 6 L18 18 M18 6 L6 18" />
    </template>
    <template v-else-if="name === 'eye'">
      <path
        d="M2.5 12 C5.2 7.5 8.5 5.5 12 5.5 C15.5 5.5 18.8 7.5 21.5 12 C18.8 16.5 15.5 18.5 12 18.5 C8.5 18.5 5.2 16.5 2.5 12 Z"
      />
      <circle cx="12" cy="12" r="2.8" />
    </template>
  </svg>
</template>

<style scoped>
.paper-icon {
  display: inline-block;
  flex: none;
  vertical-align: -0.15em;
}
</style>
