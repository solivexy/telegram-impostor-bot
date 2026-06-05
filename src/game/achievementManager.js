import { Achievement } from "../models/Achievement.js";
import { UserStat } from "../models/UserStat.js";
import { Vote } from "../models/Vote.js";
import { isDeveloper } from "../config.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";
import { mentionPlayer, safeSendMessage } from "../utils/telegram.js";

export const ACHIEVEMENTS = [
  { id: "first_game", emoji: "🎮", name: "Rookie", description: "Play your first game." },
  { id: "first_win", emoji: "🏆", name: "First Blood", description: "Win your first game." },
  { id: "veteran", emoji: "🎖️", name: "Veteran", description: "Play 10 games." },
  { id: "centurion", emoji: "💯", name: "Centurion", description: "Play 50 games." },
  { id: "champion", emoji: "👑", name: "Champion", description: "Win 10 games." },
  { id: "impostor_win", emoji: "🥷", name: "Master of Lies", description: "Win a game as the impostor." },
  { id: "crew_win", emoji: "👨‍🚀", name: "Loyal Crew", description: "Win a game as crew." },
  { id: "survivor", emoji: "🛡️", name: "Survivor", description: "Win a game without being eliminated." },
  { id: "martyr", emoji: "🕯️", name: "Martyr", description: "Get eliminated but your team still wins." },
  { id: "play_with_dev", emoji: "🤝", name: "Dev Buddy", description: "Play a game alongside a developer." },
  { id: "vote_out_dev", emoji: "⚔️", name: "Dev Slayer", description: "Vote out a developer." }
];

export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement]));

export function getAchievement(achievementId) {
  return ACHIEVEMENTS_BY_ID.get(achievementId) || null;
}

/**
 * Evaluate, persist, and announce achievements at the end of a game.
 * Should be called after updateGameStats so cumulative UserStat values are current.
 */
export async function evaluateGameAchievements(bot, game, players, winningRole) {
  if (!players?.length) return;

  const devPlayerIds = players.filter((player) => isDeveloper(player.userId)).map((player) => player.userId);
  const hasDev = devPlayerIds.length > 0;

  // Devs that were eliminated this game (voted out / killed / smitten).
  const eliminatedDevIds = new Set(
    players.filter((player) => isDeveloper(player.userId) && !player.isAlive).map((player) => player.userId)
  );

  // Resolve who voted against an eliminated dev.
  const devVoters = new Set();
  if (eliminatedDevIds.size > 0) {
    const votes = await Vote.find({ gameId: game._id, targetId: { $in: [...eliminatedDevIds] } });
    for (const vote of votes) {
      if (!isDeveloper(vote.voterId)) devVoters.add(vote.voterId);
      else if (vote.voterId !== vote.targetId) devVoters.add(vote.voterId);
    }
  }

  const stats = await UserStat.find({ userId: { $in: players.map((player) => player.userId) } });
  const statByUser = new Map(stats.map((stat) => [stat.userId, stat]));

  const unlockedByPlayer = [];

  for (const player of players) {
    const stat = statByUser.get(player.userId) || {};
    const isImpostor = player.role === "impostor";
    const won = winningRole ? player.role === winningRole : false;
    const eliminated = !player.isAlive;
    const playedWithDev = hasDev && devPlayerIds.some((devId) => devId !== player.userId);

    const earned = [];
    if ((stat.gamesPlayed || 0) >= 1) earned.push("first_game");
    if (won && (stat.wins || 0) >= 1) earned.push("first_win");
    if ((stat.gamesPlayed || 0) >= 10) earned.push("veteran");
    if ((stat.gamesPlayed || 0) >= 50) earned.push("centurion");
    if ((stat.wins || 0) >= 10) earned.push("champion");
    if (won && isImpostor) earned.push("impostor_win");
    if (won && !isImpostor) earned.push("crew_win");
    if (won && !eliminated) earned.push("survivor");
    if (won && eliminated) earned.push("martyr");
    if (playedWithDev) earned.push("play_with_dev");
    if (devVoters.has(player.userId)) earned.push("vote_out_dev");

    const newlyUnlocked = await unlockAchievements(player, earned);
    if (newlyUnlocked.length > 0) unlockedByPlayer.push({ player, achievementIds: newlyUnlocked });
  }

  await announceAchievements(bot, game, unlockedByPlayer);
}

async function unlockAchievements(player, achievementIds) {
  const newlyUnlocked = [];
  for (const achievementId of achievementIds) {
    if (!ACHIEVEMENTS_BY_ID.has(achievementId)) continue;
    try {
      await Achievement.create({
        userId: player.userId,
        achievementId,
        username: player.username || "",
        firstName: player.firstName || ""
      });
      newlyUnlocked.push(achievementId);
    } catch (error) {
      if (error.code !== 11000) {
        console.error(`Achievement unlock failed for ${player.userId}/${achievementId}:`, error.message);
      }
    }
  }
  return newlyUnlocked;
}

async function announceAchievements(bot, game, unlockedByPlayer) {
  if (unlockedByPlayer.length === 0) return;

  const lines = [`${bold("🎉 Achievements unlocked")}`, ""];
  for (const { player, achievementIds } of unlockedByPlayer) {
    for (const achievementId of achievementIds) {
      const achievement = ACHIEVEMENTS_BY_ID.get(achievementId);
      if (!achievement) continue;
      lines.push(`${achievement.emoji} ${mentionPlayer(player)} unlocked ${bold(achievement.name)} \\- ${escapeMarkdown(achievement.description)}`);
    }
  }

  await safeSendMessage(bot, game.telegramGroupId, lines.join("\n"));
}

export async function getAchievementOverview(userId) {
  const unlocked = await Achievement.find({ userId }).sort({ unlockedAt: 1 });
  const unlockedById = new Map(unlocked.map((entry) => [entry.achievementId, entry]));

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    unlocked: unlockedById.has(achievement.id),
    unlockedAt: unlockedById.get(achievement.id)?.unlockedAt || null
  }));
}
