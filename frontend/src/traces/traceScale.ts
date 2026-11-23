/**
 * Geometry for the reference marks on a trace: the dashed baseline, the axis, the
 * calibration bar, the time bar. Pure functions, no DOM.
 *
 * The M2 canvas must draw samples with `waveTransform` from this file, so that the
 * 1 mV bar and the trace are always at the same scale by construction.
 *
 * Millimetres here are NOMINAL: a CSS millimetre is 96/25.4 px, which is not the
 * physical size on any particular screen. The bar is exactly 1 mV at the gain
 * drawn, so amplitude can be read from the screen; "mm/mV" is a label of that
 * gain, and says "nominal" until a screen has been calibrated.
 */

export const NOMINAL_PX_PER_MM = 96 / 25.4;

/** Gains the trace may fall back to when the preferred gain does not fit the row. */
export const FIT_GAINS = [20, 10, 5, 2.5] as const;

/** Closest two axis labels may be. */
export const MIN_LABEL_GAP_PX = 14;
/** Below this height a trace has room for the baseline only, not labels or bars. */
export const MIN_LABEL_HEIGHT_PX = 34;

const round = (v: number) => Number(v.toFixed(10));

/** Round-number ticks inside [min, max]: 0.5, 1, 2, 5, 10 times a power of ten. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const span = max - min;
  if (!(span > 0)) return [round(min)];
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;   // nearest of 1, 2, 5, 10
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) ticks.push(round(v));
  return ticks;
}

/** Drop ticks so no two labels are closer than `minGap` px, keeping zero when present. */
export function thinTicks(ticks: number[], pxPerUnit: number, minGap = MIN_LABEL_GAP_PX): number[] {
  if (ticks.length < 2) return ticks;
  const gap = Math.abs(ticks[1]! - ticks[0]!) * pxPerUnit;
  const every = Math.max(1, Math.ceil(minGap / gap));
  if (every === 1) return ticks;
  const anchor = Math.max(0, ticks.indexOf(0));
  return ticks.filter((_, i) => (i - anchor) % every === 0);
}

export const mmToPx = (mm: number, pxPerMm = NOMINAL_PX_PER_MM) => mm * pxPerMm;

export interface WaveScale {
  unit: string;
  calibrated: boolean;
  gains_mm_per_unit: number[];
  default_gain: number | null;
  tick: number;
  baseline: "isoelectric" | "mean";
  range: [number, number];
}

export interface WaveTransform {
  heightPx: number;
  range: [number, number];
  pxPerUnit: number;
  /** mm per unit actually drawn (calibrated traces only). */
  gainMmPerUnit: number | null;
  /** True when the preferred gain was too big for the row and a smaller one is drawn. */
  fitted: boolean;
  baselineY: number;
  /** Pixel y of a value; 0 is the top of the trace area. */
  y(value: number): number;
  /** Height of a bar exactly one unit tall (1 mV), or null if the scale is arbitrary. */
  unitBarPx: number | null;
}

/**
 * Vertical transform for a waveform in a trace area `heightPx` tall.
 *
 * Calibrated (ECG): px per mV = gain x px-per-mm, using the largest gain that is
 * not above `preferredGain` and still fits the visible range in the row; the
 * range is centred if there is room to spare. Arbitrary (pleth, respiration):
 * the range fills the height.
 */
export function waveTransform(args: {
  heightPx: number; scale: WaveScale; preferredGain?: number | null;
  pxPerMm?: number; padPx?: number;
}): WaveTransform {
  const { heightPx, scale, pxPerMm = NOMINAL_PX_PER_MM, padPx = 3 } = args;
  const [lo, hi] = scale.range;
  const avail = Math.max(1, heightPx - 2 * padPx);
  let pxPerUnit: number;
  let gain: number | null = null;
  let fitted = false;

  if (scale.calibrated) {
    const preferred = args.preferredGain ?? scale.default_gain ?? 10;
    const options = FIT_GAINS.filter((g) => g <= preferred);
    const pick = options.find((g) => (hi - lo) * g * pxPerMm <= avail) ?? FIT_GAINS[FIT_GAINS.length - 1]!;
    gain = pick;
    fitted = pick !== preferred;
    pxPerUnit = pick * pxPerMm;
  } else {
    pxPerUnit = avail / (hi - lo);
  }
  const spare = Math.max(0, avail - (hi - lo) * pxPerUnit);
  const baselineY = padPx + spare / 2 + hi * pxPerUnit;
  return {
    heightPx, range: [lo, hi], pxPerUnit, gainMmPerUnit: gain, fitted, baselineY,
    y: (v) => baselineY - v * pxPerUnit,
    unitBarPx: scale.calibrated ? pxPerUnit : null,
  };
}

/** Length of the one-second bar at a sweep speed in mm/s. */
export function secondBarPx(speedMmS: number, pxPerMm = NOMINAL_PX_PER_MM): number {
  return speedMmS * pxPerMm;
}

/** The label that states the gain and speed, honest about what it is. */
export function gainLabel(t: Pick<WaveTransform, "gainMmPerUnit" | "fitted">, speedMmS: number): string {
  const speed = `${speedMmS} mm/s`;
  return t.gainMmPerUnit == null ? speed + " nominal"
    : `${t.gainMmPerUnit} mm/mV${t.fitted ? " fitted" : ""} · ${speed} nominal`;
}

/** The range shown for a trend trace: the usual alarm span with a margin, inside the parameter's limits. */
export function trendRange(p: {
  default_low: number | null; default_high: number | null;
  min_value: number | null; max_value: number | null;
}): [number, number] {
  const floor = p.min_value ?? 0;
  const ceil = p.max_value ?? 100;
  const lo = p.default_low ?? floor;
  const hi = p.default_high ?? ceil;
  const pad = (hi - lo) * 0.2;
  return [Math.max(floor, lo - pad), Math.min(ceil, hi + pad)];
}

/** Linear y for a trend of `range` in `heightPx`. */
export function trendY(value: number, range: [number, number], heightPx: number, padPx = 3): number {
  const [lo, hi] = range;
  return padPx + (hi - value) / (hi - lo) * Math.max(1, heightPx - 2 * padPx);
}
