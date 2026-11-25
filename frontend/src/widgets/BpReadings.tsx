import type { BpReading } from "@/contracts/types.gen";
import { DEFAULT_FORMAT, fmtDate, fmtTime, useFormats, type DateTimeConfig } from "@/design/datetime";

const STALE_MIN = 30;

/** "09:12" and "24/11": the time and the date of a reading, as on a bedside monitor's NIBP list, in the screen's formats. */
export function readingWhen(iso: string, cfg: DateTimeConfig = DEFAULT_FORMAT): { time: string; date: string } {
  return { time: fmtTime(iso, cfg), date: fmtDate(iso, cfg, { short: true }) };
}

/** "2 h Ago", "40 min Ago": how old a reading is, so an old one is never read as current. */
export function readingAge(iso: string, nowIso: string): string | null {
  const mins = Math.round((Date.parse(nowIso) - Date.parse(iso)) / 60000);
  if (mins <= STALE_MIN) return null;
  const h = Math.floor(mins / 60);
  return h ? `${h} h${mins % 60 ? ` ${mins % 60} min` : ""} Ago` : `${mins} min Ago`;
}

/**
 * The last blood pressure readings, newest first, like the list on a bedside monitor: time, date,
 * systolic/diastolic and the mean in brackets. The newest line is larger. A reading older than half
 * an hour carries its age. No readings says so in words, never a dash.
 */
export function BpReadings({ readings, nowIso, limit = 5, variant = "list" }: { readings: readonly BpReading[]; nowIso: string; limit?: number; variant?: "list" | "tile" }) {
  const formats = useFormats();
  if (!readings.length) return <div className={`bp-readings bp-${variant}`} data-testid="bp-readings"><span className="bp-none">No Reading</span></div>;
  const shown = readings.slice(0, Math.max(1, limit));
  if (variant === "tile") {
    // Under the BP number: just the lines, time, date and pressure with the MAP; the newest says how old it is if it is not recent.
    const age = readingAge(shown[0]!.at, nowIso);
    return (
      <div className="bp-readings bp-tile" data-testid="bp-readings" data-count={shown.length} data-stale={age ? "true" : undefined}>
        <table>
          <tbody>
            {shown.map((r, i) => {
              const w = readingWhen(r.at, formats);
              return (
                <tr key={`${i}-${r.at}`} className={i === 0 ? "is-newest" : ""} data-testid={`bp-reading-${i}`}>
                  <td className="bp-time">{w.time}</td>
                  <td className="bp-date">{w.date}</td>
                  <td className="bp-value">{r.sys}/{r.dia}<span className="bp-map"> ({r.map})</span></td>
                  {i === 0 && age && <td className="bp-age" data-testid="bp-age">{age}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="bp-readings" data-testid="bp-readings" data-count={shown.length}>
      <div className="bp-head">Last {limit >= 5 ? 5 : shown.length} Reading{shown.length > 1 ? "s" : ""}{shown[0] && readingAge(shown[0].at, nowIso) && <span className="bp-age" data-testid="bp-age"> · Newest {readingAge(shown[0].at, nowIso)}</span>}</div>
      <table>
        <tbody>
          {shown.map((r, i) => {
            const w = readingWhen(r.at, formats);
            return (
              <tr key={`${i}-${r.at}`} className={i === 0 ? "is-newest" : ""} data-testid={`bp-reading-${i}`}>
                <td className="bp-time">{w.time}</td>
                <td className="bp-date">{w.date}</td>
                <td className="bp-value">{r.sys}/{r.dia}<span className="bp-map"> ({r.map})</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
