import { MAX_DOTS, noticeColour, rowColourFor, type Notice } from "./notifications";
import { marqueeSeconds, noticeKey, tickerView } from "./ticker";

const T = Date.parse("2026-11-23T12:00:00Z");
const n = (id: string, about: "patient" | "monitor", priority: "high" | "medium" | "low", minsAgo = 1): Notice => ({
  id, about, priority, text: `${id}.`, at: T - minsAgo * 60_000, parameters: [], mark: null });

describe("ticker", () => {
  it("shows nothing when there is nothing to report", () => {
    expect(tickerView([], 0)).toEqual({ current: null, position: 0, total: 0, held: false });
  });

  it("takes turns through the items, in order, and wraps", () => {
    const list = [n("a", "monitor", "medium"), n("b", "monitor", "low"), n("c", "patient", "medium")];
    expect([0, 1, 2, 3, 4].map((t) => tickerView(list, t).current!.id)).toEqual(["a", "b", "c", "a", "b"]);
    expect(tickerView(list, 1)).toMatchObject({ position: 2, total: 3, held: false });
    expect(tickerView(list, -1).current!.id).toBe("c");
  });

  it("holds a high-priority patient alarm still, whatever the step", () => {
    const list = [n("hr", "patient", "high"), n("lost", "monitor", "medium"), n("batt", "monitor", "low")];
    for (const tick of [0, 1, 2, 7]) {
      expect(tickerView(list, tick)).toMatchObject({ held: true, position: 1, total: 3 });
      expect(tickerView(list, tick).current!.id).toBe("hr");
    }
  });

  it("holds the most recent when there are several", () => {
    const list = [n("old", "patient", "high", 20), n("new", "patient", "high", 1), n("x", "monitor", "low")];
    expect(tickerView(list, 5).current!.id).toBe("new");
  });

  it("is not held by anything less serious", () => {
    for (const item of [n("m", "monitor", "high"), n("p", "patient", "medium"), n("l", "patient", "low")]) {
      expect(tickerView([item, n("z", "monitor", "low")], 1).held).toBe(false);
    }
    // a high-priority MONITORING problem rotates like the rest
    expect(tickerView([n("m", "monitor", "high"), n("z", "monitor", "low")], 1).current!.id).toBe("z");
  });

  it("releases the hold when the alarm clears", () => {
    const rest = [n("lost", "monitor", "medium"), n("batt", "monitor", "low")];
    expect(tickerView([n("hr", "patient", "high"), ...rest], 1).held).toBe(true);
    expect(tickerView(rest, 1)).toMatchObject({ held: false });
  });

  it("restarts when the set of items changes, not when their wording does", () => {
    const a = [n("a", "monitor", "low"), n("b", "monitor", "low")];
    expect(noticeKey(a)).toBe("a|b");
    expect(noticeKey([{ ...a[0]!, text: "changed." }, a[1]!])).toBe("a|b");
    expect(noticeKey([a[1]!])).toBe("b");
  });

  it("scrolls slower for slow, and never faster than a readable pass", () => {
    expect(marqueeSeconds(80, "slow")).toBeGreaterThan(marqueeSeconds(80, "fast"));
    expect(marqueeSeconds(1, "fast")).toBeGreaterThanOrEqual(6);
  });
});

describe("notification colour", () => {
  const rows = [
    { parameter: "hr", numerics: ["hr"], colour: null },
    { parameter: "spo2", numerics: ["spo2", "pulse"], colour: null },
    { parameter: "rr", numerics: ["rr"], colour: "#FF8800" },
    { parameter: "bp_sys", numerics: ["bp_sys", "bp_dia", "bp_mean"], colour: null },
  ];

  it("uses the colour of the row a parameter is in, including secondary values", () => {
    expect(rowColourFor("hr", rows)).toBe("var(--p-hr, var(--c-text))");
    expect(rowColourFor("pulse", rows)).toBe(rowColourFor("spo2", rows));
    expect(rowColourFor("bp_dia", rows)).toBe("var(--p-bp-sys, var(--c-text))");
    expect(rowColourFor("rr", rows)).toBe("#FF8800");
    expect(rowColourFor("glucose", rows)).toBeNull();
  });

  it("colours the text for one row, and shows dots for several", () => {
    expect(noticeColour(["spo2", "pulse"], rows)).toEqual({ colour: "var(--p-spo2, var(--c-text))", dots: [] });
    const many = noticeColour(["hr", "rr", "spo2"], rows);
    expect(many.colour).toBeNull();
    expect(many.dots).toEqual(["var(--p-hr, var(--c-text))", "#FF8800", "var(--p-spo2, var(--c-text))"]);
  });

  it("is neutral when it is about no row, and caps the dots", () => {
    expect(noticeColour([], rows)).toEqual({ colour: null, dots: [] });
    expect(noticeColour(["glucose"], rows)).toEqual({ colour: null, dots: [] });
    const lots = Array.from({ length: 8 }, (_, i) => ({ parameter: `p${i}`, numerics: [], colour: `#00000${i}` }));
    expect(noticeColour(lots.map((r) => r.parameter), lots).dots).toHaveLength(MAX_DOTS);
  });
});
