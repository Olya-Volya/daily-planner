import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { extractJson, getClaudeClient, getClaudeModel } from "./claudeClient.js";

export interface FridgeImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface FridgeIngredient {
  name: string;
  estimatedQuantity: string; // например "6 шт", "~300 г", "початая пачка"
}

const SYSTEM_PROMPT = `Ты — модуль распознавания продуктов на фотографии холодильника или стола.

Внимательно посмотри на фото(-а) и перечисли ВСЕ различимые продукты питания.
Для каждого продукта укажи приблизительное количество, как оно видно на фото
(например: "6 шт", "~300 г", "начатая пачка ~500г", "1 упаковка").
Не придумывай продукты, которых не видно. Если продукт виден, но количество
оценить невозможно — укажи "количество не определено".

Ответь СТРОГО валидным JSON без markdown-обёртки и без пояснений:
{ "ingredients": [ { "name": "string", "estimated_quantity": "string" } ] }`;

const responseSchema = z.object({
  ingredients: z.array(z.object({ name: z.string().min(1), estimated_quantity: z.string() })),
});

export async function analyzeFridgePhoto(images: FridgeImage[]): Promise<FridgeIngredient[]> {
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
          { type: "text", text: "Распознай продукты на этих фотографиях." },
        ],
      },
    ],
  });

  const parsed = responseSchema.parse(extractJson(response.content));
  return parsed.ingredients.map((i) => ({ name: i.name, estimatedQuantity: i.estimated_quantity }));
}
