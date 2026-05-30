import { getActiveGame } from "../game/stateManager.js";
import { extendActiveTimer } from "../game/gameManager.js";
import { isGroupAdmin, safeSendMessage } from "../utils/telegram.js";
import { isGroupChat, parseCommandText } from "../utils/validators.js";

export async function extendTimeCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /extendtime in a group\\.");

  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");

  const allowed = msg.from.id === game.creatorId || await isGroupAdmin(bot, msg.chat.id, msg.from.id);
  if (!allowed) return safeSendMessage(bot, msg.chat.id, "Only the creator or a group admin can extend time\\.");

  const command = /^\/extendtime/i.test(msg.text || "") ? "extendtime" : "extend";
  const raw = parseCommandText(msg.text || "", command);
  const seconds = Number(raw.split(/\s+/)[0]);
  if (!Number.isInteger(seconds)) return safeSendMessage(bot, msg.chat.id, "Use /extendtime seconds\\.");

  await extendActiveTimer(bot, game, seconds);
}
