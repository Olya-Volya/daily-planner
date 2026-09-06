import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { loadEnv } from "../../config/env.js";
import { checkAccess } from "../../services/subscription/accessControl.js";
import { getActiveSubscription } from "../../db/repositories/subscriptionRepository.js";
import { incrementTrialRecognitions } from "../../db/repositories/userRepository.js";
import { subscriptionPlansKeyboard } from "../keyboards.js";

/**
 * Проверяет доступ к платной функции (голос/фото) перед её выполнением.
 * Если доступ есть — увеличивает счётчик использованных распознаваний триала
 * (если подписки ещё нет) и возвращает true. Иначе показывает пейволл и false.
 *
 * Пока PAYWALL_ENABLED=false (см. src/config/env.ts) — доступ открыт всем без
 * ограничений, счётчик триала не расходуется. Вся остальная инфраструктура
 * подписок при этом продолжает работать как обычно.
 */
export async function ensureAccessOrPaywall(ctx: Context, user: User): Promise<boolean> {
  const env = loadEnv();
  if (!env.PAYWALL_ENABLED) return true;

  const subscription = await getActiveSubscription(user.id);

  const access = checkAccess(
    { trialStartedAt: user.trialStartedAt, trialRecognitionsUsed: user.trialRecognitionsUsed },
    Boolean(subscription),
    env.TRIAL_DAYS,
    env.TRIAL_MAX_RECOGNITIONS,
  );

  if (!access.allowed) {
    await ctx.reply(
      "Пробный период закончился 😔\n\n" +
        "Оформи подписку, чтобы продолжить пользоваться распознаванием КБЖУ по голосу, тексту и фото:",
      subscriptionPlansKeyboard(),
    );
    return false;
  }

  if (access.reason === "trial_active") {
    await incrementTrialRecognitions(user.id);
  }

  return true;
}
