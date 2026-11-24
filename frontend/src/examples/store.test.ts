import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/app/api";
import { useSafety } from "@/safety/store";

import { mergeTaken, useExample } from "./store";

const snap = (scenario: string, minute: number, hr: number) => ({
  scenario_id: scenario, minute, placeholder: true, badge: "EXAMPLE DATA", numerics: { hr },
  devices: [{ id: "d1" }], signals: { hr: { state: "ok" } }, quality: [],
  alarms: { active: [], silence_seconds: 120, alarms_off: [], unmonitored: [], silenced_until: null },
}) as any;

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  useSafety.setState({ link: "connecting", devices: [], signals: {}, alarms: null });
  useExample.setState({ enabled: true, scenario: "scn-pneumonia", minute: 0, snapshot: null, status: "idle", scenarios: [
    { id: "scn-pneumonia", title: "P", teaching_point: "", start_min: -1440, end_min: 480, highlights: [] },
    { id: "scn-vt", title: "V", teaching_point: "", start_min: -480, end_min: 180, highlights: [] }] });
});

describe("example data store", () => {
  it("feeds the safety store, so the monitor is live while it is on", async () => {
    vi.spyOn(api, "example").mockResolvedValue(snap("scn-pneumonia", 0, 102));
    await useExample.getState().refresh();
    expect(useSafety.getState().link).toBe("live");
    expect(useSafety.getState().devices).toHaveLength(1);
    expect(useExample.getState().snapshot!.numerics.hr).toBe(102);
  });

  it("the latest request wins when the slider moves quickly", async () => {
    let first!: (v: unknown) => void;
    vi.spyOn(api, "example")
      .mockImplementationOnce(() => new Promise((r) => { first = r; }) as any)
      .mockResolvedValueOnce(snap("scn-pneumonia", 60, 120));
    const slow = useExample.getState().refresh();
    useExample.setState({ minute: 60 });
    await useExample.getState().refresh();
    first(snap("scn-pneumonia", 0, 99));            // the old answer arrives late
    await slow;
    expect(useExample.getState().snapshot!.numerics.hr).toBe(120);
  });

  it("turning it off removes the feed: no data, no devices, no alarms", async () => {
    vi.spyOn(api, "example").mockResolvedValue(snap("scn-pneumonia", 0, 102));
    await useExample.getState().refresh();
    useExample.getState().setEnabled(false);
    expect(useSafety.getState().link).toBe("down");
    expect(useSafety.getState().devices).toEqual([]);
    expect(useSafety.getState().alarms).toBeNull();
  });

  it("does not fetch while off", async () => {
    const spy = vi.spyOn(api, "example");
    useExample.setState({ enabled: false });
    await useExample.getState().refresh();
    expect(spy).not.toHaveBeenCalled();
  });

  it("changing scenario keeps the minute inside that scenario's range, and is remembered", () => {
    vi.spyOn(api, "example").mockResolvedValue(snap("scn-vt", 0, 70));
    useExample.setState({ minute: 400 });
    useExample.getState().setScenario("scn-vt");
    expect(useExample.getState().minute).toBe(180);
    expect(JSON.parse(window.localStorage.getItem("emus.example")!)).toMatchObject({ scenario: "scn-vt", minute: 180 });
  });
});


describe("readings taken on this screen", () => {
  const base = { generated_at: "2026-11-24T12:00:00Z", numerics: { bp_sys: 120, bp_dia: 80, bp_mean: 93 },
    bp_readings: [{ at: "2026-11-24T11:00:00Z", sys: 120, dia: 80, map: 93 }], temp_readings: [{ at: "2026-11-24T10:00:00Z", value: 37.0 }] } as any;
  const bp = (sys: number, dia: number) => ({ at: "x", sys, dia, map: Math.round(dia + (sys - dia) / 3) });

  it("puts a taken pressure first, in the list, and in the tile's numbers", () => {
    const m = mergeTaken(base, { bp: [bp(150, 90)], temp: [] });
    expect(m.bp_readings.map((r) => r.sys)).toEqual([150, 120]);
    expect(m.numerics).toMatchObject({ bp_sys: 150, bp_dia: 90, bp_mean: 110 });
    expect(m.bp_readings[0]!.at).toBe("2026-11-24T12:00:00.000Z");
  });
  it("keeps several taken readings in order, each at a slightly different time", () => {
    const m = mergeTaken(base, { bp: [bp(160, 95), bp(150, 90)], temp: [{ at: "x", value: 38.2 }, { at: "y", value: 37.9 }] });
    expect(m.bp_readings.slice(0, 2).map((r) => r.sys)).toEqual([160, 150]);
    expect(new Set(m.bp_readings.map((r) => r.at)).size).toBe(3);
    expect(m.temp_readings.map((r) => r.value)).toEqual([38.2, 37.9, 37]);
  });
  it("leaves the snapshot alone when nothing was taken", () => {
    expect(mergeTaken(base, { bp: [], temp: [] })).toBe(base);
  });
  it("is cleared when the scenario or the minute changes", async () => {
    vi.spyOn(api, "example").mockResolvedValue(snap("scn-pneumonia", 0, 102));
    useExample.getState().addTaken({ bp: bp(150, 90), temp: { at: "x", value: 38 } });
    expect(useExample.getState().taken.bp).toHaveLength(1);
    expect(useExample.getState().taken.temp).toHaveLength(1);
    useExample.getState().setMinute(30);
    expect(useExample.getState().taken).toEqual({ bp: [], temp: [] });
    useExample.getState().addTaken({ bp: bp(150, 90) });
    useExample.getState().setScenario("scn-vt");
    expect(useExample.getState().taken.bp).toHaveLength(0);
  });
});
