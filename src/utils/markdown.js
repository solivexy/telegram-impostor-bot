const markdownV2Chars = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdown(text = "") {
  return String(text).replace(markdownV2Chars, "\\$&");
}

export function bold(text = "") {
  return `*${escapeMarkdown(text)}*`;
}

export function code(text = "") {
  return `\`${String(text).replace(/[`\\]/g, "\\$&")}\``;
}
