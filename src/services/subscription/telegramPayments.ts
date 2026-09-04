import type { SubscriptionPlan } from "@prisma/client";
import { loadEnv } from "../../config/env.js";

export interface PlanDefinition {
  plan: SubscriptionPlan;
  title: string;
  description: string;
  amountMinorUnits: number; // цена в копейках/минимальных единицах валюты (игнорируется для Stars)
}

/** Цены планов подписки, читаются из env (см. .env.example). */
export function getPlanDefinitions(): PlanDefinition[] {
  const env = loadEnv();
  return [
    {
      plan: "MONTH",
      title: "Подписка на 1 месяц",
      description: "Безлимитный учёт КБЖУ по голосу и генерация меню по фото холодильника на 30 дней",
      amountMinorUnits: env.PRICE_MONTH,
    },
    {
      plan: "QUARTER",
      title: "Подписка на 3 месяца",
      description: "Безлимитный учёт КБЖУ по голосу и генерация меню по фото холодильника на 90 дней",
      amountMinorUnits: env.PRICE_QUARTER,
    },
    {
      plan: "YEAR",
      title: "Подписка на 1 год",
      description: "Безлимитный учёт КБЖУ по голосу и генерация меню по фото холодильника на 365 дней",
      amountMinorUnits: env.PRICE_YEAR,
    },
  ];
}

export function buildInvoicePayload(userId: bigint, plan: SubscriptionPlan): string {
  return `sub:${plan}:${userId}:${Date.now()}`;
}

export function parseInvoicePayload(payload: string): { plan: SubscriptionPlan; userId: bigint } | null {
  const parts = payload.split(":");
  if (parts.length < 3 || parts[0] !== "sub") return null;
  const plan = parts[1] as SubscriptionPlan;
  if (!["MONTH", "QUARTER", "YEAR"].includes(plan)) return null;
  try {
    return { plan, userId: BigInt(parts[2] ?? "") };
  } catch {
    return null;
  }
}

/**
 * Формирует параметры инвойса для Telegraf `sendInvoice`. Поддерживает как
 * фиатную оплату через провайдера (YooKassa/CloudPayments — provider_token
 * из BotFather), так и оплату Telegram Stars (валюта "XTR", provider_token
 * не требуется).
 */
export function buildInvoiceParams(userId: bigint, planDef: PlanDefinition) {
  const env = loadEnv();
  const payload = buildInvoicePayload(userId, planDef.plan);

  if (env.USE_TELEGRAM_STARS) {
    return {
      title: planDef.title,
      description: planDef.description,
      payload,
      provider_token: "", // не требуется для Stars
      currency: "XTR",
      prices: [{ label: planDef.title, amount: Math.max(1, Math.round(planDef.amountMinorUnits / 100)) }],
    };
  }

  return {
    title: planDef.title,
    description: planDef.description,
    payload,
    provider_token: env.TELEGRAM_PAYMENTS_PROVIDER_TOKEN,
    currency: env.CURRENCY,
    prices: [{ label: planDef.title, amount: planDef.amountMinorUnits }],
  };
}
