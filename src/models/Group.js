import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    telegramGroupId: { type: Number, required: true, unique: true, index: true },
    title: { type: String, default: "" },
    activeGameId: { type: mongoose.Schema.Types.ObjectId, ref: "Game", default: null, index: true }
  },
  { timestamps: true }
);

export const Group = mongoose.models.Group || mongoose.model("Group", groupSchema);
