import { useState } from "react";

import { useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { fmtTime, useFormats } from "@/design/datetime";
import type { WidgetOf } from "@/design/types";
import { useSnapshot } from "@/examples/store";
import { gcsTotal, isOverdue, useAbcde, type Airway } from "@/abcde/store";
import { flagWord, inWindow, latestSets, recency, takenAt, type BloodSet } from "@/abcde/recency";

import { BpReadings } from "./BpReadings";

export type Status = "OK" | "Check" | "Urgent";
const GLYPH: Record<Status, string> = { OK: "✓", Check: "!", Urgent: "!!" };

/** The worst NEWS2 component among some keys, as a status: 3 is Urgent, 1 or 2 is Check, 0 is OK. */
export function statusFrom(components: Record<string, number>, keys: string[]): Status {
  const worst = Math.max(0, ...keys.map((k) => components[k] ?? 0));
  return worst >= 3 ? "Urgent" : worst >= 1 ? "Check" : "OK";
}
const worse = (a: Status, b: Status): Status => (a === "Urgent" || b === "Urgent" ? "Urgent" : a === "Check" || b === "Check" ? "Check" : "OK");

function Section({ letter, title, status, children, testId }: { letter: string; title: string; status: Status | "Not Assessed"; children: React.ReactNode; testId: string }) {
  return (
    <section className="abcde-sec" data-testid={testId} data-letter={letter} data-status={status}>
      <header>
        <h3><span className="abcde-letter" aria-hidden="true">{letter}</span> {title}</h3>
        <span className="abcde-status" data-testid={`${testId}-status`}>
          {status !== "Not Assessed" && <b aria-hidden="true">{GLYPH[status]}</b>} {status}
        </span>
      </header>
      {children}
    </section>
  );
}

const Row = ({ k, v, testId }: { k: string; v: React.ReactNode; testId?: string }) => (
  <div className="abcde-row"><dt>{k}</dt><dd data-testid={testId}>{v}</dd></div>
);

function Choices<T extends string>({ value, options, onPick, testId }: { value: T | undefined; options: { v: T; label: string }[]; onPick: (v: T) => void; testId: string }) {
  return (
    <div className="choice" role="radiogroup" data-testid={testId}>
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} className={`choice-opt${o.v === value ? " is-current" : ""}`}
                data-value={o.v} onClick={() => onPick(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}


function Bloods({ snapshot }: { snapshot: ExampleSnapshot }) {
  const registry = useUi((s) => s.registry)!;
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const sets = latestSets(snapshot.labs, (t) => registry.lab_tests[t]?.group ?? "");
  return (
    <section className="abcde-sec abcde-bloods" data-testid="abcde-bloods" aria-label="Latest bloods">
      <header><h3>Latest Blood Results</h3></header>
      {sets.map((set) => <BloodSetView key={set.key} set={set} nowIso={snapshot.generated_at} shown={!!revealed[set.key]}
                                       onReveal={() => setRevealed((r) => ({ ...r, [set.key]: true }))} />)}
    </section>
  );
}

function BloodSetView({ set, nowIso, shown, onReveal }: { set: BloodSet; nowIso: string; shown: boolean; onReveal: () => void }) {
  const formats = useFormats();
  const registry = useUi((s) => s.registry)!;
  const r = set.taken ? recency(set.taken, nowIso) : null;
  const recent = r && r.kind !== "none";
  const reveal = shown && set.taken && inWindow(r!);
  return (
    <div className="blood-set" data-testid={`blood-${set.key}`} data-recency={r?.kind ?? "none"}>
      <div className="blood-head">
        <strong>{set.title}</strong>
        {set.taken && (recent || reveal) && <span className="blood-when" data-testid={`blood-${set.key}-when`}>{takenAt(set.taken, formats)}</span>}
        <span className="blood-recency" data-testid={`blood-${set.key}-recency`}>{recent ? r!.label : "No Recent Bloods"}</span>
      </div>
      {(recent || reveal) && (
        <ul className="blood-results">
          {set.results.map((l) => {
            const t = registry.lab_tests[l.test];
            const flag = flagWord(l.flag);
            return (
              <li key={l.test} data-testid={`blood-${set.key}-${l.test}`} data-flag={l.flag}>
                <span>{t?.label ?? l.test}</span>
                <b>{l.value}<small> {l.unit}</small></b>
                {flag && <em className="blood-flag"><span aria-hidden="true">{l.flag.startsWith("critical") ? "!!" : "!"}</span> {flag}</em>}
              </li>
            );
          })}
        </ul>
      )}
      {!recent && !reveal && (
        set.taken && inWindow(r!)
          ? <button type="button" className="btn" data-testid={`blood-${set.key}-show`} onClick={onReveal}>Show Most Recent (Within 72 Hours)</button>
          : <p className="why-note" data-testid={`blood-${set.key}-none`}>None in the last 72 hours.</p>
      )}
    </div>
  );
}

/**
 * Airway, Breathing, Circulation, Disability, Exposure: each checked from the monitor's own data and a few
 * prompts, with a status word on each, then the most recent blood gas, bloods and glucose with when they were
 * taken. Anything typed here (airway, capillary refill, AVPU or GCS, exposure) stays on this screen and does not
 * feed the NEWS2 score.
 */
export function Abcde({ widget }: { widget: WidgetOf<"abcde"> }) {
  const snapshot = useSnapshot();
  const formats = useFormats();
  const at = (iso: string) => fmtTime(iso, formats);
  const registry = useUi((s) => s.registry);
  const m = useAbcde();
  if (!snapshot || !registry) {
    return <div className="abcde" data-testid="abcde"><p className="why-empty">No observations to check. Turn on example data in Demo Controls.</p></div>;
  }
  const n = snapshot.numerics as Record<string, number | string | null>;
  const comps = snapshot.news2.components;
  const q = (wave: string) => snapshot.quality.find((x) => x.waveform === wave);
  const sig = (p: string) => snapshot.signals[p as keyof typeof snapshot.signals];
  const device = registry.o2_devices[snapshot.oxygen.device] ?? snapshot.oxygen.device;
  const quality = (wave: string) => { const x = q(wave); return x ? (x.grade === "good" ? "Good" : x.label || "Poor") : "No Signal"; };
  const bpLatest = snapshot.bp_readings[0];

  const airway: Status | "Not Assessed" = !m.airway || m.airway.value === "not-assessed" ? "Not Assessed" : m.airway.value === "patent" ? "OK" : "Urgent";
  const b = worse(statusFrom(comps, ["rr", "spo2", "o2_flow"]), q("pleth")?.grade === "unusable" ? "Check" : "OK");
  const c = worse(statusFrom(comps, ["bp_sys", "hr"]), m.refill?.value === "over-2" ? "Check" : snapshot.bp_readings.length ? "OK" : "Check");
  const manualA = m.avpu?.value;
  const d: Status = worse(statusFrom(comps, ["acvpu"]), manualA && manualA !== "A" ? "Urgent" : isOverdue(m.avpu) && isOverdue(m.gcs) ? "Check" : "OK");
  const e: Status = worse(statusFrom(comps, ["temp"]), isOverdue(m.exposure) ? "Check" : "OK");
  const open = (ctx: string) => useUi.getState().showSheet("abcde-assess", ctx);

  return (
    <div className="abcde" data-testid="abcde">
      <div className="abcde-top">
        <h2 className="abcde-title">ABCDE Assessment</h2>
        {widget.show_trends_button && (
          <button type="button" className="btn" data-testid="abcde-trends" onClick={() => useUi.getState().showSheet("trends")}>Trends</button>
        )}
      </div>
      <p className="why-note" data-testid="abcde-note">Airway, capillary refill, AVPU, GCS and exposure are recorded on this screen only and do not change the NEWS2 score.</p>

      <Section letter="A" title="Airway" status={airway} testId="abcde-a">
        <Choices<Airway> testId="airway-choice" value={m.airway?.value}
                         options={[{ v: "patent", label: "Patent" }, { v: "not-patent", label: "Not Patent" }, { v: "not-assessed", label: "Not Assessed" }]}
                         onPick={(v) => m.setAirway(v)} />
        {m.airway && <p className="why-note">Recorded {at(m.airway.at)}</p>}
        {m.airway?.value === "not-patent" && <p className="abcde-prompt" data-testid="airway-prompt">Call for help. Open the airway and give oxygen while help comes.</p>}
      </Section>

      <Section letter="B" title="Breathing" status={b} testId="abcde-b">
        <dl>
          <Row k="Respiratory Rate" v={`${n.rr ?? "-"} /min`} testId="b-rr" />
          <Row k="SpO2" v={`${n.spo2 ?? "-"} %`} testId="b-spo2" />
          <Row k="Oxygen" v={snapshot.oxygen.flow_l_min > 0 ? `${snapshot.oxygen.flow_l_min} L/min, ${device}` : "Air"} testId="b-oxygen" />
          <Row k="Pleth" v={quality("pleth")} testId="b-pleth" />
          <Row k="Impedance (Chest Sensor)" v={quality("resp")} testId="b-impedance" />
        </dl>
      </Section>

      <Section letter="C" title="Circulation" status={c} testId="abcde-c">
        <dl>
          <Row k="Heart Rate" v={`${n.hr ?? "-"} /min${snapshot.findings.find((f) => f.parameter === "hr" && f.status === "active" && f.domain === "rhythm") ? `, ${snapshot.findings.find((f) => f.parameter === "hr" && f.status === "active" && f.domain === "rhythm")!.label}` : ""}`} testId="c-hr" />
          <Row k="Skin Temperature" v={`${n.temp ?? "-"} °C`} testId="c-temp" />
          <Row k="Perfusion" v={q("pleth")?.issue === "low-perfusion" ? "Reduced" : q("pleth") ? (q("pleth")!.grade === "good" ? "Good" : "Poor Signal") : "No Signal"} testId="c-perfusion" />
        </dl>
        <BpReadings readings={snapshot.bp_readings} nowIso={snapshot.generated_at} />
        {bpLatest == null && sig("bp_sys")?.state === "standby" && <p className="why-note">The cuff is not connected.</p>}
        <div className="abcde-inline"><span>Capillary Refill</span>
          <Choices testId="refill-choice" value={m.refill?.value} options={[{ v: "under-2", label: "Under 2 s" }, { v: "over-2", label: "Over 2 s" }]} onPick={(v) => m.setRefill(v)} />
        </div>
      </Section>

      <Section letter="D" title="Disability" status={d} testId="abcde-d">
        <dl>
          <Row k="AVPU" v={m.avpu ? `${m.avpu.value}, recorded ${at(m.avpu.at)}` : `${n.acvpu ?? "-"}, from the chart`} testId="d-avpu" />
          {m.gcs && <Row k="GCS" v={`${gcsTotal(m.gcs.value)} (E${m.gcs.value.e} V${m.gcs.value.v} M${m.gcs.value.m}), recorded ${at(m.gcs.at)}`} testId="d-gcs" />}
          <Row k="Glucose" v={(() => { const g = snapshot.labs.find((l) => l.test === "glucose"); return g ? `${g.value} mmol/L, ${takenAt(g.collected_at, formats)}` : "No Recent Result"; })()} testId="d-glucose" />
        </dl>
        {isOverdue(m.avpu) && isOverdue(m.gcs) && <p className="abcde-prompt" data-testid="d-prompt">Assess consciousness: nothing recorded in the last hour.</p>}
        <div className="panel-buttons">
          <button type="button" className="btn" data-testid="d-avpu-btn" onClick={() => open("avpu")}>AVPU</button>
          <button type="button" className="btn" data-testid="d-gcs-btn" onClick={() => open("gcs")}>GCS Calculator</button>
        </div>
      </Section>

      <Section letter="E" title="Exposure" status={e} testId="abcde-e">
        <dl>
          <Row k="Temperature" v={`${snapshot.temp_readings[0]?.value ?? n.temp ?? "-"} °C${snapshot.temp_readings[0] ? ` (measured ${at(snapshot.temp_readings[0].at)})` : ""}`} testId="e-temp" />
          <Row k="Exposure Check" v={m.exposure ? `${m.exposure.value.length ? `Checked: ${m.exposure.value.join(", ")}` : "Nothing Ticked"}, recorded ${at(m.exposure.at)}` : "Not recorded"} testId="e-exposure" />
        </dl>
        {isOverdue(m.exposure) && <p className="abcde-prompt" data-testid="e-prompt">Expose and examine the patient: skin, wounds, lines and drains.</p>}
        <button type="button" className="btn" data-testid="e-btn" onClick={() => open("exposure")}>Exposure Check</button>
      </Section>

      {widget.show_bloods && <Bloods snapshot={snapshot} />}
    </div>
  );
}
