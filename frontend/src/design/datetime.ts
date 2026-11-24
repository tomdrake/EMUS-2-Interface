import { useDesign } from "@/app/store";

/**
 * How the screen writes dates and times. The design chooses (Settings, Appearance) and every date or time
 * on screen goes through here, so changing the setting changes them all together. Exports keep ISO.
 */
export type DateFormat = "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd" | "dd Mon yyyy";
export interface DateTimeConfig { date_format: DateFormat; clock_format: "24h" | "12h"; show_seconds: boolean }

export const DEFAULT_FORMAT: DateTimeConfig = { date_format: "dd/mm/yyyy", clock_format: "24h", show_seconds: true };
const EXAMPLE = new Date(2026, 10, 24);
/** The choices, each shown as 24 November 2026 would be written in it. */
export const DATE_FORMATS: { value: DateFormat; label: string }[] =
  (["dd/mm/yyyy", "mm/dd/yyyy", "yyyy-mm-dd", "dd Mon yyyy"] as DateFormat[]).map((value) => ({ value, label: "" }));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
const asDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));

/** "24/11/2026"; with `short` the year is left out where space is tight ("24/11"). */
export function fmtDate(v: string | Date, cfg: Pick<DateTimeConfig, "date_format"> = DEFAULT_FORMAT, opts: { short?: boolean } = {}): string {
  const d = asDate(v);
  const dd = p2(d.getDate()), mm = p2(d.getMonth() + 1), yyyy = String(d.getFullYear());
  switch (cfg.date_format) {
    case "mm/dd/yyyy": return opts.short ? `${mm}/${dd}` : `${mm}/${dd}/${yyyy}`;
    case "yyyy-mm-dd": return opts.short ? `${mm}-${dd}` : `${yyyy}-${mm}-${dd}`;
    case "dd Mon yyyy": return opts.short ? `${dd} ${MONTHS[d.getMonth()]}` : `${dd} ${MONTHS[d.getMonth()]} ${yyyy}`;
    default: return opts.short ? `${dd}/${mm}` : `${dd}/${mm}/${yyyy}`;
  }
}

/** "14:05" or "2:05 PM"; seconds when asked and the setting allows them. */
export function fmtTime(v: string | Date, cfg: Pick<DateTimeConfig, "clock_format" | "show_seconds"> = DEFAULT_FORMAT,
                        opts: { seconds?: boolean } = {}): string {
  const d = asDate(v);
  const secs = opts.seconds ?? false;
  const s = secs ? `:${p2(d.getSeconds())}` : "";
  if (cfg.clock_format === "12h") {
    const h = d.getHours() % 12 || 12;
    return `${h}:${p2(d.getMinutes())}${s} ${d.getHours() < 12 ? "AM" : "PM"}`;
  }
  return `${p2(d.getHours())}:${p2(d.getMinutes())}${s}`;
}

/** The date then the time: "24/11 14:05". */
export const fmtDateTime = (v: string | Date, cfg: DateTimeConfig = DEFAULT_FORMAT, opts: { short?: boolean; seconds?: boolean } = {}): string =>
  `${fmtDate(v, cfg, opts)} ${fmtTime(v, cfg, opts)}`;

for (const f of DATE_FORMATS) f.label = fmtDate(EXAMPLE, { date_format: f.value });

/** The formats in force on this screen. */
export function useFormats(): DateTimeConfig {
  const bar = useDesign()?.top_bar;
  return bar ? { date_format: (bar as { date_format?: DateFormat }).date_format ?? "dd/mm/yyyy", clock_format: bar.clock_format, show_seconds: bar.show_seconds } : DEFAULT_FORMAT;
}
