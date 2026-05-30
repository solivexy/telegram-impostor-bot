import { isGroupChat, isPrivateChat } from "../utils/validators.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function startCommand(bot, msg) {
  if (isPrivateChat(msg)) {
    return safeSendMessage(
      bot,
      msg.chat.id,
      "You're DM\\-ready for Who's Impostor?\\n\\nAdd me to a Telegram group, then use /newgame there\\. I will send secret words here when a group game starts\\."
    );
  }

  if (isGroupChat(msg)) {
    return safeSendMessage(
      bot,
      msg.chat.id,
      "Who's Impostor? is a group word game\\. Start a lobby with /newgame, join it, then describe your secret word without saying it\\. Vote out the impostor to win\\."
    );
  }
}
