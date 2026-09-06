import { z } from "zod";
import { extractJson, getClaudeClient, getClaudeModel } from "./claudeClient.js";
import type { ParsedMeal } from "../../types/nutrition.js";

/**
 * Строгий промпт "эксперта-парсера": модель ТОЛЬКО извлекает структуру из
 * человеческого текста (что съедено, сколько грамм, в каком состоянии).
 * Ей явно запрещено считать калории/БЖУ или что-либо домысливать сверх фразы —
 * эти цифры считаются программно после поиска в базе нутриентов
 * (см. services/calculation/nutrientCalculator.ts).
 */
const SYSTEM_PROMPT = `Ты — модуль извлечения структурированных данных о приёме пищи из свободной русской речи.

Твоя ЕДИНСТВЕННАЯ задача — разложить фразу пользователя на список ингредиентов с их весом в граммах.

ПРАВИЛА:
1. НИКОГДА не вычисляй и не указывай калории, белки, жиры или углеводы — это не твоя задача, для этого есть отдельная база данных и калькулятор.
2. Для каждого ингредиента определи "search_term" — краткое название продукта на АНГЛИЙСКОМ языке для поиска в базе нутриентов (USDA FoodData Central — англоязычная база, русские названия в ней почти никогда не находятся). Переведи название на английский и нормализуй: единственное число, без бытового сленга, базовая форма продукта (например "буженина" → "roast pork", "гречка" → "buckwheat", "куриная грудка" → "chicken breast").
3. Переведи бытовые меры в граммы по стандартным весам (например: 1 ложка мёда ≈ 12г, 1 ложка (ст.л.) масла ≈ 17г, 1 яйцо ≈ 55г, 1 стакан молока ≈ 240мл≈240г, щепотка соли ≈ 1г). Если вес не указан явно и не выводится из меры — сделай разумную оценку порции для взрослого человека и укажи это в modifiers.
4. Определи "state": "raw" — если продукт явно сырой/сухой (сухая крупа, сырое мясо), "cooked" — если явно приготовлен (варёная каша, жареная курица, суп), "unknown" — если из фразы это не ясно.
5. Модификаторы (жирность молока, тип масла, наличие сахара и т.п.) добавляй в массив "modifiers" как короткие строки — они пригодятся при поиске в базе, но НЕ используй их для расчётов сам.
6. Если в одной фразе несколько блюд/продуктов — верни их все отдельными элементами массива.

Ответь СТРОГО валидным JSON без markdown-обёртки и без пояснений, в формате:
{
  "items": [
    { "search_term": "string", "quantity_grams": number, "state": "raw"|"cooked"|"unknown", "modifiers": ["string"] }
  ],
  "notes": "string | null"
}`;

const rawItemSchema = z.object({
  search_term: z.string().min(1),
  quantity_grams: z.number().positive(),
  state: z.enum(["raw", "cooked", "unknown"]),
  modifiers: z.array(z.string()).optional().default([]),
});

const rawResponseSchema = z.object({
  items: z.array(rawItemSchema),
  notes: z.string().nullable().optional(),
});

export async function parseMealFromText(transcript: string): Promise<ParsedMeal> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: getClaudeModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const parsed = rawResponseSchema.parse(extractJson(response.content));

  return {
    items: parsed.items.map((item) => ({
      searchTerm: item.search_term,
      quantityGrams: item.quantity_grams,
      state: item.state,
      modifiers: item.modifiers,
    })),
    notes: parsed.notes ?? undefined,
  };
}
