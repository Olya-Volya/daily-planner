import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { beginOnboarding } from "./onboarding.js";

export async function handleStartCommand(ctx: Context, user: User): Promise<void> {
  if (user.onboardingCompleted) {
    await ctx.reply(
      "С возвращением! Отправь голосовое или текстовое сообщение о своём приёме пищи, или фото блюда/продукта — " +
        "посчитаю КБЖУ.\n\nКоманды: /today — итоги за день, /profile — профиль, /subscribe — подписка.",
    );
    return;
  }

  await ctx.reply(
    "Привет! Я помогу точно считать КБЖУ по голосовым сообщениям, тексту или фото того, что ты ешь.",
  );
  await beginOnboarding(ctx, user.id);
}
