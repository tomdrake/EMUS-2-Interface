import type { Registry } from "@/app/api";

import type { Design, Row } from "./types";

// Words that stay lower case inside a title (but not at its start).
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "per"]);

/**
 * Title Case for names on screen: "respiratory rate" -> "Respiratory Rate".
 *
 * A word that already has a capital or a digit anywhere is left exactly as typed,
 * so SpO2, ECG, NEWS2, pH and mmHg survive. Use this for labels, buttons and
 * headings only. Sentences (advice, explanations, alarm messages) are prose and
 * must not be passed through it.
 */
export function titleCase(text: string): string {
  let first = true;
  return text.replace(/[^\s/()\-–]+/g, (word) => {
    const isFirst = first;
    first = false;
    if (/[A-Z0-9]/.test(word)) return word;
    if (!isFirst && SMALL.has(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

/** A label as the design wants it written. */
export function label(text: string, design: Pick<Design, "labels">): string {
  return design.labels.auto_capitalise ? titleCase(text) : text;
}

/**
 * How a row's observation is measured: the row's own wording if set, else the
 * waveform it draws ("ECG", "Pleth"), else the registry's default method.
 */
export function rowMethod(row: Row, registry: Pick<Registry, "parameters" | "waveforms">): string {
  if (row.method) return row.method;
  if (row.trace === "waveform" && row.waveform) return registry.waveforms[row.waveform]?.label ?? "";
  return row.parameter ? registry.parameters[row.parameter]?.method ?? "" : "";
}

/** "Heart Rate - ECG": what is observed and how it is collected. */
export function rowTitle(row: Row, design: Pick<Design, "labels">,
                         registry: Pick<Registry, "parameters" | "waveforms">): { name: string; method: string } {
  const name = row.label ?? (row.parameter ? registry.parameters[row.parameter]?.label : null) ?? "Timer";
  const method = design.labels.show_method ? rowMethod(row, registry) : "";
  return { name: label(name, design), method: method ? label(method, design) : "" };
}
