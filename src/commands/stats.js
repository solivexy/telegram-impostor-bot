import { UserStat } from "../models/UserStat.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";
import { safeSendMessage, userName, playerDisplayName } from "../utils/telegram.js";

export async function statsCommand(bot, msg) {
  const target = msg.reply_to_message?.from || msg.from;
  const stat = await UserStat.findOne({ userId: target.id });

  if (!stat) {
    const text = target.id === msg.from.id
      ? "No stats yet\\. Finish a game first\\."
      : `No stats yet for ${escapeMarkdown(userName(target))}\\.`;
    return safeSendMessage(bot, msg.chat.id, text);
  }

  const winRate = stat.gamesPlayed > 0 ? Math.round((stat.wins / stat.gamesPlayed) * 100) : 0;
  const normalWinRate = stat.normalGames > 0 ? Math.round((stat.normalWins / stat.normalGames) * 100) : 0;
  const impostorWinRate = stat.impostorGames > 0 ? Math.round((stat.impostorWins / stat.impostorGames) * 100) : 0;

  const contextLine = isGroupChat(msg) ? "Reply to someone with /stats to see their stats\\." : "";
  const lines = [
    `${bold("Player stats")}: ${escapeMarkdown(playerDisplayName(stat))}`,
    `Games: ${stat.gamesPlayed}`,
    `Wins: ${stat.wins}`,
    `Losses: ${stat.losses}`,
    `Win rate: ${winRate}%`,
    `Normal: ${stat.normalWins}/${stat.normalGames} wins \\(${normalWinRate}%\\)`,
    `Impostor: ${stat.impostorWins}/${stat.impostorGames} wins \\(${impostorWinRate}%\\)`,
    `Eliminated: ${stat.timesEliminated}`,
    `Votes cast: ${stat.totalVotesCast}`
  ];

  if (contextLine) lines.push("", contextLine);
  return safeSendMessage(bot, msg.chat.id, lines.join("\n"));
}
