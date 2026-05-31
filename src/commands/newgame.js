import { createNewGame } from "../game/gameManager.js";
import { isGroupChat } from "../utils/validators.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function newGameCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Start games from a group chat with /newgame\\.");
  await createNewGame(bot, msg);
}
