import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { getTodayTotals } from "../../db/repositories/mealRepository.js";
import { calculateRemainingBudget } from "../../services/calculation/nutrientCalculator.js";
import { formatDailyRemaining } from "../formatters.js";

export async function handleTodayCommand(ctx: Context, user: User): Promise<void> {
  const todayTotals = await getTodayTotals(user.id);

  if (!user.dailyCalorieTarget) {
    await ctx.reply(
      `За сегодня: ${todayTotals.calories} ккал, Б${todayTotals.proteinG}/Ж${todayTotals.fatG}/У${todayTotals.carbsG} г\n\n` +
        "Заполни профиль (/start), чтобы видеть остаток суточной нормы.\n\n" +
        "Если что-то нужно убрать из съеденного — команда /remove.",
    );
    return;
  }

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

export async function handleProfileCommand(ctx: Context, user: User): Promise<void> {
  if (!user.onboardingCompleted) {
    await ctx.reply("Профиль ещё не заполнен. Отправь /start, чтобы пройти короткую анкету.");
    return;
  }

  await ctx.reply(
    [
      "👤 Твой профиль:",
      `Пол: ${user.gender === "MALE" ? "мужской" : "женский"}`,
      `Возраст: ${user.age}`,
      `Вес: ${user.weightKg} кг`,
      `Рост: ${user.heightCm} см`,
      `Активность: ${user.activityLevel}`,
      `Цель: ${user.goal}`,
      "",
      `Суточная норма: ${user.dailyCalorieTarget} ккал, ` +
        `Б${user.dailyProteinTargetG}/Ж${user.dailyFatTargetG}/У${user.dailyCarbTargetG} г`,
      "",
      "Чтобы пересчитать профиль заново — отправь /start ещё раз.",
    ].join("\n"),
  );
}
