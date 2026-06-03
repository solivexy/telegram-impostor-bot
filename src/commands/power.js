import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { Clue } from "../models/Clue.js";
import { getGameByCode } from "../game/stateManager.js";
import { powerDescription, powerLabel, startVoting } from "../game/gameManager.js";
import { bold, escapeMarkdown } from "../utils/markdown.js";
import { mentionPlayer, playerName, safeSendMessage } from "../utils/telegram.js";

export async function powerCommand(bot, msg) {
  if (msg.chat.type !== "private") {
    return safeSendMessage(bot, msg.chat.id, "Use /power in DM so your power stays secret\\.");
  }

  const resolved = await resolvePowerGame(msg.from.id);
  if (!resolved.player || !resolved.game) {
    return safeSendMessage(bot, msg.chat.id, "You do not have an active killer mode power right now\\.");
  }

  const { player, game } = resolved;
  if (!player.powerCard) return safeSendMessage(bot, msg.chat.id, "You do not have a power card this game\\.");
  if (player.powerUsed) return safeSendMessage(bot, msg.chat.id, "You already used your power card this game\\.");

  const timingError = powerTimingError(player.powerCard, game.state);
  if (timingError) {
    return safeSendMessage(
      bot,
      msg.chat.id,
      `${bold(powerLabel(player.powerCard))}\n${escapeMarkdown(powerDescription(player.powerCard))}\n\n${escapeMarkdown(timingError)}`
    );
  }

  if (player.powerCard === "double_vote" || player.powerCard === "shield") {
    player.powerUsed = true;
    player.powerActiveRound = game.roundNumber || 1;
    await player.save();
    return safeSendMessage(bot, msg.chat.id, `${bold(powerLabel(player.powerCard))} activated for this voting round\\.`);
  }

  const targets = await powerTargets(player, game);
  if (targets.length === 0) return safeSendMessage(bot, msg.chat.id, "No valid targets for this power right now\\.");

  return safeSendMessage(bot, msg.chat.id, powerPrompt(player, game), {
    reply_markup: {
      inline_keyboard: targets.map((target) => [
        { text: playerName(target), callback_data: `power:${game.gameCode}:${target.userId}` }
      ])
    }
  });
}

export async function handlePowerCallback(bot, query, gameCode, targetUserId) {
  const game = await getGameByCode(gameCode);
  if (!game) return "This game is no longer active.";
  if (game.gameMode !== "killer") return "Power cards only work in killer mode.";

  const player = await Player.findOne({ gameId: game._id, userId: query.from.id, isAlive: true });
  if (!player) return "You are not an active player in this game.";
  if (!player.powerCard) return "You do not have a power card.";
  if (player.powerUsed) return "You already used your power.";

  const timingError = powerTimingError(player.powerCard, game.state);
  if (timingError) return timingError;

  const target = await Player.findOne({ gameId: game._id, userId: targetUserId, isAlive: true });
  if (!target) return "Target is no longer active.";
  if (target.userId === player.userId) return "Choose another player.";

  if (player.powerCard === "detective") {
    player.powerUsed = true;
    player.powerTargetUserId = target.userId;
    await player.save();
    await safeSendMessage(
      bot,
      player.userId,
      `${bold("Detective result")}\n${mentionPlayer(target)} is ${target.role === "impostor" ? "an impostor" : "not an impostor"}\\.`
    );
    return "Detective result sent.";
  }

  if (player.powerCard === "silencer") {
    const roundNumber = game.roundNumber || 1;
    const existingClue = await Clue.findOne({ gameId: game._id, roundNumber, userId: target.userId });
    if (existingClue) return "That player already submitted a clue.";

    target.silencedRound = roundNumber;
    player.powerUsed = true;
    player.powerTargetUserId = target.userId;
    await Promise.all([target.save(), player.save()]);

    await safeSendMessage(bot, target.userId, `${bold("Silenced")}\nYou cannot submit a clue this round\\.`);
    await safeSendMessage(bot, player.userId, `${bold("Silencer used")}\n${mentionPlayer(target)} cannot submit a clue this round\\.`);
    await maybeStartVotingAfterSilence(bot, game, roundNumber);
    return "Silencer used.";
  }

  if (player.powerCard === "saboteur") {
    if (!player.powerTargetUserId) {
      player.powerTargetUserId = target.userId;
      await player.save();
      await safeSendMessage(bot, player.userId, `${bold("Saboteur")}\nFirst target: ${mentionPlayer(target)}\\. Pick the second player to swap with\\.`);
      return "First target selected.";
    }

    if (player.powerTargetUserId === target.userId) return "Pick a different second target.";
    const firstTarget = await Player.findOne({ gameId: game._id, userId: player.powerTargetUserId, isAlive: true });
    if (!firstTarget) {
      player.powerTargetUserId = null;
      await player.save();
      return "First target is no longer active. Use /power again.";
    }

    game.clueSwaps.push({
      roundNumber: game.roundNumber || 1,
      firstUserId: player.powerTargetUserId,
      secondUserId: target.userId,
      byUserId: player.userId
    });
    player.powerUsed = true;
    await Promise.all([game.save(), player.save()]);
    await safeSendMessage(bot, player.userId, `${bold("Saboteur used")}\nTwo clue names will be swapped at reveal\\.`);
    return "Saboteur used.";
  }

  return "Unsupported power.";
}

async function resolvePowerGame(userId) {
  const players = await Player.find({ userId, isAlive: true, powerCard: { $ne: "" } }).sort({ joinedAt: -1 });
  for (const player of players) {
    const game = await Game.findById(player.gameId);
    if (game?.gameMode === "killer" && ["describing", "voting"].includes(game.state)) {
      return { player, game };
    }
  }
  return {};
}

function powerTimingError(powerCard, state) {
  if (["detective", "silencer", "saboteur"].includes(powerCard) && state !== "describing") {
    return "Use this power during the clue phase.";
  }
  if (["double_vote", "shield"].includes(powerCard) && state !== "voting") {
    return "Use this power during the voting phase.";
  }
  return "";
}

async function powerTargets(player, game) {
  return Player.find({
    gameId: game._id,
    isAlive: true,
    userId: { $ne: player.userId }
  }).sort({ joinedAt: 1 });
}

function powerPrompt(player, game) {
  if (player.powerCard === "saboteur" && player.powerTargetUserId) {
    return `${bold("Saboteur")}\nPick the second player to swap clues with\\.`;
  }
  return `${bold(powerLabel(player.powerCard))}\n${escapeMarkdown(powerDescription(player.powerCard))}\nRound: ${game.roundNumber || 1}\nChoose a target\\.`;
}

async function maybeStartVotingAfterSilence(bot, game, roundNumber) {
  const clueCount = await Clue.countDocuments({ gameId: game._id, roundNumber });
  const eligibleCount = await Player.countDocuments({
    gameId: game._id,
    isAlive: true,
    $or: [{ silencedRound: { $ne: roundNumber } }, { silencedRound: null }]
  });
  if (clueCount >= eligibleCount) await startVoting(bot, game);
}
