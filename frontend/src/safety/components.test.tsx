import { act, fireEvent, render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { NotificationBox } from "./NotificationBox";
import { RowStatus, Tile } from "./Tile";
import { useSafety } from "./store";

const design = {
  safety: { standby_text: "STANDBY", stale_values: "hide", show_advice: true, device_status: "tiles",
            show_battery_percent: true, dim_poor_traces: true },
  labels: { auto_capitalise: true, show_method: true },
  notifications: { position: "tab-bar-left", order: "severity-then-recent", empty_text: "No Notifications",
                   show_count: true, size: "standard", flash: true, feed_max_items: 12,
                   ticker: "vertical", ticker_dwell_s: 4, ticker_speed: "medium" },
  rows: [
    { parameter: "hr", numerics: ["hr"], colour: null },
    { parameter: "spo2", numerics: ["spo2", "pulse"], colour: null },
    { parameter: "rr", numerics: ["rr"], colour: null },
  ],
  theme: { mode: "dark" },
} as unknown as Design;
const registry = {
  parameters: { spo2: { short: "SpO2", unit: "%", decimals: 0 }, pulse: { short: "PR", unit: "bpm", decimals: 0 },
                temp: { short: "Temp", unit: "°C", decimals: 1 }, bp_sys: { short: "SYS", unit: "mmHg", decimals: 0 },
                hr: { short: "HR", unit: "bpm", decimals: 0 }, rr: { short: "RR", unit: "/min", decimals: 0 } },
  signal_states: {
    ok: { text: "", tone: "normal" }, standby: { text: "STANDBY", tone: "inactive" },
    "poor-signal": { text: "POOR TRACE", tone: "technical" }, "sensor-off": { text: "CHECK SENSOR", tone: "technical" },
    "connection-lost": { text: "CONNECTION LOST", tone: "technical" }, invalid: { text: "-?-", tone: "technical" },
  },
  signal_issues: { "low-perfusion": { label: "Low perfusion", advice: "Check sensor site; try another site" } },
  technical_alarms: { "display-disconnected": { message: "This screen is not updating." } },
  alarm_priority_marks: { high: "!!!", medium: "!!", low: "!" },
};
const ok = (parameter: string, extra = {}) => ({ parameter, state: "ok", since: "", advice: "", ...extra }) as any;
const limb = (over = {}) => ({ id: "limb", label: "Limb sensor", kind: "anne-limb", connection: "connected",
  battery: "ok", battery_pct: 64, link_quality: 0.9, parameters: ["spo2", "pulse"], waveforms: [], ...over }) as any;
const alarms = (over = {}) => ({ active: [], silenced_until: null, silence_seconds: 120, alarms_off: [],
  unmonitored: [], ...over }) as any;
const val = (parameter: string, value?: number | null) => ({ parameter, value });

beforeEach(() => {
  useUi.setState({ stored: { document: design } as any, registry: registry as any });
  useSafety.setState({ link: "live", sound: "ready", signals: {}, devices: [], alarms: null });
});

describe("tile", () => {
  it("shows STANDBY rather than dashes when nothing is connected", () => {
    render(<Tile values={[val("spo2")]} />);
    const el = dom.getByTestId("num-spo2");
    expect(el.dataset.state).toBe("standby");
    expect(el.textContent).toContain("STANDBY");
    expect(el.textContent).not.toContain("--");
  });

  it("shows a value with the registry's decimals when the signal is ok", () => {
    useSafety.setState({ signals: { temp: ok("temp") } });
    render(<Tile values={[val("temp", 36.84)]} />);
    expect(dom.getByTestId("num-temp").textContent).toContain("36.8");
  });

  it("holds SpO2 and PR in ONE tile, primary first", () => {
    useSafety.setState({ signals: { spo2: ok("spo2"), pulse: ok("pulse") } });
    const { container } = render(<Tile values={[val("spo2", 97), val("pulse", 72)]} />);
    expect(container.querySelectorAll(".tile")).toHaveLength(1);
    const cells = [...container.querySelectorAll(".tile-cell")];
    expect(cells.map((c) => c.getAttribute("data-testid"))).toEqual(["cell-spo2", "cell-pulse"]);
    expect(cells[0]!.textContent).toContain("97");
    expect(cells[1]!.textContent).toContain("72");
    expect(cells[0]!.className).toContain("tile-primary");
    expect(dom.getByTestId("num-spo2").className).toContain("tile-multi");
  });

  it("shows a shared problem once, across the tile", () => {
    const lost = (p: string) => ({ parameter: p, state: "connection-lost", since: "", advice: "" }) as any;
    useSafety.setState({ signals: { spo2: lost("spo2"), pulse: lost("pulse") } });
    const { container } = render(<Tile values={[val("spo2"), val("pulse")]} />);
    expect(container.querySelectorAll(".tile-cell")).toHaveLength(1);
    expect(container.querySelectorAll(".tile-state")).toHaveLength(1);
    expect(dom.getByTestId("num-spo2").textContent).toContain("CONNECTION LOST");
    expect(dom.getByTestId("num-spo2").textContent).toContain("SpO2 · PR");
  });

  it("shows each value its own state when they differ, and never a value for a bad signal", () => {
    useSafety.setState({ signals: { spo2: ok("spo2"),
      pulse: { parameter: "pulse", state: "sensor-off", since: "", advice: "" } as any } });
    render(<Tile values={[val("spo2", 97), val("pulse", 72)]} />);
    expect(dom.getByTestId("cell-spo2").textContent).toContain("97");
    expect(dom.getByTestId("cell-pulse").textContent).toContain("CHECK SENSOR");
    expect(dom.getByTestId("cell-pulse").textContent).not.toContain("72");
    expect(dom.getByTestId("num-spo2").dataset.state).toBe("sensor-off");   // the worst sets the frame
    expect(dom.getByTestId("cell-pulse").querySelector(".tile-glyph")).not.toBeNull();
  });

  it("writes blood pressure as one value", () => {
    useSafety.setState({ signals: { bp_sys: ok("bp_sys") } });
    render(<Tile values={[{ parameter: "bp_sys", name: "BP", value: 120,
      extra: [{ separator: "/", value: 80 }, { separator: " ", value: 93, wrap: [" (", ")"] }] }]} />);
    expect(dom.getByTestId("num-bp_sys").textContent).toContain("120/80 (93)");
    expect(dom.getByTestId("num-bp_sys").textContent).toContain("BP");
  });

  it("carries the battery and link of the device that measures it, once", () => {
    useSafety.setState({ signals: { spo2: ok("spo2", { device_id: "limb" }), pulse: ok("pulse") }, devices: [limb()] });
    const { container } = render(<Tile values={[val("spo2", 97), val("pulse", 72)]} />);
    const mark = dom.getByTestId("mark-limb");
    expect(dom.getByTestId("num-spo2").contains(mark)).toBe(true);
    expect(container.querySelectorAll('[data-testid="mark-limb"]')).toHaveLength(1);
    expect(mark.textContent).toContain("64%");
    expect(mark.querySelector(".battery")).not.toBeNull();
    expect(mark.querySelector(".link-connected")).not.toBeNull();
  });

  it("says LOW with the percentage for a low battery, and NO LINK for a lost device", () => {
    useSafety.setState({ signals: { spo2: ok("spo2") }, devices: [limb({ battery: "low", battery_pct: 17.6 })] });
    const { unmount } = render(<Tile values={[val("spo2", 97)]} />);
    expect(dom.getByTestId("mark-limb").textContent).toContain("LOW 18%");
    expect(dom.getByTestId("mark-limb").className).toContain("device-low");
    unmount();
    useSafety.setState({ devices: [limb({ connection: "lost" })],
      signals: { spo2: { parameter: "spo2", state: "connection-lost", since: "", advice: "" } as any } });
    render(<Tile values={[val("spo2")]} />);
    expect(dom.getByTestId("mark-limb").textContent).toContain("NO LINK");
    expect(dom.getByTestId("num-spo2").textContent).toContain("CONNECTION LOST");
  });

  it("flags a poor trace and marks an alarm that is switched off", () => {
    useSafety.setState({
      signals: { spo2: { parameter: "spo2", state: "poor-signal", issue: "low-perfusion", since: "", advice: "" } as any },
      alarms: alarms({ alarms_off: ["spo2"] }),
    });
    render(<><Tile values={[val("spo2", 93)]} /><RowStatus parameter="spo2" /></>);
    expect(dom.getByTestId("num-spo2").textContent).toContain("93?");
    expect(dom.getByTestId("num-spo2").textContent).toContain("ALARM OFF");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("POOR TRACE");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("Check sensor site");
  });

  it("shows NO DATA and drops device details when the screen stops receiving", () => {
    useSafety.setState({ link: "stale", signals: { spo2: ok("spo2") }, devices: [limb()] });
    render(<Tile values={[val("spo2", 97)]} />);
    expect(dom.getByTestId("num-spo2").textContent).toContain("NO DATA");
    expect(dom.getByTestId("num-spo2").textContent).not.toContain("97");
    expect(dom.queryByTestId("mark-limb")).toBeNull();
  });
});

describe("notification ticker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const at = (secsAgo: number) => new Date(Date.now() - secsAgo * 1000).toISOString();
  const hr = { id: "a1", kind: "high", priority: "high", parameter: "hr", message: "Heart rate 142, above 120.", started_at: at(60) };
  const lost = { id: "a2", kind: "technical", technical: "connection-lost", priority: "medium", parameter: null,
                 device_id: "limb", message: "Limb sensor: connection lost.", started_at: at(40) };
  const batt = { id: "a3", kind: "technical", technical: "battery-low", priority: "low", parameter: null,
                 device_id: "limb", message: "Limb sensor: battery 18%.", started_at: at(20) };
  const text = () => dom.getByTestId("notif-text").textContent;

  it("says No Notifications when there are none", () => {
    render(<NotificationBox placement="bar" />);
    expect(text()).toBe("No Notifications");
    expect(dom.getByTestId("notifications").className).toContain("notif-empty");
    expect(dom.queryByTestId("feed")).toBeNull();
  });

  it("takes the items in turn, most serious first, and counts them", () => {
    useSafety.setState({ alarms: alarms({ active: [batt, lost] }), devices: [limb()] });
    render(<NotificationBox placement="bar" />);
    expect(text()).toBe("Limb sensor: connection lost.");
    expect(dom.getByTestId("notif-count").textContent).toBe("1/2");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(text()).toBe("Limb sensor: battery 18%.");
    expect(dom.getByTestId("notif-count").textContent).toBe("2/2");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(text()).toBe("Limb sensor: connection lost.");
  });

  it("stops on a high-priority patient alarm and holds it", () => {
    useSafety.setState({ alarms: alarms({ active: [lost, hr, batt] }), devices: [limb()] });
    render(<NotificationBox placement="bar" />);
    for (let i = 0; i < 4; i++) {
      expect(text()).toBe("Heart rate 142, above 120.");
      act(() => { vi.advanceTimersByTime(4000); });
    }
    expect(dom.getByTestId("notifications").dataset.held).toBe("true");
    expect(dom.getByTestId("notif-mark").getAttribute("aria-label")).toBe("High priority");
    expect(dom.getByTestId("notif-mark").querySelector("svg path")).not.toBeNull();   // a triangle, not text
    expect(dom.getByTestId("notif-mark").textContent).toBe("");
    expect(dom.getByTestId("notifications").textContent).toContain("PATIENT");
    expect(dom.getByTestId("notif-count").textContent).toBe("1/3");
  });

  it("goes back to turns when the alarm clears", () => {
    useSafety.setState({ alarms: alarms({ active: [hr, lost] }), devices: [limb()] });
    render(<NotificationBox placement="bar" />);
    expect(dom.getByTestId("notifications").dataset.held).toBe("true");
    act(() => useSafety.setState({ alarms: alarms({ active: [lost, batt] }) }));
    expect(dom.getByTestId("notifications").dataset.held).toBe("false");
    expect(text()).toBe("Limb sensor: connection lost.");
  });

  it("NEVER opens the list by itself, even for a high-priority alarm", () => {
    render(<NotificationBox placement="bar" />);
    act(() => useSafety.setState({ alarms: alarms({ active: [hr, lost, batt] }) }));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(dom.queryByTestId("feed")).toBeNull();
    expect(dom.getByTestId("notifications").getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the list when touched, most serious first, and the ticker waits", () => {
    useSafety.setState({ alarms: alarms({ active: [batt, hr, lost] }), devices: [limb()] });
    render(<NotificationBox placement="bar" />);
    fireEvent.click(dom.getByTestId("notifications"));
    const ids = [...dom.getByTestId("feed").querySelectorAll("[data-notice]")].map((e) => e.getAttribute("data-notice"));
    expect(ids).toEqual(["a1", "a2", "a3"]);
    expect(dom.getByTestId("feed").textContent).toContain("MONITOR");
    expect(dom.getByTestId("feed").textContent).toMatch(/1 min ago/);
    fireEvent.click(dom.getByTestId("feed-close"));
    expect(dom.queryByTestId("feed")).toBeNull();
  });

  it("pauses the rotation while the list is open", () => {
    useSafety.setState({ alarms: alarms({ active: [batt, lost] }), devices: [limb()] });
    render(<NotificationBox placement="bar" />);
    fireEvent.click(dom.getByTestId("notifications"));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(dom.getByTestId("notif-count").textContent).toBe("1/2");
  });

  it("colours an item like its row: one row, the row colour; several rows, dots", () => {
    useSafety.setState({ alarms: alarms({ active: [{ ...lost, device_id: "limb" }] }), devices: [limb()] });
    const { unmount } = render(<NotificationBox placement="bar" />);
    const item = dom.getByTestId("notifications").querySelector(".ticker-item") as HTMLElement;
    expect(item.style.color).toBe("var(--p-spo2, var(--c-text))");       // the limb sensor feeds the SpO2 row
    unmount();
    useSafety.setState({ devices: [limb({ parameters: ["hr", "rr"] })] });
    render(<NotificationBox placement="bar" />);
    const many = dom.getByTestId("notifications").querySelector(".ticker-item") as HTMLElement;
    expect(many.style.color).toBe("");
    expect(many.querySelectorAll(".notif-dot")).toHaveLength(2);
  });

  it("announces a NEW notification once, not each turn of the ticker", () => {
    render(<NotificationBox placement="bar" />);
    expect(dom.getByTestId("notif-announce").textContent).toBe("");
    act(() => useSafety.setState({ alarms: alarms({ active: [lost, batt] }), devices: [limb()] }));
    expect(dom.getByTestId("notif-announce").textContent).toBe("Limb sensor: connection lost.");
    expect(dom.getByTestId("notif-announce").getAttribute("role")).toBe("alert");
    act(() => { vi.advanceTimersByTime(7000); });
    expect(dom.getByTestId("notif-announce").textContent).toBe("");          // not repeated as it rotates
  });

  it("shows SOUND PAUSED with the time left beside the item", () => {
    useSafety.setState({ alarms: alarms({ active: [hr], silenced_until: new Date(Date.now() + 105_000).toISOString() }) });
    render(<NotificationBox placement="bar" />);
    expect(dom.getByTestId("notif-paused").textContent).toMatch(/SOUND PAUSED\s*1:4[45]/);
    expect(text()).toBe("Heart rate 142, above 120.");
    fireEvent.click(dom.getByTestId("notifications"));
    expect(dom.getByTestId("feed-paused").textContent).toContain("Alarms still show on screen");
    expect(dom.getByTestId("feed-resume")).toBeTruthy();
  });

  it("says only that the screen is not updating when it has no feed", () => {
    useSafety.setState({ link: "down", alarms: alarms({ active: [hr, batt] }) });
    render(<NotificationBox placement="strip" />);
    expect(text()).toBe("This screen is not updating.");
    expect(dom.queryByTestId("notif-count")).toBeNull();
    expect(dom.getByTestId("notifications").className).toContain("notif-monitor");
  });

  it("scrolls sideways, not up, when set to horizontal", () => {
    useUi.setState({ stored: { document: { ...design, notifications: { ...design.notifications, ticker: "horizontal" } } } as any });
    useSafety.setState({ alarms: alarms({ active: [lost, batt] }), devices: [limb()] });
    render(<NotificationBox placement="strip" />);
    const box = dom.getByTestId("notifications");
    expect(box.dataset.ticker).toBe("horizontal");
    expect(box.querySelector(".ticker-track")).not.toBeNull();
    expect(box.querySelectorAll(".ticker-item")).toHaveLength(2);         // both items, side by side
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(box.querySelectorAll(".ticker-item")).toHaveLength(2);         // no rolling in this mode
  });
});
