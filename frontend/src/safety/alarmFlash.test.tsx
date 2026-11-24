import { act, render, screen as dom } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { FLASH_HALF_MS, alarmOn, flashOn } from "./flash";
import { Tile, whiteReads } from "./Tile";
import { useSafety } from "./store";

const design = {
  safety: { standby_text: "STANDBY", stale_values: "hide", show_advice: true, device_status: "tiles", show_battery_percent: true, dim_poor_traces: true },
  labels: { auto_capitalise: true, show_method: true }, rows: [], theme: { mode: "dark" },
} as unknown as Design;
const P = (short: string, decimals = 0) => ({ short, unit: "u", decimals, label: short });
const registry = {
  parameters: { hr: P("HR"), spo2: P("SpO2"), bp_sys: P("SYS"), bp_dia: P("DIA"), bp_mean: P("MAP") },
  signal_states: { ok: { text: "", tone: "normal" } }, signal_issues: {}, technical_alarms: {}, alarm_priority_marks: {},
};
const ok = (parameter: string) => ({ parameter, state: "ok", since: "", advice: "" }) as any;
const alarm = (parameter: string, priority = "high", kind = "high") => ({ id: `${parameter}-${kind}`, parameter, kind, priority, message: "", started_at: "x" });
const state = (active: any[], over = {}) => ({ active, silenced_until: null, silence_seconds: 120, alarms_off: [], unmonitored: [], ...over }) as any;
const bp = () => [{ parameter: "bp_sys", name: "BP", value: 90, extra: [{ separator: "/", value: 50, parameter: "bp_dia" }, { separator: " ", wrap: [" (", ")"] as [string, string], value: 63, parameter: "bp_mean" }] }];
const lit = () => [...document.querySelectorAll(".tile-num.is-alarm")].map((e) => e.textContent);

beforeEach(() => {
  useUi.setState({ stored: { document: design } as any, registry: registry as any });
  useSafety.setState({ link: "live", sound: "ready", devices: [], alarms: null,
    signals: Object.fromEntries(["hr", "spo2", "bp_sys", "bp_dia", "bp_mean"].map((p) => [p, ok(p)])) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("a value in alarm", () => {
  it("highlights the number that alarms and no other", () => {
    useSafety.setState({ alarms: state([alarm("hr")]) });
    render(<Tile values={[{ parameter: "hr", value: 124 }]} />);
    expect(lit()).toEqual(["124"]);
    expect(dom.getByTestId("num-hr").querySelector(".tile-num")!.getAttribute("data-alarm")).toBe("high");
  });
  it("does nothing for a value inside its limits", () => {
    useSafety.setState({ alarms: state([alarm("spo2")]) });
    render(<Tile values={[{ parameter: "hr", value: 80 }]} />);
    expect(lit()).toEqual([]);
  });
  it("highlights systolic, diastolic and MAP each on its own alarm, with the separators outside the box", () => {
    for (const [on, expected] of [["bp_sys", ["90"]], ["bp_dia", ["50"]], ["bp_mean", ["63"]]] as const) {
      useSafety.setState({ alarms: state([alarm(on, "medium", "low")]) });
      const { unmount, container } = render(<Tile values={bp()} />);
      expect(lit()).toEqual(expected);
      expect(container.querySelector(".tile-main")!.textContent).toBe("90/50");               // the text itself is unchanged
      expect(container.querySelector(".tile-extra-wrap")!.textContent).toBe(" (63)");
      unmount();
    }
  });
  it("highlights all three together when all alarm", () => {
    useSafety.setState({ alarms: state([alarm("bp_sys"), alarm("bp_dia", "medium", "low"), alarm("bp_mean", "medium", "low")]) });
    render(<Tile values={bp()} />);
    expect(lit()).toEqual(["90", "50", "63"]);
  });
  it("is not shown when the alarm for that parameter is switched off", () => {
    useSafety.setState({ alarms: state([alarm("hr")], { alarms_off: ["hr"] }) });
    render(<Tile values={[{ parameter: "hr", value: 124 }]} />);
    expect(lit()).toEqual([]);
  });
  it("stays highlighted while the sound is silenced", () => {
    useSafety.setState({ alarms: state([alarm("hr")], { silenced_until: "2999-01-01T00:00:00Z" }) });
    render(<Tile values={[{ parameter: "hr", value: 124 }]} />);
    expect(lit()).toEqual(["124"]);
  });
  it("ignores technical alarms and uses the most serious priority when a parameter has two", () => {
    expect(alarmOn(state([{ ...alarm("hr"), kind: "technical", priority: "high" }]), "hr")).toBeNull();
    expect(alarmOn(state([alarm("hr", "low", "low"), alarm("hr", "medium", "high")]), "hr")).toBe("medium");
    expect(alarmOn(state([alarm("hr")], { alarms_off: ["hr"] }), "hr")).toBeNull();
    expect(alarmOn(null, "hr")).toBeNull();
  });
  it("does not highlight a value that is not shown (no signal)", () => {
    useSafety.setState({ alarms: state([alarm("hr")]), signals: { hr: { ...ok("hr"), state: "sensor-off" } } });
    render(<Tile values={[{ parameter: "hr", value: 124 }]} />);
    expect(lit()).toEqual([]);
  });
});

describe("the flash", () => {
  it("alternates every half period by priority, from the clock, so every number is in step", () => {
    expect(FLASH_HALF_MS).toEqual({ high: 500, medium: 1000, low: 2000 });
    expect([0, 499, 500, 999, 1000].map((t) => flashOn("high", t))).toEqual([true, true, false, false, true]);
    expect([0, 999, 1000, 1999, 2000].map((t) => flashOn("medium", t))).toEqual([true, true, false, false, true]);
    expect([0, 1999, 2000, 3999, 4000].map((t) => flashOn("low", t))).toEqual([true, true, false, false, true]);
    for (const half of Object.values(FLASH_HALF_MS)) expect(1000 / (2 * half)).toBeLessThanOrEqual(1);            // at most one flash a second
  });
  it("flips the highlight on screen as time passes, for sys, dia and MAP together", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    useSafety.setState({ alarms: state([alarm("bp_sys"), alarm("bp_dia"), alarm("bp_mean")]) });
    render(<Tile values={bp()} />);
    const phases = () => [...document.querySelectorAll(".tile-num")].map((e) => (e as HTMLElement).dataset.flash);
    expect(phases()).toEqual(["on", "on", "on"]);
    act(() => { vi.advanceTimersByTime(750); });
    expect(phases()).toEqual(["off", "off", "off"]);
    act(() => { vi.advanceTimersByTime(500); });
    expect(phases()).toEqual(["on", "on", "on"]);
  });
  it("holds the highlight steady with reduced motion", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    expect([0, 600, 1200].map((t) => flashOn("high", t))).toEqual([true, true, true]);
  });
});

describe("white digits in the box", () => {
  it("reads white on mid and dark colours and not on a near-white one", () => {
    expect(whiteReads("rgb(59, 220, 87)")).toBe(true);        // green
    expect(whiteReads("rgb(56, 208, 240)")).toBe(true);       // cyan
    expect(whiteReads("rgb(255, 107, 107)")).toBe(true);      // red
    expect(whiteReads("rgb(245, 217, 10)")).toBe(false);      // yellow
    expect(whiteReads("rgb(255, 255, 255)")).toBe(false);     // a white row
    expect(whiteReads("")).toBe(true);
  });
});
