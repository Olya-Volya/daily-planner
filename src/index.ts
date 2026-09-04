import { loadEnv } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createBot } from "./bot/index.js";
import { getPrismaClient } from "./db/prismaClient.js";

async function main(): Promise<void> {
  loadEnv();
  const prisma = getPrismaClient();
  await prisma.$connect();
  logger.info("Connected to database");

  const bot = createBot();

  process.once("SIGINT", () => {
    bot.stop("SIGINT");
    void prisma.$disconnect();
  });
  process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
    void prisma.$disconnect();
  });

  await bot.launch();
  logger.info("КБЖУ Трекер бот запущен");
}

main().catch((err) => {
  logger.error({ err }, "Fatal error on startup");
  process.exit(1);
});
