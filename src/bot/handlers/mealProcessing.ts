import type { Context } from "telegraf";
import type { MealSource, User } from "@prisma/client";
import { parseMealFromText } from "../../services/llm/parseMealFromText.js";
import { NutritionResolver } from "../../services/nutrition/nutritionResolver.js";
import { calculateMealTotals, calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { saveMealEntry, getTodayTotals } from "../../db/repositories/mealRepository.js";
import { logger } from "../../utils/logger.js";
import { formatDailyRemaining, formatMealSummary } from "../formatters.js";

const resolver = new NutritionResolver();

/**
 * Общий хвост конвейера "текст о приёме пищи -> точное КБЖУ", используемый
 * и голосовым, и текстовым обработчиком (после голоса текст уже получен
 * транскрибацией Whisper, для обычного текстового сообщения это сам текст
 * пользователя). Здесь и Claude-парсинг, и программный пересчёт, и сохранение,
 * и формирование ответа — один путь для обоих источников ввода.
 */
export async function processMealTranscript(
  ctx: Context,
  user: User,
  transcript: string,
  source: MealSource,
): Promise<void> {
  const parsedMeal = await parseMealFromText(transcript);
  if (parsedMeal.items.length === 0) {
    await ctx.reply("Не смог найти в сообщении конкретные продукты. Попробуй сформулировать иначе.");
    return;
  }

  const calculatedItems = await resolver.resolveMeal(parsedMeal.items);
  const mealTotals = calculateMealTotals(calculatedItems);

  await saveMealEntry({
    userId: user.id,
    source,
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
}

export function logMealProcessingError(err: unknown, user: User, stage: string): void {
  logger.error({ err, userId: user.id.toString(), stage }, "Failed to process meal input");
}
