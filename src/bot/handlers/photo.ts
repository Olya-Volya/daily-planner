import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { MenuService } from "../../services/menu/menuService.js";
import { calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { getTodayTotals } from "../../db/repositories/mealRepository.js";
import { logger } from "../../utils/logger.js";
import type { FridgeImage } from "../../services/llm/analyzeFridgePhoto.js";

const menuService = new MenuService();

// Пользователь может прислать несколько фото холодильника одним альбомом
// (одинаковый media_group_id). Telegram доставляет их отдельными апдейтами,
// поэтому собираем их в буфер и обрабатываем все вместе с небольшим дебаунсом.
const MEDIA_GROUP_DEBOUNCE_MS = 1500;
interface PendingGroup {
  images: FridgeImage[];
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
  const image: FridgeImage = { base64: buffer.toString("base64"), mediaType: "image/jpeg" };

  const mediaGroupId = "media_group_id" in message ? (message.media_group_id as string | undefined) : undefined;

  if (!mediaGroupId) {
    await processFridgePhotos(ctx, user, [image]);
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
  void processFridgePhotos(group.ctx, group.user, group.images);
}

async function processFridgePhotos(ctx: Context, user: User, images: FridgeImage[]): Promise<void> {
  const statusMessage = await ctx.reply("🧊 Анализирую содержимое холодильника...");

  try {
    const todayTotals = await getTodayTotals(user.id);
    const remainingBudget = calculateRemainingBudget({
      target: {
        calories: user.dailyCalorieTarget ?? 2000,
        proteinG: user.dailyProteinTargetG ?? 100,
        fatG: user.dailyFatTargetG ?? 60,
        carbsG: user.dailyCarbTargetG ?? 200,
      },
      consumed: todayTotals,
    });

    const recipes = await menuService.generateMenuFromFridgePhoto(images, remainingBudget);

    if (recipes.length === 0) {
      await ctx.reply("Не удалось предложить блюда по этому фото. Попробуй сфотографировать продукты чётче.");
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      undefined,
      `Нашёл ${recipes.length} вариант(а) блюда. Отправляю рецепты...`,
    );

    for (const recipe of recipes) {
      const ingredientLines = recipe.items
        .map((i) => `  • ${i.matchedName} — ${i.quantityGrams} г`)
        .join("\n");
      const stepLines = recipe.steps.map((s, idx) => `${idx + 1}. ${s}`).join("\n");

      const text = [
        `🍳 ${recipe.title}`,
        "",
        "Ингредиенты:",
        ingredientLines,
        "",
        "Приготовление:",
        stepLines,
        "",
        `КБЖУ блюда: ${recipe.totals.calories} ккал, ` +
          `Б${recipe.totals.proteinG}/Ж${recipe.totals.fatG}/У${recipe.totals.carbsG} г`,
      ].join("\n");

      await ctx.reply(text);
    }
  } catch (err) {
    logger.error({ err, userId: user.id.toString() }, "Failed to process fridge photo(s)");
    await ctx.reply("Произошла ошибка при анализе фото. Попробуй ещё раз чуть позже.");
  }
}
