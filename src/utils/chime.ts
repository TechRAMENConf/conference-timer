type ChimeKind = "warning" | "critical" | "overtime" | "test";

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctor();
  }
  return sharedAudioCtx;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
}

function strikeBell(ctx: AudioContext, freq: number, delaySec: number, durationSec: number): void {
  const start = ctx.currentTime + delaySec;

  const oscPrimary = ctx.createOscillator();
  const oscHarmonic = ctx.createOscillator();
  const gain = ctx.createGain();

  oscPrimary.type = "sine";
  oscPrimary.frequency.setValueAtTime(freq, start);

  oscHarmonic.type = "triangle";
  oscHarmonic.frequency.setValueAtTime(freq * 2, start);

  const harmonicGain = ctx.createGain();
  harmonicGain.gain.setValueAtTime(0.18, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.35, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

  oscPrimary.connect(gain);
  oscHarmonic.connect(harmonicGain);
  harmonicGain.connect(gain);
  gain.connect(ctx.destination);

  oscPrimary.start(start);
  oscHarmonic.start(start);
  oscPrimary.stop(start + durationSec + 0.05);
  oscHarmonic.stop(start + durationSec + 0.05);
}

export function playChime(kind: ChimeKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  switch (kind) {
    case "warning":
      strikeBell(ctx, 783.99, 0, 0.9); // G5: calm single bell
      break;
    case "critical":
      strikeBell(ctx, 880, 0, 0.7); // A5
      strikeBell(ctx, 1046.5, 0.22, 0.9); // C6
      break;
    case "overtime":
      strikeBell(ctx, 1046.5, 0, 0.85); // C6 double strike
      strikeBell(ctx, 1046.5, 0.28, 1.15);
      break;
    case "test":
      strikeBell(ctx, 880, 0, 0.8);
      break;
  }
}
