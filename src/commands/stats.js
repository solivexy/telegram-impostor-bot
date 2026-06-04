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

  const winRate = percent(stat.wins, stat.gamesPlayed);
  const normalWinRate = percent(stat.normalWins, stat.normalGames);
  const impostorWinRate = percent(stat.impostorWins, stat.impostorGames);
  const eliminatedRate = percent(stat.timesEliminated, stat.gamesPlayed);
  const surviveRate = stat.gamesPlayed > 0 ? Math.max(0, 100 - eliminatedRate) : 0;
  const survivedTimes = stat.gamesPlayed - stat.timesEliminated;
  const avgVotes = stat.gamesPlayed > 0 ? (stat.totalVotesCast / stat.gamesPlayed).toFixed(1) : "0.0";

  const contextLine = isGroupChat(msg) ? "_Reply to someone with /stats to see theirs\\._" : "";
  const lines = [
    `📊 ${bold(escapeMarkdown(playerDisplayName(stat)))}`,
    "",
    `🎮 ${bold("Games:")} ${stat.gamesPlayed}   🏆 ${bold("Wins:")} ${stat.wins} \\(${winRate}%\\)`,
    "",
    `👨‍🚀 ${bold("Crewmate")}  ${stat.normalWins}/${stat.normalGames} \\(${normalWinRate}%\\)`,
    `🥷 ${bold("Impostor")}  ${stat.impostorWins}/${stat.impostorGames} \\(${impostorWinRate}%\\)`,
    "",
    `🛡️ ${bold("Survived:")} ${survivedTimes} \\(${surviveRate}%\\)`,
    `💀 ${bold("Eliminated:")} ${stat.timesEliminated} \\(${eliminatedRate}%\\)`,
    `🗳️ ${bold("Avg Votes:")} ${escapeMarkdown(avgVotes)}`
  ];

  if (contextLine) lines.push("", contextLine);
  return safeSendMessage(bot, msg.chat.id, lines.join("\n"));
}

function percent(value, total) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
