import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { logMealProcessingError, processMealTranscript } from "./mealProcessing.js";

/**
 * Помимо голосовых сообщений, пользователь может просто написать текстом,
 * что он съел ("съела 2 яйца и тост с маслом") — это переиспользует тот же
 * конвейер парсинга и точного расчёта КБЖУ, что и голосовой ввод, минуя
 * только шаг транскрибации Whisper.
 */
export async function handleTextMeal(ctx: Context, user: User, text: string): Promise<void> {
  const statusMessage = await ctx.reply("Считаю КБЖУ...");

  try {
    await processMealTranscript(ctx, user, text, "TEXT");
  } catch (err) {
    logMealProcessingError(err, user, "text");
    await ctx.reply("Произошла ошибка при разборе сообщения. Попробуй сформулировать иначе.");
  } finally {
    await ctx.telegram
      .deleteMessage(ctx.chat!.id, statusMessage.message_id)
      .catch(() => undefined);
  }
}
