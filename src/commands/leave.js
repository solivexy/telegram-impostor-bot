import { getActiveGame } from "../game/stateManager.js";
import { leaveGame } from "../game/gameManager.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function leaveCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /leave in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active lobby\\.");
  const result = await leaveGame(bot, game, msg.from);
  return safeSendMessage(bot, msg.chat.id, escapeMarkdown(result));
}
