import mongoose from "mongoose";

const voteSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game", required: true, index: true },
    roundNumber: { type: Number, required: true, default: 1, index: true },
    voterId: { type: Number, required: true, index: true },
    targetId: { type: Number, required: true, index: true }
  },
  { timestamps: true }
);

voteSchema.index({ gameId: 1, roundNumber: 1, voterId: 1 }, { unique: true });

export const Vote = mongoose.models.Vote || mongoose.model("Vote", voteSchema);
