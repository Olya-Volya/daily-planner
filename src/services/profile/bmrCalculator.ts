import type { NutrientsPer100g } from "../../types/nutrition.js";

export type Gender = "MALE" | "FEMALE";
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "HIGH" | "VERY_HIGH";
export type Goal = "LOSE" | "MAINTAIN" | "GAIN";

export interface ProfileInput {
  gender: Gender;
  age: number;
  weightKg: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface DailyTargets {
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** Множители активности для формулы Харриса-Бенедикта/Миффлина-Сан Жеора. */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  HIGH: 1.725,
  VERY_HIGH: 1.9,
};

/** Коррекция калорийности относительно TDEE в зависимости от цели. */
const GOAL_CALORIE_ADJUSTMENT: Record<Goal, number> = {
  LOSE: -0.18, // дефицит ~18%
  MAINTAIN: 0,
  GAIN: 0.12, // профицит ~12%
};

/** г белка на кг веса тела в зависимости от цели. */
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  LOSE: 2.0, // повышенный белок при дефиците — сохранение мышечной массы
  MAINTAIN: 1.6,
  GAIN: 1.8,
};

/** Доля калорийности, приходящаяся на жиры. */
const FAT_SHARE_OF_CALORIES = 0.28;

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_CARBS = 4;

function round(value: number): number {
  return Math.round(value);
}

/** Базовый обмен веществ по формуле Миффлина-Сан Жеора. */
export function calculateBMR(input: Pick<ProfileInput, "gender" | "age" | "weightKg" | "heightCm">): number {
  const { gender, age, weightKg, heightCm } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return gender === "MALE" ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activityLevel];
}

/**
 * Полный расчёт суточной нормы КБЖУ: BMR -> TDEE -> коррекция по цели -> БЖУ.
 * Белок и жир считаются от массы тела/калорийности, углеводы — по остатку.
 */
export function calculateDailyTargets(input: ProfileInput): DailyTargets {
  const bmr = calculateBMR(input);
  const tdee = calculateTDEE(bmr, input.activityLevel);
  const calories = tdee * (1 + GOAL_CALORIE_ADJUSTMENT[input.goal]);

  const proteinG = PROTEIN_G_PER_KG[input.goal] * input.weightKg;
  const fatKcal = calories * FAT_SHARE_OF_CALORIES;
  const fatG = fatKcal / KCAL_PER_G_FAT;

  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const remainingKcalForCarbs = Math.max(calories - proteinKcal - fatKcal, 0);
  const carbsG = remainingKcalForCarbs / KCAL_PER_G_CARBS;

  return {
    bmr: round(bmr),
    tdee: round(tdee),
    calories: round(calories),
    proteinG: round(proteinG),
    fatG: round(fatG),
    carbsG: round(carbsG),
  };
}

export function dailyTargetsToNutrients(targets: DailyTargets): NutrientsPer100g {
  return {
    calories: targets.calories,
    proteinG: targets.proteinG,
    fatG: targets.fatG,
    carbsG: targets.carbsG,
  };
}
