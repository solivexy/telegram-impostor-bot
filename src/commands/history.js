import { Clue } from "../models/Clue.js";
import { Game } from "../models/Game.js";
import { Player } from "../models/Player.js";
import { isGroupChat } from "../utils/validators.js";
import { bold, escapeMarkdown } from "../utils/markdown.js";
import { mentionPlayer, safeEditMessage, safeSendMessage } from "../utils/telegram.js";

export async function historyCommand(bot, msg) {
  if (isGroupChat(msg)) {
    try {
      await bot.deleteMessage(msg.chat.id, msg.message_id);
    } catch (error) {
      console.error("Could not delete public history message:", error.message);
    }
  }

  const chatId = msg.from.id;
  const page = 0;
  const history = await buildHistoryPage(msg.from.id, page);
  const sent = await safeSendMessage(bot, chatId, history.text, {
    reply_markup: history.keyboard
  });

  if (!sent && isGroupChat(msg)) {
    await safeSendMessage(bot, msg.chat.id, "Open a private chat with me and send /start so I can DM your history\\.");
  }
}

export async function showHistoryPage(bot, query, page) {
  const history = await buildHistoryPage(query.from.id, page);
  await safeEditMessage(bot, query.message.chat.id, query.message.message_id, history.text, {
    reply_markup: history.keyboard
  });
}

async function buildHistoryPage(userId, page) {
  const memberships = await Player.find({ userId }).sort({ joinedAt: -1 });
  const gameIds = memberships.map((player) => player.gameId);
  const games = await Game.find({ _id: { $in: gameIds } }).sort({ createdAt: -1 });
  const game = games[0];

  if (!game) {
    return {
      text: `${bold("Clue history")}\nNo game history found yet\\.`,
      keyboard: undefined
    };
  }

  const allClues = await Clue.find({ gameId: game._id }).sort({ roundNumber: 1, createdAt: 1 });
  const players = await Player.find({ gameId: game._id }).sort({ joinedAt: 1 });
  const clues = visibleHistoryClues(game, allClues, players);
  const playersByUserId = new Map(players.map((player) => [player.userId, player]));
  const rounds = [...new Set(clues.map((clue) => clue.roundNumber || 1))].sort((a, b) => a - b);

  if (rounds.length === 0) {
    return {
      text: [
        bold("Clue history"),
        `Game: ${escapeMarkdown(game.gameCode)}`,
        `Status: ${escapeMarkdown(game.state)}`,
        "",
        "No completed clue rounds in this game yet\\."
      ].join("\n"),
      keyboard: undefined
    };
  }

  const totalPages = rounds.length;
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const roundNumber = rounds[safePage];
  const roundClues = clues.filter((clue) => (clue.roundNumber || 1) === roundNumber);
  const clueLines = roundClues.map((clue) => {
    const player = playersByUserId.get(clue.userId);
    return `• ${mentionPlayer(player || { userId: clue.userId })}: ${escapeMarkdown(clue.clue)}`;
  });

  return {
    text: [
      bold("Clue history"),
      `Page: ${safePage + 1}/${totalPages}`,
      `Game: ${escapeMarkdown(game.gameCode)}`,
      `Status: ${escapeMarkdown(game.state)}`,
      `Round: ${roundNumber}`,
      "",
      clueLines.join("\n")
    ].join("\n"),
    keyboard: historyKeyboard(safePage, totalPages)
  };
}

function historyKeyboard(page, totalPages) {
  if (totalPages <= 1) return undefined;
  const row = [];
  if (page > 0) row.push({ text: "Previous", callback_data: `hist:${page - 1}` });
  if (page < totalPages - 1) row.push({ text: "Next", callback_data: `hist:${page + 1}` });
  return { inline_keyboard: [row] };
}

function visibleHistoryClues(game, clues, players) {
  if (game.state !== "describing") return clues;

  const activeRoundNumber = game.roundNumber || 1;
  const activeRoundClueCount = clues.filter((clue) => (clue.roundNumber || 1) === activeRoundNumber).length;
  const alivePlayerCount = players.filter((player) => player.isAlive).length;
  if (activeRoundClueCount >= alivePlayerCount) return clues;

  return clues.filter((clue) => (clue.roundNumber || 1) !== activeRoundNumber);
}
