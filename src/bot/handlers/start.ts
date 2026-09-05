import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { beginOnboarding } from "./onboarding.js";

export async function handleStartCommand(ctx: Context, user: User): Promise<void> {
  if (user.onboardingCompleted) {
    await ctx.reply(
      "С возвращением! Отправь голосовое или текстовое сообщение о своём приёме пищи, или фото холодильника, " +
        "чтобы получить меню.\n\nКоманды: /today — итоги за день, /profile — профиль, " +
        "/recipes — сохранённые рецепты, /subscribe — подписка.",
    );
    return;
  }

  await ctx.reply(
    "Привет! Я помогу точно считать КБЖУ по голосовым сообщениям и подскажу, что приготовить " +
      "из содержимого твоего холодильника.",
  );
  await beginOnboarding(ctx, user.id);
}
