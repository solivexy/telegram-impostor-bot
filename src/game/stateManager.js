import { Group } from "../models/Group.js";
import { Game } from "../models/Game.js";
import { Setting } from "../models/Setting.js";

export async function getOrCreateGroup(chat) {
  return Group.findOneAndUpdate(
    { telegramGroupId: chat.id },
    { $set: { title: chat.title || "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function getOrCreateSettings(telegramGroupId) {
  return Setting.findOneAndUpdate(
    { telegramGroupId },
    { $setOnInsert: { telegramGroupId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function getActiveGame(telegramGroupId) {
  return Game.findOne({
    telegramGroupId,
    state: { $in: ["lobby", "assigning_words", "describing", "voting"] }
  }).sort({ createdAt: -1 });
}

export async function getGameByCode(gameCode) {
  return Game.findOne({ gameCode, state: { $in: ["lobby", "assigning_words", "describing", "voting"] } });
}

export async function clearActiveGame(game) {
  await Group.updateOne({ telegramGroupId: game.telegramGroupId }, { $set: { activeGameId: null } });
}

export function generateGameCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
