import { wordPairs } from "../data/words.js";

export function pickWordAssignment() {
  const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
  const reversed = Math.random() >= 0.5;
  return {
    category: pair.category,
    mainWord: reversed ? pair.words[1] : pair.words[0],
    impostorWord: reversed ? pair.words[0] : pair.words[1]
  };
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
