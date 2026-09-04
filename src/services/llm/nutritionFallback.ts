import { z } from "zod";
import { extractJson, getClaudeClient, getClaudeModel } from "./claudeClient.js";
import type { NutritionLookupResult } from "../../types/nutrition.js";

/**
 * Fallback-источник, когда продукт не найден ни в USDA, ни в FatSecret
 * (нестандартные/составные/локальные блюда). Строгий промпт эксперта-нутрициолога,
 * запрашивающий ТОЛЬКО эталонные значения на 100г — дальнейший пересчёт на вес
 * порции всё равно выполняется программно, как и для остальных источников.
 * Результат помечается isEstimated=true и явно показывается пользователю.
 */
const SYSTEM_PROMPT = `Ты — эксперт-нутрициолог с точным знанием таблиц калорийности продуктов.
Пользователь просит примерные усреднённые значения КБЖУ на 100 грамм для продукта/блюда,
которое не найдено в официальных базах данных (USDA / FatSecret).

Дай наиболее точную, реалистичную оценку на основе кулинарных рецептур и известных
табличных данных. Не занижай и не завышай специально. Учитывай состояние продукта
(сырое/готовое), если оно указано.

Ответь СТРОГО валидным JSON без markdown-обёртки и без пояснений:
{ "matched_name": "string", "calories": number, "protein_g": number, "fat_g": number, "carbs_g": number }`;

const responseSchema = z.object({
  matched_name: z.string().min(1),
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
});

export async function estimateNutritionWithLLM(
  searchTerm: string,
  state: "raw" | "cooked" | "unknown",
  modifiers: string[] = [],
): Promise<NutritionLookupResult> {
  const client = getClaudeClient();
  const userPrompt = [
    `Продукт: ${searchTerm}`,
    `Состояние: ${state}`,
    modifiers.length > 0 ? `Уточнения: ${modifiers.join(", ")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: getClaudeModel(),
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = responseSchema.parse(extractJson(response.content));

  return {
    matchedName: parsed.matched_name,
    per100g: {
      calories: parsed.calories,
      proteinG: parsed.protein_g,
      fatG: parsed.fat_g,
      carbsG: parsed.carbs_g,
    },
    source: "LLM_FALLBACK",
    isEstimated: true,
  };
}
