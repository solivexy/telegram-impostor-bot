import mongoose from "mongoose";

const userStatSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    normalGames: { type: Number, default: 0 },
    normalWins: { type: Number, default: 0 },
    impostorGames: { type: Number, default: 0 },
    impostorWins: { type: Number, default: 0 },
    timesEliminated: { type: Number, default: 0 },
    totalVotesCast: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const UserStat = mongoose.models.UserStat || mongoose.model("UserStat", userStatSchema);
