import { isGroupChat, isPrivateChat, parseCommandText } from "../utils/validators.js";
import { isGroupAdmin, safeSendMessage } from "../utils/telegram.js";
import { showSettingsMenu } from "./settings.js";

export async function startCommand(bot, msg) {
  if (isPrivateChat(msg)) {
    const args = parseCommandText(msg.text || "", "start");
    if (args.startsWith("settings_")) {
      const groupId = Number(args.replace("settings_", ""));
      if (Number.isSafeInteger(groupId)) {
        const isAdmin = await isGroupAdmin(bot, groupId, msg.from.id);
        if (isAdmin) {
          return showSettingsMenu(bot, msg.chat.id, groupId);
        } else {
          return safeSendMessage(bot, msg.chat.id, "You are not an admin of that group\\.");
        }
      }
    }

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
