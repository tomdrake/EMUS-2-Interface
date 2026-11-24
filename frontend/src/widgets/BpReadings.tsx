import type { BpReading } from "@/contracts/types.gen";

const STALE_MIN = 30;

/** "09:12" and "24 Nov": the time and the date of a reading, as on a bedside monitor's NIBP list. */
export function readingWhen(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  };
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
export function BpReadings({ readings, nowIso, limit = 5 }: { readings: readonly BpReading[]; nowIso: string; limit?: number }) {
  if (!readings.length) return <div className="bp-readings" data-testid="bp-readings"><span className="bp-none">No Reading</span></div>;
  const shown = readings.slice(0, Math.max(1, limit));
  return (
    <div className="bp-readings" data-testid="bp-readings" data-count={shown.length}>
      <div className="bp-head">Last {limit >= 5 ? 5 : shown.length} Reading{shown.length > 1 ? "s" : ""}{shown[0] && readingAge(shown[0].at, nowIso) && <span className="bp-age" data-testid="bp-age"> · Newest {readingAge(shown[0].at, nowIso)}</span>}</div>
      <table>
        <tbody>
          {shown.map((r, i) => {
            const w = readingWhen(r.at);
            return (
              <tr key={r.at} className={i === 0 ? "is-newest" : ""} data-testid={`bp-reading-${i}`}>
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
