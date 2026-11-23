import { render, screen as dom } from "@testing-library/react";

import { useUi } from "@/app/store";
import type { Design } from "@/design/types";

import { Numeric, RowStatus } from "./Numeric";
import { SilenceBanner } from "./SilenceBanner";
import { useSafety } from "./store";

const design = {
  safety: { silence_banner: "top", silence_banner_pulse: true, standby_text: "STANDBY",
            stale_values: "hide", show_advice: true, device_status: "top-bar-and-rows",
            show_battery_percent: true, dim_poor_traces: true },
} as unknown as Design;
const registry = {
  parameters: { spo2: { short: "SpO2", unit: "%", decimals: 0 }, temp: { short: "Temp", unit: "°C", decimals: 1 } },
  signal_states: {
    ok: { text: "", tone: "normal" }, standby: { text: "STANDBY", tone: "inactive" },
    "poor-signal": { text: "POOR TRACE", tone: "technical" },
    "connection-lost": { text: "CONNECTION LOST", tone: "technical" }, invalid: { text: "-?-", tone: "technical" },
  },
  signal_issues: { "low-perfusion": { label: "Low perfusion", advice: "Check sensor site; try another site" } },
};

beforeEach(() => {
  useUi.setState({ stored: { document: design } as any, registry: registry as any });
  useSafety.setState({ link: "live", signals: {}, devices: [], alarms: null });
});

describe("Numeric", () => {
  it("shows STANDBY rather than dashes when nothing is connected", () => {
    render(<Numeric parameter="spo2" />);
    const el = dom.getByTestId("num-spo2");
    expect(el.dataset.state).toBe("standby");
    expect(el.textContent).toContain("STANDBY");
    expect(el.textContent).not.toContain("--");
  });

  it("shows a value with the registry's decimals when the signal is ok", () => {
    useSafety.setState({ signals: { temp: { parameter: "temp", state: "ok", since: "", advice: "" } as any } });
    render(<Numeric parameter="temp" value={36.84} />);
    expect(dom.getByTestId("num-temp").textContent).toContain("36.8");
  });

  it("flags a poor trace and marks an alarm that is switched off", () => {
    useSafety.setState({
      signals: { spo2: { parameter: "spo2", state: "poor-signal", issue: "low-perfusion", since: "", advice: "" } as any },
      alarms: { active: [], silenced_until: null, silence_seconds: 120, alarms_off: ["spo2"], unmonitored: [] } as any,
    });
    render(<><Numeric parameter="spo2" value={93} /><RowStatus parameter="spo2" /></>);
    expect(dom.getByTestId("num-spo2").textContent).toContain("93?");
    expect(dom.getByTestId("num-spo2").textContent).toContain("ALARM OFF");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("POOR TRACE");
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("Check sensor site");
  });

  it("shows NO DATA for every parameter when the screen stops receiving", () => {
    useSafety.setState({ link: "stale",
      signals: { spo2: { parameter: "spo2", state: "ok", since: "", advice: "" } as any } });
    render(<Numeric parameter="spo2" value={97} />);
    expect(dom.getByTestId("num-spo2").textContent).toContain("NO DATA");
    expect(dom.getByTestId("num-spo2").textContent).not.toContain("97");
  });

  it("puts a low battery on the rows the device feeds", () => {
    useSafety.setState({
      signals: { spo2: { parameter: "spo2", state: "ok", device_id: "limb", since: "", advice: "" } as any },
      devices: [{ id: "limb", label: "Limb sensor", battery: "low", battery_pct: 17.6, connection: "connected" } as any],
    });
    render(<RowStatus parameter="spo2" />);
    expect(dom.getByTestId("row-status-spo2").textContent).toContain("Limb sensor battery 18%");
  });
});

describe("SilenceBanner", () => {
  it("is absent when sound is on", () => {
    render(<SilenceBanner secondsLeft={0} onResume={() => {}} />);
    expect(dom.queryByTestId("silence-banner")).toBeNull();
  });

  it("says sound is paused, for how long, that alarms still show, and offers to resume", () => {
    const resume = vi.fn();
    render(<SilenceBanner secondsLeft={105} onResume={resume} />);
    const banner = dom.getByTestId("silence-banner");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.textContent).toContain("ALARM SOUND PAUSED");
    expect(dom.getByTestId("silence-count").textContent).toBe("1:45");
    expect(banner.textContent).toContain("Alarms still show on screen");
    dom.getByTestId("silence-resume").click();
    expect(resume).toHaveBeenCalled();
  });
});
