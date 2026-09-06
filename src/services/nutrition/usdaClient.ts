import { logger } from "../../utils/logger.js";
import type { NutritionLookupResult } from "../../types/nutrition.js";

const FDC_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";

interface FdcFoodNutrient {
  nutrientName: string;
  unitName: string;
  value: number;
}

interface FdcFood {
  description: string;
  dataType: string;
  foodNutrients: FdcFoodNutrient[];
}

interface FdcSearchResponse {
  foods: FdcFood[];
}

// Официальные названия нутриентов, как их отдаёт FoodData Central.
const NUTRIENT_NAMES = {
  calories: "Energy",
  protein: "Protein",
  fat: "Total lipid (fat)",
  carbs: "Carbohydrate, by difference",
};

const KJ_TO_KCAL = 1 / 4.184;

function extractNutrient(food: FdcFood, name: string): number | undefined {
  const match = food.foodNutrients.find((n) => n.nutrientName === name);
  return match?.value;
}

/**
 * FDC часто отдаёт "Energy" ДВУМЯ отдельными записями с одинаковым
 * nutrientName — одна в KCAL, другая в kJ. Если брать первую попавшуюся без
 * проверки unitName, можно случайно взять значение в килоджоулях как
 * килокалории — калорийность окажется завышена примерно в 4.184 раза.
 * Поэтому энергию извлекаем отдельной функцией, явно приоритизируя KCAL.
 */
function extractEnergyKcal(food: FdcFood): number | undefined {
  const kcalMatch = food.foodNutrients.find(
    (n) => n.nutrientName === "Energy" && n.unitName?.toUpperCase() === "KCAL",
  );
  if (kcalMatch) return kcalMatch.value;

  const kjMatch = food.foodNutrients.find(
    (n) => n.nutrientName === "Energy" && n.unitName?.toUpperCase() === "KJ",
  );
  if (kjMatch) return kjMatch.value * KJ_TO_KCAL;

  // Фолбэк на случай нестандартного unitName — лучше взять хоть что-то,
  // чем совсем ничего, но это уже маловероятный путь.
  return extractNutrient(food, NUTRIENT_NAMES.calories);
}

/**
 * Primary источник эталонных нутриентов — USDA FoodData Central.
 * Бесплатный официальный API, покрывает большинство обычных продуктов.
 * Возвращает данные на 100 г, как их и хранит FDC (portion = 100g по умолчанию).
 */
export class UsdaClient {
  constructor(private readonly apiKey: string) {}

  async searchFood(query: string): Promise<NutritionLookupResult | null> {
    if (!this.apiKey) {
      logger.warn("USDA_FDC_API_KEY is not set, skipping USDA lookup");
      return null;
    }

    const url = new URL(FDC_SEARCH_URL);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "5");
    // Foundation/SR Legacy — курируемые официальные данные, без брендированной "воды" в цифрах
    url.searchParams.set("dataType", "Foundation,SR Legacy");

    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      logger.error({ status: response.status, query }, "USDA FDC search failed");
      return null;
    }

    const data = (await response.json()) as FdcSearchResponse;
    const food = data.foods?.[0];
    if (!food) return null;

    const calories = extractEnergyKcal(food);
    const protein = extractNutrient(food, NUTRIENT_NAMES.protein);
    const fat = extractNutrient(food, NUTRIENT_NAMES.fat);
    const carbs = extractNutrient(food, NUTRIENT_NAMES.carbs);

    if (calories === undefined || protein === undefined || fat === undefined || carbs === undefined) {
      logger.warn({ query, food: food.description }, "USDA record missing required macros, skipping");
      return null;
    }

    return {
      matchedName: food.description,
      per100g: { calories, proteinG: protein, fatG: fat, carbsG: carbs },
      source: "USDA",
      isEstimated: false,
    };
  }
}
