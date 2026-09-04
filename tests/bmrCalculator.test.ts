import { describe, expect, it } from "vitest";
import {
  calculateBMR,
  calculateDailyTargets,
  calculateTDEE,
} from "../src/services/profile/bmrCalculator.js";

describe("calculateBMR (Mifflin-St Jeor)", () => {
  it("computes BMR for a male", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    const bmr = calculateBMR({ gender: "MALE", age: 30, weightKg: 80, heightCm: 180 });
    expect(bmr).toBe(1780);
  });

  it("computes BMR for a female", () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    const bmr = calculateBMR({ gender: "FEMALE", age: 25, weightKg: 60, heightCm: 165 });
    expect(bmr).toBeCloseTo(1345.25, 5);
  });
});

describe("calculateTDEE", () => {
  it("applies activity multiplier", () => {
    expect(calculateTDEE(1780, "SEDENTARY")).toBeCloseTo(1780 * 1.2, 5);
    expect(calculateTDEE(1780, "VERY_HIGH")).toBeCloseTo(1780 * 1.9, 5);
  });
});

describe("calculateDailyTargets", () => {
  it("produces a coherent set of macro targets for a cutting goal", () => {
    const targets = calculateDailyTargets({
      gender: "MALE",
      age: 30,
      weightKg: 80,
      heightCm: 180,
      activityLevel: "MODERATE",
      goal: "LOSE",
    });

    expect(targets.bmr).toBe(1780);
    expect(targets.tdee).toBe(Math.round(1780 * 1.55));

    // calories = tdee * (1 - 0.18)
    const expectedCalories = Math.round(targets.tdee * 0.82);
    expect(targets.calories).toBe(expectedCalories);

    // protein = 2.0 g/kg for LOSE
    expect(targets.proteinG).toBe(Math.round(2.0 * 80));

    // Macros should roughly reconstruct total calories (protein 4kcal, fat 9kcal, carbs 4kcal)
    const reconstructed =
      targets.proteinG * 4 + targets.fatG * 9 + targets.carbsG * 4;
    expect(reconstructed).toBeGreaterThan(targets.calories - 20);
    expect(reconstructed).toBeLessThan(targets.calories + 20);

    // carbs should never be negative even for extreme inputs
    expect(targets.carbsG).toBeGreaterThanOrEqual(0);
  });

  it("never produces negative carbs even with a tiny calorie budget", () => {
    const targets = calculateDailyTargets({
      gender: "FEMALE",
      age: 60,
      weightKg: 40,
      heightCm: 150,
      activityLevel: "SEDENTARY",
      goal: "LOSE",
    });
    expect(targets.carbsG).toBeGreaterThanOrEqual(0);
  });
});
