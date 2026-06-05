import mongoose from "mongoose";

const achievementSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, index: true },
    achievementId: { type: String, required: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    unlockedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

achievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export const Achievement = mongoose.models.Achievement || mongoose.model("Achievement", achievementSchema);
