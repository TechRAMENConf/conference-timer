import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import App from "@/App.vue";

describe("App.vue session timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00+09:00"));
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders default 20-minute ready state and switches preset to 5-minute LT", async () => {
    const wrapper = mount(App);

    expect(wrapper.find(".digits").text()).toBe("20:00");
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("ready");

    const ltPreset = wrapper.findAll(".quick-ticket").find((btn) => btn.text().includes("5分"));
    expect(ltPreset).toBeDefined();
    await ltPreset!.trigger("click");

    expect(wrapper.find(".digits").text()).toBe("05:00");
  });

  it("transitions background phase from ready -> normal -> warning -> critical -> overtime", async () => {
    const wrapper = mount(App);

    const ltPreset = wrapper.findAll(".quick-ticket").find((btn) => btn.text().includes("5分"));
    await ltPreset!.trigger("click");

    await wrapper.find(".ctrl-btn--primary").trigger("click");
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("normal");

    // Advance 4m 05s -> 55s remaining (warning <= 60s)
    vi.advanceTimersByTime(245_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("warning");
    expect(wrapper.find(".digits").text()).toBe("00:55");

    // Advance 35s -> 20s remaining (critical <= 30s)
    vi.advanceTimersByTime(35_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("critical");
    expect(wrapper.find(".digits").text()).toBe("00:20");

    // Advance 25s -> -5s (overtime)
    vi.advanceTimersByTime(25_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("overtime");
    expect(wrapper.find(".digits").text()).toBe("+00:05");
  });

  it("supports kiosk lock preventing accidental pause/reset until long-press unlock", async () => {
    const wrapper = mount(App);

    await wrapper.find(".ctrl-btn--primary").trigger("click");
    expect(wrapper.find(".stage").attributes("data-status")).toBe("running");

    // Activate lock
    await wrapper.find(".lock-btn").trigger("pointerdown");
    expect(wrapper.find(".locked-notice").exists()).toBe(true);
    expect(wrapper.find(".controls-dock").exists()).toBe(false);

    // Space key should not pause while locked
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-status")).toBe("running");

    // Long press 800ms to unlock
    await wrapper.find(".lock-btn").trigger("pointerdown");
    vi.advanceTimersByTime(850);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".controls-dock").exists()).toBe(true);
  });
});
