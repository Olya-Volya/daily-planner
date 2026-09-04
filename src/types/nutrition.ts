/**
 * Общие типы для конвейера "голос -> текст -> ингредиенты -> точные КБЖУ".
 */

/** Состояние продукта: важно для правильного подбора эталонных нутриентов. */
export type FoodState = "raw" | "cooked" | "unknown";

/**
 * Один ингредиент, извлечённый LLM из текста пользователя.
 * LLM отвечает ТОЛЬКО за интерпретацию языка — никаких количественных
 * расчётов КБЖУ здесь быть не должно, только факты, распознанные из фразы.
 */
export interface ParsedMealItem {
  /** Поисковый термин для запроса к базе нутриентов, на русском или английском. */
  searchTerm: string;
  /** Вес порции в граммах. Если пользователь указал в штуках/ложках — LLM переводит в граммы по стандартным весам. */
  quantityGrams: number;
  /** Состояние продукта, если оно определимо из фразы. */
  state: FoodState;
  /** Дополнительные модификаторы, извлечённые из фразы (жирность, добавки и т.п.), для справки/лога. */
  modifiers?: string[];
}

export interface ParsedMeal {
  items: ParsedMealItem[];
  /** Заданные пользователем пояснения/уточнения, не относящиеся ни к одному конкретному item. */
  notes?: string;
}

/** Значения нутриентов на 100 г продукта. */
export interface NutrientsPer100g {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export type NutritionSource = "USDA" | "FATSECRET" | "LLM_FALLBACK";

export interface NutritionLookupResult {
  /** Название продукта, как оно найдено в источнике данных. */
  matchedName: string;
  per100g: NutrientsPer100g;
  source: NutritionSource;
  /** true, если данные получены LLM-фолбэком, а не из официальной базы — должно быть видно пользователю. */
  isEstimated: boolean;
}

/** Итог расчёта КБЖУ для одного элемента приёма пищи (после программного пересчёта на вес). */
export interface CalculatedMealItem {
  searchTerm: string;
  matchedName: string;
  quantityGrams: number;
  state: FoodState;
  source: NutritionSource;
  isEstimated: boolean;
  per100g: NutrientsPer100g;
  totals: NutrientsPer100g; // те же поля, но уже пересчитанные на quantityGrams
}

export interface MealTotals extends NutrientsPer100g {
  itemCount: number;
}
