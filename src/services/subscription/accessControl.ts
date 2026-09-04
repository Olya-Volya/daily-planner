/**
 * Логика доступа к платным функциям: триал (3 дня ИЛИ 10 распознаваний,
 * что наступит раньше) и активная подписка. Вынесена в чистую функцию,
 * не зависящую от Prisma/Telegram, чтобы её было легко тестировать.
 */
export interface TrialState {
  trialStartedAt: Date;
  trialRecognitionsUsed: number;
}

export interface AccessCheckResult {
  allowed: boolean;
  reason?: "trial_active" | "subscription_active" | "trial_expired_by_days" | "trial_expired_by_count";
  trialDaysLeft?: number;
  trialRecognitionsLeft?: number;
}

export function checkAccess(
  trial: TrialState,
  hasActiveSubscription: boolean,
  trialDays: number,
  trialMaxRecognitions: number,
  now: Date = new Date(),
): AccessCheckResult {
  if (hasActiveSubscription) {
    return { allowed: true, reason: "subscription_active" };
  }

  const daysElapsed = (now.getTime() - trial.trialStartedAt.getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(trialDays - daysElapsed, 0);
  const recognitionsLeft = Math.max(trialMaxRecognitions - trial.trialRecognitionsUsed, 0);

  if (daysElapsed >= trialDays) {
    return { allowed: false, reason: "trial_expired_by_days", trialDaysLeft: 0, trialRecognitionsLeft: recognitionsLeft };
  }

  if (trial.trialRecognitionsUsed >= trialMaxRecognitions) {
    return {
      allowed: false,
      reason: "trial_expired_by_count",
      trialDaysLeft: Math.ceil(daysLeft),
      trialRecognitionsLeft: 0,
    };
  }

  return {
    allowed: true,
    reason: "trial_active",
    trialDaysLeft: Math.ceil(daysLeft),
    trialRecognitionsLeft: recognitionsLeft,
  };
}
