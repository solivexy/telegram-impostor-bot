import { writeFileSync } from "fs";
import { renderCluesImages } from "./src/utils/clueImage.js";

async function testLayout(playerCount, suffix) {
  const game = { roundNumber: 6, telegramGroupId: 123 };
  
  const players = Array.from({ length: playerCount }, (_, i) => ({
    userId: `user${i}`,
    firstName: `Player`,
    lastName: `${i + 1}`
  }));
  
  const tenWordClue = "I was in the cafeteria fixing wires near the vent.";
  const clueByUser = new Map(players.map((p) => [
    p.userId, 
    tenWordClue
  ]));

  const buffers = await renderCluesImages({ game, players, clueByUser });
  buffers.forEach((buffer, i) => {
    const filename = `test-clue-${suffix}-${i + 1}.png`;
    writeFileSync(filename, buffer);
    console.log(`Image saved to ${filename}`);
  });
}

async function main() {
  await testLayout(5, "iphone");
  await testLayout(8, "ipadmini");
  await testLayout(12, "ipadpro");
}

main().catch(console.error);
