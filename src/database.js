import mongoose from "mongoose";
import { config } from "./config.js";
import { Clue } from "./models/Clue.js";
import { Vote } from "./models/Vote.js";

export async function connectDatabase() {
  try {
    mongoose.set("strictQuery", true);
    await mongoose.connect(config.mongodbUri);
    await cleanupLegacyIndexes();
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
}

async function cleanupLegacyIndexes() {
  try {
    await Vote.collection.dropIndex("gameId_1_voterId_1");
    console.log("Dropped legacy vote index gameId_1_voterId_1");
  } catch (error) {
    if (![26, 27].includes(error.code) && error.codeName !== "IndexNotFound" && error.codeName !== "NamespaceNotFound") {
      console.error("Legacy vote index cleanup failed:", error.message);
    }
  }

  try {
    await Clue.collection.dropIndex("gameId_1_userId_1");
    console.log("Dropped legacy clue index gameId_1_userId_1");
  } catch (error) {
    if (![26, 27].includes(error.code) && error.codeName !== "IndexNotFound" && error.codeName !== "NamespaceNotFound") {
      console.error("Legacy clue index cleanup failed:", error.message);
    }
  }

  try {
    await Clue.syncIndexes();
    await Vote.syncIndexes();
  } catch (error) {
    console.error("Game index sync failed:", error.message);
  }
}

export async function closeDatabase() {
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed");
  } catch (error) {
    console.error("MongoDB close failed:", error.message);
  }
}
