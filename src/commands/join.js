import { getActiveGame } from "../game/stateManager.js";
import { joinGame } from "../game/gameManager.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function joinCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /join in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active lobby\\. Use /newgame first\\.");
  const result = await joinGame(bot, game, msg.from);
  return safeSendMessage(bot, msg.chat.id, escapeMarkdown(result));
}
