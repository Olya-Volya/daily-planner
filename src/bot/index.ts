import { Telegraf } from "telegraf";
import { loadEnv } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { findOrCreateUser } from "../db/repositories/userRepository.js";
import { handleStartCommand } from "./handlers/start.js";
import { handleProfileCommand, handleTodayCommand } from "./handlers/summary.js";
import { handleVoiceMessage } from "./handlers/voice.js";
import { handlePhotoMessage } from "./handlers/photo.js";
import {
  handlePlanSelection,
  handlePreCheckoutQuery,
  handleSubscribeCommand,
  handleSuccessfulPayment,
} from "./handlers/subscription.js";
import { cancelOnboarding, handleOnboardingCallback, handleOnboardingText } from "./handlers/onboarding.js";
import { handleTextMeal } from "./handlers/text.js";
import { handleDeleteItemCallback, isDeleteItemCallback, sendTodayItemsList } from "./handlers/editItems.js";
import { ensureAccessOrPaywall } from "./middlewares/subscriptionGuard.js";
import type { SubscriptionPlan } from "@prisma/client";

/**
 * Регистрирует список команд в Telegram (кнопка "/" / значок меню рядом с
 * полем ввода) — так пользователю не нужно запоминать команды наизусть:
 * Telegram сам покажет список с описаниями и подставит автодополнение при
 * наборе "/". Достаточно вызвать один раз при старте — Telegram сохраняет
 * список на своей стороне.
 */
export async function registerBotCommands(bot: Telegraf): Promise<void> {
  await bot.telegram.setMyCommands([
    { command: "start", description: "Начать / анкета профиля" },
    { command: "today", description: "Итоги КБЖУ за сегодня" },
    { command: "remove", description: "Убрать что-то из съеденного сегодня" },
    { command: "profile", description: "Профиль и суточная норма" },
    { command: "subscribe", description: "Подписка" },
    { command: "cancel", description: "Прервать анкету" },
  ]);
}

export function createBot(): Telegraf {
  const env = loadEnv();
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  // Гарантируем, что запись пользователя существует и доступна во всех обработчиках.
  bot.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from) return next();

    const user = await findOrCreateUser({
      id: BigInt(from.id),
      telegramUsername: from.username,
      firstName: from.first_name,
      languageCode: from.language_code,
    });
    (ctx as typeof ctx & { dbUser: typeof user }).dbUser = user;
    return next();
  });

  bot.command("start", async (ctx) => {
    const user = (ctx as any).dbUser;
    await handleStartCommand(ctx, user);
  });

  bot.command("today", async (ctx) => {
    await handleTodayCommand(ctx, (ctx as any).dbUser);
  });

  bot.command("remove", async (ctx) => {
    await sendTodayItemsList(ctx, (ctx as any).dbUser);
  });

  bot.command("profile", async (ctx) => {
    await handleProfileCommand(ctx, (ctx as any).dbUser);
  });

  bot.command("subscribe", async (ctx) => {
    await handleSubscribeCommand(ctx);
  });

  bot.command("cancel", async (ctx) => {
    const user = (ctx as any).dbUser;
    const handled = await cancelOnboarding(ctx, user.id);
    if (!handled) {
      await ctx.reply("Нечего отменять.");
    }
  });

  bot.on("callback_query", async (ctx) => {
    const query = ctx.callbackQuery;
    if (!query || !("data" in query) || !query.data) return;
    const user = (ctx as any).dbUser;
    const data = query.data as string;

    if (data.startsWith("subscribe:")) {
      const plan = data.split(":")[1] as SubscriptionPlan;
      await handlePlanSelection(ctx, user.id, plan);
      return;
    }

    if (isDeleteItemCallback(data)) {
      await handleDeleteItemCallback(ctx, user, data);
      return;
    }

    const handled = await handleOnboardingCallback(ctx, user.id, data);
    if (!handled) {
      await ctx.answerCbQuery();
    }
  });

  bot.on("pre_checkout_query", async (ctx) => {
    await handlePreCheckoutQuery(ctx);
  });

  bot.on("message", async (ctx, next) => {
    const message = ctx.message;
    const user = (ctx as any).dbUser;

    if (message && "successful_payment" in message) {
      await handleSuccessfulPayment(ctx, user.id);
      return;
    }

    if (message && "voice" in message) {
      const allowed = await ensureAccessOrPaywall(ctx, user);
      if (!allowed) return;
      await handleVoiceMessage(ctx, user);
      return;
    }

    if (message && "photo" in message) {
      const allowed = await ensureAccessOrPaywall(ctx, user);
      if (!allowed) return;
      await handlePhotoMessage(ctx, user);
      return;
    }

    if (message && "text" in message && !message.text.startsWith("/")) {
      const handled = await handleOnboardingText(ctx, user.id, message.text);
      if (handled) return;

      const allowed = await ensureAccessOrPaywall(ctx, user);
      if (!allowed) return;
      await handleTextMeal(ctx, user, message.text);
      return;
    }

    return next();
  });

  bot.catch((err, ctx) => {
    logger.error({ err, updateType: ctx.updateType }, "Unhandled bot error");
  });

  return bot;
}
