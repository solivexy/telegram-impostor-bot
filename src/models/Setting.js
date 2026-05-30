import mongoose from "mongoose";
import { config } from "../config.js";

const settingSchema = new mongoose.Schema(
  {
    telegramGroupId: { type: Number, required: true, unique: true, index: true },
    lobbyTimeLimit: { type: Number, default: config.defaultLobbyTimeLimit, min: 15, max: 1800 },
    clueTimeLimit: { type: Number, default: config.defaultClueTimeLimit, min: 30, max: 1800 },
    voteTimeLimit: { type: Number, default: config.defaultVoteTimeLimit, min: 30, max: 1800 },
    allowClueEdit: { type: Boolean, default: false },
    maxPlayers: { type: Number, default: config.defaultMaxPlayers, min: 4, max: 12 },
    minPlayers: { type: Number, default: config.defaultMinPlayers, min: 4, max: 12 },
    language: { type: String, default: "en", trim: true, maxlength: 16 }
  },
  { timestamps: true }
);

export const Setting = mongoose.models.Setting || mongoose.model("Setting", settingSchema);
