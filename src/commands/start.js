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
      "DM is ready\\.\\n\\nAdd me to a group and run /newgame there\\. When a game starts, I will send your secret word here\\."
    );
  }

  if (isGroupChat(msg)) {
    return safeSendMessage(
      bot,
      msg.chat.id,
      "Who's Impostor? is ready\\.\\n\\nUse /newgame to open a lobby\\. Players join, get secret words in DM, send clues privately, then vote in the group\\."
    );
  }
}
