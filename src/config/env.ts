import "dotenv/config";
import { z } from "zod";

/**
 * Единая точка чтения переменных окружения. Валидируется один раз при старте,
 * чтобы бот падал сразу с понятной ошибкой, а не посреди обработки апдейта.
 */
const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  WHISPER_MODEL: z.string().default("whisper-1"),

  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-5"),

  USDA_FDC_API_KEY: z.string().optional().default(""),
  FATSECRET_CLIENT_ID: z.string().optional().default(""),
  FATSECRET_CLIENT_SECRET: z.string().optional().default(""),

  TELEGRAM_PAYMENTS_PROVIDER_TOKEN: z.string().optional().default(""),
  USE_TELEGRAM_STARS: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),

  // Пейволл временно отключён — все функции бесплатны, пока не решено, когда
  // включать монетизацию. Инфраструктура подписок (/subscribe, Telegram
  // Payments, триал) остаётся в коде и включается обратно этим флагом.
  PAYWALL_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),

  TRIAL_DAYS: z.coerce.number().int().positive().default(3),
  TRIAL_MAX_RECOGNITIONS: z.coerce.number().int().positive().default(10),

  PRICE_MONTH: z.coerce.number().int().positive().default(29900),
  PRICE_QUARTER: z.coerce.number().int().positive().default(79900),
  PRICE_YEAR: z.coerce.number().int().positive().default(249900),
  CURRENCY: z.string().default("RUB"),

  LOG_LEVEL: z.string().default("info"),

  // Порт для служебного HTTP health-check сервера (см. src/healthServer.ts).
  // Бот сам по себе работает через long polling и HTTP не принимает — этот
  // порт нужен только чтобы платформа деплоя (напр. Amvera) видела, что
  // контейнер "слушает" и не перезапускала его. 80 — стандартный порт,
  // с которым Amvera предлагает деплоить приложение по умолчанию.
  PORT: z.coerce.number().int().positive().default(80),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
