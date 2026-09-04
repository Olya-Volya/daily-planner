import type {
  CalculatedMealItem,
  MealTotals,
  NutrientsPer100g,
  NutritionLookupResult,
  ParsedMealItem,
} from "../../types/nutrition.js";

/**
 * ВСЯ арифметика КБЖУ находится строго в этом файле и нигде больше.
 * Ни Claude, ни Whisper не участвуют в вычислениях — они лишь поставляют
 * входные данные (распознанный текст -> структура ингредиентов; название
 * продукта -> эталонные нутриенты на 100г). См. п.4 ТЗ "Запрет на случайную
 * генерацию чисел (Hallucination Control)".
 */

const ROUND_DECIMALS = 1;

function round(value: number): number {
  const factor = 10 ** ROUND_DECIMALS;
  return Math.round(value * factor) / factor;
}

/** Пересчитывает нутриенты "на 100 г" на заданный вес порции (в граммах). Простое правило трёх. */
export function scaleNutrientsToWeight(
  per100g: NutrientsPer100g,
  quantityGrams: number,
): NutrientsPer100g {
  if (quantityGrams < 0) {
    throw new Error(`quantityGrams must be >= 0, got ${quantityGrams}`);
  }
  const factor = quantityGrams / 100;
  return {
    calories: round(per100g.calories * factor),
    proteinG: round(per100g.proteinG * factor),
    fatG: round(per100g.fatG * factor),
    carbsG: round(per100g.carbsG * factor),
  };
}

export function sumNutrients(items: NutrientsPer100g[]): NutrientsPer100g {
  return items.reduce<NutrientsPer100g>(
    (acc, item) => ({
      calories: round(acc.calories + item.calories),
      proteinG: round(acc.proteinG + item.proteinG),
      fatG: round(acc.fatG + item.fatG),
      carbsG: round(acc.carbsG + item.carbsG),
    }),
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
}

/**
 * Объединяет распознанный ингредиент, вес (уже приведённый к состоянию,
 * соответствующему найденной записи в базе нутриентов, см. cookingCoefficients.ts)
 * и результат поиска в базе нутриентов в готовую строку меню с точными итогами.
 */
export function calculateMealItem(
  parsed: ParsedMealItem,
  lookup: NutritionLookupResult,
  effectiveQuantityGrams: number,
): CalculatedMealItem {
  const totals = scaleNutrientsToWeight(lookup.per100g, effectiveQuantityGrams);
  return {
    searchTerm: parsed.searchTerm,
    matchedName: lookup.matchedName,
    quantityGrams: parsed.quantityGrams,
    state: parsed.state,
    source: lookup.source,
    isEstimated: lookup.isEstimated,
    per100g: lookup.per100g,
    totals,
  };
}

export function calculateMealTotals(items: CalculatedMealItem[]): MealTotals {
  const sums = sumNutrients(items.map((i) => i.totals));
  return { ...sums, itemCount: items.length };
}

export interface DailyBudget {
  target: NutrientsPer100g;
  consumed: NutrientsPer100g;
}

/** Остаток суточной нормы КБЖУ (может уходить в минус — отображается пользователю как "перебор"). */
export function calculateRemainingBudget(budget: DailyBudget): NutrientsPer100g {
  return {
    calories: round(budget.target.calories - budget.consumed.calories),
    proteinG: round(budget.target.proteinG - budget.consumed.proteinG),
    fatG: round(budget.target.fatG - budget.consumed.fatG),
    carbsG: round(budget.target.carbsG - budget.consumed.carbsG),
  };
}
