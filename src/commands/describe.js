import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { getActiveGame } from "../game/stateManager.js";
import { submitClue } from "../game/gameManager.js";
import { isGroupChat, isPrivateChat, parseCommandText } from "../utils/validators.js";
import { escapeMarkdown } from "../utils/markdown.js";
import { safeSendMessage } from "../utils/telegram.js";

export async function describeCommand(bot, msg) {
  const clue = parseCommandText(msg.text || "", "describe");

  if (isGroupChat(msg)) {
    const game = await getActiveGame(msg.chat.id);
    if (!game) return safeSendMessage(bot, msg.chat.id, "No active game\\.");
    if (game.state !== "describing") return safeSendMessage(bot, msg.chat.id, "Clues are not open right now\\.");
    try {
      await bot.deleteMessage(msg.chat.id, msg.message_id);
    } catch (error) {
      console.error("Could not delete public describe message:", error.message);
    }
    return safeSendMessage(bot, msg.chat.id, "Send your clue privately in our DM\\.");
  }

  if (!isPrivateChat(msg)) return;

  const resolved = await resolvePrivateDescribeGame(msg.from.id, clue);
  if (resolved.error) return safeSendMessage(bot, msg.chat.id, escapeMarkdown(resolved.error));

  await submitClue(bot, resolved.game, msg.from, resolved.clue, {
    feedbackChatId: msg.chat.id,
    privateSubmit: true
  });
}

export async function directDescribeMessage(bot, msg) {
  if (!isPrivateChat(msg)) return;
  const text = (msg.text || "").trim();
  if (!text || text.startsWith("/")) return;

  const resolved = await resolvePrivateDescribeGame(msg.from.id, text);
  if (resolved.error) return;

  await submitClue(bot, resolved.game, msg.from, resolved.clue, {
    feedbackChatId: msg.chat.id,
    privateSubmit: true
  });
}

export async function resolvePrivateDescribeGame(userId, rawClue) {
  const parts = rawClue.split(/\s+/).filter(Boolean);
  const possibleCode = parts[0]?.toUpperCase();
  const playerRows = await Player.find({ userId, isAlive: true }).sort({ joinedAt: -1 });
  const gameIds = playerRows.map((player) => player.gameId);
  const games = await Game.find({ _id: { $in: gameIds }, state: "describing" }).sort({ startedAt: -1 });

  if (possibleCode && /^[A-Z0-9]{6}$/.test(possibleCode)) {
    const codedGame = games.find((game) => game.gameCode === possibleCode);
    if (codedGame) return { game: codedGame, clue: parts.slice(1).join(" ") };
  }

  if (games.length === 0) return { error: "No active describing game found for you." };
  if (games.length > 1) return { error: "You are in multiple games. Use /describe GAMECODE your clue." };

  return { game: games[0], clue: rawClue };
}
