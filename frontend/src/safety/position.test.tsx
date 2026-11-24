import { render, screen as dom } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FallFigure, PositionFigure, breathPeriod, poseMeaning, poseOf, poseWord } from "./PositionFigure";

describe("position figure", () => {
  it("draws a figure for every position the monitor reports", () => {
    for (const p of ["upright", "walking", "supine", "prone", "left", "right"] as const) {
      const { unmount } = render(<PositionFigure pose={p} />);
      expect(dom.getByTestId("position-figure").dataset.pose).toBe(p);
      expect(dom.getByRole("img").getAttribute("aria-label")).toContain(poseWord(p));
      unmount();
    }
  });
  it("writes every position in Title Case with its plain meaning", () => {
    expect(poseWord("supine")).toBe("Supine");
    expect(poseWord("left")).toBe("Left Side");
    expect(poseWord("some new pose")).toBe("Some New Pose");
    expect(poseMeaning("supine")).toBe("Lying On Back");
    expect(poseMeaning("prone")).toBe("Lying On Front");
    expect(poseMeaning("walking")).toBe("Up And Moving");
    expect(poseOf("nonsense")).toBeNull();
  });
  it("breathes at the respiratory rate, within limits", () => {
    expect(breathPeriod(15)).toBe(4);
    expect(breathPeriod(60)).toBe(1.5);
    expect(breathPeriod(5)).toBe(6);
    expect(breathPeriod(null)).toBe(4);
  });
  it("a face marks the way a lying patient faces and a dotted spine marks the back", () => {
    const sup = render(<PositionFigure pose="supine" />);
    expect(sup.container.querySelectorAll(".pf-eye")).toHaveLength(2);
    sup.unmount();
    const pr = render(<PositionFigure pose="prone" />);
    expect(pr.container.querySelector(".pf-spine")).toBeTruthy();
    expect(pr.container.querySelectorAll(".pf-eye")).toHaveLength(0);
  });
  it("draws a fall as a figure on the floor, and no fall as one standing", () => {
    const { rerender } = render(<FallFigure fallen={false} />);
    expect(dom.getByTestId("fall-figure").dataset.fallen).toBe("false");
    rerender(<FallFigure fallen />);
    expect(dom.getByTestId("fall-figure").dataset.fallen).toBe("true");
  });
});
