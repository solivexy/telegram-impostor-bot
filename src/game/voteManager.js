import { Player } from "../models/Player.js";
import { Vote } from "../models/Vote.js";

export async function getVoteSummary(gameId, roundNumber = 1) {
  const votes = await Vote.find({ gameId, roundNumber });
  const alivePlayers = await Player.find({ gameId, isAlive: true }).sort({ joinedAt: 1 });
  const voterPlayers = await Player.find({ gameId, userId: { $in: votes.map((vote) => vote.voterId) } });
  const voterByUserId = new Map(voterPlayers.map((player) => [player.userId, player]));
  const counts = new Map();

  for (const player of alivePlayers) counts.set(player.userId, 0);
  for (const vote of votes) {
    const voter = voterByUserId.get(vote.voterId);
    const weight = voter?.powerCard === "double_vote" && voter.powerUsed && voter.powerActiveRound === roundNumber ? 2 : 1;
    counts.set(vote.targetId, (counts.get(vote.targetId) || 0) + weight);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted[0] || null;
  const tied = top ? sorted.filter((entry) => entry[1] === top[1]) : [];
  const eliminatedUserId = top && top[1] > 0 && tied.length === 1 ? top[0] : null;

  return { votes, alivePlayers, counts, eliminatedUserId, tied: tied.length > 1 };
}
