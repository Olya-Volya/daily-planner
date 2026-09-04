/**
 * Коэффициенты пересчёта веса "сырой <-> готовый продукт".
 *
 * Большинство нутрициологических баз данных (USDA, FatSecret) хранят значения
 * КБЖУ на 100 г как для сырых, так и для части готовых продуктов отдельными
 * записями. Но когда LLM извлекает из фразы состояние продукта, а в базе
 * находится запись только для другого состояния, необходимо скорректировать
 * ВЕС (не КБЖУ на 100г!) с учётом изменения массы при готовке (выпаривание
 * воды при варке круп, потеря веса при жарке мяса и т.д.).
 *
 * Коэффициент weightMultiplier показывает, во сколько раз меняется масса
 * продукта при переходе raw -> cooked (готовый продукт тяжелее/легче сырого).
 * Например, гречка при варке впитывает воду: 100 г сухой крупы дают ~250-300 г
 * готовой каши, поэтому multiplier ~2.5-3.
 *
 * Это ТОЛЬКО справочные усреднённые коэффициенты для случая, когда состояние
 * не указано пользователем или запись нужного состояния отсутствует в базе.
 * Если в базе нутриентов нашлась запись именно в нужном состоянии — коэффициент
 * не применяется вообще, используются нативные данные источника.
 */
export interface CookingCoefficient {
  /** во сколько раз меняется масса продукта при варке/жарке относительно сырого веса */
  weightMultiplier: number;
  note: string;
}

const COOKING_COEFFICIENTS: Record<string, CookingCoefficient> = {
  // крупы — сильно набирают вес и воду
  rice: { weightMultiplier: 2.5, note: "варёный рис ~2.5x веса сухого" },
  buckwheat: { weightMultiplier: 2.8, note: "варёная гречка ~2.8x веса сухой" },
  oatmeal: { weightMultiplier: 3.0, note: "овсяная каша на воде ~3x веса сухих хлопьев" },
  pasta: { weightMultiplier: 2.2, note: "варёные макароны ~2.2x веса сухих" },
  bulgur: { weightMultiplier: 2.5, note: "" },
  quinoa: { weightMultiplier: 2.8, note: "" },
  lentils: { weightMultiplier: 2.3, note: "" },
  beans: { weightMultiplier: 2.5, note: "" },

  // мясо/птица/рыба — теряют вес за счёт выпаривания влаги и жира
  chicken_breast: { weightMultiplier: 0.7, note: "жареная/варёная куриная грудка ~70% сырого веса" },
  chicken_thigh: { weightMultiplier: 0.72, note: "" },
  beef: { weightMultiplier: 0.65, note: "" },
  pork: { weightMultiplier: 0.68, note: "" },
  fish: { weightMultiplier: 0.8, note: "" },
  shrimp: { weightMultiplier: 0.75, note: "" },
  minced_meat: { weightMultiplier: 0.7, note: "" },

  // яйца — вес почти не меняется
  egg: { weightMultiplier: 0.95, note: "" },
};

/** Синонимы для сопоставления search_term (рус/eng) с ключом таблицы коэффициентов. */
const ALIASES: Record<string, keyof typeof COOKING_COEFFICIENTS> = {
  рис: "rice",
  гречка: "buckwheat",
  гречневая_крупа: "buckwheat",
  овсянка: "oatmeal",
  овсяные_хлопья: "oatmeal",
  макароны: "pasta",
  паста: "pasta",
  булгур: "bulgur",
  киноа: "quinoa",
  чечевица: "lentils",
  фасоль: "beans",
  курица: "chicken_breast",
  куриная_грудка: "chicken_breast",
  куриное_филе: "chicken_breast",
  куриное_бедро: "chicken_thigh",
  говядина: "beef",
  свинина: "pork",
  рыба: "fish",
  креветки: "shrimp",
  фарш: "minced_meat",
  яйцо: "egg",
};

function normalizeKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Возвращает коэффициент пересчёта массы raw<->cooked для данного продукта,
 * либо undefined, если продукт не найден в справочнике (в этом случае состояние
 * не корректируется и используются данные из базы нутриентов "как есть").
 */
export function getCookingCoefficient(searchTerm: string): CookingCoefficient | undefined {
  const key = normalizeKey(searchTerm);
  if (key in COOKING_COEFFICIENTS) {
    return COOKING_COEFFICIENTS[key as keyof typeof COOKING_COEFFICIENTS];
  }
  const alias = ALIASES[key];
  return alias ? COOKING_COEFFICIENTS[alias] : undefined;
}

/**
 * Переводит вес, заданный пользователем в состоянии `fromState`, в эквивалентный
 * вес в состоянии `toState`, для которого известны нутриенты на 100г в базе.
 * Пример: пользователь сказал "200г варёной гречки", а в базе нашлась только
 * запись для сырой крупы -> нужно преобразовать 200г готовой в граммовку сырой
 * крупы, чтобы применить per100g сырого продукта.
 */
export function convertWeightBetweenStates(
  searchTerm: string,
  quantityGrams: number,
  fromState: "raw" | "cooked",
  toState: "raw" | "cooked",
): number {
  if (fromState === toState) return quantityGrams;
  const coeff = getCookingCoefficient(searchTerm);
  if (!coeff) return quantityGrams; // нет данных — не корректируем

  // weightMultiplier = вес(cooked) / вес(raw)
  if (fromState === "cooked" && toState === "raw") {
    return quantityGrams / coeff.weightMultiplier;
  }
  // fromState === "raw" && toState === "cooked"
  return quantityGrams * coeff.weightMultiplier;
}
