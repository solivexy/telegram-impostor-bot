import { escapeMarkdown } from "./markdown.js";

function stripEmojis(str) {
  if (!str) return str;
  return str.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, "").replace(/\s+/g, " ").trim();
}

export function playerName(player) {
  if (!player) return "Unknown";
  let name = stripEmojis(player.firstName);
  if (!name && player.username) name = player.username;
  if (!name) name = String(player.userId);
  return name || "Player";
}

export function playerDisplayName(player) {
  if (!player) return "Unknown";
  let name = stripEmojis(player.firstName);
  if (!name && player.username) name = player.username;
  if (!name) name = String(player.userId);
  return name || "Player";
}

export function userName(user) {
  if (!user) return "Unknown";
  let name = stripEmojis(user.first_name);
  if (!name && user.username) name = user.username;
  if (!name) name = String(user.id);
  return name || "User";
}

export async function safeSendMessage(bot, chatId, text, options = {}) {
  try {
    return await bot.sendMessage(chatId, text, { parse_mode: "MarkdownV2", ...options });
  } catch (error) {
    if (options.parse_mode !== null) {
      try {
        const fallbackOptions = { ...options };
        delete fallbackOptions.parse_mode;
        return await bot.sendMessage(chatId, stripMarkdownEscapes(text), fallbackOptions);
      } catch (fallbackError) {
        console.error(`Telegram sendMessage failed for ${chatId}:`, error.message);
        console.error(`Telegram plain sendMessage fallback failed for ${chatId}:`, fallbackError.message);
        return null;
      }
    }
    console.error(`Telegram sendMessage failed for ${chatId}:`, error.message);
    return null;
  }
}

export async function safeEditMessage(bot, chatId, messageId, text, options = {}) {
  try {
    return await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "MarkdownV2",
      ...options
    });
  } catch (error) {
    if (options.parse_mode !== null) {
      try {
        const fallbackOptions = { ...options };
        delete fallbackOptions.parse_mode;
        return await bot.editMessageText(stripMarkdownEscapes(text), {
          chat_id: chatId,
          message_id: messageId,
          ...fallbackOptions
        });
      } catch (fallbackError) {
        console.error(`Telegram editMessageText failed for ${chatId}/${messageId}:`, error.message);
        console.error(`Telegram plain editMessageText fallback failed for ${chatId}/${messageId}:`, fallbackError.message);
        return null;
      }
    }
    console.error(`Telegram editMessageText failed for ${chatId}/${messageId}:`, error.message);
    return null;
  }
}

export async function safeSendPhoto(bot, chatId, photo, options = {}) {
  try {
    return await bot.sendPhoto(chatId, photo, { parse_mode: "MarkdownV2", ...options });
  } catch (error) {
    if (options.parse_mode !== null) {
      try {
        const fallbackOptions = { ...options };
        delete fallbackOptions.parse_mode;
        if (fallbackOptions.caption) fallbackOptions.caption = stripMarkdownEscapes(fallbackOptions.caption);
        return await bot.sendPhoto(chatId, photo, fallbackOptions);
      } catch (fallbackError) {
        console.error(`Telegram sendPhoto failed for ${chatId}:`, error.message);
        console.error(`Telegram plain sendPhoto fallback failed for ${chatId}:`, fallbackError.message);
        return null;
      }
    }
    console.error(`Telegram sendPhoto failed for ${chatId}:`, error.message);
    return null;
  }
}

export async function safeAnswerCallback(bot, callbackQueryId, text = "", options = {}) {
  try {
    await bot.answerCallbackQuery(callbackQueryId, { text, ...options });
  } catch (error) {
    console.error("Telegram answerCallbackQuery failed:", error.message);
  }
}

export async function isGroupAdmin(bot, chatId, userId) {
  try {
    const member = await bot.getChatMember(chatId, userId);
    return ["creator", "administrator"].includes(member.status);
  } catch (error) {
    console.error("Telegram getChatMember failed:", error.message);
    return false;
  }
}

export function mentionPlayer(player) {
  return `[${escapeMarkdown(playerName(player))}](tg://user?id=${player.userId})`;
}

export function lobbyKeyboard(gameCode) {
  return {
    inline_keyboard: [
      [
        { text: "Join Game", callback_data: `join:${gameCode}` },
        { text: "Leave Game", callback_data: `leave:${gameCode}` }
      ],
      [
        { text: "Start Game", callback_data: `start:${gameCode}` },
        { text: "Cancel Game", callback_data: `cancel:${gameCode}` }
      ]
    ]
  };
}

export function voteKeyboard(gameCode, players) {
  return {
    inline_keyboard: players.map((player) => [
      { text: playerDisplayName(player), callback_data: `vote:${gameCode}:${player.userId}` }
    ])
  };
}

function stripMarkdownEscapes(text) {
  return String(text)
    .replace(/\\([_*\[\]()~`>#+\-=|{}.!\\])/g, "$1")
    .replace(/[*_`]/g, "");
}
