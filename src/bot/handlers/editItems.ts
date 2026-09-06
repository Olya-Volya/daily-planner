import { Markup, type Context } from "telegraf";
import type { User } from "@prisma/client";
import { deleteMealItemForUser, getTodayItems, getTodayTotals } from "../../db/repositories/mealRepository.js";
import { calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { fmt, formatDailyRemaining } from "../formatters.js";
import { logger } from "../../utils/logger.js";

const CALLBACK_PREFIX = "del_item:";
const MAX_LABEL_LENGTH = 45;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Отправляет список того, что съедено сегодня, с кнопкой "убрать" под каждой
 * позицией — на случай, если что-то было залогировано по ошибке или в итоге
 * не съедено (например, запланированная, но пропущенная еда).
 */
export async function sendTodayItemsList(ctx: Context, user: User): Promise<void> {
  const items = await getTodayItems(user.id);

  if (items.length === 0) {
    await ctx.reply("За сегодня пока ничего не записано.");
    return;
  }

  const buttons = items.map((item) =>
    Markup.button.callback(
      `🗑 ${truncate(item.matchedFoodName ?? item.searchTerm, MAX_LABEL_LENGTH)} — ${fmt(item.quantityGrams)}г, ${fmt(item.calories)} ккал`,
      `${CALLBACK_PREFIX}${item.id}`,
    ),
  );

  await ctx.reply(
    "Съедено сегодня — нажми на пункт, чтобы убрать его (если не съел(а) или записано по ошибке):",
    Markup.inlineKeyboard(buttons.map((b) => [b])),
  );
}

export async function handleDeleteItemCallback(ctx: Context, user: User, data: string): Promise<void> {
  const itemId = data.slice(CALLBACK_PREFIX.length);

  try {
    const deleted = await deleteMealItemForUser(user.id, itemId);
    if (!deleted) {
      await ctx.answerCbQuery("Уже удалено или не найдено");
      return;
    }
    await ctx.answerCbQuery("Убрано ✅");
  } catch (err) {
    logger.error({ err, userId: user.id.toString(), itemId }, "Failed to delete meal item");
    await ctx.answerCbQuery("Не удалось убрать, попробуй ещё раз");
    return;
  }

  // Обновляем и список (убираем удалённую строку), и сводку по дню.
  const remainingItems = await getTodayItems(user.id);
  const todayTotals = await getTodayTotals(user.id);

  if (remainingItems.length === 0) {
    await ctx.editMessageText("За сегодня пока ничего не записано.").catch(() => undefined);
  } else {
    const buttons = remainingItems.map((item) =>
      Markup.button.callback(
        `🗑 ${truncate(item.matchedFoodName ?? item.searchTerm, MAX_LABEL_LENGTH)} — ${fmt(item.quantityGrams)}г, ${fmt(item.calories)} ккал`,
        `${CALLBACK_PREFIX}${item.id}`,
      ),
    );
    await ctx
      .editMessageReplyMarkup(Markup.inlineKeyboard(buttons.map((b) => [b])).reply_markup)
      .catch(() => undefined);
  }

  if (user.dailyCalorieTarget) {
    const remaining = calculateRemainingBudget({
      target: {
        calories: user.dailyCalorieTarget,
        proteinG: user.dailyProteinTargetG ?? 0,
        fatG: user.dailyFatTargetG ?? 0,
        carbsG: user.dailyCarbTargetG ?? 0,
      },
      consumed: todayTotals,
    });
    await ctx.reply(formatDailyRemaining(todayTotals, remaining));
  }
}

export function isDeleteItemCallback(data: string): boolean {
  return data.startsWith(CALLBACK_PREFIX);
}
