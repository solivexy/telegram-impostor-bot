import mongoose from "mongoose";

const gameSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true, index: true },
    telegramGroupId: { type: Number, required: true, index: true },
    creatorId: { type: Number, required: true, index: true },
    lobbyMessageId: { type: Number, default: null },
    gameCode: { type: String, required: true, unique: true, index: true },
    state: {
      type: String,
      enum: ["idle", "lobby", "assigning_words", "describing", "voting", "finished", "cancelled"],
      default: "lobby",
      index: true
    },
    mainWord: { type: String, default: "" },
    impostorWord: { type: String, default: "" },
    impostorIds: [{ type: Number }],
    roundNumber: { type: Number, default: 1, min: 1 },
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
