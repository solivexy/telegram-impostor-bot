import dotenv from "dotenv";

dotenv.config();

function parseDeveloperIds(raw) {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value !== 0);
}

export const config = {
  botToken: process.env.BOT_TOKEN,
  mongodbUri: process.env.MONGODB_URI,
  developerIds: parseDeveloperIds(process.env.DEVELOPER_IDS || process.env.DEVELOPER_ID),
  defaultClueTimeLimit: 90,
  defaultVoteTimeLimit: 90,
  defaultLobbyTimeLimit: 60,
  defaultMaxPlayers: 12,
  defaultMinPlayers: 4,
  pollInterval: 1000
};

export function isDeveloper(userId) {
  if (userId === undefined || userId === null) return false;
  return config.developerIds.includes(Number(userId));
}

export function validateConfig() {
  const missing = [];

  if (!config.botToken) missing.push("BOT_TOKEN");
  if (!config.mongodbUri) missing.push("MONGODB_URI");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
