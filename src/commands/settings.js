import { getOrCreateSettings } from "../game/stateManager.js";
import { isGroupAdmin, safeSendMessage } from "../utils/telegram.js";
import { isGroupChat, parseCommandText, validateSettingValue } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";

export async function settingsCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /settings in a group\\.");
  const settings = await getOrCreateSettings(msg.chat.id);
  const text = [
    bold("Settings"),
    `lobbyTimeLimit: ${settings.lobbyTimeLimit}`,
    `clueTimeLimit: ${settings.clueTimeLimit}`,
    `voteTimeLimit: ${settings.voteTimeLimit}`,
    `allowClueEdit: ${settings.allowClueEdit}`,
    `maxPlayers: ${settings.maxPlayers}`,
    `minPlayers: ${settings.minPlayers}`,
    `language: ${escapeMarkdown(settings.language)}`
  ].join("\n");
  return safeSendMessage(bot, msg.chat.id, text);
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
