import { Game } from "../models/Game.js";
import { startGame, startVoting, finishVoting } from "../game/gameManager.js";

let interval = null;

export function startDeadlineScanner(bot) {
  if (interval) clearInterval(interval);

  interval = setInterval(async () => {
    const now = new Date();
    try {
      const expiredLobbyGames = await Game.find({ state: "lobby", lobbyDeadline: { $lte: now } });
      for (const game of expiredLobbyGames) {
        game.lobbyDeadline = new Date(Date.now() + 30000);
        await game.save();
        await startGame(bot, game, true);
      }

      const expiredClueGames = await Game.find({ state: "describing", clueDeadline: { $lte: now } });
      for (const game of expiredClueGames) await startVoting(bot, game);

      const expiredVoteGames = await Game.find({ state: "voting", voteDeadline: { $lte: now } });
      for (const game of expiredVoteGames) await finishVoting(bot, game);
    } catch (error) {
      console.error("Deadline scanner failed:", error.message);
    }
  }, 5000);
}

export function stopDeadlineScanner() {
  if (interval) clearInterval(interval);
  interval = null;
}
