import { act, render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { NotificationBox } from "./NotificationBox";
import { Numeric, RowStatus } from "./Numeric";
import { useSafety } from "./store";

const design = {
  safety: { standby_text: "STANDBY", stale_values: "hide", show_advice: true, device_status: "tiles",
            show_battery_percent: true, dim_poor_traces: true },
  labels: { auto_capitalise: true, show_method: true },
  notifications: { position: "tab-bar-left", order: "severity-then-recent", empty_text: "No Notifications",
                   show_count: true, size: "standard", flash: true, feed_max_items: 12 },
  theme: { mode: "dark" },
} as unknown as Design;
const registry = {
  parameters: { spo2: { short: "SpO2", unit: "%", decimals: 0 }, temp: { short: "Temp", unit: "°C", decimals: 1 },
                bp_sys: { short: "SYS", unit: "mmHg", decimals: 0 } },
  signal_states: {
    ok: { text: "", tone: "normal" }, standby: { text: "STANDBY", tone: "inactive" },
    "poor-signal": { text: "POOR TRACE", tone: "technical" },
    "connection-lost": { text: "CONNECTION LOST", tone: "technical" }, invalid: { text: "-?-", tone: "technical" },
  },
  signal_issues: { "low-perfusion": { label: "Low perfusion", advice: "Check sensor site; try another site" } },
  technical_alarms: { "display-disconnected": { message: "This screen is not updating." } },
};
const ok = (parameter: string, extra = {}) => ({ parameter, state: "ok", since: "", advice: "", ...extra }) as any;
const limb = (over = {}) => ({ id: "limb", label: "Limb sensor", kind: "anne-limb", connection: "connected",
  battery: "ok", battery_pct: 64, link_quality: 0.9, parameters: ["spo2", "pulse"], waveforms: [], ...over }) as any;
const alarms = (over = {}) => ({ active: [], silenced_until: null, silence_seconds: 120, alarms_off: [],
  unmonitored: [], ...over }) as any;

beforeEach(() => {
  useUi.setState({ stored: { document: design } as any, registry: registry as any });
  useSafety.setState({ link: "live", sound: "ready", signals: {}, devices: [], alarms: null });
});

describe("tile", () => {
  it("shows STANDBY rather than dashes when nothing is connected", () => {
    render(<Numeric parameter="spo2" />);
    const el = dom.getByTestId("num-spo2");
    expect(el.dataset.state).toBe("standby");
    expect(el.textContent).toContain("STANDBY");
    expect(el.textContent).not.toContain("--");
  });

  it("shows a value with the registry's decimals when the signal is ok", () => {
    useSafety.setState({ signals: { temp: ok("temp") } });
    render(<Numeric parameter="temp" value={36.84} />);
    expect(dom.getByTestId("num-temp").textContent).toContain("36.8");
  });

  it("writes blood pressure as one value in one tile", () => {
    useSafety.setState({ signals: { bp_sys: ok("bp_sys") } });
    render(<Numeric parameter="bp_sys" name="BP" value={120}
                    extra={[{ separator: "/", value: 80 }, { separator: " ", value: 93, wrap: [" (", ")"] }]} />);
    expect(dom.getByTestId("num-bp_sys").textContent).toContain("120/80 (93)");
    expect(dom.getByTestId("num-bp_sys").textContent).toContain("BP");
  });

  it("carries the battery and link of the device that measures it", () => {
    useSafety.setState({ signals: { spo2: ok("spo2", { device_id: "limb" }) }, devices: [limb()] });
    render(<Numeric parameter="spo2" value={97} />);
    const mark = dom.getByTestId("mark-limb");
    expect(dom.getByTestId("num-spo2").contains(mark)).toBe(true);
    expect(mark.textContent).toContain("64%");
    expect(mark.querySelector(".battery")).not.toBeNull();
    expect(mark.querySelector(".link-connected")).not.toBeNull();
  });

  it("says LOW with the percentage for a low battery, and NO LINK for a lost device", () => {
    useSafety.setState({ signals: { spo2: ok("spo2") }, devices: [limb({ battery: "low", battery_pct: 17.6 })] });
    const { unmount } = render(<Numeric parameter="spo2" value={97} />);
    expect(dom.getByTestId("mark-limb").textContent).toContain("LOW 18%");
    expect(dom.getByTestId("mark-limb").className).toContain("device-low");
    unmount();
    useSafety.setState({ devices: [limb({ connection: "lost" })],
      signals: { spo2: { parameter: "spo2", state: "connection-lost", since: "", advice: "" } as any } });
    render(<Numeric parameter="spo2" />);
    expect(dom.getByTestId("mark-limb").textContent).toContain("NO LINK");
    expect(dom.getByTestId("num-spo2").textContent).toContain("CONNECTION LOST");
  });

  it("flags a poor trace and marks an alarm that is switched off", () => {
    useSafety.setState({
      signals: { spo2: { parameter: "spo2", state: "poor-signal", issue: "low-perfusion", since: "", advice: "" } as any },
      alarms: alarms({ alarms_off: ["spo2"] }),
    });
    render(<><Numeric parameter="spo2" value={93} /><RowStatus parameter="spo2" /></>);
    expect(dom.getByTestId("num-spo2").textContent).toContain("93?");
    expect(dom.getByTestId("num-spo2").textContent).toContain("ALARM OFF");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("POOR TRACE");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("Check sensor site");
  });

  it("shows NO DATA and drops device details when the screen stops receiving", () => {
    useSafety.setState({ link: "stale", signals: { spo2: ok("spo2") }, devices: [limb()] });
    render(<Numeric parameter="spo2" value={97} />);
    expect(dom.getByTestId("num-spo2").textContent).toContain("NO DATA");
    expect(dom.getByTestId("num-spo2").textContent).not.toContain("97");
    expect(dom.queryByTestId("mark-limb")).toBeNull();
  });
});

describe("notification box", () => {
  const hr = { id: "a1", kind: "high", priority: "high", parameter: "hr", message: "Heart rate 142, above 120.",
               started_at: new Date(Date.now() - 60_000).toISOString() };
  const batt = { id: "a2", kind: "technical", technical: "battery-low", priority: "low", parameter: null,
                 message: "Limb sensor: battery 18%.", started_at: new Date(Date.now() - 30_000).toISOString() };

  it("says No Notifications when there are none", () => {
    render(<NotificationBox placement="bar" />);
    expect(dom.getByTestId("notif-text").textContent).toBe("No Notifications");
    expect(dom.getByTestId("notifications").className).toContain("notif-empty");
    expect(dom.queryByTestId("feed")).toBeNull();
  });

  it("headlines the most serious item, counts the rest, and tags patient versus monitor", () => {
    useSafety.setState({ alarms: alarms({ active: [batt, hr] }) });
    render(<NotificationBox placement="bar" />);
    const box = dom.getByTestId("notifications");
    expect(dom.getByTestId("notif-text").textContent).toBe("Heart rate 142, above 120.");
    expect(box.textContent).toContain("PATIENT");
    expect(dom.getByTestId("notif-count").textContent).toBe("+1");
    expect(box.className).toContain("notif-patient-high");
  });

  it("opens the full list as an overlay, most serious first", () => {
    useSafety.setState({ alarms: alarms({ active: [batt, hr] }) });
    render(<NotificationBox placement="bar" />);
    act(() => dom.getByTestId("notifications").click());
    const items = [...dom.getByTestId("feed").querySelectorAll("[data-notice]")].map((e) => e.getAttribute("data-notice"));
    expect(items).toEqual(["a1", "a2"]);
    expect(dom.getByTestId("feed").textContent).toContain("MONITOR");
    expect(dom.getByTestId("feed").textContent).toMatch(/1 min ago/);
    act(() => dom.getByTestId("feed-close").click());
    expect(dom.queryByTestId("feed")).toBeNull();
  });

  it("shows SOUND PAUSED with the time left beside the headline", () => {
    useSafety.setState({ alarms: alarms({ active: [hr], silenced_until: new Date(Date.now() + 105_000).toISOString() }) });
    render(<NotificationBox placement="bar" />);
    expect(dom.getByTestId("notif-paused").textContent).toMatch(/SOUND PAUSED\s*1:4[45]/);
    expect(dom.getByTestId("notif-text").textContent).toBe("Heart rate 142, above 120.");
    act(() => dom.getByTestId("notifications").click());
    expect(dom.getByTestId("feed-paused").textContent).toContain("Alarms still show on screen");
    expect(dom.getByTestId("feed-resume")).toBeTruthy();
  });

  it("says only that the screen is not updating when it has no feed", () => {
    useSafety.setState({ link: "down", alarms: alarms({ active: [hr, batt] }) });
    render(<NotificationBox placement="strip" />);
    expect(dom.getByTestId("notif-text").textContent).toBe("This screen is not updating.");
    expect(dom.queryByTestId("notif-count")).toBeNull();
    expect(dom.getByTestId("notifications").className).toContain("notif-monitor-high");
  });
});
