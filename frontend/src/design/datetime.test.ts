import { describe, expect, it } from "vitest";

import { DATE_FORMATS, DEFAULT_FORMAT, fmtDate, fmtDateTime, fmtTime } from "./datetime";

const d = new Date(2026, 10, 24, 14, 5, 9);            // 24 Nov 2026, 14:05:09 local

describe("dates", () => {
  it("defaults to dd/mm/yyyy", () => {
    expect(fmtDate(d)).toBe("24/11/2026");
    expect(DEFAULT_FORMAT.date_format).toBe("dd/mm/yyyy");
  });
  it("writes each format in full and without the year where space is tight", () => {
    const f = (date_format: any, short = false) => fmtDate(d, { date_format }, { short });
    expect(f("dd/mm/yyyy")).toBe("24/11/2026");
    expect(f("mm/dd/yyyy")).toBe("11/24/2026");
    expect(f("yyyy-mm-dd")).toBe("2026-11-24");
    expect(f("dd Mon yyyy")).toBe("24 Nov 2026");
    expect([f("dd/mm/yyyy", true), f("mm/dd/yyyy", true), f("yyyy-mm-dd", true), f("dd Mon yyyy", true)]).toEqual(["24/11", "11/24", "11-24", "24 Nov"]);
  });
  it("pads days and months", () => {
    expect(fmtDate(new Date(2026, 0, 3))).toBe("03/01/2026");
  });
  it("takes an ISO string as well as a Date", () => {
    expect(fmtDate("2026-11-24T14:05:09")).toBe("24/11/2026");
  });
});

describe("times", () => {
  it("is 24 hour by default, with seconds only when asked", () => {
    expect(fmtTime(d)).toBe("14:05");
    expect(fmtTime(d, DEFAULT_FORMAT, { seconds: true })).toBe("14:05:09");
  });
  it("writes 12 hour with AM and PM, noon as 12 PM and midnight as 12 AM", () => {
    const c = { clock_format: "12h" as const, show_seconds: true };
    expect(fmtTime(d, c)).toBe("2:05 PM");
    expect(fmtTime(d, c, { seconds: true })).toBe("2:05:09 PM");
    expect(fmtTime(new Date(2026, 10, 24, 12, 0), c)).toBe("12:00 PM");
    expect(fmtTime(new Date(2026, 10, 24, 0, 7), c)).toBe("12:07 AM");
  });
  it("joins date and time", () => {
    expect(fmtDateTime(d, DEFAULT_FORMAT, { short: true })).toBe("24/11 14:05");
  });
});

describe("the format choices", () => {
  it("are shown as the example date written in each, so no label starts with a pattern word", () => {
    expect(DATE_FORMATS.map((f) => f.label)).toEqual(["24/11/2026", "11/24/2026", "2026-11-24", "24 Nov 2026"]);
  });
});
