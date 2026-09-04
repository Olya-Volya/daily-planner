import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "../../config/env.js";

let client: Anthropic | undefined;

export function getClaudeClient(): Anthropic {
  if (!client) {
    const env = loadEnv();
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function getClaudeModel(): string {
  return loadEnv().CLAUDE_MODEL;
}

/**
 * Достаёт первый текстовый блок из ответа Claude и парсит его как JSON.
 * Все промпты в этом проекте явно требуют от модели вернуть ТОЛЬКО JSON
 * (без пояснений и markdown-обёртки), это упрощает и делает надёжным парсинг.
 */
export function extractJson<T>(content: Anthropic.Messages.ContentBlock[]): T {
  const textBlock = content.find((block): block is Anthropic.Messages.TextBlock => block.type === "text");
  if (!textBlock) {
    throw new Error("Claude response did not contain a text block");
  }
  const raw = textBlock.text.trim();
  // На случай, если модель всё же обернула ответ в ```json ... ``` — снимаем обёртку.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`Failed to parse JSON from Claude response: ${(err as Error).message}\nRaw: ${raw}`);
  }
}
