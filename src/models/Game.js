import mongoose from "mongoose";

const gameSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    telegramGroupId: { type: Number, required: true, index: true },
    creatorId: { type: Number, required: true, index: true },
    lobbyMessageId: { type: Number, default: null },
    gameCode: { type: String, required: true, unique: true, index: true },
    gameMode: { type: String, enum: ["normal", "killer"], default: "normal" },
    state: {
      type: String,
      enum: ["idle", "lobby", "assigning_words", "describing", "voting", "finished", "cancelled"],
      default: "lobby",
      index: true
    },
    mainWord: { type: String, default: "" },
    impostorWord: { type: String, default: "" },
    impostorIds: [{ type: Number }],
    impostorKills: { type: Map, of: Number, default: {} },
    clueSwaps: {
      type: [{
        roundNumber: { type: Number, required: true },
        firstUserId: { type: Number, required: true },
        secondUserId: { type: Number, required: true },
        byUserId: { type: Number, required: true }
      }],
      default: []
    },
    roundNumber: { type: Number, default: 1, min: 1 },
    tieBreakRound: { type: Number, default: 0 },
    currentTurnUserId: { type: Number, default: null },
    lobbyDeadline: { type: Date, default: null },
    clueDeadline: { type: Date, default: null },
    voteDeadline: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Game = mongoose.models.Game || mongoose.model("Game", gameSchema);
