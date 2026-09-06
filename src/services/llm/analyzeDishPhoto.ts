import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJson, getClaudeClient, getClaudeModel } from "./claudeClient.js";
import type { ParsedMeal } from "../../types/nutrition.js";

export interface DishImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * Распознавание готового блюда/продукта по фото — тот же принцип, что и в
 * parseMealFromText.ts: Claude ТОЛЬКО определяет состав и оценивает вес
 * порций (по визуальным ориентирам — размер тарелки/приборов, количество
 * штук), но не считает калории/БЖУ сам. Дальше эти данные идут по тому же
 * конвейеру (NutritionResolver + nutrientCalculator), что и голосовой/
 * текстовый ввод, поэтому итоговые цифры считаются одинаково точно и
 * одинаковым программным кодом независимо от источника ввода.
 */
const SYSTEM_PROMPT = `Ты — модуль распознавания еды по фотографии для трекера КБЖУ.

На фото — готовое блюдо, тарелка с едой или отдельный продукт (например, кусок
пиццы, банан, батончик, упаковка йогурта), который человек ест или собирается
съесть. Определи:
1. Из чего состоит блюдо — отдельными позициями.
2. Вес каждой позиции в граммах — оцени по визуальным ориентирам: размер
   тарелки (стандартная тарелка ~24-27 см в диаметре), размер приборов,
   количество кусков/штук, сравнение с ладонью. Давай реалистичную оценку
   для одной порции взрослого человека.
3. Состояние каждого продукта: "raw" (сырое/необработанное — фрукт, овощ,
   орехи), "cooked" (термически обработано — жарено/варено/запечено),
   "unknown" — если не очевидно.

ВАЖНО: НЕ вычисляй и не указывай калории, белки, жиры или углеводы — этим
занимается отдельная база данных и калькулятор после тебя. Твоя задача —
только определить состав и вес.

Для "dish_title" используй русское название блюда (для показа пользователю).
Для "search_term" каждого ингредиента используй АНГЛИЙСКОЕ название в базовой
форме, единственном числе (например "chicken breast", "boiled rice", "cucumber
salad") — USDA FoodData Central, база нутриентов, англоязычная и по русским
названиям почти ничего не находит.

Если на фото нет еды или распознать её невозможно (слишком размыто, далеко,
не еда) — верни пустой массив "items".

Ответь СТРОГО валидным JSON без markdown-обёртки и без пояснений:
{
  "dish_title": "string | null",
  "items": [
    { "search_term": "string (на английском)", "quantity_grams": number, "state": "raw"|"cooked"|"unknown" }
  ]
}`;

const responseSchema = z.object({
  dish_title: z.string().nullable().optional(),
  items: z.array(
    z.object({
      search_term: z.string().min(1),
      quantity_grams: z.number().positive(),
      state: z.enum(["raw", "cooked", "unknown"]),
    }),
  ),
});

export interface DishPhotoAnalysis {
  title: string | null;
  meal: ParsedMeal;
}

export async function analyzeDishPhoto(images: DishImage[]): Promise<DishPhotoAnalysis> {
  if (images.length === 0) {
    throw new Error("At least one image is required");
  }

  const client = getClaudeClient();
  const response = await client.messages.create({
    model: getClaudeModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...images.map(
            (image): Anthropic.Messages.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            }),
          ),
          { type: "text", text: "Распознай блюдо/продукт на этом фото и оцени вес порций." },
        ],
      },
    ],
  });

  const parsed = responseSchema.parse(extractJson(response.content));

  return {
    title: parsed.dish_title ?? null,
    meal: {
      items: parsed.items.map((item) => ({
        searchTerm: item.search_term,
        quantityGrams: item.quantity_grams,
        state: item.state,
      })),
    },
  };
}
