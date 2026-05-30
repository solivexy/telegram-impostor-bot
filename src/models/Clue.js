import mongoose from "mongoose";

const clueSchema = new mongoose.Schema(
  {
    gameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game", required: true, index: true },
    roundNumber: { type: Number, required: true, default: 1, index: true },
    userId: { type: Number, required: true, index: true },
    clue: { type: String, required: true, trim: true, maxlength: 240 }
  },
  { timestamps: true }
);

clueSchema.index({ gameId: 1, roundNumber: 1, userId: 1 }, { unique: true });

export const Clue = mongoose.models.Clue || mongoose.model("Clue", clueSchema);
