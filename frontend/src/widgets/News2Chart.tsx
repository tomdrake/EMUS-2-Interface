import { useState } from "react";

import type { Axis, Band } from "@/app/api";
import { pickCertainty } from "@/ai/certainty";
import { useDesign, useTheme, useUi } from "@/app/store";
import type { ExampleSnapshot } from "@/contracts/types.gen";
import { fmtDate, fmtTime, useFormats } from "@/design/datetime";
import { useSnapshot } from "@/examples/store";
import type { WidgetOf } from "@/design/types";
import { useSize } from "@/traces/useSize";

/** Black or white, whichever reads better on a colour: so a scored band is readable in any theme. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "inherit";
  const n = parseInt(m[1]!, 16);
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return l > 0.4 ? "#000000" : "#ffffff";
}

type ObsSet = ExampleSnapshot["obs_sets"][number];

/** Which printed row a value falls in. Rows for oxygen only apply on oxygen; the "on air" row only on air. */
export function bandIndex(bands: readonly Band[], key: string, value: unknown, onOxygen: boolean): number {
  if (value == null) return -1;
  if (key === "acvpu") return bands.findIndex((b) => b.level === String(value).trim().toUpperCase().slice(0, 1));
  if (key === "o2_flow") return Number(value) > 0 ? 1 : 0;
  const v = key === "temp" ? Math.round(Number(value) * 10) / 10 : Number(value);
  return bands.findIndex((b) => (b.oxygen === undefined || b.oxygen === onOxygen)
    && (b.low === null || v >= b.low) && (b.high === null || v <= b.high));
}

/** Height of a value on a continuous axis inside a block `top` to `top + height`; outside the axis it sits on the edge. */
export const axisY = (value: number, axis: Axis, top: number, height: number): number =>
  top + ((axis.max - Math.min(axis.max, Math.max(axis.min, value))) / (axis.max - axis.min)) * height;

/** The values a band covers on its axis, [upper, lower]: half a step beyond its printed limits, open ends to the axis edge. */
export function bandSpan(b: Band, axis: Axis): [number, number] {
  const half = axis.step / 2;
  return [b.high == null ? axis.max : b.high + half, b.low == null ? axis.min : b.low - half];
}

/** A tick on a side scale: whole numbers as they are, temperature to a tenth. */
export const tickText = (v: number, axis: Axis): string => (axis.step < 1 ? v.toFixed(1) : String(v));

export interface ChartGroup {
  key: string; letter: string; title: string; unit: string; note: string; bandKey: string; bands: readonly Band[];
  /** Shorter names for a narrow chart, longest first. */
  short: string[];
}

/** The groups of the chart, top to bottom, as the RCP chart prints them, for the SpO2 scale being shown. */
export function chartGroups(bands: Record<string, Band[]>, spo2Scale: number): ChartGroup[] {
  const g = (key: string, letter: string, title: string, unit: string, note = "", bandKey = key, short: string[] = [title]): ChartGroup =>
    ({ key, letter, title, unit, note, bandKey, short, bands: bands[bandKey] ?? [] });
  const two = spo2Scale === 2;
  return [
    g("rr", "A+B", "Respirations", "breaths/min"),
    g("spo2", two ? "" : "A+B", two ? "SpO2 Scale 2" : "SpO2 Scale 1", "Oxygen saturation %",
      two ? "Use Scale 2 if target range is 88-92 %, e.g. in hypercapnic respiratory failure" : "",
      two ? "spo2_2" : "spo2_1", [two ? "SpO2 Scale 2" : "SpO2 Scale 1", "SpO2"]),
    g("o2_flow", "", "Air Or Oxygen?", "", "", "o2_flow", ["Air Or Oxygen?", "Oxygen", "O2"]),
    g("bp_sys", "C", "Blood Pressure", "mmHg", "Score uses systolic BP only. Down arrow systolic, up arrow diastolic, X MAP", "bp_sys", ["Blood Pressure", "Sys BP"]),
    g("hr", "C", "Pulse", "beats/min"),
    g("acvpu", "D", "Consciousness", "", "Score for new onset of confusion (no score if chronic)", "acvpu", ["Consciousness", "ACVPU"]),
    g("temp", "E", "Temperature", "°C"),
  ];
}

export const frequencyText = (hours: number | null | undefined): string =>
  hours == null ? "" : hours === 0 ? "Cont." : hours < 1 ? `${Math.round(hours * 60)} min` : `${hours} h`;
const RISK_SHORT: Record<string, string> = { low: "Low", "low-medium": "Low Med", medium: "Medium", high: "High" };
const RISK_SCORE: Record<string, number> = { low: 0, "low-medium": 1, medium: 2, high: 3 };

/** The observation sets inside the chart's window, oldest first. */
export function visibleSets(sets: readonly ObsSet[], nowIso: string, hours: number): ObsSet[] {
  const from = Date.parse(nowIso) - hours * 3600_000;
  return sets.filter((s) => Date.parse(s.at) >= from);
}

const ROW_MIN = 9;          // px: the smallest a band row may be, so its label stays readable
const MIN_COL = 32;
const MIN_LABEL_ROW = 11;      // px: the shortest a labelled row may be, so neighbouring labels never touch
const MIN_AXIS_H = 46;         // px: the shortest a continuous axis may be, so its ticks never touch
const MIN_SCALE = 0.7;         // the most the drawing is shrunk to fit a short box

/** The longest of some names that fits a rotated label of this length, so a short block never clips its name. */
export const fitLabel = (options: readonly string[], px: number): string => options.find((o) => o.length * 6.2 <= px - 4) ?? options[options.length - 1]!;

/** Words broken into lines of about `chars` characters. */
export function wrapText(text: string, chars: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + word).length > chars) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/** Colour of each parameter's line and dots: the chart's own, brighter on a dark theme. */
const LINE: Record<string, [string, string]> = {
  rr: ["#2e8b3a", "#6fe083"], spo2: ["#7b3fe4", "#b994ff"], bp_sys: ["#2456c9", "#7aaeff"],
  hr: ["#3f88d4", "#8fc8ff"], acvpu: ["#b02ad1", "#e58bff"], temp: ["#d9301e", "#ff8a78"],
};

/**
 * The NEWS2 chart as printed by the Royal College of Physicians, filled in: every parameter is a block of
 * rows coloured by score (white, yellow, orange, red), one column per observation set. The patient's value
 * is a dot in the row it falls in, its number above it, dots joined by a line in the parameter's colour
 * (blood pressure is the systolic dot with a dotted tail down to the diastolic number). Then the total
 * coloured by risk, how often to monitor and the clinical risk. Predicted totals follow in dashed columns when
 * the design asks for them. The same chart in dark mode uses the dark theme's band colours.
 */
export function News2Chart({ widget }: { widget: WidgetOf<"news2-chart"> }) {
  const snapshot = useSnapshot();
  const theme = useTheme();
  const registry = useUi((s) => s.registry);
  const design = useDesign();
  const horizons = design?.forecast.horizons_min ?? [60, 120, 240, 360];
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const formats = useFormats();
  const [shown, setShown] = useState<1 | 2 | null>(null);
  if (!snapshot || !theme || !registry) {
    return <div className="news2-empty" data-testid="news2-empty">No observations to chart. Turn on example data in Demo Controls.</div>;
  }
  const patientScale = (snapshot.spo2_scale === 2 ? 2 : 1) as 1 | 2;
  const scale = shown ?? patientScale;
  const dark = theme.mode === "dark";
  const lineColour = (k: string) => (LINE[k] ?? LINE.hr!)[dark ? 1 : 0];
  const wide = w >= 720;
  const NAME_W = wide ? 116 : 22, LABEL_W = wide ? 56 : 54;
  const left = NAME_W + LABEL_W;

  const news = snapshot.forecast.forecasts.find((f) => f.parameter === "news2" && f.scenario === "baseline");
  // The forecast has a point every 30 minutes; the chart shows the columns the design chose.
  const futureAll = widget.show_future && news ? news.points.filter((p) => horizons.includes(p.horizon_min as never)) : [];
  const groups = chartGroups(registry.news2_bands, scale);
  const axesOf = registry.news2_axes ?? {};
  // Geometry. Rows share the height. If even the smallest readable rows do not fit, the whole drawing is scaled
  // down (to at most 70 %) so the bottom of the chart is always on screen, never scrolled off.
  const headH = 28, footRows = widget.show_escalation_rows ? 2 : 0, totalH = 28, footH = 17, gap = 3, toolH = 58;
  // A labelled row (oxygen, consciousness) is never shorter than a line of text, and a continuous axis never shorter
  // than room for its ticks, so a short box shrinks the drawing rather than crowding its labels.
  const blockHeight = (g: ChartGroup, rh: number) => (axesOf[g.bandKey] ? Math.max(g.bands.length * rh, MIN_AXIS_H) : g.bands.length * Math.max(rh, MIN_LABEL_ROW));
  const heightAt = (rh: number) => headH + groups.reduce((n, g) => n + blockHeight(g, rh) + gap, 0) + (widget.show_total_row ? totalH : 0) + footRows * footH + 4;
  const avail = Math.max(h, 0) - toolH - 20;
  let rowH = ROW_MIN;
  for (let lo = ROW_MIN, hi = 20, i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (heightAt(mid) <= avail) { rowH = mid; lo = mid; } else hi = mid; }
  rowH = Math.max(ROW_MIN, rowH);
  const k = h > 0 ? Math.min(1, Math.max(MIN_SCALE, avail / heightAt(rowH))) : 1;
  const realW = Math.max(w, 300) - 12;
  const vw = realW / k;          // the width in drawing units
  // As many columns as fit at a readable width: the newest sets, then the predictions.
  const fit = Math.max(3, Math.floor((vw - left - 6) / MIN_COL));
  // "predicted" columns: one for each forecast horizon the design chose, holding the observations the forecast predicts
  const predicted = widget.columns === "predicted";
  const nowMs = Date.parse(snapshot.generated_at);
  const minutesOf = (s: ObsSet) => Math.round((Date.parse(s.at) - nowMs) / 60000);
  const allSets = predicted ? (snapshot.predicted_obs_sets ?? []).filter((s) => horizons.includes(minutesOf(s) as never))
    : visibleSets(snapshot.obs_sets, snapshot.generated_at, widget.hours_visible);
  const future = predicted ? [] : futureAll.slice(0, Math.max(0, Math.min(futureAll.length, fit - Math.min(allSets.length, 3))));
  const sets = predicted ? allSets.slice(0, Math.max(1, fit)) : allSets.slice(-Math.max(1, fit - future.length));
  const confidenceOf = (s: ObsSet): string | null => {
    const c = pickCertainty(news?.points.find((p) => p.horizon_min === minutesOf(s))?.certainty ?? [], design?.forecast.certainty.metric ?? "prediction_interval");
    return c ? `${Math.round(Math.min(1, Math.max(0, c.score)) * 100)}%` : null;
  };
  const cols = sets.length + future.length;
  const band = theme.news_bands as unknown as Record<string, string>;
  const fill = (score: number) => band[`score_${Math.min(3, score)}`] ?? "transparent";

  // The columns share the whole width of the box, so the chart always fills it.
  const colW = cols ? Math.max(MIN_COL, (vw - left - 4) / cols) : 40;
  const width = left + cols * colW + 4;
  let y = headH;
  const blocks = groups.map((g) => { const top = y; y += blockHeight(g, rowH) + gap; return { g, top }; });
  const totalTop = y;
  const height = y + (widget.show_total_row ? totalH : 0) + footRows * footH + 4;
  const time = (iso: string) => fmtTime(iso, formats);
  const date = (iso: string) => fmtDate(iso, formats, { short: true });
  const range80 = (p: (typeof future)[number]) => p.intervals["80"] as unknown as [number, number];
  const colX = (i: number) => left + i * colW;
  const cx = (i: number) => colX(i) + colW / 2;
  const totalRisk = (s: ObsSet) => RISK_SCORE[s.news2_risk ?? "low"] ?? 0;
  const val = (s: ObsSet, k: string) => (s.values as Record<string, unknown>)[k];
  const onO2 = (s: ObsSet) => Number(s.values.o2_flow) > 0;
  const axes = registry.news2_axes ?? {};
  const lastOn = sets.length ? onO2(sets[sets.length - 1]!) : false;
  const svgW = Math.max(width, vw);

  return (
    <div className={`news2-chart news2-${widget.variant}`} data-testid="news2-chart" data-variant={widget.variant} data-spo2-scale={scale} ref={ref}>
      <div className="news2-toolbar">
        {wide && <h3 className="news2-title">NEWS2 Chart</h3>}
        <div className="news2-key" data-testid="news-key" aria-label="NEWS key: score of each colour">
          {wide && <span className="news2-key-label">NEWS Key</span>}
          {[0, 1, 2, 3].map((k) => <span key={k} className="news2-key-box" data-score={k} style={{ background: fill(k), color: readableOn(fill(k)) }}>{k}</span>)}
                  <span className="news2-key-label news2-key-map" data-testid="news-key-map">▼ Sys  ▲ Dia  X MAP</span>
        </div>
        <button type="button" className="btn news2-toggle" data-testid="news-toggle-scale" aria-pressed={scale === 2}
                onClick={() => setShown(scale === 1 ? 2 : 1)}>Toggle SpO2 Scale</button>
      </div>
      <svg className="news2-svg" width={svgW * k} height={height * k} viewBox={`0 0 ${svgW} ${height}`} data-scale={k.toFixed(3)} role="img" aria-label="NEWS2 observation chart">
        {/* the time each set was taken */}
        <text x={left - 4} y={12} textAnchor="end" className="n2-label">{predicted ? "Predicted" : "Date"}</text>
        <text x={left - 4} y={24} textAnchor="end" className="n2-label">{predicted ? "Clock" : "Time"}</text>
        {sets.map((s, i) => (
          <g key={s.at} data-testid={`news-col-${i}`} data-minutes={predicted ? minutesOf(s) : undefined} className="n2-headtext">
            <text x={cx(i)} y={12} textAnchor="middle" className="n2-date">{predicted ? `+${minutesOf(s) / 60} h` : date(s.at)}</text>
            <text x={cx(i)} y={24} textAnchor="middle" className="n2-time">{time(s.at)}</text>
          </g>
        ))}
        {future.map((p, i) => (
          <g key={p.horizon_min} className="n2-headtext">
            <text x={cx(sets.length + i)} y={12} textAnchor="middle" className="n2-date">Predicted</text>
            <text x={cx(sets.length + i)} y={24} textAnchor="middle" className="n2-time">+{p.horizon_min / 60} h</text>
          </g>
        ))}

        {blocks.map(({ g, top }) => {
          const bh = blockHeight(g, rowH);
          const rh = bh / g.bands.length;
          const rowMid = (t: number, r: number) => t + r * rh + rh / 2;
          const idx = sets.map((s) => (g.key === "o2_flow" ? -1 : bandIndex(g.bands, g.key, val(s, g.key), onO2(s))));
          const axis = axes[g.bandKey];
          const yAt = (v: number) => axisY(v, axis!, top, bh);
          const yOf = (v: number) => (axis ? yAt(v) : top);
          const dots = sets.map((s, i) => ({ s, i, r: idx[i]!, y: axis ? yAt(Number(val(s, g.key))) : rowMid(top, idx[i]!) })).filter((d) => d.r >= 0);
          const colour = lineColour(g.key);
          /** The band score at a value, or at the value under a label's height, for choosing readable text. */
          const scoreAt = (grp: ChartGroup, ax: Axis, value: number, s: ObsSet, atY?: number, t0 = top, h0 = bh): number => {
            const v = atY == null ? value : ax.max - ((atY - t0) / h0) * (ax.max - ax.min);
            const on = onO2(s);
            const hit = grp.bands.find((b) => (b.oxygen === undefined || b.oxygen === on) && bandSpan(b, ax)[0] >= v && v >= bandSpan(b, ax)[1]);
            return (hit ?? grp.bands[0]!).score;
          };
          const letterSize = Math.min(26, bh * 0.34);
          const showLetter = wide && !!g.letter && bh >= 60;
          let cursor = top + (showLetter ? letterSize + 8 : 11);
          const lines: { text: string; size: number; weight: number; cls?: string }[] = [];
          if (wide) {
            lines.push({ text: g.title, size: 11, weight: 700 });
            if (g.unit) lines.push({ text: g.unit, size: 9, weight: 500 });
            wrapText(g.note, 24).forEach((t) => lines.push({ text: t, size: 8.5, weight: 400 }));
            if (g.key === "spo2" && scale !== patientScale) wrapText(`Totals use Scale ${patientScale}`, 24).forEach((t) => lines.push({ text: t, size: 8.5, weight: 700, cls: "n2-warn" }));
            if (g.key === "spo2" && scale === 2) wrapText("Only use Scale 2 under the direction of a qualified clinician", 24).forEach((t) => lines.push({ text: t, size: 8.5, weight: 700, cls: "n2-warn" }));
          }
          // A note is whole or left out: never cut off mid-sentence.
          const room = top + bh - 2 - cursor;
          const need = (list: typeof lines) => list.reduce((n, l) => n + l.size + 2, 0);
          const noteLines = lines.filter((l) => l.size < 9 && !l.cls);
          if (need(lines) > room) noteLines.forEach((l) => lines.splice(lines.indexOf(l), 1));
          return (
            <g key={g.key} data-testid={`news-group-${g.key}`} data-letter={g.letter}>
              <rect x={0} y={top} width={NAME_W} height={bh} className="n2-name" style={{ fill: band.header }} />
              {wide ? (
                <>
                  {showLetter && <text x={6} y={top + letterSize + 2} className="n2-letter" style={{ fontSize: letterSize }} aria-hidden="true">{g.letter}</text>}
                  {lines.map((l, k) => {
                    cursor += l.size + 2;
                    if (cursor > top + bh - 2) return null;
                    return <text key={k} x={6} y={cursor - 2} className={`n2-nametext ${l.cls ?? ""}`} style={{ fontSize: l.size, fontWeight: l.weight, fill: l.cls ? undefined : band.header_text }}>{l.text}</text>;
                  })}
                </>
              ) : (
                <text transform={`translate(${NAME_W / 2 + 3.5} ${top + bh / 2}) rotate(-90)`} textAnchor="middle" className="n2-nametext"
                      style={{ fill: band.header_text }}>{fitLabel(g.short, bh)}</text>
              )}
              {axis ? (
                <>
                  {/* a continuous axis: the side scale has a few ticks, the bands are painted at their true widths */}
                  <rect x={NAME_W} y={top} width={LABEL_W} height={bh} className="n2-bandlabel" />
                  {axis.ticks.map((t) => (
                    <g key={t} data-testid={`news-tick-${g.key}-${t}`}>
                      <line x1={left - 4} x2={left} y1={yAt(t)} y2={yAt(t)} className="n2-tick" />
                      <text x={left - 7} y={Math.min(top + bh - 1, Math.max(top + 8, yAt(t) + 3.2))} textAnchor="end" className="n2-label">{tickText(t, axis)}</text>
                    </g>
                  ))}
                  {g.bands.map((b, r) => {
                    const [hi, lo] = bandSpan(b, axis);
                    const y0 = axisY(hi, axis, top, bh), y1 = axisY(lo, axis, top, bh);
                    // Scale 2 reads differently on air and on oxygen, so each column paints the bands that apply to it.
                    const applies = (on: boolean) => b.oxygen === undefined || b.oxygen === on;
                    return (
                      <g key={b.label} data-testid={`news-band-${g.key}-${r}`} data-score={b.score} data-from={y0.toFixed(1)} data-to={y1.toFixed(1)}>
                        {g.bandKey === "spo2_2" ? (
                          <>
                            {sets.map((s, i) => applies(onO2(s)) && <rect key={s.at} x={colX(i)} y={y0} width={colW} height={y1 - y0} style={{ fill: fill(b.score) }} className="n2-bandcont" />)}
                            {future.length > 0 && applies(lastOn) && <rect x={colX(sets.length)} y={y0} width={future.length * colW} height={y1 - y0} style={{ fill: fill(b.score) }} className="n2-bandcont" />}
                          </>
                        ) : (
                          <rect x={left} y={y0} width={cols * colW} height={y1 - y0} style={{ fill: fill(b.score) }} className="n2-bandcont" />
                        )}
                        {future.length > 0 && <rect x={colX(sets.length)} y={y0} width={future.length * colW} height={y1 - y0} className="n2-futureveil" />}
                      </g>
                    );
                  })}
                  {axis.ticks.map((t) => <line key={t} x1={left} x2={left + cols * colW} y1={yAt(t)} y2={yAt(t)} className="n2-tickline" />)}
                </>
              ) : (
                g.bands.map((b, r) => (
                  <g key={b.label} data-testid={`news-band-${g.key}-${r}`} data-score={b.score}>
                    <rect x={NAME_W} y={top + r * rh} width={LABEL_W} height={rh} className="n2-bandlabel" />
                    <text x={NAME_W + LABEL_W - 4} y={top + r * rh + rh / 2 + 3.2} textAnchor="end" className="n2-label">{b.label}</text>
                    <rect x={left} y={top + r * rh} width={cols * colW} height={rh} style={{ fill: fill(b.score) }} className="n2-bandrow" />
                    {future.length > 0 && <rect x={colX(sets.length)} y={top + r * rh} width={future.length * colW} height={rh} className="n2-futureveil" />}
                  </g>
                ))
              )}
              <rect x={NAME_W} y={top} width={LABEL_W + cols * colW} height={bh} className="n2-block" />

              {/* blood pressure: a dotted tail from the systolic dot to the diastolic number, and an X at the MAP */}
              {g.key === "bp_sys" && sets.map((s, i) => {
                const sys = Number(val(s, "bp_sys")), dia = Number(val(s, "bp_dia")), map = Number(val(s, "bp_mean"));
                if (!Number.isFinite(sys) || !Number.isFinite(dia)) return null;
                const y0 = yOf(sys), y1 = yOf(dia), ym = Number.isFinite(map) ? yOf(map) : null;
                return (
                  <g key={s.at} data-testid={`news-tail-${i}`} data-sys-y={y0.toFixed(1)} data-dia-y={y1.toFixed(1)}>
                    <line x1={cx(i)} x2={cx(i)} y1={y0} y2={Math.max(y0, y1)} className="n2-tail" style={{ stroke: colour }} />
                    <polygon className="n2-arrow" data-testid={`news-diamark-${i}`} style={{ fill: colour }}
                             points={`${cx(i) - 4.5},${y1 + 4} ${cx(i) + 4.5},${y1 + 4} ${cx(i)},${y1 - 3.5}`} />
                    <text x={cx(i)} y={Math.min(top + bh - 1.5, y1 + 13)} textAnchor="middle" className="n2-value n2-dia" data-testid={`news-dia-${i}`}
                          style={{ fill: readableOn(fill(scoreAt(g, axis, dia, s))) }}>{String(val(s, "bp_dia"))}</text>
                    {ym != null && (
                      <g data-testid={`news-map-${i}`} data-y={ym.toFixed(1)} data-value={map} className="n2-map" style={{ stroke: colour }}>
                        <line x1={cx(i) - 3.6} x2={cx(i) + 3.6} y1={ym - 3.6} y2={ym + 3.6} />
                        <line x1={cx(i) - 3.6} x2={cx(i) + 3.6} y1={ym + 3.6} y2={ym - 3.6} />
                      </g>
                    )}
                  </g>
                );
              })}

              {g.key === "bp_sys" ? (() => {
                /* the trend follows the MAP; dashed lines link the systolic and the diastolic trends */
                const pts = (pick: (s: ObsSet) => number) => sets.map((s, i) => (Number.isFinite(pick(s)) ? `${cx(i)},${yOf(pick(s))}` : null)).filter(Boolean);
                const map = pts((s) => Number(val(s, "bp_mean"))), sys = pts((s) => Number(val(s, "bp_sys"))), dia = pts((s) => Number(val(s, "bp_dia")));
                return (
                  <>
                    {sys.length > 1 && <polyline className="n2-line n2-dashed" data-testid="news-line-bp_sys-sys" style={{ stroke: colour }} points={sys.join(" ")} />}
                    {dia.length > 1 && <polyline className="n2-line n2-dashed" data-testid="news-line-bp_sys-dia" style={{ stroke: colour }} points={dia.join(" ")} />}
                    {map.length > 1 && <polyline className="n2-line" data-testid="news-line-bp_sys" style={{ stroke: colour }} points={map.join(" ")} />}
                  </>
                );
              })() : dots.length > 1 && (
                <polyline className="n2-line" data-testid={`news-line-${g.key}`} style={{ stroke: colour }}
                          points={dots.map((d) => `${cx(d.i)},${d.y}`).join(" ")} />
              )}
              {g.key === "o2_flow" && sets.map((s, i) => {
                const flow = Number(val(s, "o2_flow")) > 0;
                const t = (r: number, text: string | number | undefined) => (text === undefined || text === "" ? null : (
                  <text x={cx(i)} y={top + r * rh + rh / 2 + 3.2} textAnchor="middle" className="n2-value" style={{ fill: readableOn(fill(g.bands[r]!.score)) }}>{text}</text>));
                return (
                  <g key={s.at} data-testid={`news-cell-o2_flow-${i}`} data-score={flow ? 2 : 0} data-row={flow ? 1 : 0}>
                    {t(0, flow ? undefined : "A")}{t(1, flow ? String(val(s, "o2_flow")) : undefined)}{t(2, flow ? s.oxygen?.device : undefined)}
                  </g>
                );
              })}
              {g.key !== "o2_flow" && dots.map(({ s, i, r, y }) => {
                const score = g.bands[r]!.score;
                const above = y - top > 11;
                const v = val(s, g.key);
                const ly = above ? y - (g.key === "bp_sys" ? 7 : 5.5) : y + (g.key === "bp_sys" ? 13 : 12);
                return (
                  <g key={s.at} data-testid={`news-cell-${g.key}-${i}`} data-score={score} data-row={r} data-y={y.toFixed(1)}>
                    {g.key === "bp_sys"
                      ? <polygon className="n2-arrow" data-testid={`news-sysmark-${i}`} style={{ fill: colour }}
                                 points={`${cx(i) - 4.5},${y - 4} ${cx(i) + 4.5},${y - 4} ${cx(i)},${y + 3.5}`} />
                      : <circle cx={cx(i)} cy={y} r={3.3} className="n2-dot" style={{ fill: colour }} />}
                    <text x={cx(i)} y={ly} textAnchor="middle" className="n2-value"
                          style={{ fill: readableOn(fill(axis ? scoreAt(g, axis, Number(v), s, ly, top, bh) : g.bands[r]!.score)) }}>{String(v)}</text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* vertical grid between sets */}
        {blocks.map(({ g, top }) => Array.from({ length: cols + 1 }, (_, i) => (
          <line key={`${g.key}${i}`} x1={colX(i)} x2={colX(i)} y1={top} y2={top + blockHeight(g, rowH)} className={`n2-grid${predicted || i > sets.length ? " is-future" : ""}`} />)))}

        {widget.show_total_row && (
          <g data-testid="news-totals">
            <rect x={0} y={totalTop} width={left} height={totalH} style={{ fill: band.header }} />
            <text x={6} y={totalTop + totalH / 2 + 4} className="n2-label" style={{ fill: band.header_text }}>NEWS Total</text>
            {sets.map((s, i) => (
              <g key={s.at} data-testid={`news-total-${i}`} data-total={s.news2_total ?? ""} data-risk={s.news2_risk ?? ""} data-confidence={predicted ? confidenceOf(s) ?? "" : undefined}>
                <rect x={colX(i)} y={totalTop} width={colW} height={totalH} style={{ fill: fill(totalRisk(s)) }} className="n2-totalcell" />
                {predicted ? (
                  <>
                    <text x={cx(i)} y={totalTop + 12} textAnchor="middle" className="n2-totaltext n2-small" style={{ fill: readableOn(fill(totalRisk(s))) }}>{s.news2_total}</text>
                    {confidenceOf(s) && <text x={cx(i)} y={totalTop + 24} textAnchor="middle" className="n2-range" data-testid={`news-confidence-${i}`} style={{ fill: readableOn(fill(totalRisk(s))) }}>{confidenceOf(s)} Sure</text>}
                  </>
                ) : (
                  <text x={cx(i)} y={totalTop + totalH / 2 + 5} textAnchor="middle" className="n2-totaltext" style={{ fill: readableOn(fill(totalRisk(s))) }}>{s.news2_total}</text>
                )}
              </g>
            ))}
            {future.map((p, i) => {
              const [lo, hi] = range80(p);
              const sc = p.value >= 7 ? 3 : p.value >= 5 ? 2 : 0;
              return (
                <g key={p.horizon_min} data-testid={`news-future-${p.horizon_min}`} data-value={p.value}>
                  <rect x={colX(sets.length + i) + 1} y={totalTop} width={colW - 2} height={totalH} rx={3} className="n2-futurecell" style={{ fill: fill(sc) }} />
                  <text x={cx(sets.length + i)} y={totalTop + 12} textAnchor="middle" className="n2-totaltext n2-small" style={{ fill: readableOn(fill(sc)) }}>{Math.round(p.value)}</text>
                  <text x={cx(sets.length + i)} y={totalTop + 24} textAnchor="middle" className="n2-range" style={{ fill: readableOn(fill(sc)) }}>{Math.round(lo)}-{Math.round(hi)}</text>
                </g>
              );
            })}
          </g>
        )}
        {widget.show_escalation_rows && [[wide ? "Monitoring Frequency" : "Monitoring", (s: ObsSet) => frequencyText(s.monitoring_hours)], [wide ? "Clinical Risk" : "Risk", (s: ObsSet) => (s.news2_risk ? RISK_SHORT[s.news2_risk] ?? "" : "")]].map(([label, text], r) => {
          const top = totalTop + (widget.show_total_row ? totalH : 0) + r * footH;
          return (
            <g key={label as string} data-testid={r === 0 ? "news-frequency" : "news-risks"}>
              <rect x={0} y={top} width={left} height={footH} className="n2-footlabel" />
              <text x={left - 4} y={top + footH / 2 + 3.2} textAnchor="end" className="n2-label">{label as string}</text>
              <rect x={left} y={top} width={cols * colW} height={footH} className="n2-footcells" />
              {sets.map((s, i) => <text key={s.at} x={cx(i)} y={top + footH / 2 + 3.5} textAnchor="middle" className="n2-foot" data-testid={r === 1 ? `news-risk-${i}` : undefined}>{(text as (s: ObsSet) => string)(s)}</text>)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
