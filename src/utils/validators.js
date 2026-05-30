const settingKeys = new Set(["lobbyTimeLimit", "clueTimeLimit", "voteTimeLimit", "allowClueEdit", "maxPlayers", "minPlayers", "language"]);

export function isGroupChat(msg) {
  return msg.chat?.type === "group" || msg.chat?.type === "supergroup";
}

export function isPrivateChat(msg) {
  return msg.chat?.type === "private";
}

export function parseCommandText(text = "", command = "") {
  return text.replace(new RegExp(`^/${command}(?:@\\w+)?\\s*`, "i"), "").trim();
}

export function normalizeUsername(username = "") {
  return username.replace(/^@/, "").toLowerCase();
}

export function containsExactWord(clue, word) {
  if (!word) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(clue);
}

export function validateSettingValue(key, value) {
  if (!settingKeys.has(key)) {
    return { ok: false, error: "Invalid settings key." };
  }

  if (key === "allowClueEdit") {
    if (!["true", "false", "yes", "no", "1", "0"].includes(value.toLowerCase())) {
      return { ok: false, error: "allowClueEdit must be true or false." };
    }
    return { ok: true, value: ["true", "yes", "1"].includes(value.toLowerCase()) };
  }

  if (key === "language") {
    if (!/^[a-z]{2,8}$/i.test(value)) return { ok: false, error: "language must be a short language code." };
    return { ok: true, value: value.toLowerCase() };
  }

  const number = Number(value);
  if (!Number.isInteger(number)) return { ok: false, error: `${key} must be an integer.` };

  if (key === "lobbyTimeLimit" && (number < 15 || number > 1800)) {
    return { ok: false, error: `${key} must be between 15 and 1800 seconds.` };
  }

  if (["clueTimeLimit", "voteTimeLimit"].includes(key) && (number < 30 || number > 1800)) {
    return { ok: false, error: `${key} must be between 30 and 1800 seconds.` };
  }

  if (["maxPlayers", "minPlayers"].includes(key) && (number < 4 || number > 12)) {
    return { ok: false, error: `${key} must be between 4 and 12.` };
  }

  return { ok: true, value: number };
}
