import { useUi } from "@/app/store";
import type { TraceMark } from "@/contracts/types.gen";

import { type StripWindow, xAtSec } from "./Strip";

/**
 * What the AI saw on a trace and why, drawn as brackets and flags with short labels
 * over the part of the strip it refers to. Pure geometry here; the component below draws it.
 *
 * Marks are in seconds from the start of the strip. Marks outside the visible window are
 * dropped; those that straddle an edge are clipped to it. Overlapping marks go in separate
 * lanes so their labels never sit on top of each other.
 */
export interface PlacedMark {
  mark: TraceMark;
  x1: number;
  x2: number;
  lane: number;
}

export const LANE_PX = 15;

export function placeMarks(marks: readonly TraceMark[], w: StripWindow): PlacedMark[] {
  const placed: PlacedMark[] = [];
  const laneEnds: number[] = [];
  for (const mark of [...marks].sort((a, b) => a.start_s - b.start_s)) {
    const x1 = Math.max(w.x0, xAtSec(w, mark.start_s));
    const x2 = Math.min(w.x1, xAtSec(w, mark.kind === "flag" ? mark.start_s : mark.end_s));
    if (x2 < w.x0 || x1 > w.x1) continue;
    // The label needs room beside the bracket: about 6 px a character.
    const need = Math.max(x2, x1 + mark.label.length * 6 + 10);
    let lane = laneEnds.findIndex((end) => end <= x1 - 4);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = need;
    placed.push({ mark, x1, x2: Math.max(x2, x1 + 6), lane });
  }
  return placed;
}

/**
 * The marks on one strip. A finding's marks open its Why sheet when tapped; a bracket about
 * the trace itself ("Poor trace: movement") is a technical mark, not an AI one, and stays
 * visible when AI is turned off.
 */
export function AnnotationLayer({ marks, w, height, aiOn, rowId, interactive = true, kinds = "all" }: {
  marks: readonly TraceMark[]; w: StripWindow; height: number; aiOn: boolean; rowId: string;
  /** False where the marks are already inside the Why sheet: no tap target to open it again. */
  interactive?: boolean;
  /** 'technical' = only the marks about the trace itself; 'finding' = only what the AI used. */
  kinds?: "all" | "technical" | "finding";
}) {
  const shown = marks.filter((m) => (kinds === "all" || (kinds === "technical") === (m.tone === "technical")) && (m.tone === "technical" || aiOn));
  const boxes = shown.filter((m) => m.kind === "box");
  const placed = placeMarks(shown.filter((m) => m.kind !== "box"), w);
  if (!placed.length && !boxes.length) return null;
  return (
    <g className="trace-annotations" data-testid={`annotations-${rowId}`}>
      {boxes.map((m, i) => {
        const x1 = Math.max(w.x0, xAtSec(w, m.start_s)), x2 = Math.min(w.x1, xAtSec(w, m.end_s));
        if (x2 <= x1) return null;
        return (
          <g key={`box-${i}`} className="trace-box" data-testid={`box-${rowId}-${i}`} data-label={m.label} data-x1={x1.toFixed(1)} data-x2={x2.toFixed(1)}>
            <rect x={x1} y={2} width={x2 - x1} height={Math.max(0, height - 4)} rx={2} />
            {m.label && <text x={x1 + 2} y={11} className="trace-box-label" data-audit-ignore="scrolling">{m.label}</text>}
          </g>
        );
      })}
      {placed.map(({ mark, x1, x2, lane }, i) => {
        const y = 4 + lane * LANE_PX;
        const tech = mark.tone === "technical";
        const openWhy = () => mark.finding_id && useUi.getState().showSheet("finding-explain", mark.finding_id);
        return (
          <g key={`${mark.label}-${i}`} className={`trace-mark${tech ? " is-technical" : ""}`}
             data-testid={`mark-${rowId}-${i}`} data-label={mark.label} data-lane={lane}
             data-x1={x1.toFixed(1)} data-x2={x2.toFixed(1)}>
            {mark.kind === "bracket" ? (
              <path d={`M${x1} ${y + 8}V${y + 3}H${x2}V${y + 8}`} className="trace-bracket" />
            ) : (
              <path d={`M${x1} ${y + 2}V${y + 10}`} className="trace-bracket" />
            )}
            <text x={x1 + 3} y={y + 14} className="trace-mark-label">{mark.label}</text>
            {interactive && !tech && mark.finding_id && (
              <rect x={x1} y={0} width={Math.max(x2 - x1, 24)} height={Math.min(48, height)} fill="transparent"
                    className="trace-mark-hit" role="button" tabIndex={0} aria-label={`Why: ${mark.label}`}
                    onClick={(e) => { e.stopPropagation(); openWhy(); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openWhy(); }} />
            )}
          </g>
        );
      })}
    </g>
  );
}
