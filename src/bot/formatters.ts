import type { CalculatedMealItem, MealTotals, NutrientsPer100g } from "../types/nutrition.js";

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function formatMealSummary(items: CalculatedMealItem[], totals: MealTotals): string {
  const lines = items.map((item) => {
    const estimatedTag = item.isEstimated ? " ⚠️оценка" : "";
    return `• ${item.matchedName} (${fmt(item.quantityGrams)} г${estimatedTag}) — ` +
      `${fmt(item.totals.calories)} ккал, Б${fmt(item.totals.proteinG)}/Ж${fmt(item.totals.fatG)}/У${fmt(item.totals.carbsG)}`;
  });

  return [
    "🍽 Приём пищи посчитан:",
    ...lines,
    "",
    `Итого: ${fmt(totals.calories)} ккал, Б${fmt(totals.proteinG)}/Ж${fmt(totals.fatG)}/У${fmt(totals.carbsG)} г`,
  ].join("\n");
}

export function formatDailyRemaining(consumed: NutrientsPer100g, remaining: NutrientsPer100g): string {
  const over = remaining.calories < 0;
  return [
    `📊 За сегодня: ${fmt(consumed.calories)} ккал, Б${fmt(consumed.proteinG)}/Ж${fmt(consumed.fatG)}/У${fmt(consumed.carbsG)} г`,
    over
      ? `⚠️ Превышение нормы на ${fmt(Math.abs(remaining.calories))} ккал`
      : `Остаток на сегодня: ${fmt(remaining.calories)} ккал, Б${fmt(remaining.proteinG)}/Ж${fmt(remaining.fatG)}/У${fmt(remaining.carbsG)} г`,
  ].join("\n");
}
