import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { Clue } from "../models/Clue.js";
import { Vote } from "../models/Vote.js";
import { Group } from "../models/Group.js";
import { UserStat } from "../models/UserStat.js";
import { NextGameSubscription } from "../models/NextGameSubscription.js";
import { pickWordAssignment, chooseImpostors } from "./wordManager.js";
import { getOrCreateGroup, getOrCreateSettings, getActiveGame, clearActiveGame, generateGameCode } from "./stateManager.js";
import { getVoteSummary } from "./voteManager.js";
import { containsExactWord } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";
import { renderCluesImages } from "../utils/clueImage.js";
import { lobbyKeyboard, mentionPlayer, playerName, safeEditMessage, safeSendMessage, safeSendPhoto, voteKeyboard } from "../utils/telegram.js";

export async function createNewGame(bot, msg) {
  const existing = await getActiveGame(msg.chat.id);
  if (existing) return safeSendMessage(bot, msg.chat.id, "A game is already active in this group\\.");

  const group = await getOrCreateGroup(msg.chat);
  const settings = await getOrCreateSettings(msg.chat.id);
  let gameCode = generateGameCode();
  while (await Game.exists({ gameCode })) gameCode = generateGameCode();

  const game = await Game.create({
    groupId: group._id,
    telegramGroupId: msg.chat.id,
    creatorId: msg.from.id,
    gameCode,
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
  if (count >= settings.maxPlayers) return `This lobby is full. Max players: ${settings.maxPlayers}.`;

  const dmReady = await safeSendMessage(
    bot,
    user.id,
    "You are ready to join Who's Impostor? Keep this chat open so I can send your secret word\\."
  );
  if (!dmReady) {
    return "Open a private chat with me and send /start first. Then press Join Game again.";
  }

  try {
    await Player.create(playerFromUser(game, user));
  } catch (error) {
    if (error.code === 11000) return "You already joined this game.";
    throw error;
  }

  await refreshLobbyMessage(bot, game);
  return "Joined the game.";
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
  return "Left the game.";
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

export async function startGame(bot, game) {
  if (game.state !== "lobby") {
    await safeSendMessage(bot, game.telegramGroupId, "This game cannot be started now\\.");
    return false;
  }

  const settings = await getOrCreateSettings(game.telegramGroupId);
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  if (players.length < settings.minPlayers) {
    await safeSendMessage(bot, game.telegramGroupId, `Need at least ${settings.minPlayers} players to start\\.`);
    return false;
  }
  if (players.length > settings.maxPlayers) {
    await safeSendMessage(bot, game.telegramGroupId, `Too many players\\. Max players: ${settings.maxPlayers}\\.`);
    return false;
  }

  const blocked = [];
  for (const player of players) {
    const dm = await safeSendMessage(bot, player.userId, "DM check for Who's Impostor? You are ready for the next game\\.");
    if (!dm) blocked.push(player);
  }

  if (blocked.length > 0) {
    const names = blocked.map((player) => mentionPlayer(player)).join(", ");
    await safeSendMessage(
      bot,
      game.telegramGroupId,
      `Cannot start yet\\. These players must open a private chat with me and send /start: ${names}`
    );
    return false;
  }

  game.state = "assigning_words";
  game.lobbyDeadline = null;
  await game.save();

  const assignment = pickWordAssignment();
  const impostorIds = chooseImpostors(players);

  for (const player of players) {
    const isImpostor = impostorIds.includes(player.userId);
    player.role = isImpostor ? "impostor" : "normal";
    player.secretWord = isImpostor ? assignment.impostorWord : assignment.mainWord;
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
    const sent = await safeSendMessage(
      bot,
      player.userId,
      `${bold("Your secret word")}: ${bold(player.secretWord)}\nReply here with /describe your clue without saying the exact word\\.`
    );
    if (!sent) {
      game.state = "lobby";
      game.mainWord = "";
      game.impostorWord = "";
      game.impostorIds = [];
      game.lobbyDeadline = new Date(Date.now() + (settings.lobbyTimeLimit || 60) * 1000);
      game.clueDeadline = null;
      await game.save();
      await Player.updateMany({ gameId: game._id }, { $set: { role: "normal", secretWord: "", hasReceivedDm: false } });
      await safeSendMessage(bot, game.telegramGroupId, `Could not DM ${mentionPlayer(player)}\\. They must send /start in private chat first\\.`);
      return false;
    }
    player.hasReceivedDm = true;
    await player.save();
  }

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `Words sent\\. Describe your word privately with me using /describe your clue here\\.\nClue time: ${settings.clueTimeLimit} seconds\\.`
  );
  return true;
}

export async function submitClue(bot, game, user, clueText, options = {}) {
  const feedbackChatId = options.feedbackChatId || game.telegramGroupId;
  const privateSubmit = Boolean(options.privateSubmit);
  const roundNumber = game.roundNumber || 1;

  if (game.state !== "describing") return safeSendMessage(bot, feedbackChatId, "Clues are not open right now\\.");
  if (!clueText) return safeSendMessage(bot, feedbackChatId, "Use /describe followed by your clue\\.");
  if (clueText.length > 240) return safeSendMessage(bot, feedbackChatId, "Clue is too long\\. Keep it under 240 characters\\.");

  const player = await Player.findOne({ gameId: game._id, userId: user.id, isAlive: true });
  if (!player) return safeSendMessage(bot, feedbackChatId, "You are not an active player in this game\\.");
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
    if (existing && clue.userId === user.id && clue._id.equals(existing._id)) return false;
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

  const aliveCount = await Player.countDocuments({ gameId: game._id, isAlive: true });
  const clueCount = await Clue.countDocuments({ gameId: game._id, roundNumber });

  if (privateSubmit) {
    await safeSendMessage(bot, feedbackChatId, `Clue saved\\. Progress: ${clueCount}/${aliveCount}\\.`);
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

  return safeSendMessage(bot, game.telegramGroupId, `${label} timer extended by ${seconds} seconds\\.`);
}

export async function startVoting(bot, game) {
  const freshGame = await Game.findById(game._id);
  if (!freshGame || freshGame.state !== "describing") return;

  const settings = await getOrCreateSettings(freshGame.telegramGroupId);
  const alivePlayers = await Player.find({ gameId: freshGame._id, isAlive: true }).sort({ joinedAt: 1 });
  const clues = await Clue.find({ gameId: freshGame._id, roundNumber: freshGame.roundNumber || 1 });
  const clueByUser = new Map(clues.map((clue) => [clue.userId, clue.clue]));

  freshGame.state = "voting";
  freshGame.clueDeadline = null;
  freshGame.voteDeadline = new Date(Date.now() + settings.voteTimeLimit * 1000);
  await freshGame.save();

  await sendClueReveal(bot, freshGame, alivePlayers, clueByUser);

  await sendVotePrompt(bot, freshGame);
}

export async function submitVote(bot, game, voterUserId, targetUserId) {
  if (game.state !== "voting") return "Voting is not open right now.";

  const voter = await Player.findOne({ gameId: game._id, userId: voterUserId, isAlive: true });
  if (!voter) return "You are not an active player in this game.";
  if (voterUserId === targetUserId) return "You cannot vote for yourself.";

  const target = await Player.findOne({ gameId: game._id, userId: targetUserId, isAlive: true });
  if (!target) return "That player is not an active voting target.";

  try {
    await Vote.create({ gameId: game._id, roundNumber: game.roundNumber || 1, voterId: voterUserId, targetId: targetUserId });
  } catch (error) {
    if (error.code === 11000) return "You already voted.";
    throw error;
  }

  await sendVoteProgress(bot, game);

  const aliveCount = await Player.countDocuments({ gameId: game._id, isAlive: true });
  const voteCount = await Vote.countDocuments({ gameId: game._id, roundNumber: game.roundNumber || 1 });
  if (voteCount >= aliveCount) await finishVoting(bot, game);
  return "Vote recorded.";
}

export async function finishVoting(bot, game) {
  const freshGame = await Game.findById(game._id);
  if (!freshGame || freshGame.state !== "voting") return;

  const roundNumber = freshGame.roundNumber || 1;
  const summary = await getVoteSummary(freshGame._id, roundNumber);
  let eliminated = null;
  if (summary.eliminatedUserId) {
    eliminated = await Player.findOneAndUpdate(
      { gameId: freshGame._id, userId: summary.eliminatedUserId },
      { $set: { isAlive: false } },
      { new: true }
    );
  }

  const players = await Player.find({ gameId: freshGame._id }).sort({ joinedAt: 1 });
  const impostors = players.filter((player) => player.role === "impostor");
  const voteLines = players.map((player) => `• ${mentionPlayer(player)}: ${summary.counts.get(player.userId) || 0}`);

  const alivePlayers = players.filter((player) => player.isAlive);
  const aliveImpostors = alivePlayers.filter((player) => player.role === "impostor");
  const aliveNormals = alivePlayers.filter((player) => player.role !== "impostor");
  
  const eliminatedLine = eliminated
    ? `${mentionPlayer(eliminated)} was ${eliminated.role === "impostor" ? "An Impostor" : "not An Impostor"}\\. ${aliveImpostors.length} Impostor${aliveImpostors.length === 1 ? "" : "s"} remain${aliveImpostors.length === 1 ? "s" : ""}\\.`
    : "No one was ejected \\(Tie\\)\\.";

  const normalsWin = impostors.length > 0 && aliveImpostors.length === 0;
  const impostorsWin = aliveImpostors.length > 0 && aliveImpostors.length >= aliveNormals.length;

  if (normalsWin || impostorsWin) {
    freshGame.state = "finished";
    freshGame.finishedAt = new Date();
    freshGame.voteDeadline = null;
    await freshGame.save();
    await clearActiveGame(freshGame);

    const winner = normalsWin ? "Normal players win!" : "Impostors win!";
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
      `${bold(winner)}\nCongratulations to: ${winnerNames}\n${normalsWin ? "All impostors were eliminated\\." : "Impostors reached parity with normal players\\."}`
    );

    await safeSendMessage(
      bot,
      freshGame.telegramGroupId,
      `${bold("Final result")}\nRound: ${roundNumber}\n\nMain word: ${bold(freshGame.mainWord)}\nImpostor word: ${bold(freshGame.impostorWord)}\nImpostors: ${impostors.map((player) => mentionPlayer(player)).join(", ")}\n\nVotes:\n${voteLines.join("\n")}`
    );
    return;
  }

  freshGame.roundNumber = roundNumber + 1;
  await startNextDescribeRound(bot, freshGame, eliminatedLine, voteLines, roundNumber);
}

async function startNextDescribeRound(bot, game, eliminatedLine, voteLines, completedRoundNumber) {
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
    `${bold("Round result")}\nRound: ${completedRoundNumber}\n\nThe game continues\\. Alive players must describe again in DM\\.\nClue time: ${settings.clueTimeLimit} seconds\\.\n\nVotes:\n${voteLines.join("\n")}`
  );
  await promptAlivePlayersForClues(bot, game);
}

async function promptAlivePlayersForClues(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  for (const player of alivePlayers) {
    await safeSendMessage(
      bot,
      player.userId,
      `${bold("Round")} ${game.roundNumber}\nSend a new clue for your word with /describe your clue\\. Do not say the exact word\\.`
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
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  const lines = players.map((player) => `• ${mentionPlayer(player)}${player.isAlive ? "" : " \\(out\\)"}`);
  const deadline = activeDeadline(game);
  const timerLine = deadline ? `\nTimer: ${secondsUntil(deadline)} seconds remaining` : "";
  return `${bold("Game status")}\nState: ${escapeMarkdown(game.state)}${timerLine}\nPlayers: ${players.length}\n${lines.join("\n") || "No players yet\\."}`;
}

export async function renderLobby(game) {
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  const lines = players.map((player, index) => `${index + 1}\\. ${mentionPlayer(player)}${player.userId === game.creatorId ? " \\(creator\\)" : ""}`);
  const timerLine = game.lobbyDeadline ? `\nAutostart: ${secondsUntil(game.lobbyDeadline)} seconds` : "";
  return `${bold("Who's Impostor?")}\nGame code: ${escapeMarkdown(game.gameCode)}\nPlayers: ${players.length}${timerLine}\n\n${lines.join("\n") || "No players yet\\."}\n\nJoin the lobby, then start when everyone is ready\\.`;
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
  await safeSendMessage(bot, game.telegramGroupId, `${bold("Vote now")}\nRound: ${game.roundNumber || 1}`, {
    reply_markup: voteKeyboard(game.gameCode, alivePlayers)
  });
}

async function sendVoteProgress(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const votes = await Vote.find({ gameId: game._id, roundNumber: game.roundNumber || 1 });
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
    `${bold("Vote progress")}\nVoted: ${voted.length}/${alivePlayers.length}\nAlready voted: ${votedLine}\nWaiting for: ${pendingLine}`
  );
}

async function sendClueProgress(bot, game) {
  const alivePlayers = await Player.find({ gameId: game._id, isAlive: true }).sort({ joinedAt: 1 });
  const clues = await Clue.find({ gameId: game._id, roundNumber: game.roundNumber || 1 });
  const submittedIds = new Set(clues.map((clue) => clue.userId));
  const submitted = alivePlayers.filter((player) => submittedIds.has(player.userId));
  const pending = alivePlayers.filter((player) => !submittedIds.has(player.userId));

  const submittedLine = submitted.length
    ? submitted.map((player) => mentionPlayer(player)).join(", ")
    : "None";
  const pendingLine = pending.length
    ? pending.map((player) => mentionPlayer(player)).join(", ")
    : "None";

  await safeSendMessage(
    bot,
    game.telegramGroupId,
    `${bold("Clue progress")}\nSubmitted: ${submitted.length}/${alivePlayers.length}\nAlready described: ${submittedLine}\nWaiting for: ${pendingLine}`
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
        ? `${bold("Clues")}\nVote for the impostor\\.`
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
    `${bold("Clues")}\n${clueLines.join("\n")}\n\nVote for the impostor using the buttons below\\.`
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

function normalizeClue(clue) {
  return String(clue)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "");
}

async function updateGameStats(game, players, winningRole) {
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
    hasReceivedDm: false
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

  const eliminatedLine = `⚡ ${mentionPlayer(target)} was SMITED by an admin\\! They were ${target.role === "impostor" ? "An Impostor" : "not An Impostor"}\\. ${aliveImpostors.length} Impostor${aliveImpostors.length === 1 ? "" : "s"} remain${aliveImpostors.length === 1 ? "s" : ""}\\.`;
  await safeSendMessage(bot, freshGame.telegramGroupId, eliminatedLine);

  const normalsWin = impostors.length > 0 && aliveImpostors.length === 0;
  const impostorsWin = aliveImpostors.length > 0 && aliveImpostors.length >= aliveNormals.length;

  if (normalsWin || impostorsWin) {
    freshGame.state = "finished";
    freshGame.finishedAt = new Date();
    freshGame.voteDeadline = null;
    await freshGame.save();
    await clearActiveGame(freshGame);

    const winner = normalsWin ? "Normal players win!" : "Impostors win!";
    const winningRole = normalsWin ? "normal" : "impostor";
    const winningPlayers = players.filter((player) => player.role === winningRole);
    const winnerNames = winningPlayers.map((player) => mentionPlayer(player)).join(", ");
    await updateGameStats(freshGame, players, winningRole);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold(winner)}\nCongratulations to: ${winnerNames}\n${normalsWin ? "All impostors were eliminated\\." : "Impostors reached parity with normal players\\."}`);
    await safeSendMessage(bot, freshGame.telegramGroupId, `${bold("Final result")}\n\nMain word: ${bold(freshGame.mainWord)}\nImpostor word: ${bold(freshGame.impostorWord)}\nImpostors: ${impostors.map((player) => mentionPlayer(player)).join(", ")}`);
    return;
  }

  // Not finished, force advance if needed
  if (freshGame.state === "describing") {
    const clueCount = await Clue.countDocuments({ gameId: freshGame._id, roundNumber: freshGame.roundNumber || 1 });
    if (clueCount >= alivePlayers.length) await startVoting(bot, freshGame);
  } else if (freshGame.state === "voting") {
    const voteCount = await Vote.countDocuments({ gameId: freshGame._id, roundNumber: freshGame.roundNumber || 1 });
    if (voteCount >= alivePlayers.length) await finishVoting(bot, freshGame);
  }
}
