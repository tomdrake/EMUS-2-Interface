import type { IconId } from "@/design/types";

// Minimal stroke icons on a 24x24 grid. Each icon is a list of path strings; a
// string starting "F:" is filled instead of stroked. Add an id to the backend
// IconId list before adding one here.
const COG = "M10.08 5.06 L10.50 2.52 L13.50 2.52 L13.92 5.06 L15.55 5.73 L17.64 4.23 L19.77 6.36 L18.27 8.45 L18.94 10.08 L21.48 10.50 L21.48 13.50 L18.94 13.92 L18.27 15.55 L19.77 17.64 L17.64 19.77 L15.55 18.27 L13.92 18.94 L13.50 21.48 L10.50 21.48 L10.08 18.94 L8.45 18.27 L6.36 19.77 L4.23 17.64 L5.73 15.55 L5.06 13.92 L2.52 13.50 L2.52 10.50 L5.06 10.08 L5.73 8.45 L4.23 6.36 L6.36 4.23 L8.45 5.73 Z";

const PATHS: Record<Exclude<IconId, "none">, string[]> = {
  monitor: ["M3 5h18v11H3z", "M2 12h5l2-4 3 7 2-5 1 2h7", "M8 20h8"],
  chart: ["M4 4v16h16", "M7 15l3-5 3 3 4-7"],
  split: ["M3 4h18v16H3z", "M12 4v16"],
  labs: ["M9 3h6", "M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3", "M8 15h8"],
  imaging: ["M4 4h16v16H4z", "M9 7c-2 2-2 8 0 10", "M15 7c2 2 2 8 0 10", "M12 6v12"],
  // A brain: lobed outline, folds as circuit traces ending in nodes. The AI.
  ai: [
    "M12 4.2a3 3 0 0 0-5.1 1.4 2.8 2.8 0 0 0-2.5 4.1 3 3 0 0 0 .5 4.9 2.9 2.9 0 0 0 3 3.6 2.6 2.6 0 0 0 4.1 1.4 2.6 2.6 0 0 0 4.1-1.4 2.9 2.9 0 0 0 3-3.6 3 3 0 0 0 .5-4.9 2.8 2.8 0 0 0-2.5-4.1A3 3 0 0 0 12 4.2z",
    "M12 4.4v15",
    "M12 9.6c-1.8 0-3-.8-3.8-2", "M12 13.6c-1.8 0-3.2.8-4 2.2", "M12 11.2c1.8 0 3-.8 3.6-1.9", "M12 15.8c1.6 0 2.8.6 3.4 1.6",
    "F:M8.2 7.6a1.1 1.1 0 1 0 0 .01z", "F:M8 15.8a1.1 1.1 0 1 0 0 .01z", "F:M15.6 9.3a1.1 1.1 0 1 0 0 .01z", "F:M15.4 17.4a1.1 1.1 0 1 0 0 .01z",
  ],
  forecast: ["M3 17l5-5 3 3", "M11 15l2-2", "M15 11l2-2", "M19 7l2-2", "M17 5h4v4"],
  alarm: ["M6 16V11a6 6 0 0 1 12 0v5l2 2H4z", "M10 21h4"],
  bell: ["M6 16V11a6 6 0 0 1 12 0v5l2 2H4z", "M10 21h4"],
  "alarm-off": ["M6 16V11a6 6 0 0 1 9-5", "M18 11v5l2 2H8", "M10 21h4", "M3 3l18 18"],
  // A cog: toothed outline with a round hole.
  settings: [COG, "M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z"],
  patient: ["M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M4 21c0-4 4-6 8-6s8 2 8 6"],
  "new-patient": ["M10 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M2 21c0-4 4-6 8-6 1.5 0 3 .3 4.2.9", "M19 14v7", "M15.5 17.5h7"],
  discharge: ["M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M1.5 21c0-4 3.5-6 7.5-6 1 0 2 .1 2.9.4", "M14 18h8", "M19 15l3 3-3 3"],
  theme: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "F:M12 3a9 9 0 0 1 0 18z"],
  oxygen: ["M8 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M15 13h5", "M15 17h5", "M20 13c0 3-5 2-5 4"],
  timer: ["M12 7a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M12 10v4l3 2", "M9 3h6"],
  heart: ["M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"],
  lungs: ["M12 4v8", "M12 12c-2-1-4-5-5-5-2 0-4 6-4 10 0 2 3 2 5 1s4-2 4-6", "M12 12c2-1 4-5 5-5 2 0 4 6 4 10 0 2-3 2-5 1s-4-2-4-6"],
  // A blood pressure cuff on an arm, with a cycle arrow: take a reading again.
  "bp-cuff": [
    "M2.5 4.5h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z",
    "M5.2 4.5v8", "M8.2 4.5v8", "M1.5 8.5H.6", "M13.5 8.5H15",
    "M19.3 13.4A4.4 4.4 0 1 0 20.4 17.6", "M20.2 10.4v3.3h-3.3",
  ],
  drop: ["M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"],
  thermometer: ["M10 4a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z", "M12 9v7"],
  activity: ["M3 12h4l3-8 4 16 3-8h4"],
  sleep: ["M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"],
  fall: ["M5 5a2 2 0 1 0 0.01 0", "M7 9l5 3 5-2", "M12 12l-2 6", "M12 12l5 5", "M3 21h18"],
  palette: ["M12 3a9 9 0 1 0 0 18c1 0 2-1 2-2s-1-2 0-3 5 0 6-3a9 9 0 0 0-8-10z", "M8 10h.01", "M12 7h.01", "M16 10h.01"],
  layout: ["M3 4h18v16H3z", "M3 9h18", "M9 9v11"],
  chat: ["M4 5h16v11H9l-5 4z"],
  history: ["M4 12a8 8 0 1 0 2-5", "M4 4v4h4", "M12 8v4l3 2"],
  info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v6", "M12 7h.01"],
};

export function Icon({ id, size = 24 }: { id: IconId; size?: number }) {
  if (id === "none") return null;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={id === "ai" ? 1.4 : 1.8} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" data-icon={id}>
      {PATHS[id].map((d, i) => (d.startsWith("F:")
        ? <path key={i} d={d.slice(2)} fill="currentColor" stroke="none" />
        : <path key={i} d={d} />))}
    </svg>
  );
}
