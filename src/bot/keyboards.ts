import { Markup } from "telegraf";

export const genderKeyboard = Markup.inlineKeyboard([
  Markup.button.callback("Мужской", "gender:MALE"),
  Markup.button.callback("Женский", "gender:FEMALE"),
]);

export const activityKeyboard = Markup.inlineKeyboard(
  [
    ["Сидячий образ жизни", "SEDENTARY"],
    ["Лёгкая активность (1-3 трен/нед)", "LIGHT"],
    ["Умеренная активность (3-5 трен/нед)", "MODERATE"],
    ["Высокая активность (6-7 трен/нед)", "HIGH"],
    ["Очень высокая (физ. работа + спорт)", "VERY_HIGH"],
  ].map(([label, value]) => [Markup.button.callback(label!, `activity:${value}`)]),
);

export const goalKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Похудение", "goal:LOSE")],
  [Markup.button.callback("Удержание веса", "goal:MAINTAIN")],
  [Markup.button.callback("Набор массы", "goal:GAIN")],
]);

export function subscriptionPlansKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1 месяц", "subscribe:MONTH")],
    [Markup.button.callback("3 месяца", "subscribe:QUARTER")],
    [Markup.button.callback("1 год (выгоднее всего)", "subscribe:YEAR")],
  ]);
}
