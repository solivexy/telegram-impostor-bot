import { NextGameSubscription } from "../models/NextGameSubscription.js";
import { getActiveGame } from "../game/stateManager.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage, userName } from "../utils/telegram.js";

export async function nextGameCommand(bot, msg) {
  if (!isGroupChat(msg)) {
    return safeSendMessage(bot, msg.chat.id, "Use /nextgame in the group where you want to be notified\\.");
  }

  const activeGame = await getActiveGame(msg.chat.id);
  if (activeGame?.state === "lobby") {
    return safeSendMessage(bot, msg.chat.id, "A lobby is already open\\. Use /join to play now\\.");
  }

  await NextGameSubscription.updateOne(
    { telegramGroupId: msg.chat.id, userId: msg.from.id },
    {
      $set: {
        username: msg.from.username || "",
        firstName: msg.from.first_name || ""
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  return safeSendMessage(
    bot,
    msg.chat.id,
    `${escapeMarkdown(userName(msg.from))}, I will notify you when the next lobby opens\\.`
  );
}
