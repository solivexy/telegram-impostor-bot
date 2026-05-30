import { validateConfig } from "./config.js";
import { connectDatabase, closeDatabase } from "./database.js";
import { createBot } from "./bot.js";
import { startDeadlineScanner, stopDeadlineScanner } from "./utils/timers.js";

validateConfig();
await connectDatabase();

const bot = createBot();
startDeadlineScanner(bot);

console.log("Who's Impostor bot is running");

async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  stopDeadlineScanner();

  try {
    await bot.stopPolling();
  } catch (error) {
    console.error("Bot polling shutdown failed:", error.message);
  }

  await closeDatabase();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});
