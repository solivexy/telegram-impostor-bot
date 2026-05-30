import { Player } from "../models/Player.js";
import { getActiveGame } from "../game/stateManager.js";
import { submitVote } from "../game/gameManager.js";
import { isGroupChat, normalizeUsername, parseCommandText } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function voteCommand(bot, msg) {
  if (!isGroupChat(msg)) return safeSendMessage(bot, msg.chat.id, "Use /vote in a group\\.");
  const game = await getActiveGame(msg.chat.id);
  if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");

  const rawTarget = parseCommandText(msg.text || "", "vote");
  if (!rawTarget) return safeSendMessage(bot, msg.chat.id, "Please use the inline buttons to vote\\.");

  const targetName = rawTarget.trim();
  const target = await Player.findOne({ 
    gameId: game._id, 
    $or: [
      { username: new RegExp(`^${escapeRegExp(normalizeUsername(targetName.split(/\s+/)[0]))}$`, "i") },
      { firstName: new RegExp(`^${escapeRegExp(targetName)}$`, "i") }
    ],
    isAlive: true 
  });
  if (!target) return safeSendMessage(bot, msg.chat.id, "Could not find that active player\\. Please use the vote buttons instead\\.");

  const result = await submitVote(bot, game, msg.from.id, target.userId);
  return safeSendMessage(bot, msg.chat.id, escapeMarkdown(result));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
