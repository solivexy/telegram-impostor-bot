import { writeFileSync } from "fs";
import { renderCluesImage } from "./src/utils/clueImage.js";

async function main() {
  const game = { roundNumber: 3, telegramGroupId: 123 };
  const players = [
    { userId: 1, firstName: "Alice", lastName: "Smith" },
    { userId: 2, firstName: "Bob" },
    { userId: 3, firstName: "Charlie", lastName: "Brown" },
    { userId: 4, firstName: "Dave" }
  ];
  
  const clueByUser = new Map([
    [1, "I was in the cafeteria fixing wires. I didn't see anyone else there."],
    [2, "I saw Charlie walking towards the medbay, looking kind of sus."],
    [3, "That's a lie, I was doing asteroids! I have a visual task to prove it, come watch me."],
    [4, "I just found a body in electrical."]
  ]);

  const buffer = await renderCluesImage({ game, players, clueByUser });
  writeFileSync("test-clue.png", buffer);
  console.log("Image saved to test-clue.png");
}

main().catch(console.error);
