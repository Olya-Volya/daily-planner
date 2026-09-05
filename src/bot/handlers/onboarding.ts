import type { Context } from "telegraf";
import { activityKeyboard, genderKeyboard, goalKeyboard } from "../keyboards.js";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  startOnboarding,
  type OnboardingDraft,
} from "../onboardingState.js";
import { calculateDailyTargets } from "../../services/profile/bmrCalculator.js";
import { updateUser } from "../../db/repositories/userRepository.js";
import { logger } from "../../utils/logger.js";

export async function beginOnboarding(ctx: Context, userId: bigint): Promise<void> {
  startOnboarding(userId);
  await ctx.reply(
    "Давай настроим твой профиль, чтобы точно рассчитать суточную норму КБЖУ.\n\nУкажи свой пол:",
    genderKeyboard,
  );
}

export async function cancelOnboarding(ctx: Context, userId: bigint): Promise<boolean> {
  const draft = getOnboardingDraft(userId);
  if (!draft) return false;
  clearOnboardingDraft(userId);
  await ctx.reply("Анкета отменена. Отправь /start, когда будешь готов(а) пройти её заново.");
  return true;
}

/** Обрабатывает нажатия инлайн-кнопок (пол/активность/цель) в рамках онбординга. */
export async function handleOnboardingCallback(ctx: Context, userId: bigint, data: string): Promise<boolean> {
  const draft = getOnboardingDraft(userId);
  if (!draft) return false;

  const [kind, value] = data.split(":");

  if (kind === "gender" && draft.step === "gender") {
    draft.gender = value as OnboardingDraft["gender"];
    draft.step = "age";
    await ctx.answerCbQuery();
    await ctx.reply("Сколько тебе полных лет?");
    return true;
  }

  if (kind === "activity" && draft.step === "activity") {
    draft.activityLevel = value as OnboardingDraft["activityLevel"];
    draft.step = "goal";
    await ctx.answerCbQuery();
    await ctx.reply("Какая у тебя цель?", goalKeyboard);
    return true;
  }

  if (kind === "goal" && draft.step === "goal") {
    draft.goal = value as OnboardingDraft["goal"];
    draft.step = "done";
    await ctx.answerCbQuery();
    await finishOnboarding(ctx, userId, draft);
    return true;
  }

  return false;
}

/** Обрабатывает текстовые ответы (возраст/вес/рост) в рамках онбординга. Возвращает true, если сообщение было "съедено" онбордингом. */
export async function handleOnboardingText(ctx: Context, userId: bigint, text: string): Promise<boolean> {
  const draft = getOnboardingDraft(userId);
  if (!draft) return false;

  const number = Number(text.replace(",", ".").trim());

  if (draft.step === "age") {
    if (!Number.isFinite(number) || number < 10 || number > 100) {
      await ctx.reply("Пожалуйста, укажи возраст числом от 10 до 100.");
      return true;
    }
    draft.age = Math.round(number);
    draft.step = "weight";
    await ctx.reply("Какой у тебя вес в кг?");
    return true;
  }

  if (draft.step === "weight") {
    if (!Number.isFinite(number) || number < 30 || number > 300) {
      await ctx.reply("Пожалуйста, укажи вес числом в кг (от 30 до 300).");
      return true;
    }
    draft.weightKg = number;
    draft.step = "height";
    await ctx.reply("Какой у тебя рост в см?");
    return true;
  }

  if (draft.step === "height") {
    if (!Number.isFinite(number) || number < 100 || number > 250) {
      await ctx.reply("Пожалуйста, укажи рост числом в см (от 100 до 250).");
      return true;
    }
    draft.heightCm = number;
    draft.step = "activity";
    await ctx.reply("Какой у тебя уровень активности?", activityKeyboard);
    return true;
  }

  return false;
}

async function finishOnboarding(ctx: Context, userId: bigint, draft: OnboardingDraft): Promise<void> {
  if (!draft.gender || !draft.age || !draft.weightKg || !draft.heightCm || !draft.activityLevel || !draft.goal) {
    logger.error({ userId, draft }, "Onboarding finished with incomplete draft");
    await ctx.reply("Что-то пошло не так, начни заново командой /start");
    clearOnboardingDraft(userId);
    return;
  }

  const targets = calculateDailyTargets({
    gender: draft.gender,
    age: draft.age,
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    activityLevel: draft.activityLevel,
    goal: draft.goal,
  });

  await updateUser(userId, {
    gender: draft.gender,
    age: draft.age,
    weightKg: draft.weightKg,
    heightCm: draft.heightCm,
    activityLevel: draft.activityLevel,
    goal: draft.goal,
    dailyCalorieTarget: targets.calories,
    dailyProteinTargetG: targets.proteinG,
    dailyFatTargetG: targets.fatG,
    dailyCarbTargetG: targets.carbsG,
    onboardingCompleted: true,
    onboardingStep: null,
  });

  clearOnboardingDraft(userId);

  await ctx.reply(
    [
      "Готово! Твоя суточная норма:",
      `🔥 Калории: ${targets.calories} ккал`,
      `🥩 Белки: ${targets.proteinG} г`,
      `🥑 Жиры: ${targets.fatG} г`,
      `🍞 Углеводы: ${targets.carbsG} г`,
      "",
      "Теперь просто отправь мне голосовое или текстовое сообщение о том, что ты съел(а), " +
        "или фото содержимого холодильника — и я предложу меню и посчитаю КБЖУ.",
    ].join("\n"),
  );
}
