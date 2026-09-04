import pino from "pino";
import { loadEnv } from "../config/env.js";

const env = loadEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
});
