import type { Context } from "telegraf";
import type { User } from "@prisma/client";
import { transcribeVoiceMessage } from "../../services/stt/whisperService.js";
import { logger } from "../../utils/logger.js";
import { logMealProcessingError, processMealTranscript } from "./mealProcessing.js";

export async function handleVoiceMessage(ctx: Context, user: User): Promise<void> {
  const message = ctx.message;
  if (!message || !("voice" in message) || !message.voice) return;

  const statusMessage = await ctx.reply("🎙 Распознаю голосовое сообщение...");

  try {
    const fileLink = await ctx.telegram.getFileLink(message.voice.file_id);
    const response = await fetch(fileLink.toString());
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    const transcript = await transcribeVoiceMessage(audioBuffer, "voice.oga");
    logger.info({ userId: user.id.toString(), transcript }, "Voice transcribed");

    if (!transcript) {
      await ctx.reply("Не удалось распознать речь, попробуй ещё раз.");
      return;
    }

    await ctx.telegram.editMessageText(
      ctx.chat!.id,
      statusMessage.message_id,
      undefined,
      `📝 Распознано: «${transcript}»\n\nСчитаю КБЖУ...`,
    );

    await processMealTranscript(ctx, user, transcript, "VOICE");
  } catch (err) {
    logMealProcessingError(err, user, "voice");
    await ctx.reply("Произошла ошибка при обработке голосового сообщения. Попробуй ещё раз чуть позже.");
  }
}
