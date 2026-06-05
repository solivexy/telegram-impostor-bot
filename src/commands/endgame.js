import { getActiveGame } from "../game/stateManager.js";
import { cancelGame, forceEndGame } from "../game/gameManager.js";
import { isAdminOrDeveloper, safeSendMessage } from "../utils/telegram.js";
import { isGroupChat } from "../utils/validators.js";

export async function cancelGameCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /cancelgame in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");
  const allowed = msg.from.id === game.creatorId || await isAdminOrDeveloper(bot, msg.chat.id, msg.from.id);
  if (!allowed) return safeSendMessage(bot, msg.chat.id, "Only the creator or a group admin can cancel this game\\.");
  await cancelGame(bot, game);
}

export async function endGameCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /endgame in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");
  const allowed = msg.from.id === game.creatorId || await isAdminOrDeveloper(bot, msg.chat.id, msg.from.id);
  if (!allowed) return safeSendMessage(bot, msg.chat.id, "Only the creator or a group admin can end this game\\.");
  await forceEndGame(bot, game);
}

export async function killGameCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /killgame in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");
  const allowed = await isAdminOrDeveloper(bot, msg.chat.id, msg.from.id);
  if (!allowed) return safeSendMessage(bot, msg.chat.id, "Only a group admin can kill this game\\.");
  await cancelGame(bot, game);
}
