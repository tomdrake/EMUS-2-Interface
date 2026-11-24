import { act, fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUi } from "@/app/store";
import { useExample } from "@/examples/store";
import { AbcdeAssess } from "@/studio/AbcdeAssess";
import { Abcde, statusFrom } from "@/widgets/Abcde";

import { flagWord, inWindow, latestSets, recency, takenAt } from "./recency";
import { gcsTotal, isOverdue, useAbcde } from "./store";

const NOW = "2026-11-24T12:00:00Z";
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60000).toISOString();

describe("recency of bloods", () => {
  it("is Current within an hour, then within 4 hours, within 24 hours, then none", () => {
    expect(recency(ago(5), NOW)).toMatchObject({ kind: "current", label: "Current" });
    expect(recency(ago(60), NOW).kind).toBe("current");
    expect(recency(ago(61), NOW)).toMatchObject({ kind: "within4", label: "Within 4 Hours" });
    expect(recency(ago(240), NOW).kind).toBe("within4");
    expect(recency(ago(241), NOW)).toMatchObject({ kind: "within24", label: "Within 24 Hours" });
    expect(recency(ago(24 * 60), NOW).kind).toBe("within24");
    expect(recency(ago(24 * 60 + 1), NOW)).toMatchObject({ kind: "none", label: "No Recent Bloods" });
  });
  it("keeps a 72 hour window for the show-most-recent button", () => {
    expect(inWindow(recency(ago(72 * 60), NOW))).toBe(true);
    expect(inWindow(recency(ago(72 * 60 + 1), NOW))).toBe(false);
  });
  it("always writes the date and the time", () => {
    expect(takenAt("2026-11-24T09:12:00")).toBe("24/11 09:12");
    expect(takenAt("2026-11-24T09:12:00", { date_format: "dd Mon yyyy", clock_format: "12h", show_seconds: false })).toBe("24 Nov 9:12 AM");
  });
  it("takes the newest sample of each kind, as one sample", () => {
    const l = (test: string, min: number, value = 1) => ({ test, value, unit: "", collected_at: ago(min), flag: "normal" }) as any;
    const group = (t: string) => (["ph", "pco2", "lactate"].includes(t) ? "gas" : t === "glucose" ? "glucose" : "ue");
    const sets = latestSets([l("ph", 30), l("pco2", 30), l("lactate", 600), l("na", 90), l("k", 90), l("na", 500), l("glucose", 120)], group);
    expect(sets.map((s) => s.key)).toEqual(["gas", "bloods", "glucose"]);
    expect(sets[0]!.results.map((r) => r.test)).toEqual(["ph", "pco2"]);   // the old lactate is another sample
    expect(sets[1]!.results.map((r) => r.test)).toEqual(["na", "k"]);
    expect(sets[2]!.results).toHaveLength(1);
    expect(latestSets([], group).every((s) => s.taken === null && s.results.length === 0)).toBe(true);
  });
  it("names abnormal flags in words", () => {
    expect([flagWord("critical-low"), flagWord("high"), flagWord("normal")]).toEqual(["Critical Low", "High", ""]);
  });
});

describe("ABCDE status and GCS", () => {
  it("takes the worst NEWS2 component: 3 is Urgent, 1 or 2 is Check, 0 is OK", () => {
    expect(statusFrom({ rr: 0, spo2: 0 }, ["rr", "spo2"])).toBe("OK");
    expect(statusFrom({ rr: 1, spo2: 0 }, ["rr", "spo2"])).toBe("Check");
    expect(statusFrom({ rr: 1, spo2: 3 }, ["rr", "spo2"])).toBe("Urgent");
    expect(statusFrom({}, ["rr"])).toBe("OK");
  });
  it("adds the Glasgow Coma Scale and flags a record older than an hour", () => {
    expect(gcsTotal({ e: 4, v: 5, m: 6 })).toBe(15);
    expect(gcsTotal({ e: 1, v: 1, m: 1 })).toBe(3);
    expect(isOverdue(null)).toBe(true);
    expect(isOverdue({ value: 1, at: new Date().toISOString() })).toBe(false);
    expect(isOverdue({ value: 1, at: new Date(Date.now() - 61 * 60000).toISOString() })).toBe(true);
  });
});

const snapshot = (over: object = {}) => ({
  generated_at: NOW, numerics: { rr: 27, spo2: 91, hr: 118, temp: 38.2, acvpu: "A" }, oxygen: { flow_l_min: 4, device: "N" },
  news2: { components: { rr: 3, spo2: 2, o2_flow: 2, bp_sys: 1, hr: 1, acvpu: 0, temp: 1 }, total: 10, complete: true },
  quality: [{ waveform: "pleth", grade: "good", label: "" }, { waveform: "resp", grade: "poor", label: "Movement" }],
  signals: {}, findings: [], bp_readings: [{ at: ago(10), sys: 118, dia: 68, map: 85 }], temp_readings: [{ at: ago(20), value: 38.4 }],
  labs: [
    { test: "ph", value: 7.31, unit: "", collected_at: ago(30), flag: "low" },
    { test: "po2", value: 7.2, unit: "kPa", collected_at: ago(30), flag: "critical-low" },
    { test: "k", value: 4.1, unit: "mmol/L", collected_at: ago(600), flag: "normal" },
    { test: "glucose", value: 9.1, unit: "mmol/L", collected_at: ago(60 * 40), flag: "normal" },
  ], ...over,
}) as any;
const registry = { lab_tests: { ph: { label: "pH", group: "gas" }, po2: { label: "pO₂", group: "gas" }, k: { label: "Potassium", group: "ue" }, glucose: { label: "Glucose", group: "glucose" } },
  o2_devices: { N: "Nasal cannula" }, parameters: {}, signal_states: {}, signal_issues: {} } as any;
const widget = { id: "a", type: "abcde", show_trends_button: true, show_bloods: true } as any;

beforeEach(() => {
  window.localStorage.clear();
  useAbcde.getState().clear();
  useUi.setState({ registry, openSheet: null, sheetContext: null });
  useExample.setState({ enabled: true, snapshot: snapshot() });
});

describe("ABCDE screen", () => {
  it("checks each letter from the observations and says so in words", () => {
    render(<Abcde widget={widget} />);
    expect(dom.getByTestId("abcde-b-status").textContent).toContain("Urgent");
    expect(dom.getByTestId("b-rr").textContent).toBe("27 /min");
    expect(dom.getByTestId("b-oxygen").textContent).toBe("4 L/min, Nasal cannula");
    expect(dom.getByTestId("b-impedance").textContent).toBe("Movement");
    expect(dom.getByTestId("abcde-c-status").textContent).toContain("Check");
    expect(dom.getByTestId("abcde-a").dataset.status).toBe("Not Assessed");
    expect(dom.getByTestId("bp-reading-0").textContent).toContain("118/68");
  });
  it("records airway and capillary refill with a time, and calls for help when the airway is not patent", () => {
    render(<Abcde widget={widget} />);
    fireEvent.click(dom.getByText("Patent", { selector: "button" }));
    expect(dom.getByTestId("abcde-a-status").textContent).toContain("OK");
    fireEvent.click(dom.getByText("Not Patent"));
    expect(dom.getByTestId("airway-prompt").textContent).toContain("Call for help");
    expect(dom.getByTestId("abcde-a-status").textContent).toContain("Urgent");
    fireEvent.click(dom.getByText("Over 2 s"));
    expect(useAbcde.getState().refill?.value).toBe("over-2");
    expect(JSON.parse(window.localStorage.getItem("emus.abcde")!).airway.value).toBe("not-patent");
  });
  it("asks for consciousness and exposure when nothing is recorded, and opens the assessment sheets", () => {
    render(<Abcde widget={widget} />);
    expect(dom.getByTestId("d-prompt")).toBeTruthy();
    expect(dom.getByTestId("e-prompt")).toBeTruthy();
    fireEvent.click(dom.getByTestId("d-avpu-btn"));
    expect(useUi.getState().openSheet).toBe("abcde-assess");
    expect(useUi.getState().sheetContext).toBe("avpu");
    fireEvent.click(dom.getByTestId("abcde-trends"));
    expect(useUi.getState().openSheet).toBe("trends");
  });
  it("shows each blood set with its date and time and a recency word; old ones are one tap away", () => {
    render(<Abcde widget={widget} />);
    expect(dom.getByTestId("blood-gas-recency").textContent).toBe("Current");
    expect(dom.getByTestId("blood-gas-when").textContent).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/);
    expect(dom.getByTestId("blood-gas-po2").textContent).toContain("Critical Low");
    expect(dom.getByTestId("blood-bloods-recency").textContent).toBe("Within 24 Hours");
    expect(dom.getByTestId("blood-glucose-recency").textContent).toBe("No Recent Bloods");
    expect(dom.queryByTestId("blood-glucose-glucose")).toBeNull();
    fireEvent.click(dom.getByTestId("blood-glucose-show"));
    expect(dom.getByTestId("blood-glucose-glucose").textContent).toContain("9.1");
    expect(dom.getByTestId("blood-glucose-when")).toBeTruthy();
  });
  it("says none in 72 hours rather than showing a button that does nothing", () => {
    useExample.setState({ snapshot: snapshot({ labs: [{ test: "glucose", value: 5, unit: "mmol/L", collected_at: ago(80 * 60), flag: "normal" }] }) });
    render(<Abcde widget={widget} />);
    expect(dom.getByTestId("blood-glucose-none").textContent).toContain("72 hours");
    expect(dom.queryByTestId("blood-glucose-show")).toBeNull();
  });
  it("without example data says there is nothing to check", () => {
    useExample.setState({ enabled: false });
    render(<Abcde widget={widget} />);
    expect(dom.getByTestId("abcde").textContent).toContain("No observations");
  });
});

describe("assessment sheets", () => {
  it("records AVPU in one tap and closes", () => {
    useUi.setState({ sheetContext: "avpu", openSheet: "abcde-assess" });
    render(<AbcdeAssess />);
    fireEvent.click(dom.getByTestId("avpu-V"));
    expect(useAbcde.getState().avpu?.value).toBe("V");
    expect(useUi.getState().openSheet).toBeNull();
  });
  it("adds the GCS as it is chosen and records E, V and M", () => {
    useUi.setState({ sheetContext: "gcs" });
    render(<AbcdeAssess />);
    expect(dom.getByTestId("gcs-total").textContent).toContain("GCS 15");
    fireEvent.click(dom.getByText("3 Words"));
    fireEvent.click(dom.getByText("2 Extension"));
    expect(dom.getByTestId("gcs-total").textContent).toContain("GCS 9");
    act(() => { fireEvent.click(dom.getByTestId("gcs-save")); });
    expect(useAbcde.getState().gcs?.value).toEqual({ e: 4, v: 3, m: 2 });
  });
  it("records the exposure checklist", () => {
    useUi.setState({ sheetContext: "exposure" });
    render(<AbcdeAssess />);
    fireEvent.click(dom.getByTestId("exposure-skin-and-wounds"));
    fireEvent.click(dom.getByTestId("exposure-save"));
    expect(useAbcde.getState().exposure?.value).toEqual(["Skin And Wounds"]);
  });
});
