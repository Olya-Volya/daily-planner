import { analyzeFridgePhoto, type FridgeImage } from "../llm/analyzeFridgePhoto.js";
import { generateMenuSuggestions, type RecipeSuggestion } from "../llm/generateMenu.js";
import { NutritionResolver } from "../nutrition/nutritionResolver.js";
import { calculateMealTotals } from "../calculation/nutrientCalculator.js";
import type { CalculatedMealItem, MealTotals, NutrientsPer100g, ParsedMealItem } from "../../types/nutrition.js";

export interface RecipeWithNutrition {
  title: string;
  steps: string[];
  items: CalculatedMealItem[];
  totals: MealTotals;
}

/**
 * Полный сценарий Функции 2 ТЗ: фото холодильника -> распознанные продукты ->
 * 2-3 варианта рецептов с шагами -> точная раскладка КБЖУ каждого рецепта,
 * рассчитанная тем же программным путём (база нутриентов + calculator), что
 * и для голосового ввода — Claude не является источником итоговых цифр.
 */
export class MenuService {
  private readonly resolver = new NutritionResolver();

  async generateMenuFromFridgePhoto(
    images: FridgeImage[],
    remainingBudget: NutrientsPer100g,
  ): Promise<RecipeWithNutrition[]> {
    const ingredients = await analyzeFridgePhoto(images);
    const recipes = await generateMenuSuggestions(ingredients, remainingBudget);
    return Promise.all(recipes.map((recipe) => this.calculateRecipeNutrition(recipe)));
  }

  private async calculateRecipeNutrition(recipe: RecipeSuggestion): Promise<RecipeWithNutrition> {
    const parsedItems: ParsedMealItem[] = recipe.ingredients.map((ing) => ({
      searchTerm: ing.searchTerm,
      quantityGrams: ing.quantityGrams,
      state: ing.state,
    }));
    const items = await this.resolver.resolveMeal(parsedItems);
    const totals = calculateMealTotals(items);
    return { title: recipe.title, steps: recipe.steps, items, totals };
  }
}
