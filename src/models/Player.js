import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game", required: true, index: true },
  telegramGroupId: { type: Number, required: true, index: true },
  userId: { type: Number, required: true, index: true },
  username: { type: String, default: "" },
  firstName: { type: String, default: "" },
  role: { type: String, enum: ["normal", "impostor"], default: "normal" },
  secretWord: { type: String, default: "" },
  isAlive: { type: Boolean, default: true },
  hasReceivedDm: { type: Boolean, default: false },
  powerCard: {
    type: String,
    enum: ["", "detective", "silencer", "double_vote", "shield", "saboteur"],
    default: ""
  },
  powerUsed: { type: Boolean, default: false },
  powerActiveRound: { type: Number, default: null },
  powerTargetUserId: { type: Number, default: null },
  silencedRound: { type: Number, default: null },
  joinedAt: { type: Date, default: Date.now }
});

playerSchema.index({ gameId: 1, userId: 1 }, { unique: true });

export const Player = mongoose.models.Player || mongoose.model("Player", playerSchema);
