import { describe, expect, it } from "vitest";
import {
  convertWeightBetweenStates,
  getCookingCoefficient,
} from "../src/services/calculation/cookingCoefficients.js";

describe("getCookingCoefficient", () => {
  it("resolves known Russian aliases", () => {
    expect(getCookingCoefficient("гречка")?.weightMultiplier).toBe(2.8);
    expect(getCookingCoefficient("куриное филе")?.weightMultiplier).toBe(0.7);
  });

  it("returns undefined for unknown products", () => {
    expect(getCookingCoefficient("зефир")).toBeUndefined();
  });
});

describe("convertWeightBetweenStates", () => {
  it("returns the same value when states match", () => {
    expect(convertWeightBetweenStates("гречка", 150, "cooked", "cooked")).toBe(150);
  });

  it("converts cooked weight down to raw-equivalent weight", () => {
    // 280г варёной гречки эквивалентно 100г сухой крупы (multiplier 2.8)
    expect(convertWeightBetweenStates("гречка", 280, "cooked", "raw")).toBeCloseTo(100, 5);
  });

  it("converts raw weight up to cooked-equivalent weight", () => {
    expect(convertWeightBetweenStates("куриное филе", 200, "raw", "cooked")).toBeCloseTo(140, 5);
  });

  it("leaves weight unchanged for products without a known coefficient", () => {
    expect(convertWeightBetweenStates("зефир", 50, "raw", "cooked")).toBe(50);
  });
});
