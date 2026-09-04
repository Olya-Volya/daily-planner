import { logger } from "../../utils/logger.js";
import { loadEnv } from "../../config/env.js";
import { UsdaClient } from "./usdaClient.js";
import { FatSecretClient } from "./fatSecretClient.js";
import { estimateNutritionWithLLM } from "../llm/nutritionFallback.js";
import { convertWeightBetweenStates } from "../calculation/cookingCoefficients.js";
import { calculateMealItem } from "../calculation/nutrientCalculator.js";
import type { CalculatedMealItem, ParsedMealItem } from "../../types/nutrition.js";

/**
 * Оркестрирует поиск эталонных нутриентов: USDA (primary) -> FatSecret (secondary)
 * -> Claude fallback (последняя инстанция, помечается как оценка).
 * Затем передаёт результат в чистый программный калькулятор для пересчёта на вес —
 * сам resolver никогда не считает итоговые калории/БЖУ.
 */
export class NutritionResolver {
  private readonly usda: UsdaClient;
  private readonly fatSecret: FatSecretClient;

  constructor() {
    const env = loadEnv();
    this.usda = new UsdaClient(env.USDA_FDC_API_KEY);
    this.fatSecret = new FatSecretClient(env.FATSECRET_CLIENT_ID, env.FATSECRET_CLIENT_SECRET);
  }

  async resolveAndCalculate(item: ParsedMealItem): Promise<CalculatedMealItem> {
    let lookup = await this.tryUsda(item.searchTerm);

    if (!lookup) {
      lookup = await this.tryFatSecret(item.searchTerm);
    }

    if (!lookup) {
      logger.info({ searchTerm: item.searchTerm }, "Falling back to LLM nutrition estimate");
      lookup = await estimateNutritionWithLLM(item.searchTerm, item.state, item.modifiers);
    }

    // Официальные базы обычно хранят по одному состоянию продукта (чаще сырое/сухое).
    // Если пользователь указал другое состояние явно, приводим вес к состоянию записи,
    // а не наоборот — данные "на 100г" из источника не трогаем.
    const effectiveQuantityGrams =
      item.state !== "unknown"
        ? convertWeightBetweenStates(item.searchTerm, item.quantityGrams, item.state, "raw")
        : item.quantityGrams;

    return calculateMealItem(item, lookup, effectiveQuantityGrams);
  }

  async resolveMeal(items: ParsedMealItem[]): Promise<CalculatedMealItem[]> {
    return Promise.all(items.map((item) => this.resolveAndCalculate(item)));
  }

  private async tryUsda(searchTerm: string) {
    try {
      return await this.usda.searchFood(searchTerm);
    } catch (err) {
      logger.error({ err, searchTerm }, "USDA lookup failed");
      return null;
    }
  }

  private async tryFatSecret(searchTerm: string) {
    try {
      return await this.fatSecret.searchFood(searchTerm);
    } catch (err) {
      logger.error({ err, searchTerm }, "FatSecret lookup failed");
      return null;
    }
  }
}
