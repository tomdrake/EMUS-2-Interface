import type { SignalStatus } from "@/contracts/types.gen";
import type { Design } from "@/design/types";

import { deviceSummary } from "./DeviceChips";
import { ago, displayFor, elapsed } from "./status";
import { buildNotices } from "./notifications";

const registry = {
  signal_states: {
    ok: { text: "", shows_value: true, tone: "normal", meaning: "" },
    standby: { text: "STANDBY", shows_value: false, tone: "inactive", meaning: "" },
    acquiring: { text: "SEARCHING", shows_value: false, tone: "inactive", meaning: "" },
    "poor-signal": { text: "POOR TRACE", shows_value: true, tone: "technical", meaning: "" },
    "sensor-off": { text: "CHECK SENSOR", shows_value: false, tone: "technical", meaning: "" },
    "connection-lost": { text: "CONNECTION LOST", shows_value: false, tone: "technical", meaning: "" },
    invalid: { text: "-?-", shows_value: false, tone: "technical", meaning: "" },
  },
  signal_issues: { motion: { label: "Movement artefact", advice: "Patient moving; recheck when still" } },
};
const safety = {
  standby_text: "STANDBY", stale_values: "hide", show_advice: true,
} as Design["safety"];
const NOW = Date.parse("2026-11-23T12:00:00Z");
const sig = (state: string, extra: Partial<SignalStatus> = {}) =>
  ({ parameter: "spo2", state, since: "2026-11-23T11:59:00Z", advice: "", ...extra }) as SignalStatus;
const show = (signal: SignalStatus | undefined, value: number | null | undefined, over = {}) =>
  displayFor({ signal, value, link: "live", now: NOW, safety, registry, ...over });

describe("what a numeric shows", () => {
  it("shows a current value only when the signal is ok", () => {
    expect(show(sig("ok"), 97)).toMatchObject({ kind: "ok", showValue: true, flagged: false, text: "" });
  });

  it("says STANDBY, never a dash, for a modality with no device", () => {
    const d = show(sig("standby"), null);
    expect(d).toMatchObject({ kind: "standby", text: "STANDBY", showValue: false, tone: "inactive" });
    // A parameter the server has said nothing about is also standby.
    expect(show(undefined, undefined).text).toBe("STANDBY");
    expect(show(sig("standby"), null, { safety: { ...safety, standby_text: "NOT CONNECTED" } }).text)
      .toBe("NOT CONNECTED");
  });

  it("gives every no-number state its own word", () => {
    const words = ["standby", "acquiring", "sensor-off", "connection-lost", "invalid"]
      .map((s) => show(sig(s), null).text);
    expect(new Set(words).size).toBe(words.length);
    for (const w of words) expect(w).not.toMatch(/^-+$/);
  });

  it("never shows a value for a lost, off or standby signal even if one arrives", () => {
    for (const s of ["standby", "acquiring", "sensor-off", "connection-lost", "invalid"]) {
      expect(show(sig(s), 97).showValue).toBe(false);
    }
  });

  it("keeps the value for a poor trace but flags it and says what to check", () => {
    const d = show(sig("poor-signal", { issue: "motion", quality: 0.4 }), 131);
    expect(d).toMatchObject({ kind: "poor-signal", showValue: true, flagged: true, tone: "technical",
                              text: "POOR TRACE", advice: "Patient moving; recheck when still" });
    expect(show(sig("poor-signal", { issue: "motion" }), 131, { safety: { ...safety, show_advice: false } }).advice)
      .toBe("");
  });

  it("does not present a missing value as fine", () => {
    expect(show(sig("ok"), null)).toMatchObject({ kind: "invalid", text: "-?-", showValue: false });
  });

  it("marks everything NO DATA when the screen itself is not receiving", () => {
    for (const link of ["stale", "down"] as const) {
      expect(show(sig("ok"), 97, { link })).toMatchObject({ kind: "no-data", text: "NO DATA", showValue: false });
    }
    expect(show(sig("ok"), 97, { link: "connecting" }).text).toBe("CONNECTING");
  });

  it("can show the last value with its age after a lost connection, never as current", () => {
    const lost = sig("connection-lost", { last_value: 96, last_value_at: "2026-11-23T11:58:00Z" });
    expect(show(lost, null).last).toBeNull();
    const d = show(lost, null, { safety: { ...safety, stale_values: "dim-with-age" } });
    expect(d.showValue).toBe(false);
    expect(d.last).toEqual({ value: 96, age: "2 min ago" });
  });
});

describe("time wording", () => {
  it("formats ages and countdowns", () => {
    expect([ago(4_000), ago(60_000), ago(134 * 60_000), ago(120 * 60_000)])
      .toEqual(["4 s ago", "1 min ago", "2 h 14 min ago", "2 h ago"]);
    expect([elapsed(120_000), elapsed(105_000), elapsed(9_000)]).toEqual(["2:00", "1:45", "0:09"]);
  });
});

describe("notifications", () => {
  const T = Date.parse("2026-11-23T12:00:00Z");
  const iso = (minsAgo: number) => new Date(T - minsAgo * 60_000).toISOString();
  const alarm = (id: string, priority: string, minsAgo: number, extra: object = {}) =>
    ({ id, kind: "high", priority, message: `${id} message.`, started_at: iso(minsAgo), ...extra }) as any;
  const state = (active: any[], unmonitored: string[] = []) =>
    ({ active, unmonitored, alarms_off: [], silenced_until: null, silence_seconds: 120 }) as any;
  const base = {
    link: "live" as const, sound: "ready" as const, alarms: state([]),
    order: "severity-then-recent" as const,
    registry: { parameters: { spo2: { short: "SpO2" }, pulse: { short: "PR" } },
                alarm_priority_marks: { high: "High", medium: "Medium", low: "Low" },
                technical_alarms: { "display-disconnected": { message: "Screen not updating." },
                                    "sound-unavailable": { message: "Sound is off." } } } as any,
  };

  it("is empty when all is well", () => {
    expect(buildNotices(base)).toEqual([]);
  });

  it("orders by severity, then newest first", () => {
    const list = buildNotices({ ...base, alarms: state([
      alarm("old-high", "high", 30), alarm("low", "low", 1), alarm("new-high", "high", 2),
      alarm("medium", "medium", 5)]) });
    expect(list.map((n) => n.id)).toEqual(["new-high", "old-high", "medium", "low"]);
  });

  it("can order newest first instead", () => {
    const list = buildNotices({ ...base, order: "recent-first", alarms: state([
      alarm("old-high", "high", 30), alarm("low", "low", 1), alarm("medium", "medium", 5)]) });
    expect(list.map((n) => n.id)).toEqual(["low", "medium", "old-high"]);
  });

  it("marks patient alarms with their priority and leaves monitoring problems unmarked", () => {
    const list = buildNotices({ ...base, alarms: state([
      alarm("hr", "high", 1, { parameter: "hr" }), alarm("rr", "medium", 1), alarm("lo", "low", 1),
      alarm("batt", "low", 1, { kind: "technical", technical: "battery-low" })]) });
    expect(Object.fromEntries(list.map((n) => [n.id, n.mark]))).toEqual({ hr: "High", rr: "Medium", lo: "Low", batt: null });
    expect(list.find((n) => n.id === "hr")!.parameters).toEqual(["hr"]);
  });

  it("says which rows a device problem is about", () => {
    const list = buildNotices({
      ...base, devices: [{ id: "limb", parameters: ["spo2", "pulse"] } as any],
      alarms: state([alarm("lost", "medium", 1, { kind: "technical", technical: "connection-lost",
                                                   parameter: null, device_id: "limb" })]) });
    expect(list[0]!.parameters).toEqual(["spo2", "pulse"]);
  });

  it("separates patient alarms from monitoring problems", () => {
    const list = buildNotices({ ...base, alarms: state([
      alarm("hr", "high", 1), alarm("batt", "low", 1, { kind: "technical", technical: "battery-low" })]) });
    expect(list.map((n) => [n.id, n.about])).toEqual([["hr", "patient"], ["batt", "monitor"]]);
  });

  it("says only that the screen is not updating when it has no feed", () => {
    for (const link of ["stale", "down"] as const) {
      const list = buildNotices({ ...base, link, alarms: state([alarm("hr", "high", 1)], ["spo2"]) });
      expect(list.map((n) => n.id)).toEqual(["display-disconnected"]);
      expect(list[0]).toMatchObject({ priority: "high", about: "monitor" });
    }
  });

  it("says when alarm sound cannot play and offers to enable it", () => {
    const run = vi.fn();
    const [n] = buildNotices({ ...base, sound: "blocked", enableSound: run });
    expect(n!.action!.label).toBe("Enable Sound");
    n!.action!.run();
    expect(run).toHaveBeenCalled();
  });

  it("names unmonitored parameters unless a technical alarm already explains them", () => {
    expect(buildNotices({ ...base, alarms: state([], ["spo2", "pulse"]) })[0]!.text)
      .toBe("Not monitored: SpO2, PR.");
    const explained = buildNotices({ ...base, alarms: state(
      [alarm("lost", "medium", 1, { kind: "technical", technical: "connection-lost" })], ["spo2"]) });
    expect(explained.map((n) => n.id)).toEqual(["lost"]);
  });
});

describe("device wording", () => {
  const dev = (over: object) => ({ id: "d", label: "Limb sensor", kind: "anne-limb", connection: "connected",
    battery: "ok", battery_pct: 64, last_seen: null, parameters: [], waveforms: [], ...over }) as any;

  it("always has words, not just an icon", () => {
    expect(deviceSummary(dev({}), NOW, true)).toEqual({ text: "64%", tone: "ok" });
    expect(deviceSummary(dev({}), NOW, false)).toEqual({ text: "connected", tone: "ok" });
    expect(deviceSummary(dev({ battery: "low", battery_pct: 18 }), NOW, true))
      .toEqual({ text: "battery low 18%", tone: "low" });
    expect(deviceSummary(dev({ battery: "critical", battery_pct: 6 }), NOW, true).tone).toBe("critical");
    expect(deviceSummary(dev({ connection: "not-paired" }), NOW, true)).toEqual({ text: "standby", tone: "inactive" });
    expect(deviceSummary(dev({ connection: "lost", last_seen: "2026-11-23T11:59:18Z" }), NOW, true))
      .toEqual({ text: "no signal 0:42", tone: "lost" });
  });
});
