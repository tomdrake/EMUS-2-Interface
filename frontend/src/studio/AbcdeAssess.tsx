import { useState } from "react";

import { useUi } from "@/app/store";
import { gcsTotal, useAbcde, type Gcs } from "@/abcde/store";

const AVPU = [
  { v: "A", label: "Alert" }, { v: "C", label: "Confusion" }, { v: "V", label: "Responds To Voice" },
  { v: "P", label: "Responds To Pain" }, { v: "U", label: "Unresponsive" },
] as const;
const EYE = [[4, "Spontaneous"], [3, "To Sound"], [2, "To Pressure"], [1, "None"]] as const;
const VERBAL = [[5, "Orientated"], [4, "Confused"], [3, "Words"], [2, "Sounds"], [1, "None"]] as const;
const MOTOR = [[6, "Obeys Commands"], [5, "Localising"], [4, "Normal Flexion"], [3, "Abnormal Flexion"], [2, "Extension"], [1, "None"]] as const;
export const EXPOSURE = ["Skin And Wounds", "Lines And Drains", "Rash", "Pressure Areas", "Temperature Checked"];

const close = () => useUi.getState().showSheet(null);

function Scale({ title, options, value, onPick, testId }: { title: string; options: readonly (readonly [number, string])[]; value: number; onPick: (n: number) => void; testId: string }) {
  return (
    <div className="setting" data-testid={testId}>
      <span className="setting-label">{title}</span>
      <div className="choice" role="radiogroup" aria-label={title}>
        {options.map(([n, label]) => (
          <button key={n} type="button" role="radio" aria-checked={n === value} className={`choice-opt${n === value ? " is-current" : ""}`}
                  data-value={n} onClick={() => onPick(n)}>{n} {label}</button>
        ))}
      </div>
    </div>
  );
}

/** AVPU in one tap, the Glasgow Coma Scale as a calculator, and the exposure checklist. Recorded on this screen only. */
export function AbcdeAssess() {
  const what = useUi((s) => s.sheetContext);
  const m = useAbcde();
  const [gcs, setGcs] = useState<Gcs>(m.gcs?.value ?? { e: 4, v: 5, m: 6 });
  const [done, setDone] = useState<string[]>(m.exposure?.value ?? []);

  if (what === "avpu") {
    return (
      <div className="settings" data-testid="assess-avpu">
        <p className="demo-note">One tap records the level of consciousness and closes this.</p>
        <div className="choice choice-col">
          {AVPU.map((a) => (
            <button key={a.v} type="button" className="choice-opt" data-testid={`avpu-${a.v}`} onClick={() => { m.setAvpu(a.v); close(); }}>
              <b>{a.v}</b> {a.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (what === "gcs") {
    return (
      <div className="settings" data-testid="assess-gcs">
        <Scale testId="gcs-e" title="Eyes" options={EYE} value={gcs.e} onPick={(e) => setGcs({ ...gcs, e })} />
        <Scale testId="gcs-v" title="Verbal" options={VERBAL} value={gcs.v} onPick={(v) => setGcs({ ...gcs, v })} />
        <Scale testId="gcs-m" title="Motor" options={MOTOR} value={gcs.m} onPick={(mm) => setGcs({ ...gcs, m: mm })} />
        <p className="gcs-total" data-testid="gcs-total">GCS {gcsTotal(gcs)} <small>(E{gcs.e} V{gcs.v} M{gcs.m})</small></p>
        <button type="button" className="btn btn-primary" data-testid="gcs-save" onClick={() => { m.setGcs(gcs); close(); }}>Record GCS</button>
      </div>
    );
  }
  return (
    <div className="settings" data-testid="assess-exposure">
      <p className="demo-note">Expose the patient and examine them. Tick each part you examined.</p>
      <div className="content-list">
        {EXPOSURE.map((x) => (
          <label key={x} className="toggle">
            <input type="checkbox" checked={done.includes(x)} data-testid={`exposure-${x.replace(/\s+/g, "-").toLowerCase()}`}
                   onChange={(e) => setDone(e.target.checked ? [...done, x] : done.filter((y) => y !== x))} />
            <span>{x}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary" data-testid="exposure-save" onClick={() => { m.setExposure(done); close(); }}>Record Exposure Check</button>
    </div>
  );
}
