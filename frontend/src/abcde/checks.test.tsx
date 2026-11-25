import { fireEvent, render, screen as dom } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUi } from "@/app/store";
import { AbcdeAssess } from "@/studio/AbcdeAssess";

import { CHECKS, assess, labelOf, type Findings } from "./checks";
import { useAbcde } from "./store";

const at = "2026-11-24T12:00:00Z";
const f = (o: Record<string, string>): Findings => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, at }])) as Findings;

describe("look, listen and feel (breathing)", () => {
  it("offers the checks a clinician makes: expansion, resonance (including hyper-resonant) and air entry", () => {
    const b = CHECKS.filter((c) => c.letter === "B");
    expect(b.map((c) => c.key)).toEqual(expect.arrayContaining(["expansion", "percussion", "entry", "sounds", "wob", "trachea"]));
    expect(CHECKS.find((c) => c.key === "percussion")!.options.map((o) => o.label)).toContain("Hyper-Resonant");
    expect(CHECKS.find((c) => c.key === "entry")!.options.map((o) => o.label)).toEqual(["Equal", "Reduced Left", "Reduced Right", "Reduced Both", "Absent"]);
  });
  it("is OK when everything is normal and Check for any abnormal answer", () => {
    expect(assess("B", f({ expansion: "equal", percussion: "normal", entry: "equal" })).level).toBe("OK");
    expect(assess("B", f({ sounds: "wheeze" })).level).toBe("Check");
    expect(assess("B", f({ wob: "increased" })).level).toBe("Check");
  });
  it("is Urgent for tension signs, no air entry or a deviated trachea, with a prompt", () => {
    const tension = assess("B", f({ expansion: "left-less", percussion: "hyper" }));
    expect(tension.level).toBe("Urgent");
    expect(tension.prompts.join(" ")).toMatch(/pneumothorax/);
    expect(assess("B", f({ entry: "absent" })).level).toBe("Urgent");
    expect(assess("B", f({ trachea: "deviated" })).level).toBe("Urgent");
  });
  it("suggests consolidation or effusion for reduced air entry with dullness", () => {
    expect(assess("B", f({ entry: "reduced-right", percussion: "dull" })).prompts.join(" ")).toMatch(/consolidation or effusion/);
  });
});

describe("look and feel (circulation)", () => {
  it("checks oedema, skin, pulse and neck veins", () => {
    expect(CHECKS.filter((c) => c.letter === "C").map((c) => c.key)).toEqual(["oedema", "skin", "pulse", "jvp"]);
  });
  it("prompts for oedema, with raised neck veins pointing to heart failure or overload", () => {
    expect(assess("C", f({ oedema: "peripheral" })).prompts.join(" ")).toMatch(/Oedema/);
    const hf = assess("C", f({ oedema: "peripheral", jvp: "raised" }));
    expect(hf.prompts.join(" ")).toMatch(/heart failure or fluid overload/);
    expect(hf.level).toBe("Check");
  });
  it("is Urgent for mottled skin, and for cool skin with slow capillary refill", () => {
    expect(assess("C", f({ skin: "mottled" })).level).toBe("Urgent");
    expect(assess("C", f({ skin: "cool" })).level).toBe("Check");
    expect(assess("C", f({ skin: "cool" }), "over-2").level).toBe("Urgent");
  });
  it("labels answers in words", () => {
    expect(labelOf("skin", "warm-pink")).toBe("Warm And Pink");
  });
});

describe("the look, listen and feel sheets", () => {
  beforeEach(() => { window.localStorage.clear(); useAbcde.getState().clear(); });
  it("records each touch with a time and keeps it", () => {
    useUi.setState({ sheetContext: "breathing" } as any);
    const { container } = render(<AbcdeAssess />);
    fireEvent.click(container.querySelector('[data-testid="check-entry"] [data-value="reduced-left"]')!);
    fireEvent.click(container.querySelector('[data-testid="check-percussion"] [data-value="hyper"]')!);
    const c = useAbcde.getState().checks;
    expect(c.entry?.value).toBe("reduced-left");
    expect(c.percussion?.value).toBe("hyper");
    expect(Date.parse(c.entry!.at)).toBeGreaterThan(0);
    expect(JSON.parse(window.localStorage.getItem("emus.abcde")!).checks.percussion.value).toBe("hyper");
  });
  it("offers the circulation checks from its own sheet", () => {
    useUi.setState({ sheetContext: "circulation" } as any);
    render(<AbcdeAssess />);
    expect(dom.getByTestId("check-oedema")).toBeTruthy();
    expect(dom.queryByTestId("check-entry")).toBeNull();
  });
});
