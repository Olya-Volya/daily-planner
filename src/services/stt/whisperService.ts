import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { loadEnv } from "../../config/env.js";

let client: OpenAI | undefined;

function getOpenAiClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: loadEnv().OPENAI_API_KEY });
  }
  return client;
}

/**
 * Транскрибирует голосовое сообщение (.ogg/.oga из Telegram, .mp3 и т.п.)
 * через OpenAI Whisper API. Явно указываем язык "ru" для лучшего качества
 * распознавания числительных и нутрициологических терминов.
 */
export async function transcribeVoiceMessage(audioBuffer: Buffer, filename = "voice.oga"): Promise<string> {
  const env = loadEnv();
  const openai = getOpenAiClient();

  const file = await toFile(audioBuffer, filename);
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: env.WHISPER_MODEL,
    language: "ru",
    response_format: "text",
  });

  // response_format "text" -> SDK возвращает строку напрямую (typed as any in openai sdk)
  return typeof transcription === "string" ? transcription.trim() : String(transcription).trim();
}
