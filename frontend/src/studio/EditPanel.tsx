import { useState } from "react";

import { useDesign, useUi } from "@/app/store";
import type { Row } from "@/design/types";
import { rowTitle } from "@/design/text";

import { useEditor } from "./editor";
import { HEIGHTS } from "@/layout/grid";
import { addModule, cellsOf, changeParameter, duplicateModule, gridsOn, move, patchRow, removeModule, setSize, unfit } from "./layoutEdit";

const COLOURS = ["#4ADE80", "#38BDF8", "#FACC15", "#F87171", "#FFFFFF", "#818CF8", "#FB923C", "#F472B6"];
const CONTENT: { key: keyof Row["content"]; label: string; needs: string }[] = [
  { key: "trace", label: "Trace", needs: "trace" },
  { key: "ai", label: "AI Interpretation", needs: "ai" },
  { key: "certainty", label: "Certainty", needs: "certainty" },
  { key: "explain", label: "Why Line", needs: "explain" },
  { key: "forecast", label: "Forecast", needs: "forecast" },
];

/** A size drawn as the cells it fills, so "double height" and "small square" can be chosen by sight. */
function SizeDiagram({ cols, rows, columns }: { cols: number; rows: number; columns: number }) {
  const unit = 6, gap = 1;
  const w = columns * unit, h = Math.max(rows, 2) * unit;
  return (
    <svg width={w + 2} height={h + 2} viewBox={`0 0 ${w + 2} ${h + 2}`} aria-hidden="true" className="size-diagram">
      {Array.from({ length: columns * Math.max(rows, 2) }, (_, i) => (
        <rect key={i} x={1 + (i % columns) * unit} y={1 + Math.floor(i / columns) * unit} width={unit - gap} height={unit - gap} className="cell" />
      ))}
      <rect x={1} y={1} width={cols * unit - gap} height={rows * unit - gap} className="fill" />
    </svg>
  );
}

/**
 * The side panel of Edit Layout. With a module selected: its size (as pictures), place, what it measures,
 * its name, colour and what it shows, with a note on anything its size has no room for. With none selected:
 * add a module. Everything goes through the editor, so it can be undone and is saved only on request.
 */
export function EditPanel() {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const screenId = useUi((s) => s.screenId) ?? design.home_screen;
  const selected = useEditor((s) => s.selected);
  const editor = useEditor.getState();
  const [addParam, setAddParam] = useState("temp");
  const [addSize, setAddSize] = useState("tile");

  const grid = gridsOn(design, screenId).find((g) => selected && g.items.some((i) => i.row_id === selected)) ?? gridsOn(design, screenId)[0];
  const row = selected ? design.rows.find((r) => r.id === selected) : undefined;
  const item = row && grid ? grid.items.find((i) => i.row_id === row.id) : undefined;
  const columns = grid?.columns ?? 6;
  const sizes = Object.entries(registry.module_sizes);

  if (!grid) {
    return <aside className="edit-panel" data-testid="edit-panel"><p className="demo-note">This screen has no monitor grid to edit. Go to a screen with one.</p></aside>;
  }

  if (!row || !item) {
    const params = Object.values(registry.parameters).filter((p) => !["news2", "timer", "fio2", "bp_dia", "bp_mean", "pulse", "acvpu"].includes(p.id));
    return (
      <aside className="edit-panel" data-testid="edit-panel">
        <h3>Tap a module to change it</h3>
        <p className="demo-note">Choose its size, place and what it shows. Changes show at once and are saved only when you press Save.</p>
        <h4>Add a module</h4>
        <label className="field">What to show
          <select value={addParam} onChange={(e) => setAddParam(e.target.value)} data-testid="add-parameter">
            {params.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <div className="size-grid" role="radiogroup" aria-label="Size of the new module">
          {sizes.map(([id, spec]) => (
            <button key={id} type="button" role="radio" aria-checked={addSize === id} className={`size-opt${addSize === id ? " is-current" : ""}`}
                    onClick={() => setAddSize(id)} data-testid={`add-size-${id}`}>
              <SizeDiagram {...cellsOf(spec, columns)} cols={cellsOf(spec, columns).w} rows={cellsOf(spec, columns).h} columns={columns} />
              <span>{spec.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary" data-testid="add-module" onClick={() => {
          let made: string | null = null;
          editor.apply((d) => { const r = addModule(d, screenId, addParam, addSize, registry); made = r.newId; return r.design; });
          if (made) editor.select(made);
        }}>Add Module</button>
      </aside>
    );
  }

  const spec = registry.module_sizes[item.size]!;
  const title = rowTitle(row, design, registry);
  const dropped = unfit(spec, row);
  const param = row.parameter ? registry.parameters[row.parameter] : undefined;
  const wave = param?.waveforms[0];
  const edit = (fn: (d: typeof design) => typeof design) => editor.apply(fn);
  const params = Object.values(registry.parameters).filter((p) => !["news2", "timer", "fio2", "bp_dia", "bp_mean", "pulse", "acvpu"].includes(p.id));

  return (
    <aside className="edit-panel" data-testid="edit-panel" data-selected={row.id}>
      <header className="panel-head">
        <h3 data-testid="panel-title">{title.name}{title.method && <small> - {title.method}</small>}</h3>
        <button type="button" className="btn" onClick={() => editor.select(null)} data-testid="panel-done">Done</button>
      </header>

      <h4>Size</h4>
      <div className="size-grid" role="radiogroup" aria-label="Size">
        {sizes.map(([id, s]) => {
          const c = cellsOf(s, columns);
          return (
            <button key={id} type="button" role="radio" aria-checked={item.size === id} className={`size-opt${item.size === id ? " is-current" : ""}`}
                    onClick={() => edit((d) => setSize(d, screenId, row.id, id))} data-testid={`size-${id}`}>
              <SizeDiagram cols={c.w} rows={c.h} columns={columns} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      <h4>Height</h4>
      <div className="height-opts" role="radiogroup" aria-label="Height" data-testid="height-options">
        {HEIGHTS.map((h) => (
          <button key={h.value} type="button" role="radio" aria-checked={row.height_scale === h.value}
                  className={`btn height-opt${row.height_scale === h.value ? " is-current" : ""}`} data-testid={`height-${h.value}`}
                  onClick={() => edit((d) => patchRow(d, row.id, { height_scale: h.value }))}>{h.label}</button>
        ))}
      </div>

      <h4>Place</h4>
      <div className="panel-buttons">
        <button type="button" className="btn" data-testid="move-earlier" onClick={() => edit((d) => move(d, screenId, row.id, -1))}>Earlier</button>
        <button type="button" className="btn" data-testid="move-later" onClick={() => edit((d) => move(d, screenId, row.id, 1))}>Later</button>
        <button type="button" className="btn" data-testid="duplicate-module" onClick={() => {
          let made: string | null = null;
          edit((d) => { const r = duplicateModule(d, screenId, row.id); made = r.newId; return r.design; });
          if (made) editor.select(made);
        }}>Duplicate</button>
        <button type="button" className="btn" data-testid="remove-module" onClick={() => { edit((d) => removeModule(d, screenId, row.id)); editor.select(null); }}>Remove</button>
      </div>

      <h4>What it shows</h4>
      <label className="field">Item
        <select value={row.parameter ?? ""} onChange={(e) => edit((d) => changeParameter(d, row.id, e.target.value, registry))} data-testid="row-parameter">
          {params.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="field">Name
        <input value={row.label ?? ""} maxLength={40} placeholder={param?.label} data-testid="row-label"
               onChange={(e) => edit((d) => patchRow(d, row.id, { label: e.target.value || null }))} />
      </label>
      <label className="field">Method of collection
        <input value={row.method ?? ""} maxLength={40} placeholder={param?.method} data-testid="row-method"
               onChange={(e) => edit((d) => patchRow(d, row.id, { method: e.target.value || null }))} />
      </label>
      <label className="field">Trace
        <select value={row.trace} data-testid="row-trace"
                onChange={(e) => edit((d) => patchRow(d, row.id, { trace: e.target.value as Row["trace"], waveform: e.target.value === "waveform" ? (wave as Row["waveform"]) : null }))}>
          {wave && <option value="waveform">Waveform</option>}
          <option value="trend">Trend</option>
          <option value="bar">Bar</option>
          <option value="events">Events</option>
          <option value="none">None</option>
        </select>
      </label>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        <button type="button" role="radio" aria-checked={!row.colour} className={`swatch swatch-default${!row.colour ? " is-current" : ""}`}
                onClick={() => edit((d) => patchRow(d, row.id, { colour: null }))} data-testid="colour-default">Default</button>
        {COLOURS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={row.colour?.toUpperCase() === c} aria-label={`Colour ${c}`}
                  className={`swatch${row.colour?.toUpperCase() === c ? " is-current" : ""}`} style={{ background: c }}
                  onClick={() => edit((d) => patchRow(d, row.id, { colour: c }))} data-testid={`colour-${c.slice(1)}`} />
        ))}
      </div>

      <h4>Content</h4>
      <ul className="content-list">
        {CONTENT.map((c) => {
          const noRoom = dropped.includes(c.key as never);
          return (
            <li key={c.key}>
              <label className="toggle">
                <input type="checkbox" checked={row.content[c.key]} data-testid={`content-${c.key}`}
                       onChange={(e) => edit((d) => patchRow(d, row.id, { content: { [c.key]: e.target.checked } }))} />
                <span>{c.label}</span>
              </label>
              {noRoom && <small className="no-room" data-testid={`noroom-${c.key}`}>Does not fit at this size</small>}
            </li>
          );
        })}
      </ul>
      <p className="demo-note">AI Interpretation off hides every AI mark on this module only.</p>
    </aside>
  );
}
