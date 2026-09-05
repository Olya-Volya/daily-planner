import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMealItem } from "../src/types/nutrition.js";

vi.mock("../src/config/env.js", () => ({
  loadEnv: () => ({
    USDA_FDC_API_KEY: "test-usda-key",
    FATSECRET_CLIENT_ID: "test-id",
    FATSECRET_CLIENT_SECRET: "test-secret",
    LOG_LEVEL: "silent",
  }),
}));

const usdaSearchFood = vi.fn();
vi.mock("../src/services/nutrition/usdaClient.js", () => ({
  UsdaClient: vi.fn().mockImplementation(() => ({ searchFood: usdaSearchFood })),
}));

const fatSecretSearchFood = vi.fn();
vi.mock("../src/services/nutrition/fatSecretClient.js", () => ({
  FatSecretClient: vi.fn().mockImplementation(() => ({ searchFood: fatSecretSearchFood })),
}));

const estimateNutritionWithLLM = vi.fn();
vi.mock("../src/services/llm/nutritionFallback.js", () => ({ estimateNutritionWithLLM }));

const { NutritionResolver } = await import("../src/services/nutrition/nutritionResolver.js");

describe("NutritionResolver", () => {
  beforeEach(() => {
    usdaSearchFood.mockReset();
    fatSecretSearchFood.mockReset();
    estimateNutritionWithLLM.mockReset();
  });

  it("uses the USDA result when found, without touching fallback sources", async () => {
    usdaSearchFood.mockResolvedValue({
      matchedName: "Chicken breast, raw",
      per100g: { calories: 165, proteinG: 31, fatG: 3.6, carbsG: 0 },
      source: "USDA",
      isEstimated: false,
    });

    const resolver = new NutritionResolver();
    const item: ParsedMealItem = { searchTerm: "куриная грудка", quantityGrams: 200, state: "unknown" };
    const result = await resolver.resolveAndCalculate(item);

    expect(result.source).toBe("USDA");
    expect(result.isEstimated).toBe(false);
    expect(result.totals).toEqual({ calories: 330, proteinG: 62, fatG: 7.2, carbsG: 0 });
    expect(fatSecretSearchFood).not.toHaveBeenCalled();
    expect(estimateNutritionWithLLM).not.toHaveBeenCalled();
  });

  it("falls back to FatSecret when USDA has no match", async () => {
    usdaSearchFood.mockResolvedValue(null);
    fatSecretSearchFood.mockResolvedValue({
      matchedName: "Fictional Product",
      per100g: { calories: 100, proteinG: 5, fatG: 2, carbsG: 15 },
      source: "FATSECRET",
      isEstimated: false,
    });

    const resolver = new NutritionResolver();
    const item: ParsedMealItem = { searchTerm: "неизвестный продукт", quantityGrams: 100, state: "unknown" };
    const result = await resolver.resolveAndCalculate(item);

    expect(result.source).toBe("FATSECRET");
    expect(estimateNutritionWithLLM).not.toHaveBeenCalled();
  });

  it("falls back to the LLM estimate and marks it as estimated when both DBs miss", async () => {
    usdaSearchFood.mockResolvedValue(null);
    fatSecretSearchFood.mockResolvedValue(null);
    estimateNutritionWithLLM.mockResolvedValue({
      matchedName: "Домашний плов (оценка)",
      per100g: { calories: 200, proteinG: 8, fatG: 7, carbsG: 25 },
      source: "LLM_FALLBACK",
      isEstimated: true,
    });

    const resolver = new NutritionResolver();
    const item: ParsedMealItem = { searchTerm: "домашний плов", quantityGrams: 300, state: "unknown" };
    const result = await resolver.resolveAndCalculate(item);

    expect(result.source).toBe("LLM_FALLBACK");
    expect(result.isEstimated).toBe(true);
    expect(result.totals).toEqual({ calories: 600, proteinG: 24, fatG: 21, carbsG: 75 });
  });

  it("converts a cooked-state weight to its raw equivalent before scaling (гречка)", async () => {
    usdaSearchFood.mockResolvedValue({
      matchedName: "Buckwheat groats, raw",
      per100g: { calories: 343, proteinG: 13.3, fatG: 3.4, carbsG: 71.5 },
      source: "USDA",
      isEstimated: false,
    });

    const resolver = new NutritionResolver();
    // 280г варёной гречки эквивалентно 100г сухой крупы (коэффициент 2.8)
    const item: ParsedMealItem = { searchTerm: "гречка", quantityGrams: 280, state: "cooked" };
    const result = await resolver.resolveAndCalculate(item);

    expect(result.totals).toEqual({ calories: 343, proteinG: 13.3, fatG: 3.4, carbsG: 71.5 });
  });

  it("resolves a full meal concurrently via resolveMeal", async () => {
    usdaSearchFood.mockResolvedValue({
      matchedName: "Egg, whole, raw",
      per100g: { calories: 143, proteinG: 12.6, fatG: 9.5, carbsG: 0.7 },
      source: "USDA",
      isEstimated: false,
    });

    const resolver = new NutritionResolver();
    const items: ParsedMealItem[] = [
      { searchTerm: "яйцо", quantityGrams: 55, state: "unknown" },
      { searchTerm: "яйцо", quantityGrams: 55, state: "unknown" },
    ];
    const results = await resolver.resolveMeal(items);
    expect(results).toHaveLength(2);
    expect(usdaSearchFood).toHaveBeenCalledTimes(2);
  });
});
