import { writeFileSync } from "fs";
import { renderCluesImage } from "./src/utils/clueImage.js";

async function main() {
  const game = { roundNumber: 6, telegramGroupId: 123 };
  const players = [
    { userId: 1, firstName: "Alice", lastName: "Smith" },
    { userId: 2, firstName: "Bob" },
    { userId: 3, firstName: "Charlie", lastName: "Brown" },
    { userId: 4, firstName: "Dave" }
  ];
  
  const clueByUser = new Map([
    [1, "I was in the cafeteria fixing wires ⚡. I didn't see anyone else there. 1234567890"],
    [2, "I saw Charlie walking towards the medbay, looking kind of sus 👀. 1 2 8"],
    [3, "That's a lie, I was doing asteroids ☄️! I have a visual task to prove it, come watch me."],
    [4, "emot kebanggaan ⛲⛲⛲"]
  ]);

  const buffer = await renderCluesImage({ game, players, clueByUser });
  writeFileSync("test-clue.png", buffer);
  console.log("Image saved to test-clue.png");
}

main().catch(console.error);
