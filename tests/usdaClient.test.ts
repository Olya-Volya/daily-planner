import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({
  loadEnv: () => ({ LOG_LEVEL: "silent" }),
}));

const { UsdaClient } = await import("../src/services/nutrition/usdaClient.js");

describe("UsdaClient.searchFood", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the KCAL energy value, not the kJ one, when FDC returns both", async () => {
    // FoodData Central часто отдаёт "Energy" двумя записями с разными
    // единицами — реальный баг был в том, что бралась первая попавшаяся
    // (в этом фикстуре — kJ), завышая калорийность примерно в 4.184 раза.
    const fakeResponse = {
      foods: [
        {
          description: "Chicken, broiler, breast, meat only, raw",
          dataType: "Foundation",
          foodNutrients: [
            { nutrientName: "Energy", unitName: "kJ", value: 690 },
            { nutrientName: "Energy", unitName: "KCAL", value: 165 },
            { nutrientName: "Protein", unitName: "G", value: 31 },
            { nutrientName: "Total lipid (fat)", unitName: "G", value: 3.6 },
            { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 0 },
          ],
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeResponse),
      }),
    );

    const client = new UsdaClient("test-key");
    const result = await client.searchFood("chicken breast");

    expect(result?.per100g.calories).toBe(165);
  });

  it("converts kJ to kcal when only the kJ value is present", async () => {
    const fakeResponse = {
      foods: [
        {
          description: "Some food, kJ only",
          dataType: "Foundation",
          foodNutrients: [
            { nutrientName: "Energy", unitName: "kJ", value: 418.4 },
            { nutrientName: "Protein", unitName: "G", value: 5 },
            { nutrientName: "Total lipid (fat)", unitName: "G", value: 2 },
            { nutrientName: "Carbohydrate, by difference", unitName: "G", value: 10 },
          ],
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fakeResponse),
      }),
    );

    const client = new UsdaClient("test-key");
    const result = await client.searchFood("some food");

    expect(result?.per100g.calories).toBeCloseTo(100, 1);
  });
});
