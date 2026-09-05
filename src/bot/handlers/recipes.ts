import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { getPrismaClient } from "../../db/prismaClient.js";
import { takeCachedRecipe } from "../recipeCache.js";
import { logger } from "../../utils/logger.js";

export async function handleSaveRecipeCallback(ctx: Context, user: User, recipeId: string): Promise<void> {
  const recipe = takeCachedRecipe(recipeId, user.id);
  if (!recipe) {
    await ctx.answerCbQuery("Рецепт больше не доступен для сохранения");
    return;
  }

  try {
    await getPrismaClient().savedRecipe.create({
      data: {
        userId: user.id,
        title: recipe.title,
        ingredientsJson: recipe.items.map((i) => ({ name: i.matchedName, grams: i.quantityGrams })),
        steps: recipe.steps.join("\n"),
        calories: recipe.totals.calories,
        protein: recipe.totals.proteinG,
        fat: recipe.totals.fatG,
        carbs: recipe.totals.carbsG,
      },
    });
    await ctx.answerCbQuery("Рецепт сохранён ✅");
  } catch (err) {
    logger.error({ err, userId: user.id.toString() }, "Failed to save recipe");
    await ctx.answerCbQuery("Не удалось сохранить рецепт");
  }
}

export async function handleRecipesCommand(ctx: Context, user: User): Promise<void> {
  const recipes = await getPrismaClient().savedRecipe.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (recipes.length === 0) {
    await ctx.reply("У тебя пока нет сохранённых рецептов. Сохраняй их кнопкой под предложенным меню.");
    return;
  }

  const lines = recipes.map(
    (r) => `🍳 ${r.title} — ${r.calories} ккал (Б${r.protein}/Ж${r.fat}/У${r.carbs} г)`,
  );
  await ctx.reply(["Твои сохранённые рецепты:", ...lines].join("\n"));
}
