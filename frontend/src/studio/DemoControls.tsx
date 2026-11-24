import { titleCase } from "@/design/text";
import { useExample } from "@/examples/store";

/**
 * Example data controls: pick a scripted scenario, move through its time, or turn example
 * data off (which returns the screen to NO DATA and STANDBY, handy for showing those states).
 * All of it is simulated; nothing here changes the design or the patient record.
 */
export function DemoControls() {
  const { enabled, scenario, minute, scenarios, snapshot, status } = useExample();
  const info = scenarios.find((s) => s.id === scenario);
  const set = useExample.getState();
  const fmt = (m: number) => (m === 0 ? "Now" : m < 0 ? `${Math.abs(m)} min ago` : `In ${m} min`);
  return (
    <div className="demo" data-testid="demo-controls">
      <label className="demo-switch">
        <input type="checkbox" checked={enabled} data-testid="example-switch"
               onChange={(e) => set.setEnabled(e.target.checked)} />
        <span>Example data {enabled ? "on" : "off"}</span>
      </label>
      <p className="demo-note">Everything shown with example data is simulated: numbers, traces, findings and forecasts.
        Turn it off to see how the screen looks with no feed.</p>

      <h3 className="demo-h">Scenario</h3>
      <div className="demo-list" role="radiogroup" aria-label="Scenario">
        {scenarios.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={s.id === scenario} disabled={!enabled}
                  className={`demo-option${s.id === scenario ? " is-current" : ""}`} data-testid={`scenario-${s.id}`}
                  onClick={() => set.setScenario(s.id)}>
            <strong>{titleCase(s.title)}</strong>
            <span>{s.teaching_point}</span>
          </button>
        ))}
      </div>

      {info && (
        <>
          <h3 className="demo-h">Time In The Scenario: <span data-testid="minute-label">{fmt(Math.round(minute))}</span></h3>
          <input type="range" className="demo-slider" min={info.start_min} max={info.end_min} step={1}
                 value={Math.round(minute)} disabled={!enabled} data-testid="minute-slider"
                 aria-label="Minutes from now in the scenario"
                 onChange={(e) => set.setMinute(Number(e.target.value))} />
          <div className="demo-jumps">
            {info.highlights.map((h) => (
              <button key={`${h.minute}-${h.label}`} type="button" className="demo-jump" disabled={!enabled}
                      data-testid={`jump-${h.minute}`} onClick={() => set.setMinute(h.minute)}>
                {titleCase(h.label)}<small>{fmt(h.minute)}</small>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="demo-status" role="status">
        {!enabled ? "No example data: this screen has no feed."
          : status === "loading" ? "Loading…"
            : status === "error" ? "Could not load the example." : snapshot ? snapshot.title : ""}
      </p>
    </div>
  );
}
