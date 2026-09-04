import type { Context } from "telegraf";
import type { SubscriptionPlan } from "@prisma/client";
import { subscriptionPlansKeyboard } from "../keyboards.js";
import { buildInvoiceParams, getPlanDefinitions, parseInvoicePayload } from "../../services/subscription/telegramPayments.js";
import { activateSubscription, recordPayment } from "../../db/repositories/subscriptionRepository.js";
import { loadEnv } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

export async function handleSubscribeCommand(ctx: Context): Promise<void> {
  await ctx.reply("Выбери план подписки:", subscriptionPlansKeyboard());
}

export async function handlePlanSelection(ctx: Context, userId: bigint, plan: SubscriptionPlan): Promise<void> {
  const planDef = getPlanDefinitions().find((p) => p.plan === plan);
  if (!planDef) {
    await ctx.answerCbQuery("Неизвестный план");
    return;
  }
  await ctx.answerCbQuery();
  const invoiceParams = buildInvoiceParams(userId, planDef);
  await ctx.replyWithInvoice(invoiceParams);
}

/** Telegram обязательно требует ответить на pre_checkout_query в течение 10 секунд. */
export async function handlePreCheckoutQuery(ctx: Context): Promise<void> {
  const query = ctx.preCheckoutQuery;
  if (!query) return;

  const parsed = parseInvoicePayload(query.invoice_payload);
  if (!parsed) {
    await ctx.answerPreCheckoutQuery(false, "Некорректный заказ, попробуй оформить подписку заново.");
    return;
  }

  await ctx.answerPreCheckoutQuery(true);
}

export async function handleSuccessfulPayment(ctx: Context, userId: bigint): Promise<void> {
  const message = ctx.message;
  if (!message || !("successful_payment" in message)) return;
  const payment = message.successful_payment;

  const parsed = parseInvoicePayload(payment.invoice_payload);
  if (!parsed) {
    logger.error({ userId: userId.toString(), payload: payment.invoice_payload }, "Could not parse invoice payload");
    await ctx.reply("Оплата получена, но не удалось активировать подписку автоматически. Напиши в поддержку.");
    return;
  }

  const subscription = await activateSubscription(userId, parsed.plan);
  const env = loadEnv();
  await recordPayment({
    userId,
    subscriptionId: subscription.id,
    plan: parsed.plan,
    provider: env.USE_TELEGRAM_STARS ? "TELEGRAM_STARS" : "YOOKASSA",
    amount: payment.total_amount,
    currency: payment.currency,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
    invoicePayload: payment.invoice_payload,
  });

  await ctx.reply("✅ Подписка активирована! Теперь тебе доступны все функции бота без ограничений.");
}
