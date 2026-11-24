import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/app/api";
import { useSafety } from "@/safety/store";

import { useExample } from "./store";

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
