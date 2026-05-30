import { Player } from "../models/Player.js";
import { getActiveGame } from "../game/stateManager.js";
import { handleSmite } from "../game/gameManager.js";
import { isGroupChat, normalizeUsername, parseCommandText } from "../utils/validators.js";
import { safeSendMessage, isGroupAdmin } from "../utils/telegram.js";

export async function smiteCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /smite in a group\\.");

  const isAdmin = await isGroupAdmin(bot, msg.chat.id, msg.from.id);
  if (!isAdmin) return safeSendMessage(bot, msg.chat.id, "Only group admins can use this command\\.");

  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");
  if (game.state === "lobby" || game.state === "finished") return safeSendMessage(bot, msg.chat.id, "Game is not playing right now\\.");

  const rawTarget = parseCommandText(msg.text || "", "smite");
  if (!rawTarget) return safeSendMessage(bot, msg.chat.id, "Use /smite @username to kick an AFK player\\.");

  const targetName = rawTarget.trim();
  const targetUsername = normalizeUsername(targetName.split(/\s+/)[0]);
  
  const target = await Player.findOne({ 
    gameId: game._id, 
    $or: [
      { username: new RegExp(`^${escapeRegExp(targetUsername)}$`, "i") },
      { firstName: new RegExp(`^${escapeRegExp(targetName)}$`, "i") }
    ],
    isAlive: true 
  });

  if (!target) return safeSendMessage(bot, msg.chat.id, "Could not find that active player to smite\\. Make sure you used their first name or @username exact match\\.");

  await handleSmite(bot, game, target);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
