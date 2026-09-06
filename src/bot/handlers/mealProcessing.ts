import type { Context } from "telegraf";
import type { MealSource, User } from "@prisma/client";
import { parseMealFromText } from "../../services/llm/parseMealFromText.js";
import { NutritionResolver } from "../../services/nutrition/nutritionResolver.js";
import { calculateMealTotals, calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { saveMealEntry, getTodayTotals } from "../../db/repositories/mealRepository.js";
import { logger } from "../../utils/logger.js";
import { formatDailyRemaining, formatMealSummary } from "../formatters.js";
import type { ParsedMeal } from "../../types/nutrition.js";

const resolver = new NutritionResolver();

/**
 * Общий хвост конвейера "распознанные ингредиенты -> точное КБЖУ", используемый
 * голосовым, текстовым и фото-обработчиками независимо от того, как именно
 * ингредиенты были извлечены (Whisper+Claude, просто текст, или Claude Vision
 * по фото блюда). Здесь и поиск нутриентов, и программный пересчёт на вес,
 * и сохранение, и формирование ответа — один путь для всех источников ввода.
 */
export async function processParsedMeal(
  ctx: Context,
  user: User,
  parsedMeal: ParsedMeal,
  source: MealSource,
  rawTranscript?: string,
): Promise<void> {
  if (parsedMeal.items.length === 0) {
    await ctx.reply("Не смог найти конкретные продукты. Попробуй сформулировать иначе или прислать более чёткое фото.");
    return;
  }

  const calculatedItems = await resolver.resolveMeal(parsedMeal.items);
  const mealTotals = calculateMealTotals(calculatedItems);

  await saveMealEntry({
    userId: user.id,
    source,
    rawTranscript,
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

/** Голосовой/текстовый ввод: сначала Claude разбирает фразу на ингредиенты, дальше — общий конвейер. */
export async function processMealTranscript(
  ctx: Context,
  user: User,
  transcript: string,
  source: MealSource,
): Promise<void> {
  const parsedMeal = await parseMealFromText(transcript);
  await processParsedMeal(ctx, user, parsedMeal, source, transcript);
}

export function logMealProcessingError(err: unknown, user: User, stage: string): void {
  logger.error({ err, userId: user.id.toString(), stage }, "Failed to process meal input");
}
