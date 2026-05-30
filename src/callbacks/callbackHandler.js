import { Game } from "../models/Game.js";
import { getGameByCode } from "../game/stateManager.js";
import { cancelGame, joinGame, leaveGame, startGame, submitVote } from "../game/gameManager.js";
import { isGroupAdmin, safeAnswerCallback } from "../utils/telegram.js";
import { showHistoryPage } from "../commands/history.js";

export async function handleCallback(bot, query) {
  const data = query.data || "";
  const parts = data.split(":");
  const action = parts[0];
  const gameCode = parts[1];

  if (action === "hist") {
    const page = Number(parts[1]);
    if (!Number.isInteger(page) || page < 0) return safeAnswerCallback(bot, query.id, "Invalid history page.");
    await showHistoryPage(bot, query, page);
    return safeAnswerCallback(bot, query.id, "History updated.");
  }

  if (!gameCode) return safeAnswerCallback(bot, query.id, "Invalid button.");

  const game = await getGameByCode(gameCode);
  if (!game) return safeAnswerCallback(bot, query.id, "This game is no longer active.");

  try {
    if (action === "join") {
      const result = await joinGame(bot, game, query.from);
      return safeAnswerCallback(bot, query.id, result);
    }

    if (action === "leave") {
      const result = await leaveGame(bot, game, query.from);
      return safeAnswerCallback(bot, query.id, result);
    }

    if (action === "start") {
      const allowed = query.from.id === game.creatorId || await isGroupAdmin(bot, game.telegramGroupId, query.from.id);
      if (!allowed) return safeAnswerCallback(bot, query.id, "Only the creator or an admin can start.");
      await safeAnswerCallback(bot, query.id, "Starting game...");
      return startGame(bot, game);
    }

    if (action === "cancel") {
      const allowed = query.from.id === game.creatorId || await isGroupAdmin(bot, game.telegramGroupId, query.from.id);
      if (!allowed) return safeAnswerCallback(bot, query.id, "Only the creator or an admin can cancel.");
      await safeAnswerCallback(bot, query.id, "Cancelling game...");
      return cancelGame(bot, game);
    }

    if (action === "vote") {
      const targetUserId = Number(parts[2]);
      if (!Number.isSafeInteger(targetUserId)) return safeAnswerCallback(bot, query.id, "Invalid vote target.");
      const freshGame = await Game.findById(game._id);
      const result = await submitVote(bot, freshGame, query.from.id, targetUserId);
      return safeAnswerCallback(bot, query.id, result);
    }

    return safeAnswerCallback(bot, query.id, "Unknown action.");
  } catch (error) {
    console.error("Callback handling failed:", error);
    return safeAnswerCallback(bot, query.id, "Something went wrong.");
  }
}
