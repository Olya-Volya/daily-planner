import { describe, expect, it } from "vitest";
import { checkAccess } from "../src/services/subscription/accessControl.js";

const TRIAL_DAYS = 3;
const TRIAL_MAX_RECOGNITIONS = 10;

describe("checkAccess", () => {
  it("allows access with an active subscription regardless of trial state", () => {
    const result = checkAccess(
      { trialStartedAt: new Date("2020-01-01"), trialRecognitionsUsed: 999 },
      true,
      TRIAL_DAYS,
      TRIAL_MAX_RECOGNITIONS,
    );
    expect(result).toEqual({ allowed: true, reason: "subscription_active" });
  });

  it("allows access during an active trial", () => {
    const now = new Date("2026-01-04T00:00:00Z");
    const result = checkAccess(
      { trialStartedAt: new Date("2026-01-03T00:00:00Z"), trialRecognitionsUsed: 2 },
      false,
      TRIAL_DAYS,
      TRIAL_MAX_RECOGNITIONS,
      now,
    );
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("trial_active");
    expect(result.trialDaysLeft).toBe(2);
    expect(result.trialRecognitionsLeft).toBe(8);
  });

  it("blocks access once trial days are exhausted", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    const result = checkAccess(
      { trialStartedAt: new Date("2026-01-01T00:00:00Z"), trialRecognitionsUsed: 1 },
      false,
      TRIAL_DAYS,
      TRIAL_MAX_RECOGNITIONS,
      now,
    );
    expect(result).toEqual({
      allowed: false,
      reason: "trial_expired_by_days",
      trialDaysLeft: 0,
      trialRecognitionsLeft: 9,
    });
  });

  it("blocks access once trial recognitions are exhausted, even within the day window", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    const result = checkAccess(
      { trialStartedAt: new Date("2026-01-01T00:00:00Z"), trialRecognitionsUsed: 10 },
      false,
      TRIAL_DAYS,
      TRIAL_MAX_RECOGNITIONS,
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("trial_expired_by_count");
    expect(result.trialRecognitionsLeft).toBe(0);
  });
});
