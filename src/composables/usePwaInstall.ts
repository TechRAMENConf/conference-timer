import { onBeforeUnmount, onMounted, ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function usePwaInstall() {
  const isStandalone = ref(false);
  const canInstallPrompt = ref(false);
  const isIosOrIpadOs = ref(false);
  const hasUpdate = ref(false);
  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  let waitingRegistration: ServiceWorkerRegistration | null = null;

  function detectEnvironment(): void {
    if (typeof window === "undefined") return;
    const standaloneMedia = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
    const iosStandalone = Boolean((navigator as unknown as { standalone?: boolean }).standalone);
    isStandalone.value = standaloneMedia || iosStandalone;

    const ua = navigator.userAgent || "";
    const isIpadDesktopUa = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
    const isAppleMobile = /iPhone|iPad|iPod/i.test(ua);
    isIosOrIpadOs.value = isAppleMobile || isIpadDesktopUa;
  }

  function handleBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    canInstallPrompt.value = true;
  }

  function handleAppInstalled(): void {
    deferredPrompt = null;
    canInstallPrompt.value = false;
    isStandalone.value = true;
  }

  async function triggerInstall(): Promise<boolean> {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    canInstallPrompt.value = false;
    return outcome === "accepted";
  }

  function reloadToUpdate(): void {
    if (waitingRegistration?.waiting) {
      waitingRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  }

  onMounted(() => {
    detectEnvironment();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker
        .register("./sw.js", { scope: "./" })
        .then((registration) => {
          waitingRegistration = registration;
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                hasUpdate.value = true;
              }
            });
          });
        })
        .catch(() => {
          // ignore registration failure in restricted contexts
        });
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.removeEventListener("appinstalled", handleAppInstalled);
  });

  return {
    isStandalone,
    canInstallPrompt,
    isIosOrIpadOs,
    hasUpdate,
    triggerInstall,
    reloadToUpdate,
  };
}
