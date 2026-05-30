import { getActiveGame } from "../game/stateManager.js";
import { renderStatus } from "../game/gameManager.js";
import { isGroupChat } from "../utils/validators.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function statusCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /status in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game in this group\\.");
  return safeSendMessage(bot, msg.chat.id, await renderStatus(game));
}
