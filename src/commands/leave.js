import { getActiveGame } from "../game/stateManager.js";
import { leaveGame } from "../game/gameManager.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function leaveCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Leave from the group lobby\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No lobby is open\\.");
  const result = await leaveGame(bot, game, msg.from);
  return safeSendMessage(bot, msg.chat.id, escapeMarkdown(result));
}
