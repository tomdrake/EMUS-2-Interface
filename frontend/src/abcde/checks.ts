/**
 * The bedside checks of Breathing (look, listen, feel) and Circulation (look and feel), recorded on the ABCDE screen with a
 * time like the other typed findings. Each is one touch. Abnormal answers raise the letter's status and bring a prompt in
 * plain words; none of it changes the NEWS2 score.
 */
export type CheckKey = "expansion" | "percussion" | "entry" | "sounds" | "wob" | "trachea" | "oedema" | "skin" | "pulse" | "jvp";
export interface Check { key: CheckKey; letter: "B" | "C"; how: "Look" | "Listen" | "Feel"; label: string; options: { v: string; label: string }[]; normal: string[] }

const o = (...pairs: [string, string][]) => pairs.map(([v, label]) => ({ v, label }));

export const CHECKS: Check[] = [
  { key: "expansion", letter: "B", how: "Look", label: "Chest Expansion", normal: ["equal"],
    options: o(["equal", "Equal"], ["left-less", "Left Less"], ["right-less", "Right Less"], ["reduced-both", "Reduced Both"]) },
  { key: "wob", letter: "B", how: "Look", label: "Work Of Breathing", normal: ["normal"],
    options: o(["normal", "Normal"], ["increased", "Increased"], ["accessory", "Accessory Muscles"]) },
  { key: "trachea", letter: "B", how: "Feel", label: "Trachea", normal: ["central"], options: o(["central", "Central"], ["deviated", "Deviated"]) },
  { key: "percussion", letter: "B", how: "Feel", label: "Percussion (Resonance)", normal: ["normal"],
    options: o(["normal", "Normal"], ["hyper", "Hyper-Resonant"], ["dull", "Dull"], ["stony", "Stony Dull"]) },
  { key: "entry", letter: "B", how: "Listen", label: "Air Entry", normal: ["equal"],
    options: o(["equal", "Equal"], ["reduced-left", "Reduced Left"], ["reduced-right", "Reduced Right"], ["reduced-both", "Reduced Both"], ["absent", "Absent"]) },
  { key: "sounds", letter: "B", how: "Listen", label: "Added Sounds", normal: ["clear"],
    options: o(["clear", "Clear"], ["wheeze", "Wheeze"], ["crackles", "Crackles"], ["bronchial", "Bronchial Breathing"]) },
  { key: "oedema", letter: "C", how: "Look", label: "Oedema", normal: ["none"],
    options: o(["none", "None"], ["peripheral", "Peripheral"], ["sacral", "Sacral"], ["generalised", "Generalised"]) },
  { key: "skin", letter: "C", how: "Look", label: "Skin", normal: ["warm-pink"],
    options: o(["warm-pink", "Warm And Pink"], ["cool", "Cool"], ["mottled", "Mottled"], ["pale-clammy", "Pale Or Clammy"]) },
  { key: "pulse", letter: "C", how: "Feel", label: "Pulse", normal: ["normal"],
    options: o(["normal", "Normal"], ["weak", "Weak"], ["bounding", "Bounding"], ["irregular", "Irregular"]) },
  { key: "jvp", letter: "C", how: "Look", label: "Neck Veins (JVP)", normal: ["normal"], options: o(["normal", "Normal"], ["raised", "Raised"]) },
];

export type Findings = Partial<Record<CheckKey, { value: string; at: string }>>;
export type Level = "OK" | "Check" | "Urgent";

export const labelOf = (key: CheckKey, v: string): string => CHECKS.find((c) => c.key === key)?.options.find((x) => x.v === v)?.label ?? v;

/** What the answers of one letter mean: the status they raise it to and the prompts, as sentences. `refill` is capillary refill. */
export function assess(letter: "B" | "C", f: Findings, refill?: string): { level: Level; prompts: string[] } {
  const v = (k: CheckKey) => f[k]?.value;
  const prompts: string[] = [];
  let level: Level = "OK";
  const raise = (l: Level) => { if (l === "Urgent" || (l === "Check" && level === "OK")) level = l; };
  for (const c of CHECKS.filter((x) => x.letter === letter)) { const x = v(c.key); if (x && !c.normal.includes(x)) raise("Check"); }
  if (letter === "B") {
    const unequal = v("expansion") === "left-less" || v("expansion") === "right-less";
    const reducedEntry = ["reduced-left", "reduced-right", "reduced-both"].includes(v("entry") ?? "");
    const dull = v("percussion") === "dull" || v("percussion") === "stony";
    if (unequal && v("percussion") === "hyper") { raise("Urgent"); prompts.push("Unequal expansion with hyper-resonance: think pneumothorax and call for help."); }
    else if (v("percussion") === "hyper") prompts.push("Hyper-resonance: consider pneumothorax or hyperinflation.");
    if (reducedEntry && dull) prompts.push("Reduced air entry with dullness: consider consolidation or effusion.");
    else if (v("percussion") === "stony") prompts.push("Stony dullness: consider a large effusion.");
    if (v("entry") === "absent") { raise("Urgent"); prompts.push("No air entry on one or both sides: call for help now."); }
    if (v("trachea") === "deviated") { raise("Urgent"); prompts.push("Deviated trachea: call for help and consider tension pneumothorax."); }
    if (v("sounds") === "wheeze") prompts.push("Wheeze: consider asthma, COPD or heart failure.");
    if (v("sounds") === "crackles") prompts.push("Crackles: consider fluid, infection or fibrosis.");
    if (v("wob") === "accessory") prompts.push("Accessory muscles in use: the patient is tiring; reassess often and call for help.");
  } else {
    const poorPerfusion = ["cool", "mottled", "pale-clammy"].includes(v("skin") ?? "") || refill === "over-2";
    if (v("skin") === "mottled") raise("Urgent");
    if (poorPerfusion && ((v("skin") && v("skin") !== "warm-pink") && refill === "over-2")) { raise("Urgent"); prompts.push("Cool, mottled or clammy skin with slow capillary refill: possible shock, call for help."); }
    else if (v("skin") === "mottled") prompts.push("Mottled skin: possible shock, call for help.");
    if (v("oedema") && v("oedema") !== "none" && v("jvp") === "raised") prompts.push("Oedema with raised neck veins: consider heart failure or fluid overload.");
    else if (v("oedema") && v("oedema") !== "none") prompts.push("Oedema: check for pitting, the weight and the fluid balance.");
    if (v("pulse") === "weak") prompts.push("Weak pulse: check the blood pressure and the cause.");
    if (v("pulse") === "irregular") prompts.push("Irregular pulse: check the ECG rhythm.");
  }
  return { level, prompts };
}
