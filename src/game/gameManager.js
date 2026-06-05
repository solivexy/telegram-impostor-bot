import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { Clue } from "../models/Clue.js";
import { Vote } from "../models/Vote.js";
import { Group } from "../models/Group.js";
import { UserStat } from "../models/UserStat.js";
import { NextGameSubscription } from "../models/NextGameSubscription.js";
import { pickWordAssignment, chooseImpostors } from "./wordManager.js";
import { getOrCreateGroup, getOrCreateSettings, getActiveGame, clearActiveGame, generateGameCode } from "./stateManager.js";
import { getVoteSummary, getEffectiveRound } from "./voteManager.js";
import { evaluateGameAchievements } from "./achievementManager.js";
import { containsExactWord } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";
import { renderCluesImages } from "../utils/clueImage.js";
import { checkDmEnabled, lobbyKeyboard, mentionPlayer, playerName, safeEditMessage, safeSendMessage, safeSendPhoto, voteKeyboard } from "../utils/telegram.js";

const CREW_POWER_CARDS = ["detective", "silencer", "double_vote", "shield"];
const IMPOSTOR_POWER_CARDS = ["saboteur", "double_vote", "shield"];
const KILLER_POWER_CARD_COUNT = 2;

export async function createNewGame(bot, msg, options = {}) {
  const existing = await getActiveGame(msg.chat.id);
  if (existing) return safeSendMessage(bot, msg.chat.id, "A game is already running here\\. Use /status to see where it is\\.");

  const group = await getOrCreateGroup(msg.chat);
  const settings = await getOrCreateSettings(msg.chat.id);
  let gameCode = generateGameCode();
  while (await Game.exists({ gameCode })) gameCode = generateGameCode();

  const gameMode = options.gameMode || "normal";
  const game = await Game.create({
    groupId: group._id,
    telegramGroupId: msg.chat.id,
    creatorId: msg.from.id,
    gameCode,
    gameMode,
    roundNumber: 1,
    state: "lobby",
    lobbyDeadline: new Date(Date.now() + (settings.lobbyTimeLimit || 60) * 1000)
  });

  await Player.create(playerFromUser(game, msg.from));
  await Group.updateOne({ _id: group._id }, { $set: { activeGameId: game._id } });

  const sent = await safeSendMessage(bot, msg.chat.id, await renderLobby(game), {
    reply_markup: lobbyKeyboard(game.gameCode)
  });

  if (sent) {
    game.lobbyMessageId = sent.message_id;
    await game.save();
  }

  await notifyNextGameSubscribers(bot, game);
}

export async function joinGame(bot, game, user) {
  const settings = await getOrCreateSettings(game.telegramGroupId);
  if (game.state !== "lobby") return "This game has already started.";

  const existing = await Player.findOne({ gameId: game._id, userId: user.id });
  if (existing) return "You already joined this game.";

  const count = await Player.countDocuments({ gameId: game._id });
  if (count >= settings.maxPlayers) return `Lobby is full. Max players: ${settings.maxPlayers}.`;

  const dmReady = await checkDmEnabled(bot, user.id);
  if (!dmReady) {
    return "Open my DM and send /start first. Then press Join again.";
  }

  try {
    await Player.create(playerFromUser(game, user));
  } catch (error) {
    if (error.code === 11000) return "You already joined this game.";
    throw error;
  }

  await refreshLobbyMessage(bot, game);
  return "You are in.";
}

export async function leaveGame(bot, game, user) {
  if (game.state !== "lobby") return "You can only leave during the lobby.";

  const removed = await Player.findOneAndDelete({ gameId: game._id, userId: user.id });
  if (!removed) return "You are not in this game.";

  const remaining = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  if (remaining.length === 0) {
    game.state = "cancelled";
    game.finishedAt = new Date();
    await game.save();
    await clearActiveGame(game);
    await safeSendMessage(bot, game.telegramGroupId, "Game cancelled because no players are left\\.");
    return "Left the game.";
  }

  if (game.creatorId === user.id) {
    game.creatorId = remaining[0].userId;
    await game.save();
  }

  await refreshLobbyMessage(bot, game);
  return "You left the lobby.";
}

export async function cancelGame(bot, game) {
  if (!game || !["lobby", "assigning_words", "describing", "voting"].includes(game.state)) {
    return safeSendMessage(bot, game?.telegramGroupId, "No active game to cancel\\.");
  }

  game.state = "cancelled";
  game.finishedAt = new Date();
  await game.save();
  await clearActiveGame(game);
  await safeSendMessage(bot, game.telegramGroupId, "Game cancelled\\.");
}

export async function startGame(bot, game, isAutoStart = false) {
  if (game.state !== "lobby") {
    await safeSendMessage(bot, game.telegramGroupId, "This game cannot be started now\\.");
    return false;
  }

  game.state = "assigning_words";
  await game.save();

  const settings = await getOrCreateSettings(game.telegramGroupId);
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  if (players.length < settings.minPlayers) {
    if (isAutoStart) {
      game.state = "cancelled";
      game.finishedAt = new Date();
      await game.save();
      await clearActiveGame(game);
      await safeSendMessage(bot, game.telegramGroupId, `Game cancelled: not enough players \\(need ${settings.minPlayers}\\)\\.`);
    } else {
      game.state = "lobby";
      await game.save();
      await safeSendMessage(bot, game.telegramGroupId, `Need ${settings.minPlayers} players to start\\.`);
    }
    return false;
  }
  if (players.length > settings.maxPlayers) {
    game.state = "lobby";
    await game.save();
    await safeSendMessage(bot, game.telegramGroupId, `Too many players\\. Max players: ${settings.maxPlayers}\\.`);
    return false;
  }

  const blocked = [];
  for (const player of players) {
    const dm = await checkDmEnabled(bot, player.userId);
    if (!dm) blocked.push(player);
  }

  if (blocked.length > 0) {
    game.state = "lobby";
    await game.save();
    const names = blocked.map((player) => mentionPlayer(player)).join(", ");
    await safeSendMessage(
      bot,
      game.telegramGroupId,
      `Cannot start yet\\. These players need to DM me and send /start: ${names}`
    );
    return false;
  }

  game.state = "assigning_words";
  game.lobbyDeadline = null;
  await game.save();

  const assignment = await pickWordAssignment(game.telegramGroupId);
  const impostorIds = chooseImpostors(players);

  const powerUserIds = game.gameMode === "killer" ? choosePowerCardPlayers(players, KILLER_POWER_CARD_COUNT) : new Set();

  for (const player of players) {
    const isImpostor = impostorIds.includes(player.userId);
    player.role = isImpostor ? "impostor" : "normal";
    player.secretWord = isImpostor ? assignment.impostorWord : assignment.mainWord;
    player.powerCard = powerUserIds.has(player.userId) ? assignPowerCard(isImpostor) : "";
    player.powerUsed = false;
    player.powerActiveRound = null;
    player.powerTargetUserId = null;
    player.silencedRound = null;
    player.hasReceivedDm = false;
    await player.save();
  }

  game.mainWord = assignment.mainWord;
  game.impostorWord = assignment.impostorWord;
  game.impostorIds = impostorIds;
  game.roundNumber = 1;
  game.state = "describing";
  game.startedAt = new Date();
  game.clueDeadline = new Date(Date.now() + settings.clueTimeLimit * 1000);
  await game.save();

  for (const player of players) {
    const isKillerMode = game.gameMode === "killer";
    const isImpostor = player.role === "impostor";
    let roleInfo = "";
    if (isKillerMode) {
      roleInfo = isImpostor ? `${bold("You are IMPOSTOR")}\n` : `${bold("You are CREW")}\n`;
    }
    let message = `${roleInfo}${bold("Your word")}: ${bold(player.secretWord)}\nReply with one clue\\. Do not use the exact word\\.`;
    if (isKillerMode && isImpostor) {
      message += `\n\n${bold("KILLER MODE")}: You can /kill one player in DM during the clue phase\\.`;
    }
    if (isKillerMode && player.powerCard) {
      message += `\n\n${bold("Power card")}: ${bold(powerLabel(player.powerCard))}\n${escapeMarkdown(powerDescription(player.powerCard))}\nUse /power in DM when the timing is right\\.`;
    }
    const sent = await safeSendMessage(
      bot,
      player.userId,
      message
    );
    if (!sent) {
      game.state = "lobby";
      game.mainWord = "";
      game.impostorWord = "";
      game.impostorIds = [];
      game.lobbyDeadline = new Date(Date.now() + (settings.lobbyTimeLimit || 60) * 1000);
      game.clueDeadline = null;
      await game.save();
      await Player.updateMany({ gameId: game._id }, {
        $set: {
          role: "normal",
          secretWord: "",
          hasReceivedDm: false,
          powerCard: "",
          powerUsed: false,
          powerActiveRound: null,
          powerTargetUserId: null,
          silencedRound: null
        }
      });
      await safeSendMessage(bot, game.telegramGroupId, `Could not DM ${mentionPlayer(player)}\\. They must send /start in private chat first\\.`);
      return false;
    }
    player.hasReceivedDm = true;
    await player.save();
  }

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Clue round started")}\nWords are in DM\\. Reply there with one clue\\.\nTime: ${formatSeconds(settings.clueTimeLimit)}\\.`
  );
  return true;
}

export async function submitClue(bot, game, user, clueText, options = {}) {
  const feedbackChatId = options.feedbackChatId || game.telegramGroupId;
  const privateSubmit = Boolean(options.privateSubmit);
  const roundNumber = game.roundNumber || 1;

  if (game.state !== "describing") return safeSendMessage(bot, feedbackChatId, "Clues are not open right now\\.");
  if (!clueText) return safeSendMessage(bot, feedbackChatId, "Please provide a valid clue\\.");
  if (clueText.length > 240) return safeSendMessage(bot, feedbackChatId, "Clue is too long\\. Keep it under 240 characters\\.");

  const player = await Player.findOne({ gameId: game._id, userId: user.id, isAlive: true });
  if (!player) return safeSendMessage(bot, feedbackChatId, "You are not an active player in this game\\.");
  if (player.silencedRound === roundNumber) {
    return safeSendMessage(bot, feedbackChatId, "You were silenced this round\\. You cannot submit a clue\\.");
  }
  if (containsExactWord(clueText, player.secretWord)) {
    return safeSendMessage(bot, feedbackChatId, "Invalid clue\\. Do not say your exact secret word\\.");
  }

  const settings = await getOrCreateSettings(game.telegramGroupId);
  const existing = await Clue.findOne({ gameId: game._id, roundNumber, userId: user.id });
  if (existing && !settings.allowClueEdit) {
    return safeSendMessage(bot, feedbackChatId, "You already submitted a clue\\.");
  }

  const normalizedClue = normalizeClue(clueText);
  const usedClues = await Clue.find({ gameId: game._id, roundNumber }).select("userId clue");
  const duplicate = usedClues.find((clue) => {
    if (existing && String(clue.userId) === String(user.id) && clue._id.equals(existing._id)) return false;
    return normalizeClue(clue.clue) === normalizedClue;
  });
  if (duplicate) {
    return safeSendMessage(bot, feedbackChatId, "That clue was already used in this game\\. Send a different clue\\.");
  }

  await Clue.findOneAndUpdate(
    { gameId: game._id, roundNumber, userId: user.id },
    { $set: { clue: clueText, roundNumber } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const aliveCount = await countClueEligiblePlayers(game._id, roundNumber);
  const clueCount = await Clue.countDocuments({ gameId: game._id, roundNumber });

  if (privateSubmit) {
    await safeSendMessage(bot, feedbackChatId, `Clue saved\\. ${clueCount}/${aliveCount} submitted\\.`);
  }
  await sendClueProgress(bot, game);
  if (clueCount >= aliveCount) await startVoting(bot, game);
}

export async function extendActiveTimer(bot, game, seconds) {
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) {
    return safeSendMessage(bot, game.telegramGroupId, "Extend time must be between 1 and 1800 seconds\\.");
  }

  const now = Date.now();
  let field = null;
  let label = "";

  if (game.state === "lobby") {
    field = "lobbyDeadline";
    label = "Lobby";
  } else if (game.state === "describing") {
    field = "clueDeadline";
    label = "Clue";
  } else if (game.state === "voting") {
    field = "voteDeadline";
    label = "Vote";
  }

  if (!field) return safeSendMessage(bot, game.telegramGroupId, "There is no active timer to extend\\.");

  const currentDeadline = game[field]?.getTime?.() || now;
  game[field] = new Date(Math.max(currentDeadline, now) + seconds * 1000);
  await game.save();

  return safeSendMessage(bot, game.telegramGroupId, `${label} timer extended by ${formatSeconds(seconds)}\\.`);
}

export async function startVoting(bot, game) {
  const freshGame = await Game.findById(game._id);
  if (!freshGame || freshGame.state !== "describing") return;

  const settings = await getOrCreateSettings(freshGame.telegramGroupId);
  const alivePlayers = await Player.find({ gameId: freshGame._id, isAlive: true }).sort({ joinedAt: 1 });
  const clues = await Clue.find({ gameId: freshGame._id, roundNumber: freshGame.roundNumber || 1 });
  const clueByUser = applyClueSwaps(freshGame, new Map(clues.map((clue) => [clue.userId, clue.clue])), freshGame.roundNumber || 1);

  freshGame.state = "voting";
  freshGame.clueDeadline = null;
  freshGame.tieBreakRound = 0;
  freshGame.voteDeadline = new Date(Date.now() + settings.voteTimeLimit * 1000);
  await freshGame.save();

  await sendClueReveal(bot, freshGame, alivePlayers, clueByUser);

  await sendVotePrompt(bot, freshGame);
}

export async function submitVote(bot, game, voterUserId, targetUserId) {
  if (game.state !== "voting") return "Voting is not open right now.";

  // Re-fetch game to get current tieBreakRound (may have changed during a tie-break)
  const freshGame = await Game.findById(game._id);
  if (!freshGame || freshGame.state !== "voting") return "Voting is not open right now.";

  const voter = await Player.findOne({ gameId: freshGame._id, userId: voterUserId, isAlive: true });
  if (!voter) return "You are not an active player in this game.";
  if (voterUserId === targetUserId) return "You cannot vote for yourself.";

  const target = await Player.findOne({ gameId: freshGame._id, userId: targetUserId, isAlive: true });
  if (!target) return "That player is not an active voting target.";

  const effectiveRound = getEffectiveRound(freshGame);

  try {
    await Vote.create({ gameId: freshGame._id, roundNumber: effectiveRound, voterId: voterUserId, targetId: targetUserId });
  } catch (error) {
    if (error.code === 11000) return "You already voted.";
    throw error;
  }

  await sendVoteProgress(bot, freshGame);

  const aliveCount = await Player.countDocuments({ gameId: freshGame._id, isAlive: true });
  const voteCount = await Vote.countDocuments({ gameId: freshGame._id, roundNumber: effectiveRound });
  if (voteCount >= aliveCount) await finishVoting(bot, freshGame);
  return "Vote recorded.";
}

export async function finishVoting(bot, game) {
  const freshGame = await Game.findById(game._id);
  if (!freshGame || freshGame.state !== "voting") return;

  const effectiveRound = getEffectiveRound(freshGame);
  const summary = await getVoteSummary(freshGame._id, effectiveRound);

  // Handle tie — start tie-break re-vote with only tied players
  if (summary.tied && summary.tiedUserIds.length >= 2) {
    const tiedPlayers = freshGame._id
      ? await Player.find({ gameId: freshGame._id, userId: { $in: summary.tiedUserIds } }).sort({ joinedAt: 1 })
      : [];
    const tiedNames = tiedPlayers.map((player) => mentionPlayer(player)).join(", ");
    const topVotes = summary.counts.get(summary.tiedUserIds[0]) || 0;

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      `${bold("Tie!")}\n${tiedNames} tied with ${topVotes} vote${topVotes === 1 ? "" : "s"} each\\.\nVote again\\! Only tied players can be ejected\\.`
    );

    freshGame.tieBreakRound = (freshGame.tieBreakRound || 0) + 1;
    const settings = await getOrCreateSettings(freshGame.telegramGroupId);
    freshGame.voteDeadline = new Date(Date.now() + settings.voteTimeLimit * 1000);
    await freshGame.save();

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      `${bold("Tie\\-break vote")}\nPick who to eject from the tied players\\. Time: ${formatSeconds(settings.voteTimeLimit)}\\.`,
      { reply_markup: voteKeyboard(freshGame.gameCode, tiedPlayers) }
    );
    return;
  }

  // Clear winner — reset tie-break counter
  freshGame.tieBreakRound = 0;
  await freshGame.save();

  const roundNumber = freshGame.roundNumber || 1;
  let eliminated = null;
  let shielded = null;
  if (summary.eliminatedUserId) {
    const target = await Player.findOne({ gameId: freshGame._id, userId: summary.eliminatedUserId });
    if (target?.powerCard === "shield" && target.powerUsed && target.powerActiveRound === effectiveRound) {
      shielded = target;
    } else {
      eliminated = await Player.findOneAndUpdate(
        { gameId: freshGame._id, userId: summary.eliminatedUserId },
        { $set: { isAlive: false } },
        { new: true }
      );
    }
  }

  const players = await Player.find({ gameId: freshGame._id }).sort({ joinedAt: 1 });
  const impostors = players.filter((player) => player.role === "impostor");
  const alivePlayers = players.filter((player) => player.isAlive);
  const voteLines = summary.alivePlayers.map((player) => `• ${mentionPlayer(player)}: ${summary.counts.get(player.userId) || 0}`);
  const alivePlayerLine = alivePlayers.length
    ? alivePlayers.map((player) => mentionPlayer(player)).join(", ")
    : "None";
  const aliveImpostors = alivePlayers.filter((player) => player.role === "impostor");
  const aliveNormals = alivePlayers.filter((player) => player.role !== "impostor");
  
  const eliminatedLine = shielded
    ? `${mentionPlayer(shielded)} would have been ejected, but their ${bold("Shield")} blocked it\\. No one was ejected\\.`
    : eliminated
    ? `${mentionPlayer(eliminated)} was ${eliminated.role === "impostor" ? "an impostor" : "not an impostor"}\\. ${aliveImpostors.length} impostor${aliveImpostors.length === 1 ? "" : "s"} remain\\.`
    : "No one was ejected \\(Tie\\)\\.";

  const normalsWin = impostors.length > 0 && aliveImpostors.length === 0;
  const impostorsWin = aliveImpostors.length > 0 && aliveImpostors.length >= aliveNormals.length;

  if (normalsWin || impostorsWin) {
    freshGame.state = "finished";
    freshGame.finishedAt = new Date();
    freshGame.voteDeadline = null;
    await freshGame.save();
    await clearActiveGame(freshGame);

    const winner = normalsWin ? "Crew wins!" : "Impostors win!";
    const winningRole = normalsWin ? "normal" : "impostor";
    const winningPlayers = players.filter((player) => player.role === winningRole);
    const winnerNames = winningPlayers.map((player) => mentionPlayer(player)).join(", ");
    await updateGameStats(freshGame, players, winningRole);

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      eliminatedLine
    );

    // Wait a brief moment for effect
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      `${bold(winner)}\nWinners: ${winnerNames}\n${normalsWin ? "All impostors were eliminated\\." : "Impostors reached parity with the crew\\."}`
    );

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      `${bold("Final result")}\nRounds: ${roundNumber}\nMain word: ${bold(freshGame.mainWord)}\nImpostor word: ${bold(freshGame.impostorWord)}\nImpostors: ${impostors.map((player) => mentionPlayer(player)).join(", ")}\n\n${bold("Last vote")}\n${voteLines.join("\n")}`
    );
    await evaluateGameAchievements(bot, freshGame, players, winningRole);
    return;
  }

  freshGame.roundNumber = roundNumber + 1;
  await startNextDescribeRound(bot, freshGame, eliminatedLine, voteLines, alivePlayerLine, roundNumber);
}

async function startNextDescribeRound(bot, game, eliminatedLine, voteLines, alivePlayerLine, completedRoundNumber) {
  const settings = await getOrCreateSettings(game.telegramGroupId);
  game.state = "describing";
  game.voteDeadline = null;
  game.clueDeadline = new Date(Date.now() + settings.clueTimeLimit * 1000);
  await game.save();

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    eliminatedLine
  );

  // Wait a brief moment for effect
  await new Promise((resolve) => setTimeout(resolve, 1500));

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Round result")}\nRound: ${completedRoundNumber}\nThe game continues\\. Alive players get a fresh clue prompt in DM\\.\nTime: ${formatSeconds(settings.clueTimeLimit)}\\.\n\n${bold("Alive players")}\n${alivePlayerLine}\n\n${bold("Votes")}\n${voteLines.join("\n")}`
  );
  await promptAlivePlayersForClues(bot, game);
}

async function promptAlivePlayersForClues(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  for (const player of alivePlayers) {
    const powerLine = game.gameMode === "killer" && player.powerCard && !player.powerUsed
      ? `\nPower available: ${powerLabel(player.powerCard)}\\. Use /power if it applies this round\\.`
      : "";
    await safeSendMessage(
      bot,
      player.userId,
      `${bold(`Round ${game.roundNumber}`)}\nSend one new clue for your word\\. Do not use the exact word\\.${powerLine}`
    );
  }
}

export async function forceEndGame(bot, game) {
  if (!game) return;
  game.state = "finished";
  game.finishedAt = new Date();
  await game.save();
  await clearActiveGame(game);

  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  const impostors = players.filter((player) => player.role === "impostor");

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Game ended")}\nMain word: ${bold(game.mainWord || "Not assigned")}\nImpostor word: ${bold(game.impostorWord || "Not assigned")}\nImpostors: ${impostors.length ? impostors.map((player) => mentionPlayer(player)).join(", ") : "Not assigned"}`
  );
}

export async function renderStatus(game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const lines = alivePlayers.map((player) => `• ${mentionPlayer(player)}`);
  const deadline = activeDeadline(game);
  const timerLine = deadline ? `\nTimer: ${formatSeconds(secondsUntil(deadline))} left` : "";
  return `${bold("Game status")}\nPhase: ${escapeMarkdown(stateLabel(game.state))}${timerLine}\nAlive players: ${alivePlayers.length}\n\n${lines.join("\n") || "No alive players\\."}`;
}

export async function renderLobby(game) {
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  const lines = players.map((player, index) => `${index + 1}\\. ${mentionPlayer(player)}${player.userId === game.creatorId ? " \\(creator\\)" : ""}`);
  const timerLine = game.lobbyDeadline ? `\nStarts in: ${formatSeconds(secondsUntil(game.lobbyDeadline))}` : "";
  const modeLine = game.gameMode === "killer" ? `\n${bold("KILLER MODE")} \\- Impostors can kill once per game\\. Power cards are enabled\\.` : "";
  return `${bold("Who's Impostor?")}\nCode: ${escapeMarkdown(game.gameCode)}\nPlayers: ${players.length}${timerLine}${modeLine}\n\n${lines.join("\n") || "No players yet\\."}\n\nJoin if you are playing\\. The creator or an admin can start early\\.`;
}

export async function refreshLobbyMessage(bot, game) {
  const freshGame = await Game.findById(game._id);
  if (!freshGame?.lobbyMessageId) return;
  await safeEditMessage(bot, freshGame.telegramGroupId, freshGame.lobbyMessageId, await renderLobby(freshGame), {
    reply_markup: lobbyKeyboard(freshGame.gameCode)
  });
}

async function sendVotePrompt(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const settings = await getOrCreateSettings(game.telegramGroupId);
  const powerLine = game.gameMode === "killer" ? "\nKiller mode powers like Shield and Double Vote can be used now with /power in DM\\." : "";
  await safeSendMessage(bot, game.telegramGroupId, `${bold("Vote now")}\nRound: ${game.roundNumber || 1}\nPick the player who seems off\\. Time: ${formatSeconds(settings.voteTimeLimit)}\\.${powerLine}`, {
    reply_markup: voteKeyboard(game.gameCode, alivePlayers)
  });
}

async function sendVoteProgress(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const votes = await Vote.find({ gameId: game._id, roundNumber: getEffectiveRound(game) });
  const votedIds = new Set(votes.map((vote) => vote.voterId));
  const voted = alivePlayers.filter((player) => votedIds.has(player.userId));
  const pending = alivePlayers.filter((player) => !votedIds.has(player.userId));

  const votedLine = voted.length
    ? voted.map((player) => mentionPlayer(player)).join(", ")
    : "None";
  const pendingLine = pending.length
    ? pending.map((player) => mentionPlayer(player)).join(", ")
    : "None";

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Vote progress")}: ${voted.length}/${alivePlayers.length}\nDone: ${votedLine}\nWaiting: ${pendingLine}`
  );
}

async function sendClueProgress(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const clues = await Clue.find({ gameId: game._id, roundNumber: game.roundNumber || 1 });
  const submittedIds = new Set(clues.map((clue) => clue.userId));
  const eligiblePlayers = alivePlayers.filter((player) => player.silencedRound !== (game.roundNumber || 1));
  const submitted = eligiblePlayers.filter((player) => submittedIds.has(player.userId));
  const pending = eligiblePlayers.filter((player) => !submittedIds.has(player.userId));

  const submittedLine = submitted.length
    ? submitted.map((player) => mentionPlayer(player)).join(", ")
    : "None";
  const pendingLine = pending.length
    ? pending.map((player) => mentionPlayer(player)).join(", ")
    : "None";

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Clue progress")}: ${submitted.length}/${eligiblePlayers.length}\nDone: ${submittedLine}\nWaiting: ${pendingLine}`
  );
}

async function sendClueReveal(bot, game, alivePlayers, clueByUser) {
  const clueLines = alivePlayers.map((player) => {
    const clue = clueByUser.get(player.userId) || "No clue submitted.";
    return `• ${mentionPlayer(player)}: ${escapeMarkdown(clue)}`;
  });

  try {
    const avatarsByUserId = await getPlayerAvatars(bot, alivePlayers);
    const images = await renderCluesImages({ game, players: alivePlayers, clueByUser, avatarsByUserId });
    let sentAny = false;
    for (let index = 0; index < images.length; index += 1) {
      const caption = index === images.length - 1
        ? `${bold("Clues")}\nNow vote for the impostor\\.`
        : `${bold("Clues")}\nPage ${index + 1}/${images.length}`;
      const sent = await safeSendPhoto(bot, game.telegramGroupId, images[index], { caption });
      sentAny = Boolean(sent) || sentAny;
    }
    if (sentAny) return;
  } catch (error) {
    console.error("Clue image generation failed:", error.message);
  }

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Clues")}\n${clueLines.join("\n")}\n\nNow vote for the impostor using the buttons below\\.`
  );
}

async function getPlayerAvatars(bot, players) {
  const avatarsByUserId = new Map();

  for (const player of players) {
    try {
      const photos = await bot.getUserProfilePhotos(player.userId, { limit: 1 });
      const photo = photos.photos?.[0]?.at(-1);
      if (!photo?.file_id) continue;

      const link = await bot.getFileLink(photo.file_id);
      const response = await fetch(link);
      if (!response.ok) continue;

      avatarsByUserId.set(player.userId, Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error(`Profile photo fetch failed for ${player.userId}:`, error.message);
    }
  }

  return avatarsByUserId;
}

function activeDeadline(game) {
  if (game.state === "lobby") return game.lobbyDeadline;
  if (game.state === "describing") return game.clueDeadline;
  if (game.state === "voting") return game.voteDeadline;
  return null;
}

function secondsUntil(date) {
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));
}

function formatSeconds(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (remainder === 0) return `${minutes} min`;
  return `${minutes} min ${remainder} sec`;
}

function stateLabel(state) {
  const labels = {
    lobby: "Lobby",
    assigning_words: "Sending words",
    describing: "Clues",
    voting: "Voting",
    finished: "Finished",
    cancelled: "Cancelled"
  };
  return labels[state] || state;
}

function normalizeClue(clue) {
  return String(clue)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "");
}

async function countClueEligiblePlayers(gameId, roundNumber) {
  return Player.countDocuments({
    gameId,
    isAlive: true,
    $or: [{ silencedRound: { $ne: roundNumber } }, { silencedRound: null }]
  });
}

function applyClueSwaps(game, clueByUser, roundNumber) {
  const swaps = (game.clueSwaps || []).filter((swap) => swap.roundNumber === roundNumber);
  for (const swap of swaps) {
    const firstClue = clueByUser.get(swap.firstUserId);
    const secondClue = clueByUser.get(swap.secondUserId);
    clueByUser.set(swap.firstUserId, secondClue);
    clueByUser.set(swap.secondUserId, firstClue);
  }
  return clueByUser;
}

function assignPowerCard(isImpostor) {
  const pool = isImpostor ? IMPOSTOR_POWER_CARDS : CREW_POWER_CARDS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function choosePowerCardPlayers(players, cardCount) {
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return new Set(shuffled.slice(0, Math.min(cardCount, shuffled.length)).map((player) => player.userId));
}

export function powerLabel(powerCard) {
  const labels = {
    detective: "Detective",
    silencer: "Silencer",
    double_vote: "Double Vote",
    shield: "Shield",
    saboteur: "Saboteur"
  };
  return labels[powerCard] || "No power";
}

export function powerDescription(powerCard) {
  const descriptions = {
    detective: "Pick one player to privately learn whether they are an impostor.",
    silencer: "During the clue phase, block one player from submitting a clue this round.",
    double_vote: "During voting, make your vote count as 2 this round.",
    shield: "During voting, protect yourself from being ejected this round.",
    saboteur: "During the clue phase, swap the displayed clues of two players before voting."
  };
  return descriptions[powerCard] || "No power card assigned.";
}

export async function updateGameStats(game, players, winningRole) {
  const votes = await Vote.find({ gameId: game._id });
  const votesByUser = new Map();

  for (const vote of votes) {
    votesByUser.set(vote.voterId, (votesByUser.get(vote.voterId) || 0) + 1);
  }

  for (const player of players) {
    const isImpostor = player.role === "impostor";
    const won = player.role === winningRole;
    const update = {
      $set: {
        username: player.username || "",
        firstName: player.firstName || ""
      },
      $inc: {
        gamesPlayed: 1,
        wins: won ? 1 : 0,
        losses: won ? 0 : 1,
        normalGames: isImpostor ? 0 : 1,
        normalWins: !isImpostor && won ? 1 : 0,
        impostorGames: isImpostor ? 1 : 0,
        impostorWins: isImpostor && won ? 1 : 0,
        timesEliminated: player.isAlive ? 0 : 1,
        totalVotesCast: votesByUser.get(player.userId) || 0
      }
    };

    await UserStat.updateOne(
      { userId: player.userId },
      update,
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
}

async function notifyNextGameSubscribers(bot, game) {
  const subscriptions = await NextGameSubscription.find({ telegramGroupId: game.telegramGroupId }).sort({ createdAt: 1 });
  if (subscriptions.length === 0) return;

  await NextGameSubscription.deleteMany({ telegramGroupId: game.telegramGroupId });

  for (const subscription of subscriptions) {
    await safeSendMessage(
      bot,
      subscription.userId,
      `A new Who's Impostor lobby is open\\. Join in the group now\\.\nGame code: ${escapeMarkdown(game.gameCode)}`
    );
  }
}

export function playerFromUser(game, user) {
  return {
    gameId: game._id,
    telegramGroupId: game.telegramGroupId,
    userId: user.id,
    username: user.username || "",
    firstName: user.first_name || "",
    role: "normal",
    secretWord: "",
    isAlive: true,
    hasReceivedDm: false,
    powerCard: "",
    powerUsed: false,
    powerActiveRound: null,
    powerTargetUserId: null,
    silencedRound: null
  };
}

export async function handleSmite(bot, game, target) {
  await Player.updateOne({ _id: target._id }, { $set: { isAlive: false } });
  const freshGame = await Game.findById(game._id);
  const players = await Player.find({ gameId: freshGame._id }).sort({ joinedAt: 1 });
  const impostors = players.filter((player) => player.role === "impostor");
  const alivePlayers = players.filter((player) => player.isAlive);
  const aliveImpostors = alivePlayers.filter((player) => player.role === "impostor");
  const aliveNormals = alivePlayers.filter((player) => player.role !== "impostor");

  const eliminatedLine = `⚡ ${mentionPlayer(target)} was removed by an admin\\. They were ${target.role === "impostor" ? "an impostor" : "not an impostor"}\\. ${aliveImpostors.length} impostor${aliveImpostors.length === 1 ? "" : "s"} remain\\.`;
  await safeSendMessage(bot, freshGame.telegramGroupId, eliminatedLine);

  const normalsWin = impostors.length > 0 && aliveImpostors.length === 0;
  const impostorsWin = aliveImpostors.length > 0 && aliveImpostors.length >= aliveNormals.length;

  if (normalsWin || impostorsWin) {
    freshGame.state = "finished";
    freshGame.finishedAt = new Date();
    freshGame.voteDeadline = null;
    await freshGame.save();
    await clearActiveGame(freshGame);

    const winner = normalsWin ? "Crew wins!" : "Impostors win!";
    const winningRole = normalsWin ? "normal" : "impostor";
    const winningPlayers = players.filter((player) => player.role === winningRole);
    const winnerNames = winningPlayers.map((player) => mentionPlayer(player)).join(", ");
    await updateGameStats(freshGame, players, winningRole);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold(winner)}\nWinners: ${winnerNames}\n${normalsWin ? "All impostors were eliminated\\." : "Impostors reached parity with the crew\\."}`);
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold("Final result")}\nMain word: ${bold(freshGame.mainWord)}\nImpostor word: ${bold(freshGame.impostorWord)}\nImpostors: ${impostors.map((player) => mentionPlayer(player)).join(", ")}`);
    await evaluateGameAchievements(bot, freshGame, players, winningRole);
    return;
  }

  // Not finished, force advance if needed
  if (freshGame.state === "describing") {
    const clueCount = await Clue.countDocuments({ gameId: freshGame._id, roundNumber: freshGame.roundNumber || 1 });
    if (clueCount >= alivePlayers.length) await startVoting(bot, freshGame);
  } else if (freshGame.state === "voting") {
    const voteCount = await Vote.countDocuments({ gameId: freshGame._id, roundNumber: getEffectiveRound(freshGame) });
    if (voteCount >= alivePlayers.length) await finishVoting(bot, freshGame);
  }
}
