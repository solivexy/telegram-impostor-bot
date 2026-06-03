import { writeFileSync } from "fs";
import { renderCluesImage } from "./src/utils/clueImage.js";
import sharp from "sharp";

// Monkey patch sharp to intercept the SVG buffer
const originalSharp = sharp;
let svgString = "";
const mockSharp = function(input) {
  if (Buffer.isBuffer(input) && input.toString().startsWith("<svg")) {
    svgString = input.toString();
  }
  return originalSharp(input);
};
Object.assign(mockSharp, originalSharp);

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

  try {
    const { renderCluePage } = await import("./src/utils/clueImage.js");
    // wait, we can't easily hook into renderCluePage if it's not exported.
    // Instead we will just use regex to replace sharp in clueImage.js temporarily, or just read the SVG from the error using a simpler method.
  } catch(e) {}
}

main().catch(console.error);
