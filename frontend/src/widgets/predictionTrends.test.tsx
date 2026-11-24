import { act, fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no layout; give every measured element a width so the boxes and the axis are drawn
vi.mock("@/traces/useSize", () => ({ useSize: () => [{ current: null }, { w: 640, h: 300 }] }));

import { PREDICTION_OVERLAY_SCREEN, isOverlayScreen, useUi } from "@/app/store";
import { useExample } from "@/examples/store";

import { AiSummary } from "./AiSummary";
import { EventsTimeline } from "./EventsTimeline";
import { ForecastPanel } from "./ForecastPanel";
import { PredictionSwitches, PredictionTrends, fanPoints } from "./PredictionTrends";

const HOURS = Array.from({ length: 16 }, (_, i) => (i + 1) * 30);
const point = (h: number, value: number) => ({ horizon_min: h, at: "x", value, intervals: { "50": [value - 1, value + 1], "80": [value - 2, value + 2], "95": [value - 3, value + 3] } });
const forecast = (parameter: string, base: number, score = 0.6) => ({
  parameter, scenario: "baseline", points: HOURS.map((h) => point(h, base + h / 60)),
  certainty: [{ metric: "prediction_interval", score, text: `${Math.round(score * 100)}%`, label: "", inputs: {} }],
});
const finding = (id: string, severity: string, status: string, label: string) => ({
  id, label, severity, status, summary: `${label} summary.`, onset: "2026-11-24T11:00:00Z", offset: status === "resolved" ? "2026-11-24T11:30:00Z" : null,
  certainty: [{ metric: "calibrated_probability", score: 0.8, text: "80%", label: "", inputs: {} }],
});
const event = (id: string, label: string, minutes: number, probability: number) => ({
  id, event: id, label, probability, expected_at: new Date(Date.parse("2026-11-24T12:00:00Z") + minutes * 60000).toISOString(),
  earliest_at: new Date(Date.parse("2026-11-24T12:00:00Z") + (minutes - 30) * 60000).toISOString(), latest_at: new Date(Date.parse("2026-11-24T12:00:00Z") + (minutes + 60) * 60000).toISOString(),
  certainty: [{ metric: "prediction_interval", score: 0.7, text: "70%", label: "", inputs: {} }],
});
const snapshot = (score = 0.6) => ({
  generated_at: "2026-11-24T12:00:00Z", news2: { total: 6, risk: "medium" }, numerics: { hr: 100, rr: 20, spo2: 95, bp_sys: 120, bp_dia: 70, bp_mean: 87, temp: 37 },
  bp_readings: [{ at: "2026-11-24T10:00:00Z", sys: 124, dia: 74, map: 91 }, { at: "2026-11-24T11:00:00Z", sys: 122, dia: 72, map: 89 }],
  obs_sets: [{ at: "2026-11-24T08:00:00Z", news2_total: 3, news2_risk: "low" }],
  trends: { hr: { points: [{ t: -60, v: 95 }] } },
  findings: [finding("a", "critical", "active", "Falling oxygen saturation"), finding("b", "info", "resolved", "Old finding"), finding("c", "warning", "active", "Raised temperature")],
  forecast: {
    forecasts: ["news2", "hr", "rr", "spo2", "bp_sys", "bp_dia", "bp_mean", "temp"].map((p) => forecast(p, p === "temp" ? 37 : p === "bp_dia" ? 6 : p === "bp_mean" ? 8 : 10, score)),
    news_bands: [], minutes_to_news_threshold: { "5": 45 },
    events: [event("news2_ge_7", "NEWS2 7 or more", 240, 0.5), event("desaturation", "Desaturation", 30, 0.66)],
  },
} as any);
const design = { forecast: { horizons_min: [60, 120, 480], news_number: "value-range", news_threshold: 5, certainty: { metric: "prediction_interval", display: "percent", badge_medium_at: 0.5, badge_high_at: 0.8, min_to_show: 0.3, show_metric_name: false, finding_metric: "calibrated_probability", event_metric: "prediction_interval" } },
  rows: [{ id: "ecg", height_scale: 1.25 }, { id: "spo2", height_scale: 1.25 }, { id: "resp" }, { id: "bp", height_scale: 1.9 }, { id: "temp" }, { id: "news", height_scale: 1.25 }],
  ai: { enabled: true }, home_screen: "monitor", top_bar: { clock_format: "24h", show_seconds: true, date_format: "dd/mm/yyyy" } } as any;
const registry = { parameters: Object.fromEntries(["hr", "rr", "spo2", "bp_sys", "temp"].map((p) => [p, { id: p, short: p.toUpperCase(), label: p, unit: "u", decimals: 0 }])),
  certainty_metrics: { prediction_interval: { label: "Prediction interval" }, calibrated_probability: { label: "Probability" } } } as any;
const switchesWidget = { id: "sw", type: "prediction-switches", show_news_number: true, show_observations: true, show_certainty: true } as any;
const trendsWidget = { id: "pt", type: "prediction-trends", back_hours: 4, ahead_hours: 8, show_news_number: true, show_observations: true, show_certainty: true } as any;

const load = (score = 0.6) => useExample.setState({ enabled: true, snapshot: snapshot(score), taken: { bp: [], temp: [] } });
beforeEach(() => {
  window.localStorage.clear();
  useUi.setState({ stored: { document: design } as any, draft: null, registry, predictShow: {}, aiOverride: null, screenId: null, overlayFrom: null } as any);
  load();
});

describe("fanPoints", () => {
  it("takes the points up to the window and their intervals", () => {
    const pts = fanPoints(forecast("hr", 100) as any, 480);
    expect(pts).toHaveLength(16);
    expect(pts[15]!.t).toBe(480);
    expect(fanPoints(forecast("hr", 100) as any, 120)).toHaveLength(4);
    expect(pts[0]!.i80).toEqual([pts[0]!.v - 2, pts[0]!.v + 2]);
    expect(fanPoints(undefined, 480)).toEqual([]);
  });
});

describe("the predicted trends (right half of the overlay)", () => {
  it("runs on one axis from four hours back to eight hours ahead, marked every two hours", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    const root = dom.getByTestId("prediction-trends");
    expect(root.getAttribute("data-ahead")).toBe("8");
    expect(root.getAttribute("data-back")).toBe("4");
    expect(dom.getByTestId("pt-axis").getAttribute("data-max")).toBe("480");
    expect(dom.getByTestId("pt-axis").getAttribute("data-min")).toBe("-240");
  });
  it("shows the five observations, each with now and the +8 H value, and the NEWS2 in boxes", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    for (const p of ["hr", "rr", "spo2", "bp_sys", "temp"]) expect(dom.getByTestId(`pt-${p}`)).toBeTruthy();
    expect(dom.getByTestId("pt-values-hr").textContent).toContain("Now 100");
    expect(dom.getByTestId("pt-values-hr").textContent).toContain("+8 H 18");
    expect(dom.getByTestId("pt-news")).toBeTruthy();
  });
  it("lines each chart up with the monitor row beside it: the same share of the height, in the monitor's order", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    const charts = [...document.querySelectorAll('section.pt-chart[data-row]')] as HTMLElement[];
    expect(charts.map((c) => c.dataset.row)).toEqual(["ecg", "spo2", "resp", "bp", "temp"]);
    expect(charts.map((c) => c.style.flexGrow)).toEqual(["1.25", "1.25", "1", "1.9", "1"]);
    expect(dom.getByTestId("pt-news").style.flexGrow).toBe("1.25");
    expect(dom.getByTestId("pt-news")).toBe(document.querySelector(".pt-stack")!.lastElementChild);
  });
  it("shows the charted and current NEWS2 totals and the predicted ones in boxes, the predicted in dashed boxes", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    expect(dom.getByTestId("pt-box-0").dataset.kind).toBe("now");
    expect(dom.getByTestId("pt-box-0").dataset.value).toBe("6");
    expect(dom.getByTestId("pt-box--240").dataset).toMatchObject({ kind: "past", value: "3" });
    expect(dom.getByTestId("pt-box-480").dataset.kind).toBe("future");
    expect(dom.getByTestId("pt-box-480").dataset.value).toBe("18");                // 10 + 480 / 60 at the horizon the design chose
    expect(dom.queryByTestId("pt-box-90")).toBeNull();                              // only the design's horizons are boxed
  });
  it("shows a certainty for each chart, and the switch removes them all", () => {
    render(<><PredictionSwitches widget={switchesWidget} /><PredictionTrends widget={trendsWidget} /></>);
    expect(document.querySelectorAll('[data-testid^="pt-certainty-"]')).toHaveLength(5);
    fireEvent.click(dom.getByTestId("fp-toggle-certainty"));
    expect(document.querySelectorAll('[data-testid^="pt-certainty-"]')).toHaveLength(0);
  });
  it("draws blood pressure as systolic, MAP and diastolic, each with its measured readings and its predicted intervals", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    for (const id of ["bp_sys", "bp_mean", "bp_dia"]) {
      expect(dom.getByTestId(`pt-${id}-chart-band80`)).toBeTruthy();
      expect(dom.getByTestId(`pt-${id}-chart-band95`)).toBeTruthy();
      expect(dom.getByTestId(`pt-${id}-chart-future`)).toBeTruthy();
    }
    expect(dom.getByTestId("pt-bp_sys-chart-end").dataset.value).toBe("18");
    expect(dom.getByTestId("pt-bp_mean-chart-end").dataset.value).toBe("16");
    expect(dom.getByTestId("pt-bp_dia-chart-end").dataset.value).toBe("14");
    expect(dom.getByTestId("pt-values-bp_sys").textContent).toContain("Now 120/70 (87)");
    expect(dom.getByTestId("pt-values-bp_sys").textContent).toContain("+8 H 18/14 (16)");
    expect(document.querySelectorAll(".tf-bpx").length).toBeGreaterThan(0);                  // the MAP markers
  });
  it("puts a % confidence under each predicted NEWS2 box and none under the charted or current ones", () => {
    render(<PredictionTrends widget={trendsWidget} />);
    expect(dom.getByTestId("pt-conf-480").dataset.value).toBe("0.6");
    expect(dom.getByTestId("pt-conf-480").textContent).toBe("60%");
    expect(dom.getByTestId("pt-conf-60")).toBeTruthy();
    expect(dom.queryByTestId("pt-conf-0")).toBeNull();
    expect(dom.queryByTestId("pt-conf--240")).toBeNull();
    expect(dom.getByTestId("pt-confcap").textContent).toBe("Confidence");
  });
  it("uses the certainty of that horizon when the forecast point has its own", () => {
    const s = snapshot();
    const news = s.forecast.forecasts.find((f: any) => f.parameter === "news2");
    news.points.find((p: any) => p.horizon_min === 480).certainty = [{ metric: "prediction_interval", score: 0.42, text: "42%", label: "", inputs: {} }];
    useExample.setState({ snapshot: s });
    render(<PredictionTrends widget={trendsWidget} />);
    expect(dom.getByTestId("pt-conf-480").textContent).toBe("42%");
    expect(dom.getByTestId("pt-conf-60").textContent).toBe("60%");
  });
  it("the Certainty switch removes the confidences", () => {
    render(<><PredictionSwitches widget={switchesWidget} /><PredictionTrends widget={trendsWidget} /></>);
    fireEvent.click(dom.getByTestId("fp-toggle-certainty"));
    expect(document.querySelectorAll('[data-testid^="pt-conf-"]')).toHaveLength(0);
    expect(dom.queryByTestId("pt-confcap")).toBeNull();
  });
  it("each switch hides its part, and says so when nothing is left; the time axis stays", () => {
    render(<><PredictionSwitches widget={switchesWidget} /><PredictionTrends widget={trendsWidget} /></>);
    fireEvent.click(dom.getByTestId("fp-toggle-news"));
    expect(dom.queryByTestId("pt-boxes")!.querySelector(".pt-box")).toBeNull();
    expect(dom.getByTestId("pt-news-off")).toBeTruthy();
    expect(dom.getByTestId("pt-hr")).toBeTruthy();
    fireEvent.click(dom.getByTestId("fp-toggle-obs"));
    expect(dom.getByTestId("pt-nothing")).toBeTruthy();
    expect(dom.getByTestId("pt-axis")).toBeTruthy();
    fireEvent.click(dom.getByTestId("fp-toggle-news"));
    expect(dom.getByTestId("pt-nothing").textContent).toMatch(/Observation Predictions are off/);
  });
  it("shares its switches with the Prediction view", () => {
    const { unmount } = render(<PredictionSwitches widget={switchesWidget} />);
    fireEvent.click(dom.getByTestId("fp-toggle-obs"));
    unmount();
    render(<ForecastPanel widget={{ id: "f", type: "forecast-panel", show_news_number: true, show_observations: true, show_certainty: true } as any} />);
    expect(dom.queryByTestId("fp-obs")).toBeNull();
    expect(dom.getByTestId("fp-news")).toBeTruthy();
  });
  it("keeps the history but hides a prediction below the certainty limit, and says so", () => {
    load(0.1);
    render(<PredictionTrends widget={trendsWidget} />);
    expect(dom.getByTestId("pt-hidden-hr")).toBeTruthy();
    expect(dom.getByTestId("pt-values-hr").textContent).not.toContain("+8 H");
    expect(dom.getByTestId("pt-hidden-news")).toBeTruthy();
    expect(dom.queryByTestId("pt-box-480")).toBeNull();                              // no predicted NEWS2 boxes, the charted ones stay
    expect(dom.getByTestId("pt-box-0")).toBeTruthy();
  });
  it("says so without example data", () => {
    useExample.setState({ enabled: false, snapshot: null });
    render(<PredictionTrends widget={trendsWidget} />);
    expect(dom.getByTestId("pt-empty")).toBeTruthy();
  });
});

describe("What the AI Sees Now", () => {
  const widget = { id: "s", type: "ai-summary", max_items: 6, include_resolved: false } as any;
  it("lists the active findings, each with its severity, certainty and onset", () => {
    render(<AiSummary widget={widget} />);
    expect(dom.getByTestId("ai-summary").getAttribute("data-count")).toBe("2");
    expect(dom.queryByTestId("ais-b")).toBeNull();
    expect(dom.getByTestId("ais-sev-a").textContent).toBe("Critical");
    expect(dom.getByTestId("ais-a").textContent).toContain("80%");
    expect(dom.getByTestId("ais-a").textContent).toContain("Began");
  });
  it("includes resolved findings and limits the count when asked", () => {
    render(<AiSummary widget={{ ...widget, include_resolved: true }} />);
    expect(dom.getByTestId("ai-summary").getAttribute("data-count")).toBe("3");
    expect(dom.getByTestId("ais-b").getAttribute("data-status")).toBe("resolved");
  });
  it("limits the list to max_items", () => {
    render(<AiSummary widget={{ ...widget, max_items: 1 }} />);
    expect(dom.getByTestId("ai-summary").getAttribute("data-count")).toBe("1");
  });
  it("opens the Why sheet for a finding in one touch", () => {
    render(<AiSummary widget={widget} />);
    fireEvent.click(dom.getByTestId("ais-a"));
    expect(useUi.getState().openSheet).toBe("finding-explain");
    expect(useUi.getState().sheetContext).toBe("a");
  });
  it("says so when the AI is off, and when there is nothing to flag", () => {
    useUi.setState({ aiOverride: false } as any);
    const { unmount } = render(<AiSummary widget={widget} />);
    expect(dom.getByTestId("ais-off")).toBeTruthy();
    unmount();
    useUi.setState({ aiOverride: null } as any);
    useExample.setState({ snapshot: { ...snapshot(), findings: [] } as any });
    render(<AiSummary widget={widget} />);
    expect(dom.getByTestId("ais-none")).toBeTruthy();
  });
});

describe("the events timeline", () => {
  const widget = { id: "t", type: "events-timeline", hours_back: 4, hours_ahead: 8 } as any;
  it("lists each predicted event soonest first with its probability and the time to NEWS2 5", () => {
    render(<EventsTimeline widget={widget} />);
    const rows = [...document.querySelectorAll('[data-testid^="evt-row-"]')].map((r) => r.getAttribute("data-testid"));
    expect(rows).toEqual(["evt-row-desaturation", "evt-row-news2_ge_7"]);
    expect(dom.getByTestId("evt-row-desaturation").textContent).toContain("66% Likely");
    expect(dom.getByTestId("evt-row-desaturation").textContent).toContain("In 30 min");
    expect(dom.getByTestId("evt-threshold").textContent).toContain("45");
  });
  it("counts what it shows", () => {
    render(<EventsTimeline widget={widget} />);
    expect(dom.getByTestId("events-timeline").getAttribute("data-future")).toBe("2");
    expect(+dom.getByTestId("events-timeline").getAttribute("data-past")!).toBeGreaterThan(0);
  });
  it("says so when nothing is predicted", () => {
    useExample.setState({ snapshot: { ...snapshot(), forecast: { ...snapshot().forecast, events: [], minutes_to_news_threshold: {} } } as any });
    render(<EventsTimeline widget={widget} />);
    expect(dom.getByTestId("evt-none")).toBeTruthy();
  });
});

describe("the Prediction Overlay switch", () => {
  it("goes to the overlay screen and back to where it came from", () => {
    useUi.setState({ screenId: "abcde" } as any);
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe(PREDICTION_OVERLAY_SCREEN);
    expect(useUi.getState().overlayFrom).toBe("abcde");
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe("abcde");
    expect(useUi.getState().overlayFrom).toBeNull();
  });
  it("goes back to the home screen when it was switched on from nowhere", () => {
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe(PREDICTION_OVERLAY_SCREEN);
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe("monitor");
  });
});

describe("the Prediction Overlay on the NEWS2 screen", () => {
  it("opens the NEWS2 overlay from the NEWS2 screen and goes back to it", () => {
    useUi.setState({ screenId: "news2" } as any);
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe("news2-predict");
    expect(isOverlayScreen("news2-predict")).toBe(true);
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe("news2");
  });
  it("uses the monitor overlay from any other screen, and when the design has no NEWS2 overlay", () => {
    useUi.setState({ screenId: "abcde" } as any);
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe(PREDICTION_OVERLAY_SCREEN);
    act(() => useUi.getState().togglePredictionOverlay());
    useUi.setState({ screenId: "news2", stored: { document: { ...design, screens: [{ id: "news2" }, { id: PREDICTION_OVERLAY_SCREEN }] } } as any });
    act(() => useUi.getState().togglePredictionOverlay());
    expect(useUi.getState().screenId).toBe(PREDICTION_OVERLAY_SCREEN);
  });
});
