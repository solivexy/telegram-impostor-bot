import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { getActiveGame, clearActiveGame } from "../game/stateManager.js";
import { updateGameStats } from "../game/gameManager.js";
import { safeSendMessage, mentionPlayer } from "../utils/telegram.js";
import { bold } from "../utils/markdown.js";

export async function killCommand(bot, msg) {
  const chatType = msg.chat.type;
  if (chatType !== "private") {
    return safeSendMessage(bot, msg.chat.id, "Use /kill in DM to select a player to kill.");
  }

  const userId = msg.from.id;
  
  // Find active games where this user is an impostor
  const player = await Player.findOne({ userId, role: "impostor", isAlive: true });
  if (!player) return safeSendMessage(bot, userId, "You are not an active impostor in any game.");

  const game = await Game.findById(player.gameId);
  if (!game) return safeSendMessage(bot, userId, "Game not found.");
  if (game.gameMode !== "killer") return safeSendMessage(bot, userId, "This command is only available in killer mode.");
  if (game.state !== "describing") return safeSendMessage(bot, userId, "You can only kill during the clue phase.");

  const kills = game.impostorKills?.get(String(userId)) || 0;
  if (kills >= 1) return safeSendMessage(bot, userId, "You already used your kill this game.");

  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true, role: "normal" }).sort({ joinedAt: 1 });
  if (alivePlayers.length === 0) return safeSendMessage(bot, userId, "No players available to kill.");

  const keyboard = {
    inline_keyboard: alivePlayers.map((p, index) => [{
      text: `${index + 1}. ${p.firstName || p.username || "Player"}`,
      callback_data: `kill:${game.gameCode}:${p.userId}`
    }])
  };

  await safeSendMessage(bot, userId, `${bold("Select a player to kill:")}`, {
    reply_markup: keyboard
  });
}

export async function handleKillCallback(bot, query, gameCode, targetUserId) {
  const game = await getGameByCode(gameCode);
  if (!game) return "This game is no longer active.";
  if (game.gameMode !== "killer") return "This game is not in killer mode.";
  if (game.state !== "describing") return "You can only kill during the clue phase.";

  const killer = await Player.findOne({ gameId: game._id, userId: query.from.id, isAlive: true });
  if (!killer) return "You are not an active player in this game.";
  if (killer.role !== "impostor") return "Only impostors can kill.";

  const kills = game.impostorKills?.get(String(query.from.id)) || 0;
  if (kills >= 1) return "You already used your kill this game.";

  const target = await Player.findOne({ gameId: game._id, userId: targetUserId, isAlive: true });
  if (!target) return "Player not found or already out.";
  if (target.userId === query.from.id) return "You cannot kill yourself.";

  await Player.updateOne({ _id: target._id }, { $set: { isAlive: false } });
  game.impostorKills = game.impostorKills || new Map();
  game.impostorKills.set(String(query.from.id), kills + 1);
  await game.save();

  await safeSendMessage(bot, game.telegramGroupId, `${bold("Kill!")}\n${mentionPlayer(killer)} eliminated ${mentionPlayer(target)}\\. They were ${target.role === "impostor" ? "an impostor" : "not an impostor"}\\.`);

  const freshGame = await Game.findById(game._id);
  const players = await Player.find({ gameId: freshGame._id }).sort({ joinedAt: 1 });
  const impostors = players.filter(p => p.role === "impostor");
  const alivePlayers = players.filter(p => p.isAlive);
  const aliveImpostors = alivePlayers.filter(p => p.role === "impostor");
  const aliveNormals = alivePlayers.filter(p => p.role !== "impostor");

  const normalsWin = impostors.length > 0 && aliveImpostors.length === 0;
  const impostorsWin = aliveImpostors.length > 0 && aliveImpostors.length >= aliveNormals.length;

  if (normalsWin || impostorsWin) {
    freshGame.state = "finished";
    freshGame.finishedAt = new Date();
    freshGame.clueDeadline = null;
    freshGame.voteDeadline = null;
    await freshGame.save();
    await clearActiveGame(freshGame);

    const winner = normalsWin ? "Crew wins!" : "Impostors win!";
    const winningRole = normalsWin ? "normal" : "impostor";
    const winningPlayers = players.filter(p => p.role === winningRole);
    const winnerNames = winningPlayers.map(p => mentionPlayer(p)).join(", ");
    await updateGameStats(freshGame, players, winningRole);

    await new Promise(resolve => setTimeout(resolve, 1500));
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold(winner)}\nWinners: ${winnerNames}\n${normalsWin ? "All impostors were eliminated\\." : "Impostors reached parity with the crew\\."}`);
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold("Final result")}\nMain word: ${bold(freshGame.mainWord)}\nImpostor word: ${bold(freshGame.impostorWord)}\nImpostors: ${impostors.map(p => mentionPlayer(p)).join(", ")}`);
  }

  return "Player eliminated!";
}

import { getGameByCode } from "../game/stateManager.js";
