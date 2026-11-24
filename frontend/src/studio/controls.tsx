/** Small touch controls shared by the settings sheets. Every target is at least a touch target tall. */
export function Choice<T extends string>({ label, value, options, onChange, testId }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; testId: string;
}) {
  return (
    <div className="setting" data-testid={testId}>
      <span className="setting-label">{label}</span>
      <div className="choice" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}
                  className={`choice-opt${o.value === value ? " is-current" : ""}`} data-value={o.value}
                  onClick={() => onChange(o.value)}>{o.label}</button>
        ))}
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange, testId, hint }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; testId: string; hint?: string;
}) {
  return (
    <div className="setting">
      <label className="toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
        <span>{label}</span>
      </label>
      {hint && <small className="no-room">{hint}</small>}
    </div>
  );
}

/** A number changed in steps with two big buttons, so no keyboard is needed. */
export function Stepper({ label, value, step, min, max, format = (v) => String(v), onChange, testId }: {
  label: string; value: number; step: number; min: number; max: number; format?: (v: number) => string;
  onChange: (v: number) => void; testId: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number(v.toFixed(3))));
  return (
    <div className="setting" data-testid={testId}>
      <span className="setting-label">{label}</span>
      <div className="stepper">
        <button type="button" className="btn" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
        <output data-testid={`${testId}-value`}>{format(value)}</output>
        <button type="button" className="btn" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
      </div>
    </div>
  );
}

/** Tell the user, in the sheet itself, that edits are unsaved and where the Save button is. */
export function DraftNote({ dirty }: { dirty: boolean }) {
  return <p className="demo-note" data-testid="draft-note">{dirty
    ? "Changes show now and are not saved yet. Use Save in the bar at the top."
    : "Changes show now. Save them from the bar that appears at the top."}</p>;
}
