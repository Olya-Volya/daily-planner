import { randomUUID } from "node:crypto";
import type { RecipeWithNutrition } from "../services/menu/menuService.js";

/**
 * Временный кэш только что сгенерированных рецептов, чтобы пользователь мог
 * нажать "Сохранить" под конкретным вариантом меню без повторной генерации.
 * Как и черновик онбординга — для продакшена стоит вынести в Redis/БД.
 */
interface CachedRecipe {
  userId: bigint;
  recipe: RecipeWithNutrition;
}

const cache = new Map<string, CachedRecipe>();
const MAX_ENTRIES = 5000;

export function cacheRecipe(userId: bigint, recipe: RecipeWithNutrition): string {
  const id = randomUUID();
  if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(id, { userId, recipe });
  return id;
}

export function takeCachedRecipe(id: string, userId: bigint): RecipeWithNutrition | undefined {
  const entry = cache.get(id);
  if (!entry || entry.userId !== userId) return undefined;
  return entry.recipe;
}
