import mongoose from "mongoose";

const nextGameSubscriptionSchema = new mongoose.Schema(
  {
    telegramGroupId: { type: Number, required: true, index: true },
    userId: { type: Number, required: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" }
  },
  { timestamps: true }
);

nextGameSubscriptionSchema.index({ telegramGroupId: 1, userId: 1 }, { unique: true });

export const NextGameSubscription = mongoose.models.NextGameSubscription ||
  mongoose.model("NextGameSubscription", nextGameSubscriptionSchema);
