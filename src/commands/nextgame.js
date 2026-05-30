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

  const dmReady = await safeSendMessage(
    bot,
    msg.from.id,
    "You are subscribed for the next Who's Impostor lobby in this group\\."
  );
  if (!dmReady) {
    return safeSendMessage(bot, msg.chat.id, "Open a private chat with me and send /start first\\. Then use /nextgame again\\.");
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
    `${escapeMarkdown(userName(msg.from))}, I will notify you by DM when the next lobby opens\\.`
  );
}
