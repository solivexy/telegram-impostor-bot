import { wordPairs } from "../data/words.js";
import { Game } from "../models/Game.js";

export async function pickWordAssignment(telegramGroupId, now = new Date()) {
  const usedWords = await getUsedWordsForGroupToday(telegramGroupId, now);
  const availablePairs = wordPairs.filter((pair) => pair.words.every((word) => !usedWords.has(normalizeWord(word))));
  const pair = pickRandom(availablePairs.length ? availablePairs : wordPairs);
  const reversed = Math.random() >= 0.5;
  return {
    category: pair.category,
    mainWord: reversed ? pair.words[1] : pair.words[0],
    impostorWord: reversed ? pair.words[0] : pair.words[1]
  };
}

async function getUsedWordsForGroupToday(telegramGroupId, now) {
  if (!telegramGroupId) return new Set();

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  const games = await Game.find({
    telegramGroupId,
    startedAt: { $gte: startOfDay, $lt: endOfDay }
  }).select("mainWord impostorWord");

  return new Set(
    games
      .flatMap((game) => [game.mainWord, game.impostorWord])
      .filter(Boolean)
      .map(normalizeWord)
  );
}

function normalizeWord(word) {
  return String(word).trim().toLocaleLowerCase("id-ID");
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function impostorCountForPlayers(playerCount) {
  if (playerCount > 10) return 3;
  return playerCount >= 7 ? 2 : 1;
}

export function chooseImpostors(players) {
  const count = impostorCountForPlayers(players.length);
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((player) => player.userId);
}
