import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { transcribeVoiceMessage } from "../../services/stt/whisperService.js";
import { parseMealFromText } from "../../services/llm/parseMealFromText.js";
import { NutritionResolver } from "../../services/nutrition/nutritionResolver.js";
import { calculateMealTotals, calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { saveMealEntry, getTodayTotals } from "../../db/repositories/mealRepository.js";
import { logger } from "../../utils/logger.js";
import { formatMealSummary, formatDailyRemaining } from "../formatters.js";

const resolver = new NutritionResolver();

export async function handleVoiceMessage(ctx: Context, user: User): Promise<void> {
  const message = ctx.message;
  if (!message || !("voice" in message) || !message.voice) return;

  const statusMessage = await ctx.reply("🎙 Распознаю голосовое сообщение...");

  try {
    const fileLink = await ctx.telegram.getFileLink(message.voice.file_id);
    const response = await fetch(fileLink.toString());
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    const transcript = await transcribeVoiceMessage(audioBuffer, "voice.oga");
    logger.info({ userId: user.id.toString(), transcript }, "Voice transcribed");

    if (!transcript) {
      await ctx.reply("Не удалось распознать речь, попробуй ещё раз.");
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      undefined,
      `📝 Распознано: «${transcript}»\n\nСчитаю КБЖУ...`,
    );

    const parsedMeal = await parseMealFromText(transcript);
    if (parsedMeal.items.length === 0) {
      await ctx.reply("Не смог найти в сообщении конкретные продукты. Попробуй сформулировать иначе.");
      return;
    }

    const calculatedItems = await resolver.resolveMeal(parsedMeal.items);
    const mealTotals = calculateMealTotals(calculatedItems);

    await saveMealEntry({
      userId: user.id,
      source: "VOICE",
      rawTranscript: transcript,
      items: calculatedItems,
    });

    const todayTotals = await getTodayTotals(user.id);

    let reply = formatMealSummary(calculatedItems, mealTotals);

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
      reply += "\n\n" + formatDailyRemaining(todayTotals, remaining);
    }

    await ctx.reply(reply);
  } catch (err) {
    logger.error({ err, userId: user.id.toString() }, "Failed to process voice message");
    await ctx.reply("Произошла ошибка при обработке голосового сообщения. Попробуй ещё раз чуть позже.");
  }
}
