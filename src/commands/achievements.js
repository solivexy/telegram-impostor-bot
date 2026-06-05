import { getAchievementOverview } from "../game/achievementManager.js";
import { isGroupChat } from "../utils/validators.js";
import { escapeMarkdown, bold } from "../utils/markdown.js";
import { safeSendMessage, userName } from "../utils/telegram.js";

export async function achievementsCommand(bot, msg) {
  const target = msg.reply_to_message?.from || msg.from;
  const overview = await getAchievementOverview(target.id);

  const unlocked = overview.filter((achievement) => achievement.unlocked);
  const locked = overview.filter((achievement) => !achievement.unlocked);

  const header = target.id === msg.from.id
    ? `🏅 ${bold("Your achievements")}`
    : `🏅 ${bold(`${escapeMarkdown(userName(target))}'s achievements`)}`;

  const lines = [
    header,
    `${unlocked.length}/${overview.length} unlocked`,
    "",
    bold("✅ Unlocked")
  ];

  if (unlocked.length > 0) {
    for (const achievement of unlocked) {
      lines.push(`${achievement.emoji} ${bold(achievement.name)} \\- ${escapeMarkdown(achievement.description)}`);
    }
  } else {
    lines.push("_None yet\\. Play a game to start earning\\._");
  }

  lines.push("", bold("🔒 Locked"));
  if (locked.length > 0) {
    for (const achievement of locked) {
      lines.push(`${achievement.emoji} ${bold(achievement.name)} \\- ${escapeMarkdown(achievement.description)}`);
    }
  } else {
    lines.push("_All achievements unlocked\\. Nice\\._");
  }

  if (isGroupChat(msg)) {
    lines.push("", "_Reply to someone with /achievements to see theirs\\._");
  }

  return safeSendMessage(bot, msg.chat.id, lines.join("\n"));
}
