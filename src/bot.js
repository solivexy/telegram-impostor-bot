import TelegramBot from "node-telegram-bot-api";
import { config } from "./config.js";
import { startCommand } from "./commands/start.js";
import { newGameCommand } from "./commands/newgame.js";
import { joinCommand } from "./commands/join.js";
import { leaveCommand } from "./commands/leave.js";
import { startGameCommand } from "./commands/startgame.js";
import { describeCommand, directDescribeMessage } from "./commands/describe.js";
import { historyCommand } from "./commands/history.js";
import { voteCommand } from "./commands/vote.js";
import { smiteCommand } from "./commands/smite.js";
import { statusCommand } from "./commands/status.js";
import { statsCommand } from "./commands/stats.js";
import { settingsCommand, setCommand } from "./commands/settings.js";
import { cancelGameCommand, endGameCommand, killGameCommand } from "./commands/endgame.js";
import { extendTimeCommand } from "./commands/extendtime.js";
import { handleCallback } from "./callbacks/callbackHandler.js";

export function createBot() {
  const bot = new TelegramBot(config.botToken, { polling: true });
  const botIdentity = { username: null };
  loadBotIdentity(bot, botIdentity);
  registerBotCommands(bot);

  onCommand(bot, botIdentity, "start", (msg) => startCommand(bot, msg));
  onCommand(bot, botIdentity, "newgame", (msg) => newGameCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "join", (msg) => joinCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "leave", (msg) => leaveCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "startgame", (msg) => startGameCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "cancelgame", (msg) => cancelGameCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "killgame", (msg) => killGameCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "describe", (msg) => describeCommand(bot, msg));
  onCommand(bot, botIdentity, "history", (msg) => historyCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "vote", (msg) => voteCommand(bot, msg));
  onCommand(bot, botIdentity, "smite", (msg) => smiteCommand(bot, msg));
  onCommand(bot, botIdentity, "status", (msg) => statusCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "stats", (msg) => statsCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "settings", (msg) => settingsCommand(bot, msg), { exact: true });
  onCommand(bot, botIdentity, "set", (msg) => setCommand(bot, msg));
  onCommand(bot, botIdentity, "extendtime", (msg) => extendTimeCommand(bot, msg));
  onCommand(bot, botIdentity, "extend", (msg) => extendTimeCommand(bot, msg));
  onCommand(bot, botIdentity, "endgame", (msg) => endGameCommand(bot, msg), { exact: true });

  bot.on("message", (msg) => runCommand("directDescribe", () => directDescribeMessage(bot, msg)));
  bot.on("callback_query", (query) => runCommand("callback", () => handleCallback(bot, query)));
  bot.on("polling_error", (error) => console.error("Telegram polling error:", error.message));
  bot.on("webhook_error", (error) => console.error("Telegram webhook error:", error.message));

  return bot;
}

function onCommand(bot, botIdentity, command, handler, options = {}) {
  const argsPattern = options.exact ? "" : "(?:\\s+[\\s\\S]*)?";
  const pattern = new RegExp(`^/${command}(?:@\\w+)?${argsPattern}$`, "i");
  bot.onText(pattern, (msg) => {
    if (!shouldHandleCommand(msg, command, botIdentity.username)) return;
    runCommand(command, () => handler(msg));
  });
}

function shouldHandleCommand(msg, command, botUsername) {
  const text = msg.text || "";
  const token = text.trim().split(/\s+/)[0] || "";
  const match = token.match(/^\/([a-z0-9_]+)(?:@([a-z0-9_]+))?$/i);
  if (!match || match[1].toLowerCase() !== command.toLowerCase()) return false;

  const mention = match[2]?.toLowerCase();
  const chatType = msg.chat?.type;
  const isGroup = chatType === "group" || chatType === "supergroup";

  if (!isGroup) {
    return !mention || !botUsername || mention === botUsername.toLowerCase();
  }

  if (!mention) return false;
  return !botUsername || mention === botUsername.toLowerCase();
}

function loadBotIdentity(bot, botIdentity) {
  bot.getMe()
    .then((me) => {
      botIdentity.username = me.username || null;
      if (botIdentity.username) console.log(`Bot username loaded: @${botIdentity.username}`);
    })
    .catch((error) => {
      console.error("Telegram getMe failed:", error.message);
    });
}

function registerBotCommands(bot) {
  bot.setMyCommands([
    { command: "start", description: "Start DM setup or show game help" },
    { command: "newgame", description: "Create a new lobby" },
    { command: "join", description: "Join the active lobby" },
    { command: "leave", description: "Leave the active lobby" },
    { command: "startgame", description: "Start the lobby game" },
    { command: "cancelgame", description: "Cancel the active game" },
    { command: "killgame", description: "Admin-only emergency cancel" },
    { command: "describe", description: "Submit your clue in DM" },
    { command: "history", description: "View your private clue history" },
    { command: "vote", description: "Vote for a player" },
    { command: "status", description: "Show the current game state" },
    { command: "stats", description: "Show player stats" },
    { command: "settings", description: "Show group settings" },
    { command: "set", description: "Admin-only setting change" },
    { command: "extendtime", description: "Extend the active timer" },
    { command: "extend", description: "Short alias for extendtime" },
    { command: "endgame", description: "Force finish and reveal game" }
  ]).catch((error) => {
    console.error("Telegram command registration failed:", error.message);
  });
}

async function runCommand(name, handler) {
  try {
    await handler();
  } catch (error) {
    console.error(`Command ${name} failed:`, error);
  }
}
