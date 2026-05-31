import { getActiveGame } from "../game/stateManager.js";
import { startGame } from "../game/gameManager.js";
import { isGroupAdmin, safeSendMessage } from "../utils/telegram.js";
import { isGroupChat } from "../utils/validators.js";

export async function startGameCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Start games from the group lobby\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No lobby is open\\. Use /newgame first\\.");

  const allowed = msg.from.id === game.creatorId || await isGroupAdmin(bot, msg.chat.id, msg.from.id);
  if (!allowed) return safeSendMessage(bot, msg.chat.id, "Only the creator or a group admin can start\\.");

  await startGame(bot, game);
}
