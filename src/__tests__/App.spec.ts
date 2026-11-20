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

  it("transitions background phase from ready -> normal -> warning -> critical -> overtime without shrinking +MM:SS", async () => {
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

    // Advance 25s -> -5s (overtime) and digits stay full size
    vi.advanceTimersByTime(25_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-phase")).toBe("overtime");
    expect(wrapper.find(".digits").text()).toBe("+00:05");
    expect(wrapper.find(".digits").classes()).not.toContain("is-long");
  });

  it("does not warp active countdown when wall clock shifts via NTP sync", async () => {
    const wrapper = mount(App);
    await wrapper.find(".ctrl-btn--primary").trigger("click");

    vi.advanceTimersByTime(10_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".digits").text()).toBe("19:50");

    // Simulate OS wall clock jumping forward by 3 minutes (NTP sync) without monotonic time advancing
    const realPerfNow = performance.now();
    const perfSpy = vi.spyOn(performance, "now").mockImplementation(() => realPerfNow);
    vi.setSystemTime(new Date("2026-11-21T10:03:10+09:00"));

    document.dispatchEvent(new Event("visibilitychange"));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".digits").text()).toBe("19:50");
    perfSpy.mockRestore();
  });

  it("restores an active running timer after page reload", async () => {
    const wrapper1 = mount(App);
    await wrapper1.find(".ctrl-btn--primary").trigger("click");
    vi.advanceTimersByTime(30_000);
    await wrapper1.vm.$nextTick();
    expect(wrapper1.find(".digits").text()).toBe("19:30");
    wrapper1.unmount();

    // Simulate reload 5 seconds later
    vi.advanceTimersByTime(5_000);
    const wrapper2 = mount(App);
    await wrapper2.vm.$nextTick();
    expect(wrapper2.find(".stage").attributes("data-status")).toBe("running");
    expect(wrapper2.find(".digits").text()).toBe("19:25");
  });

  it("requires confirmation before resetting an active timer via preset in setup drawer", async () => {
    const wrapper = mount(App);
    await wrapper.find(".ctrl-btn--primary").trigger("click");

    const settingsBtn = wrapper.findAll(".ctrl-btn").find((b) => b.text().includes("設定"));
    await settingsBtn!.trigger("click");

    const ltPreset = wrapper.findAll(".preset-ticket").find((b) => b.text().includes("5分"));
    await ltPreset!.trigger("click");

    expect(wrapper.find(".confirm-banner").exists()).toBe(true);
    expect(wrapper.find(".stage").attributes("data-status")).toBe("running");
    expect(wrapper.find(".digits").text()).toBe("20:00");

    await wrapper.find(".confirm-banner .apply-btn").trigger("click");
    expect(wrapper.find(".confirm-banner").exists()).toBe(false);
    expect(wrapper.find(".stage").attributes("data-status")).toBe("idle");
    expect(wrapper.find(".digits").text()).toBe("05:00");
  });

  it("supports kiosk lock via pointer long-press and keyboard accessibility", async () => {
    const wrapper = mount(App);

    await wrapper.find(".ctrl-btn--primary").trigger("click");
    expect(wrapper.find(".stage").attributes("data-status")).toBe("running");

    // Activate lock via pointer
    await wrapper.find(".lock-btn").trigger("pointerdown", { pointerType: "touch" });
    expect(wrapper.find(".locked-notice").exists()).toBe(true);
    expect(wrapper.find(".controls-dock").exists()).toBe(false);

    // Space key should not pause while locked
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".stage").attributes("data-status")).toBe("running");

    // Long press 800ms to unlock
    await wrapper.find(".lock-btn").trigger("pointerdown", { pointerType: "touch" });
    vi.advanceTimersByTime(850);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".controls-dock").exists()).toBe(true);

    // Keyboard Enter on lock button also toggles lock
    await wrapper.find(".lock-btn").trigger("keydown.enter");
    expect(wrapper.find(".locked-notice").exists()).toBe(true);
    await wrapper.find(".lock-btn").trigger("keydown.enter");
    expect(wrapper.find(".controls-dock").exists()).toBe(true);
  });
});
