import { act, fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUi } from "@/app/store";
import { useExample } from "@/examples/store";

import { BpReadings } from "./BpReadings";
import { ForecastPanel, horizonText, riskOfTotal } from "./ForecastPanel";

const point = (h: number, value: number) => ({ horizon_min: h, at: "x", value, intervals: { "50": [value - 1, value + 1], "80": [value - 2, value + 2], "95": [value - 3, value + 3] } });
const forecast = (parameter: string, base: number, score = 0.6) => ({
  parameter, scenario: "baseline", points: [60, 120].map((h) => point(h, base + h / 60)),
  certainty: [{ metric: "prediction_interval", score, text: `${Math.round(score * 100)}%`, label: "", inputs: {} }],
});
const snapshot = {
  generated_at: "2026-11-24T12:00:00Z", news2: { total: 4, risk: "low" }, numerics: { hr: 100, rr: 20, spo2: 95, bp_sys: 120, temp: 37 },
  obs_sets: [{ at: "2026-11-24T08:00:00Z", news2_total: 2, news2_risk: "low" }],
  trends: {}, bp_readings: [],
  forecast: { forecasts: ["news2", "hr", "rr", "spo2", "bp_sys", "temp"].map((p) => forecast(p, p === "temp" ? 37 : 10)), news_bands: [], minutes_to_news_threshold: {} },
} as any;
const design = { forecast: { horizons_min: [60, 120], news_number: "value-range", news_threshold: 5, certainty: { metric: "prediction_interval", display: "percent", badge_medium_at: 0.5, badge_high_at: 0.8, min_to_show: 0.3, show_metric_name: false } },
  top_bar: { clock_format: "24h", show_seconds: true, date_format: "dd/mm/yyyy" } } as any;
const registry = { parameters: Object.fromEntries(["hr", "rr", "spo2", "bp_sys", "temp"].map((p) => [p, { id: p, short: p.toUpperCase(), unit: "u", decimals: 0 }])), certainty_metrics: { prediction_interval: { label: "Prediction interval" } } } as any;
const widget = { id: "f", type: "forecast-panel", show_news_number: true, show_observations: true, show_certainty: true } as any;

beforeEach(() => {
  window.localStorage.clear();
  useUi.setState({ stored: { document: design } as any, draft: null, registry, predictShow: {} } as any);
  useExample.setState({ enabled: true, snapshot, taken: { bp: [], temp: [] } });
});

describe("the Prediction view", () => {
  it("writes horizons and risks", () => {
    expect([horizonText(60), horizonText(240), horizonText(90)]).toEqual(["+1 H", "+4 H", "+90 Min"]);
    expect([riskOfTotal(2), riskOfTotal(5), riskOfTotal(6), riskOfTotal(7)]).toEqual(["low", "medium", "medium", "high"]);
  });
  it("shows the future NEWS and every observation, each with its certainty", () => {
    render(<ForecastPanel widget={widget} />);
    expect(dom.getByTestId("fp-news-60").getAttribute("data-value")).toBe("11");
    expect(dom.getByTestId("fp-obs-hr-120").getAttribute("data-value")).toBe("12");
    for (const p of ["hr", "rr", "spo2", "bp_sys", "temp"]) expect(dom.getByTestId(`fp-obs-${p}`)).toBeTruthy();
    expect(document.querySelectorAll('[data-testid^="fp-certainty-"]')).toHaveLength(6);
  });
  it("each switch hides its own block, and the certainty switch removes every certainty figure", () => {
    render(<ForecastPanel widget={widget} />);
    fireEvent.click(dom.getByTestId("fp-toggle-news"));
    expect(dom.queryByTestId("fp-news")).toBeNull();
    expect(dom.getByTestId("fp-obs")).toBeTruthy();
    fireEvent.click(dom.getByTestId("fp-toggle-news"));
    fireEvent.click(dom.getByTestId("fp-toggle-obs"));
    expect(dom.queryByTestId("fp-obs")).toBeNull();
    fireEvent.click(dom.getByTestId("fp-toggle-obs"));
    fireEvent.click(dom.getByTestId("fp-toggle-certainty"));
    expect(document.querySelectorAll('[data-testid^="fp-certainty-"]')).toHaveLength(0);
    expect(dom.getByTestId("fp-news")).toBeTruthy();
  });
  it("keeps the switches, and starts from the design's defaults", () => {
    const { unmount } = render(<ForecastPanel widget={{ ...widget, show_observations: false }} />);
    expect(dom.queryByTestId("fp-obs")).toBeNull();
    fireEvent.click(dom.getByTestId("fp-toggle-news"));
    expect(JSON.parse(window.localStorage.getItem("emus.predict-show")!)).toEqual({ news: false });
    unmount();
  });
  it("hides a prediction below the certainty limit and says so", () => {
    useExample.setState({ snapshot: { ...snapshot, forecast: { ...snapshot.forecast, forecasts: snapshot.forecast.forecasts.map((f: any) => (f.parameter === "hr" ? forecast("hr", 10, 0.1) : f)) } } });
    render(<ForecastPanel widget={widget} />);
    expect(dom.getByTestId("fp-obs-hr").getAttribute("data-hidden")).toBe("true");
    expect(dom.getByTestId("fp-obs-hr-60").textContent).toBe("Hidden");
    expect(dom.getByTestId("fp-obs-rr-60").textContent).not.toBe("Hidden");
  });
  it("says so when example data is off", () => {
    useExample.setState({ enabled: false });
    render(<ForecastPanel widget={widget} />);
    expect(dom.getByTestId("fp-empty")).toBeTruthy();
    expect(dom.getByTestId("fp-toggle-news")).toBeTruthy();
  });
});

describe("the BP lines under the number", () => {
  const readings = [0, 1, 2, 3, 4, 5].map((i) => ({ at: new Date(Date.UTC(2026, 10, 24, 12, 0) - i * 3600_000).toISOString(), sys: 140 - i, dia: 80 - i, map: 100 - i }));
  it("lists the newest five with time, date, sys/dia and the MAP in brackets", () => {
    render(<BpReadings readings={readings} nowIso="2026-11-24T12:00:00Z" variant="tile" />);
    const rows = document.querySelectorAll('[data-testid^="bp-reading-"]');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.textContent).toMatch(/\d{2}:\d{2}.*\d{2}\/\d{2}.*140\/80.*\(100\)/);
    expect(rows[4]!.textContent).toContain("136/76");
  });
  it("gives the newest reading's age only when it is old, and says No Reading with none", () => {
    const { unmount } = render(<BpReadings readings={readings} nowIso="2026-11-24T12:00:00Z" variant="tile" />);
    expect(dom.queryByTestId("bp-age")).toBeNull();
    unmount();
    render(<BpReadings readings={readings} nowIso="2026-11-24T14:00:00Z" variant="tile" />);
    expect(dom.getByTestId("bp-age").textContent).toBe("2 h Ago");
    act(() => undefined);
  });
  it("says No Reading when there is none", () => {
    render(<BpReadings readings={[]} nowIso="2026-11-24T12:00:00Z" variant="tile" />);
    expect(dom.getByText("No Reading")).toBeTruthy();
  });
});
