import { z } from "zod";
import { extractJson, getClaudeClient, getClaudeModel } from "./claudeClient.js";
import type { NutrientsPer100g } from "../../types/nutrition.js";
import type { FridgeIngredient } from "./analyzeFridgePhoto.js";

export interface RecipeIngredient {
  searchTerm: string;
  quantityGrams: number;
  state: "raw" | "cooked" | "unknown";
}

export interface RecipeSuggestion {
  title: string;
  steps: string[];
  ingredients: RecipeIngredient[];
}

/**
 * Claude предлагает рецепты и грамовки исходя из того, что есть на фото, и
 * остатка суточного бюджета КБЖУ. Модель НЕ является источником истины по
 * калориям готового блюда — после генерации backend прогоняет каждый
 * ингредиент рецепта через тот же NutritionResolver + nutrientCalculator,
 * что и для голосового ввода, и уже эта точная раскладка показывается
 * пользователю (см. п.4 ТЗ, "Запрет на случайную генерацию чисел").
 */
const SYSTEM_PROMPT = `Ты — шеф-повар-нутрициолог. Пользователь прислал фото содержимого холодильника
и остаток его суточной нормы КБЖУ. Предложи 2-3 варианта блюд, которые можно
приготовить ТОЛЬКО из перечисленных продуктов (плюс базовая бакалея: соль, перец,
растительное/сливочное масло, специи, вода — их не нужно учитывать в списке ингредиентов
с граммовкой, кроме масла, если оно значимо для калорийности).

Каждый рецепт должен по возможности укладываться в остаток суточного бюджета КБЖУ.
Для каждого ингредиента блюда укажи точный вес в граммах и состояние (raw/cooked/unknown
-- состояние ингредиента ДО готовки, как он использован в рецепте).

НЕ указывай калории или БЖУ готового блюда самостоятельно — это будет рассчитано отдельно
точным программным способом по базе нутриентов.

Ответь СТРОГО валидным JSON без markdown-обёртки и без пояснений:
{
  "recipes": [
    {
      "title": "string",
      "steps": ["string", "..."],
      "ingredients": [ { "search_term": "string", "quantity_grams": number, "state": "raw"|"cooked"|"unknown" } ]
    }
  ]
}`;

const responseSchema = z.object({
  recipes: z.array(
    z.object({
      title: z.string().min(1),
      steps: z.array(z.string()),
      ingredients: z.array(
        z.object({
          search_term: z.string().min(1),
          quantity_grams: z.number().positive(),
          state: z.enum(["raw", "cooked", "unknown"]),
        }),
      ),
    }),
  ),
});

export async function generateMenuSuggestions(
  availableIngredients: FridgeIngredient[],
  remainingBudget: NutrientsPer100g,
): Promise<RecipeSuggestion[]> {
  const client = getClaudeClient();

  const ingredientsList = availableIngredients
    .map((i) => `- ${i.name} (${i.estimatedQuantity})`)
    .join("\n");

  const userPrompt = `Доступные продукты:\n${ingredientsList}\n\nОстаток суточного бюджета:\n` +
    `калории: ${remainingBudget.calories} ккал, белки: ${remainingBudget.proteinG} г, ` +
    `жиры: ${remainingBudget.fatG} г, углеводы: ${remainingBudget.carbsG} г`;

  const response = await client.messages.create({
    model: getClaudeModel(),
    max_tokens: 1536,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const parsed = responseSchema.parse(extractJson(response.content));

  return parsed.recipes.map((recipe) => ({
    title: recipe.title,
    steps: recipe.steps,
    ingredients: recipe.ingredients.map((ing) => ({
      searchTerm: ing.search_term,
      quantityGrams: ing.quantity_grams,
      state: ing.state,
    })),
  }));
}
