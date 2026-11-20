import { onBeforeUnmount, onMounted, ref } from "vue";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

export function useWakeLock() {
  const isSupported = ref(false);
  const isActive = ref(false);
  let sentinel: WakeLockSentinelLike | null = null;
  let shouldKeepAwake = false;

  async function requestLock(): Promise<void> {
    if (typeof navigator === "undefined") return;
    const nav = navigator as unknown as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    isSupported.value = true;

    if (sentinel && !sentinel.released) return;
    if (document.visibilityState !== "visible") return;

    try {
      const next = await nav.wakeLock.request("screen");
      sentinel = next;
      isActive.value = true;
      next.addEventListener?.("release", () => {
        if (sentinel === next) {
          sentinel = null;
          isActive.value = false;
        }
      });
    } catch {
      isActive.value = false;
    }
  }

  async function acquire(): Promise<void> {
    shouldKeepAwake = true;
    await requestLock();
  }

  async function release(): Promise<void> {
    shouldKeepAwake = false;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
      } catch {
        // ignore release error
      }
    }
    sentinel = null;
    isActive.value = false;
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "visible" && shouldKeepAwake) {
      void requestLock();
    }
  }

  onMounted(() => {
    const nav = navigator as unknown as NavigatorWithWakeLock;
    isSupported.value = Boolean(nav.wakeLock);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    void release();
  });

  return {
    isSupported,
    isActive,
    acquire,
    release,
  };
}
