import dotenv from "dotenv";

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN,
  mongodbUri: process.env.MONGODB_URI,
  defaultClueTimeLimit: 90,
  defaultVoteTimeLimit: 90,
  defaultLobbyTimeLimit: 60,
  defaultMaxPlayers: 12,
  defaultMinPlayers: 4,
  pollInterval: 1000
};

export function validateConfig() {
  const missing = [];

  if (!config.botToken) missing.push("BOT_TOKEN");
  if (!config.mongodbUri) missing.push("MONGODB_URI");

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
