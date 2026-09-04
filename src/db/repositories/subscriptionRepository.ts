import type { SubscriptionPlan } from "@prisma/client";
import { getPrismaClient } from "../prismaClient.js";

export async function getActiveSubscription(userId: bigint) {
  const prisma = getPrismaClient();
  return prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
  });
}

const PLAN_DURATION_DAYS: Record<SubscriptionPlan, number> = {
  MONTH: 30,
  QUARTER: 90,
  YEAR: 365,
};

export async function activateSubscription(userId: bigint, plan: SubscriptionPlan) {
  const prisma = getPrismaClient();
  const now = new Date();
  const durationDays = PLAN_DURATION_DAYS[plan];
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return prisma.subscription.create({
    data: { userId, plan, status: "ACTIVE", startedAt: now, expiresAt },
  });
}

export async function recordPayment(params: {
  userId: bigint;
  subscriptionId: string;
  plan: SubscriptionPlan;
  provider: "YOOKASSA" | "TELEGRAM_STARS" | "CLOUDPAYMENTS";
  amount: number;
  currency: string;
  telegramPaymentChargeId: string;
  invoicePayload: string;
}) {
  const prisma = getPrismaClient();
  return prisma.payment.create({
    data: { ...params, status: "SUCCEEDED" },
  });
}
