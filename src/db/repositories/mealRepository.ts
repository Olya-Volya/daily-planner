import type { MealSource } from "@prisma/client";
import { getPrismaClient } from "../prismaClient.js";
import type { CalculatedMealItem, MealTotals } from "../../types/nutrition.js";

export async function saveMealEntry(params: {
  userId: bigint;
  source: MealSource;
  rawTranscript?: string;
  items: CalculatedMealItem[];
}) {
  const prisma = getPrismaClient();
  return prisma.mealEntry.create({
    data: {
      userId: params.userId,
      source: params.source,
      rawTranscript: params.rawTranscript,
      items: {
        create: params.items.map((item) => ({
          searchTerm: item.searchTerm,
          matchedFoodName: item.matchedName,
          quantityGrams: item.quantityGrams,
          state: item.state.toUpperCase() as "RAW" | "COOKED" | "UNKNOWN",
          dataSource: item.source,
          isEstimated: item.isEstimated,
          caloriesPer100g: item.per100g.calories,
          proteinPer100g: item.per100g.proteinG,
          fatPer100g: item.per100g.fatG,
          carbsPer100g: item.per100g.carbsG,
          calories: item.totals.calories,
          protein: item.totals.proteinG,
          fat: item.totals.fatG,
          carbs: item.totals.carbsG,
        })),
      },
    },
    include: { items: true },
  });
}

function startOfToday(): Date {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

/** Суммарное КБЖУ пользователя за текущие сутки (по локальному времени сервера). */
export async function getTodayTotals(userId: bigint): Promise<MealTotals> {
  const prisma = getPrismaClient();

  const items = await prisma.mealItem.findMany({
    where: { mealEntry: { userId, eatenAt: { gte: startOfToday() } } },
  });

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      proteinG: acc.proteinG + item.protein,
      fatG: acc.fatG + item.fat,
      carbsG: acc.carbsG + item.carbs,
    }),
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );

  return { ...totals, itemCount: items.length };
}

/** Позиции, съеденные сегодня — для показа списка с возможностью удалить лишнее. */
export async function getTodayItems(userId: bigint) {
  const prisma = getPrismaClient();
  return prisma.mealItem.findMany({
    where: { mealEntry: { userId, eatenAt: { gte: startOfToday() } } },
    orderBy: { mealEntry: { eatenAt: "asc" } },
  });
}

/**
 * Удаляет одну позицию, только если она действительно принадлежит этому
 * пользователю (проверяем через связанный MealEntry.userId, а не доверяем
 * голому id из callback-данных). Возвращает true, если что-то удалено.
 */
export async function deleteMealItemForUser(userId: bigint, itemId: string): Promise<boolean> {
  const prisma = getPrismaClient();
  const result = await prisma.mealItem.deleteMany({
    where: { id: itemId, mealEntry: { userId } },
  });
  return result.count > 0;
}
