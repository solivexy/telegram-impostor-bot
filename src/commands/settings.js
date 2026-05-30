import { getOrCreateSettings } from "../game/stateManager.js";
import { isGroupAdmin, safeSendMessage } from "../utils/telegram.js";
import { isGroupChat, parseCommandText, validateSettingValue } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";

export async function settingsCommand(bot, msg, botUsername) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /settings in a group\\.");
  
  const isAdmin = await isGroupAdmin(bot, msg.chat.id, msg.from.id);
  if (!isAdmin) {
    return safeSendMessage(bot, msg.chat.id, "Only group admins can use this command\\.");
  }

  const url = `https://t.me/${botUsername}?start=settings_${msg.chat.id}`;
  const kb = {
    inline_keyboard: [[{ text: "Change Settings", url }]]
  };

  return bot.sendMessage(
    msg.chat.id,
    "Change the game settings in our private chat\\.",
    { reply_markup: kb }
  ).catch(err => console.error("Filter setting msg err:", err));
}

export async function getSettingsMenu(groupChatId) {
  const settings = await getOrCreateSettings(groupChatId);
  const text = bold("⚙️ Game Settings") + `\\n\\nConfigure settings for group ID: ${escapeMarkdown(String(groupChatId))}`;

  const opts = {
    inline_keyboard: [
      [
        { text: `Lobby Time: ${settings.lobbyTimeLimit}s`, callback_data: "ignore" }
      ],
      [
        { text: "60s", callback_data: `set:${groupChatId}:lobbyTimeLimit:60` },
        { text: "90s", callback_data: `set:${groupChatId}:lobbyTimeLimit:90` },
        { text: "120s", callback_data: `set:${groupChatId}:lobbyTimeLimit:120` }
      ],
      [
        { text: `Clue Time: ${settings.clueTimeLimit}s`, callback_data: "ignore" }
      ],
      [
        { text: "60s", callback_data: `set:${groupChatId}:clueTimeLimit:60` },
        { text: "90s", callback_data: `set:${groupChatId}:clueTimeLimit:90` },
        { text: "120s", callback_data: `set:${groupChatId}:clueTimeLimit:120` }
      ],
      [
        { text: `Vote Time: ${settings.voteTimeLimit}s`, callback_data: "ignore" }
      ],
      [
        { text: "60s", callback_data: `set:${groupChatId}:voteTimeLimit:60` },
        { text: "90s", callback_data: `set:${groupChatId}:voteTimeLimit:90` },
        { text: "120s", callback_data: `set:${groupChatId}:voteTimeLimit:120` }
      ],
      [
        { text: `Min Players: ${settings.minPlayers}`, callback_data: `ignore` },
        { text: "-", callback_data: `set:${groupChatId}:minPlayers:${Math.max(3, settings.minPlayers - 1)}` },
        { text: "+", callback_data: `set:${groupChatId}:minPlayers:${Math.min(settings.maxPlayers, settings.minPlayers + 1)}` }
      ],
      [
        { text: `Max Players: ${settings.maxPlayers}`, callback_data: `ignore` },
        { text: "-", callback_data: `set:${groupChatId}:maxPlayers:${Math.max(settings.minPlayers, settings.maxPlayers - 1)}` },
        { text: "+", callback_data: `set:${groupChatId}:maxPlayers:${Math.min(20, settings.maxPlayers + 1)}` }
      ]
    ]
  };
  return { text, opts };
}

export async function showSettingsMenu(bot, dmChatId, groupChatId) {
  const { text, opts } = await getSettingsMenu(groupChatId);
  return bot.sendMessage(dmChatId, text, { parse_mode: "MarkdownV2", reply_markup: opts }).catch(console.error);
}

export async function setCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /set in a group\\.");
  const isAdmin = await isGroupAdmin(bot, msg.chat.id, msg.from.id);
  if (!isAdmin) return safeSendMessage(bot, msg.chat.id, "Only group admins can change settings\\.");

  const args = parseCommandText(msg.text || "", "set").split(/\s+/).filter(Boolean);
  if (args.length < 2) return safeSendMessage(bot, msg.chat.id, "Use /set key value\\.");

  const [key, value] = args;
  const result = validateSettingValue(key, value);
  if (!result.ok) return safeSendMessage(bot, msg.chat.id, escapeMarkdown(result.error));

  const settings = await getOrCreateSettings(msg.chat.id);
  if (key === "minPlayers" && result.value > settings.maxPlayers) {
    return safeSendMessage(bot, msg.chat.id, "minPlayers cannot be greater than maxPlayers\\.");
  }
  if (key === "maxPlayers" && result.value < settings.minPlayers) {
    return safeSendMessage(bot, msg.chat.id, "maxPlayers cannot be lower than minPlayers\\.");
  }

  settings[key] = result.value;
  await settings.save();
  return safeSendMessage(bot, msg.chat.id, `${escapeMarkdown(key)} updated to ${escapeMarkdown(String(result.value))}\\.`);
}
