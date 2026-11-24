export type Pose = "upright" | "walking" | "supine" | "prone" | "left" | "right";

const WORDS: Record<Pose, string> = {
  upright: "Upright", walking: "Walking", supine: "Supine", prone: "Prone", left: "Left Side", right: "Right Side",
};
/** Plain words for what the position means, because most people do not know "supine". */
const MEANING: Record<Pose, string> = {
  upright: "Sitting Or Standing", walking: "Up And Moving", supine: "Lying On Back", prone: "Lying On Front",
  left: "Lying On Left Side", right: "Lying On Right Side",
};

/** The word for a position, in Title Case: "Left Side", never "left". */
export function poseWord(value: string | number | null | undefined): string {
  const p = String(value ?? "").toLowerCase() as Pose;
  return WORDS[p] ?? (value ? String(value).replace(/\b\w/g, (c) => c.toUpperCase()) : "");
}

export const poseMeaning = (value: string | number | null | undefined): string => MEANING[String(value ?? "").toLowerCase() as Pose] ?? "";

export function poseOf(value: string | number | null | undefined): Pose | null {
  const p = String(value ?? "").toLowerCase() as Pose;
  return p in WORDS ? p : null;
}

/** Breathing period in seconds for the chest-rise animation, from the respiratory rate; steady 4 s when unknown. */
export function breathPeriod(rr: number | null | undefined): number {
  return rr && rr > 0 ? Math.min(6, Math.max(1.5, 60 / rr)) : 4;
}

/** A limb or the trunk as an outlined band: a wide stroke in the figure's colour with a narrower one in the
 *  background over it, so the body reads as an outline with a lightly filled inside. */
function Band({ x1, y1, x2, y2, w, className }: { x1: number; y1: number; x2: number; y2: number; w: number; className?: string }) {
  return (
    <g className={className}>
      <line className="pf-outer" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w + 3} />
      <line className="pf-inner" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={w} />
    </g>
  );
}

const Head = ({ cx, cy }: { cx: number; cy: number }) => <circle className="pf-headline" cx={cx} cy={cy} r={7.5} />;

/**
 * A human outline in the patient's position, in the row's colour, so the position can be seen and not only read.
 * Lying positions rest on a bed and rise and fall with the breathing rate; a face marks which way the patient
 * faces and a dotted spine marks the back; a walking figure swings its limbs and an upright one sways a little.
 * All of it holds still with reduced motion. It always goes with the word and its plain meaning.
 */
export function PositionFigure({ pose, period = 4 }: { pose: Pose; period?: number }) {
  const lying = pose === "supine" || pose === "prone" || pose === "left" || pose === "right";
  return (
    <svg className={`position-figure pose-${pose}`} viewBox="0 0 120 72" role="img" aria-label={`Patient position: ${WORDS[pose]}, ${MEANING[pose]}`}
         data-testid="position-figure" data-pose={pose} style={{ ["--breath" as string]: `${period}s` }}>
      {lying && <><rect className="pf-bed" x="4" y="55" width="112" height="7" rx="3" /><rect className="pf-pillow" x="8" y="47" width="22" height="8" rx="4" /></>}
      {pose === "upright" && (
        <g className="pf-sway">
          <Band x1={60} y1={26} x2={60} y2={46} w={15} />
          <Band x1={60} y1={29} x2={48} y2={46} w={6} /><Band x1={60} y1={29} x2={72} y2={46} w={6} />
          <Band x1={55} y1={48} x2={52} y2={68} w={7} /><Band x1={65} y1={48} x2={68} y2={68} w={7} />
          <Head cx={60} cy={13} />
          <circle className="pf-eye" cx="57.5" cy="12" r="1" /><circle className="pf-eye" cx="62.5" cy="12" r="1" />
        </g>
      )}
      {pose === "walking" && (
        <g>
          <Band x1={60} y1={26} x2={60} y2={46} w={15} />
          <Band className="pf-arm pf-a1" x1={60} y1={29} x2={60} y2={46} w={6} /><Band className="pf-arm pf-a2" x1={60} y1={29} x2={60} y2={46} w={6} />
          <Band className="pf-leg pf-l1" x1={60} y1={48} x2={60} y2={68} w={7} /><Band className="pf-leg pf-l2" x1={60} y1={48} x2={60} y2={68} w={7} />
          <Head cx={60} cy={13} />
          <circle className="pf-eye" cx="62.5" cy="12" r="1" />
        </g>
      )}
      {pose === "supine" && (
        <g className="pf-breathe">
          <Band x1={36} y1={46} x2={72} y2={46} w={14} />
          <Band x1={38} y1={50} x2={62} y2={52} w={6} />
          <Band x1={72} y1={46} x2={106} y2={44} w={7} /><Band x1={72} y1={46} x2={106} y2={50} w={7} />
          <Head cx={22} cy={46} />
          <circle className="pf-eye" cx="19.5" cy="42.5" r="1" /><circle className="pf-eye" cx="24.5" cy="42.5" r="1" />
        </g>
      )}
      {pose === "prone" && (
        <g className="pf-breathe">
          <Band x1={36} y1={46} x2={72} y2={46} w={14} />
          <line className="pf-spine" x1="40" y1="42" x2="68" y2="42" />
          <Band x1={38} y1={46} x2={26} y2={36} w={6} />
          <Band x1={72} y1={46} x2={106} y2={46} w={7} /><Band x1={72} y1={46} x2={106} y2={51} w={7} />
          <Head cx={22} cy={47} />
          <path className="pf-hair" d="M16 44 Q22 38 28 44" />
        </g>
      )}
      {(pose === "left" || pose === "right") && (
        <g className="pf-breathe" transform={pose === "right" ? "translate(120 0) scale(-1 1)" : undefined}>
          <Band x1={36} y1={46} x2={70} y2={46} w={14} />
          <Band x1={40} y1={50} x2={54} y2={44} w={6} />
          <Band x1={70} y1={46} x2={88} y2={40} w={7} /><Band x1={88} y1={40} x2={76} y2={54} w={7} />
          <Band x1={70} y1={48} x2={92} y2={48} w={7} /><Band x1={92} y1={48} x2={82} y2={56} w={7} />
          <Head cx={22} cy={44} />
          <circle className="pf-eye" cx="19.5" cy="42.5" r="1" />
        </g>
      )}
    </svg>
  );
}

/**
 * A fall, drawn: a standing outline when there has been none, and a figure on the floor with a dashed path
 * from where they stood when there has. The words beside it say which.
 */
export function FallFigure({ fallen }: { fallen: boolean }) {
  return (
    <svg className={`position-figure fall-figure${fallen ? " is-fallen" : ""}`} viewBox="0 0 120 72" role="img"
         aria-label={fallen ? "A fall has been detected" : "No fall detected"} data-testid="fall-figure" data-fallen={fallen}>
      <line className="pf-bed" x1="4" y1="66" x2="116" y2="66" />
      {!fallen && (
        <g>
          <Band x1={60} y1={26} x2={60} y2={46} w={15} /><Band x1={60} y1={29} x2={48} y2={46} w={6} /><Band x1={60} y1={29} x2={72} y2={46} w={6} />
          <Band x1={55} y1={48} x2={52} y2={64} w={7} /><Band x1={65} y1={48} x2={68} y2={64} w={7} />
          <Head cx={60} cy={13} />
        </g>
      )}
      {fallen && (
        <g>
          <g className="pf-ghost"><Band x1={26} y1={26} x2={26} y2={44} w={10} /><Head cx={26} cy={14} /></g>
          <path className="pf-fallpath" d="M34 14 Q58 12 70 38" />
          <Band x1={58} y1={58} x2={92} y2={60} w={14} />
          <Band x1={92} y1={60} x2={112} y2={56} w={7} /><Band x1={92} y1={62} x2={112} y2={64} w={7} />
          <Band x1={62} y1={56} x2={72} y2={46} w={6} />
          <Head cx={48} cy={58} />
          <path className="pf-impact" d="M40 46 l4 5 M50 42 l1 6 M60 46 l-3 5" />
        </g>
      )}
    </svg>
  );
}
