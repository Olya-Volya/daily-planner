import { describe, expect, it } from "vitest";
import {
  calculateMealItem,
  calculateMealTotals,
  calculateRemainingBudget,
  scaleNutrientsToWeight,
  sumNutrients,
} from "../src/services/calculation/nutrientCalculator.js";
import type { NutritionLookupResult, ParsedMealItem } from "../src/types/nutrition.js";

describe("scaleNutrientsToWeight", () => {
  it("scales per-100g values proportionally to weight", () => {
    const per100g = { calories: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3 }; // сырая овсянка
    const result = scaleNutrientsToWeight(per100g, 200);
    expect(result).toEqual({ calories: 778, proteinG: 33.8, fatG: 13.8, carbsG: 132.6 });
  });

  it("returns zeros for 0 grams", () => {
    const per100g = { calories: 200, proteinG: 10, fatG: 5, carbsG: 20 };
    expect(scaleNutrientsToWeight(per100g, 0)).toEqual({
      calories: 0,
      proteinG: 0,
      fatG: 0,
      carbsG: 0,
    });
  });

  it("throws on negative weight", () => {
    expect(() => scaleNutrientsToWeight({ calories: 1, proteinG: 1, fatG: 1, carbsG: 1 }, -5)).toThrow();
  });
});

describe("sumNutrients", () => {
  it("sums multiple nutrient sets", () => {
    const result = sumNutrients([
      { calories: 100, proteinG: 5, fatG: 2, carbsG: 10 },
      { calories: 50, proteinG: 2.5, fatG: 1, carbsG: 5 },
    ]);
    expect(result).toEqual({ calories: 150, proteinG: 7.5, fatG: 3, carbsG: 15 });
  });

  it("returns zeros for empty list", () => {
    expect(sumNutrients([])).toEqual({ calories: 0, proteinG: 0, fatG: 0, carbsG: 0 });
  });
});

describe("calculateMealItem / calculateMealTotals", () => {
  it("computes a full meal from parsed items + nutrition lookups deterministically", () => {
    // "съел 200 грамм овсянки на нежирном молоке с ложкой мёда" -> 3 позиции
    const oatmeal: ParsedMealItem = {
      searchTerm: "овсянка сухая",
      quantityGrams: 200,
      state: "raw",
    };
    const oatmealLookup: NutritionLookupResult = {
      matchedName: "Oats, raw",
      per100g: { calories: 389, proteinG: 16.9, fatG: 6.9, carbsG: 66.3 },
      source: "USDA",
      isEstimated: false,
    };

    const milk: ParsedMealItem = { searchTerm: "молоко нежирное", quantityGrams: 150, state: "unknown" };
    const milkLookup: NutritionLookupResult = {
      matchedName: "Milk, nonfat",
      per100g: { calories: 34, proteinG: 3.4, fatG: 0.2, carbsG: 5 },
      source: "USDA",
      isEstimated: false,
    };

    const honey: ParsedMealItem = { searchTerm: "мёд", quantityGrams: 20, state: "unknown" };
    const honeyLookup: NutritionLookupResult = {
      matchedName: "Honey",
      per100g: { calories: 304, proteinG: 0.3, fatG: 0, carbsG: 82.4 },
      source: "USDA",
      isEstimated: false,
    };

    const items = [
      calculateMealItem(oatmeal, oatmealLookup, 200),
      calculateMealItem(milk, milkLookup, 150),
      calculateMealItem(honey, honeyLookup, 20),
    ];

    expect(items[0]?.totals).toEqual({ calories: 778, proteinG: 33.8, fatG: 13.8, carbsG: 132.6 });
    expect(items[1]?.totals).toEqual({ calories: 51, proteinG: 5.1, fatG: 0.3, carbsG: 7.5 });
    expect(items[2]?.totals).toEqual({ calories: 60.8, proteinG: 0.1, fatG: 0, carbsG: 16.5 });

    const totals = calculateMealTotals(items);
    expect(totals).toEqual({ calories: 889.8, proteinG: 39, fatG: 14.1, carbsG: 156.6, itemCount: 3 });
  });
});

describe("calculateRemainingBudget", () => {
  it("subtracts consumed from target, can go negative", () => {
    const remaining = calculateRemainingBudget({
      target: { calories: 2000, proteinG: 150, fatG: 60, carbsG: 200 },
      consumed: { calories: 2200, proteinG: 100, fatG: 70, carbsG: 150 },
    });
    expect(remaining).toEqual({ calories: -200, proteinG: 50, fatG: -10, carbsG: 50 });
  });
});
