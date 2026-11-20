import { describe, expect, it } from "vite-plus/test";
import {
  clampDurationSeconds,
  computeAutoThresholds,
  computeTimerPhase,
  DEFAULT_TIMER_CONFIG,
  formatClockTime,
  formatDurationLabel,
  formatRemainingTime,
  normalizeThresholds,
  parseQueryConfig,
  sanitizeConfig,
} from "@/utils/timerLogic";

describe("timerLogic", () => {
  it("clamps duration safely between 10 seconds and 180 minutes", () => {
    expect(clampDurationSeconds(3)).toBe(10);
    expect(clampDurationSeconds(1200)).toBe(1200);
    expect(clampDurationSeconds(99999)).toBe(10800);
  });

  it("computes sensible auto thresholds for LT and full sessions", () => {
    expect(computeAutoThresholds(300)).toEqual({ warnSeconds: 60, criticalSeconds: 30 });
    expect(computeAutoThresholds(1200)).toEqual({ warnSeconds: 300, criticalSeconds: 60 });
    expect(computeAutoThresholds(2400)).toEqual({ warnSeconds: 300, criticalSeconds: 60 });
    expect(computeAutoThresholds(3600)).toEqual({ warnSeconds: 600, criticalSeconds: 120 });
  });

  it("normalizes manual thresholds so critical < warn < duration", () => {
    expect(normalizeThresholds(60, 80, 90)).toEqual({ warnSeconds: 59, criticalSeconds: 58 });
    expect(normalizeThresholds(300, 60, 60)).toEqual({ warnSeconds: 60, criticalSeconds: 59 });
  });

  it("sanitizes corrupted or legacy config objects safely", () => {
    expect(
      sanitizeConfig({
        durationSeconds: Number.NaN,
        autoThresholds: "yes",
        warnSeconds: "bad",
        showClock: 123,
        sessionTitle: "  Track A  ",
        chimeMode: "end-only",
      }),
    ).toEqual({
      ...DEFAULT_TIMER_CONFIG,
      sessionTitle: "  Track A  ",
    });
  });

  it("computes timer phases accurately", () => {
    expect(computeTimerPhase("idle", 300_000, 60, 30)).toBe("ready");
    expect(computeTimerPhase("running", 120_000, 60, 30)).toBe("normal");
    expect(computeTimerPhase("running", 60_000, 60, 30)).toBe("warning");
    expect(computeTimerPhase("paused", 45_000, 60, 30)).toBe("warning");
    expect(computeTimerPhase("running", 30_000, 60, 30)).toBe("critical");
    expect(computeTimerPhase("running", 0, 60, 30)).toBe("overtime");
    expect(computeTimerPhase("running", -5_200, 60, 30)).toBe("overtime");
  });

  it("formats remaining time using ceiling seconds and symmetric overtime formatting", () => {
    expect(formatRemainingTime(300_000).digits).toBe("05:00");
    expect(formatRemainingTime(299_100).digits).toBe("05:00");
    expect(formatRemainingTime(299_000).digits).toBe("04:59");
    expect(formatRemainingTime(1_000).digits).toBe("00:01");
    expect(formatRemainingTime(0).digits).toBe("00:00");
    expect(formatRemainingTime(-5_400, true).digits).toBe("+00:05");
    expect(formatRemainingTime(-5_400, false).digits).toBe("00:00");
    expect(formatRemainingTime(6_000_000).digits).toBe("1:40:00");
    expect(formatRemainingTime(-6_000_000, true).digits).toBe("+1:40:00");
  });

  it("formats clock time with optional nearest-minute rounding", () => {
    const t1 = new Date("2026-11-21T15:02:10+09:00").getTime();
    const t2 = new Date("2026-11-21T15:02:50+09:00").getTime();
    expect(formatClockTime(t1)).toBe("15:02");
    expect(formatClockTime(t2)).toBe("15:02");
    expect(formatClockTime(t1, true)).toBe("15:02");
    expect(formatClockTime(t2, true)).toBe("15:03");
  });

  it("formats Japanese duration labels cleanly", () => {
    expect(formatDurationLabel(45)).toBe("45秒");
    expect(formatDurationLabel(300)).toBe("5分");
    expect(formatDurationLabel(90)).toBe("1分30秒");
  });

  it("parses query parameters for direct track bookmarks", () => {
    expect(parseQueryConfig("?m=15&title=Track+A")).toEqual({
      durationSeconds: 900,
      autoThresholds: true,
      sessionTitle: "Track A",
    });
    expect(parseQueryConfig("?preset=lt-5")).toEqual({
      durationSeconds: 300,
      warnSeconds: 60,
      criticalSeconds: 30,
      autoThresholds: false,
    });
  });
});
