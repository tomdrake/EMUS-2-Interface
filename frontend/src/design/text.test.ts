import { rowMethod, rowTitle, titleCase } from "./text";
import type { Design, Row } from "./types";

describe("titleCase", () => {
  it("capitalises names", () => {
    expect(titleCase("respiratory rate")).toBe("Respiratory Rate");
    expect(titleCase("pleth")).toBe("Pleth");
    expect(titleCase("next obs due")).toBe("Next Obs Due");
  });

  it("keeps small words lower case except at the start", () => {
    expect(titleCase("screens and layout")).toBe("Screens and Layout");
    expect(titleCase("the monitor above the chart")).toBe("The Monitor Above the Chart");
  });

  it("leaves abbreviations and units exactly as typed", () => {
    expect(titleCase("SpO2 scale 2")).toBe("SpO2 Scale 2");
    expect(titleCase("NEWS2 beside monitor")).toBe("NEWS2 Beside Monitor");
    expect(titleCase("heart rate - ECG")).toBe("Heart Rate - ECG");
    expect(titleCase("pH and pCO2")).toBe("pH and pCO2");
    expect(titleCase("dark / light")).toBe("Dark / Light");
  });
});

describe("row titles", () => {
  const registry = {
    parameters: { hr: { label: "Heart Rate", method: "ECG" }, rr: { label: "Respiratory Rate", method: "Chest Sensor" },
                  bp_sys: { label: "Systolic Blood Pressure", method: "Cuff" } },
    waveforms: { ecg: { label: "ECG" }, pleth: { label: "Pleth" }, resp: { label: "Resp" } },
  } as any;
  const design = (over = {}) => ({ labels: { auto_capitalise: true, show_method: true, ...over } }) as Design;
  const row = (over: object) => ({ kind: "parameter", label: null, method: null, trace: "trend", waveform: null, ...over }) as Row;

  it("defaults to the name and how it is measured", () => {
    expect(rowTitle(row({ parameter: "hr", trace: "waveform", waveform: "ecg" }), design(), registry))
      .toEqual({ name: "Heart Rate", method: "ECG" });
    expect(rowTitle(row({ parameter: "bp_sys", label: "blood pressure" }), design(), registry))
      .toEqual({ name: "Blood Pressure", method: "Cuff" });
  });

  it("uses the waveform a row draws, then the registry method", () => {
    expect(rowMethod(row({ parameter: "rr", trace: "waveform", waveform: "resp" }), registry)).toBe("Resp");
    expect(rowMethod(row({ parameter: "rr" }), registry)).toBe("Chest Sensor");
  });

  it("lets the design change both", () => {
    expect(rowTitle(row({ parameter: "rr", trace: "waveform", waveform: "resp", method: "pleth" }), design(), registry))
      .toEqual({ name: "Respiratory Rate", method: "Pleth" });
    expect(rowTitle(row({ parameter: "hr", label: "pulse" }), design({ show_method: false }), registry))
      .toEqual({ name: "Pulse", method: "" });
    expect(rowTitle(row({ parameter: "hr", label: "heart rate" }), design({ auto_capitalise: false }), registry).name)
      .toBe("heart rate");
  });
});
