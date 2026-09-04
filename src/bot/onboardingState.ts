import type { ActivityLevel, Gender, Goal } from "../services/profile/bmrCalculator.js";

export type OnboardingStep = "gender" | "age" | "weight" | "height" | "activity" | "goal" | "done";

export interface OnboardingDraft {
  step: OnboardingStep;
  gender?: Gender;
  age?: number;
  weightKg?: number;
  heightCm?: number;
  activityLevel?: ActivityLevel;
  goal?: Goal;
}

/**
 * Временное хранилище черновика анкеты онбординга, пока пользователь не ответит
 * на все вопросы. В продакшене стоит вынести в Redis/БД для устойчивости к
 * рестартам процесса; для объёма этого проекта достаточно in-memory Map.
 */
const drafts = new Map<bigint, OnboardingDraft>();

export function startOnboarding(userId: bigint): OnboardingDraft {
  const draft: OnboardingDraft = { step: "gender" };
  drafts.set(userId, draft);
  return draft;
}

export function getOnboardingDraft(userId: bigint): OnboardingDraft | undefined {
  return drafts.get(userId);
}

export function clearOnboardingDraft(userId: bigint): void {
  drafts.delete(userId);
}
