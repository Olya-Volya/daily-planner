import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { analyzeDishPhoto, type DishImage } from "../../services/llm/analyzeDishPhoto.js";
import { logMealProcessingError, processParsedMeal } from "./mealProcessing.js";

// Пользователь может прислать несколько фото одного блюда одним альбомом
// (одинаковый media_group_id, например ракурсы одной тарелки). Telegram
// доставляет их отдельными апдейтами, поэтому собираем в буфер и разбираем
// все вместе с небольшим дебаунсом.
const MEDIA_GROUP_DEBOUNCE_MS = 1500;
interface PendingGroup {
  images: DishImage[];
  ctx: Context;
  user: User;
  timer: ReturnType<typeof setTimeout>;
}
const pendingGroups = new Map<string, PendingGroup>();

export async function handlePhotoMessage(ctx: Context, user: User): Promise<void> {
  const message = ctx.message;
  if (!message || !("photo" in message) || !message.photo || message.photo.length === 0) return;

  const largestPhoto = message.photo[message.photo.length - 1];
  if (!largestPhoto) return;

  const fileLink = await ctx.telegram.getFileLink(largestPhoto.file_id);
  const response = await fetch(fileLink.toString());
  const buffer = Buffer.from(await response.arrayBuffer());
  const image: DishImage = { base64: buffer.toString("base64"), mediaType: "image/jpeg" };

  const mediaGroupId = "media_group_id" in message ? (message.media_group_id as string | undefined) : undefined;

  if (!mediaGroupId) {
    await processDishPhotos(ctx, user, [image]);
    return;
  }

  const existing = pendingGroups.get(mediaGroupId);
  if (existing) {
    existing.images.push(image);
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => finalizeGroup(mediaGroupId), MEDIA_GROUP_DEBOUNCE_MS);
    return;
  }

  const timer = setTimeout(() => finalizeGroup(mediaGroupId), MEDIA_GROUP_DEBOUNCE_MS);
  pendingGroups.set(mediaGroupId, { images: [image], ctx, user, timer });
}

function finalizeGroup(mediaGroupId: string): void {
  const group = pendingGroups.get(mediaGroupId);
  if (!group) return;
  pendingGroups.delete(mediaGroupId);
  void processDishPhotos(group.ctx, group.user, group.images);
}

/**
 * Распознавание КБЖУ блюда/продукта по фото: Claude Vision определяет состав
 * и вес порций (по визуальным ориентирам), дальше — тот же конвейер точного
 * расчёта, что и для голоса/текста (NutritionResolver + nutrientCalculator).
 */
async function processDishPhotos(ctx: Context, user: User, images: DishImage[]): Promise<void> {
  const statusMessage = await ctx.reply("📸 Распознаю блюдо на фото...");

  try {
    const analysis = await analyzeDishPhoto(images);

    if (analysis.meal.items.length === 0) {
      await ctx.reply("Не удалось распознать еду на фото. Попробуй сфотографировать блюдо чётче и ближе.");
      return;
    }

    await ctx.telegram
      .editMessageText(
        ctx.chat!.id,
        statusMessage.message_id,
        undefined,
        `📝 Похоже на: ${analysis.title ?? "блюдо с фото"}\n\nСчитаю КБЖУ...`,
      )
      .catch(() => undefined);

    await processParsedMeal(ctx, user, analysis.meal, "PHOTO", analysis.title ?? undefined);
    await ctx.reply("⚠️ Вес порций на фото оценён приблизительно — для точного учёта используй голосовой/текстовый ввод.");
  } catch (err) {
    logMealProcessingError(err, user, "photo");
    await ctx.reply("Произошла ошибка при анализе фото. Попробуй ещё раз чуть позже.");
  }
}
