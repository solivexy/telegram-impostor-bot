import sharp from "sharp";
import { playerDisplayName } from "./telegram.js";

const width = 1080;
const margin = 48;
const titleHeight = 110;
const footerHeight = 60;
const maxImageHeight = 1900;
const compactPlayerLimit = 12;

const fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const emojiFontFamily = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

function renderEmoji(text) {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
  return text.replace(emojiRegex, `<tspan font-family="${emojiFontFamily}">$&</tspan>`);
}

const regularLayout = {
  columns: 1,
  cardGap: 36,
  columnGap: 0,
  cardPaddingX: 32,
  cardPaddingY: 26,
  lineHeight: 40,
  avatarSize: 72,
  avatarMarginRight: 20,
  nameFontSize: 24,
  clueFontSize: 32,
  nameMaxChars: 42,
  clueMaxChars: 46,
  cardRadius: 28,
  avatarTextSize: 28,
  minCardHeight: 0
};

const compactLayout = {
  columns: 2,
  cardGap: 24,
  columnGap: 24,
  cardPaddingX: 24,
  cardPaddingY: 20,
  lineHeight: 32,
  avatarSize: 52,
  avatarMarginRight: 14,
  nameFontSize: 19,
  clueFontSize: 24,
  nameMaxChars: 24,
  clueMaxChars: 28,
  cardRadius: 22,
  avatarTextSize: 20,
  minCardHeight: 0
};

export async function renderCluesImages({ game, players, clueByUser, avatarsByUserId = new Map() }) {
  const layout = players.length <= compactPlayerLimit ? compactLayout : regularLayout;
  const cards = players.map((player, index) => {
    const clue = clueByUser.get(player.userId) || "No clue submitted.";
    const nameLines = wrapText(playerDisplayName(player), layout.nameMaxChars);
    const clueLines = wrapText(clue, layout.clueMaxChars);
    
    const nameHeight = nameLines.length * (layout.nameFontSize * 1.2);
    const bubbleHeight = layout.cardPaddingY * 2 + (clueLines.length - 1) * layout.lineHeight + layout.clueFontSize;
    const height = Math.max(layout.avatarSize, nameHeight + 8 + bubbleHeight);

    return {
      index,
      player,
      nameLines,
      clueLines,
      height,
      nameHeight,
      bubbleHeight,
      avatar: avatarsByUserId.get(player.userId) || null
    };
  });

  const pages = paginateCards(cards, layout);
  const totalPages = pages.length;

  return Promise.all(pages.map((pageCards, pageIndex) => renderCluePage({
    game,
    cards: pageCards,
    pageNumber: pageIndex + 1,
    totalPages,
    layout
  })));
}

export async function renderCluesImage(options) {
  const images = await renderCluesImages(options);
  return images[0];
}

async function renderCluePage({ game, cards, pageNumber, totalPages, layout }) {
  const contentHeight = pageContentHeight(cards, layout);
  const height = margin + titleHeight + contentHeight + footerHeight + margin;
  const placements = [];
  const cardSvg = renderCards(cards, layout, margin + titleHeight, placements);

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#000000"/>
  <text x="${width / 2}" y="${margin + 42}" text-anchor="middle" font-family="${fontFamily}" font-size="42" font-weight="700" fill="#ffffff">Clues</text>
  <text x="${width / 2}" y="${margin + 82}" text-anchor="middle" font-family="${fontFamily}" font-size="24" font-weight="400" fill="#8E8E93">Round ${escapeXml(String(game.roundNumber || 1))}${totalPages > 1 ? ` • Page ${pageNumber}/${totalPages}` : ""}</text>
  ${cardSvg}
  <text x="${width / 2}" y="${height - margin}" text-anchor="middle" font-family="${fontFamily}" font-size="22" font-weight="500" fill="#8E8E93">Vote for who you think is the impostor.</text>
</svg>`;

  const overlays = [];
  for (const placement of placements) {
    if (!placement.avatar) continue;
    const input = await circularAvatar(placement.avatar, placement.size);
    if (input) overlays.push({ input, left: Math.round(placement.x), top: Math.round(placement.y) });
  }

  let image = sharp(Buffer.from(svg));
  if (overlays.length > 0) image = image.composite(overlays);
  return image.png().toBuffer();
}

function renderCards(cards, layout, startY, placements) {
  if (layout.columns === 1) {
    let y = startY;
    return cards.map((card) => {
      const cardSvg = renderCard(card, margin, y, width - margin * 2, card.height, layout);
      placements.push(avatarPlacement(card, margin, y, layout));
      y += card.height + layout.cardGap;
      return cardSvg;
    }).join("");
  }

  const cardWidth = (width - margin * 2 - layout.columnGap) / 2;
  let y = startY;
  const rows = chunk(cards, layout.columns);

  return rows.map((row) => {
    const rowHeight = Math.max(...row.map((card) => card.height));
    const rowSvg = row.map((card, columnIndex) => {
      const x = margin + columnIndex * (cardWidth + layout.columnGap);
      placements.push(avatarPlacement(card, x, y, layout));
      return renderCard(card, x, y, cardWidth, rowHeight, layout);
    }).join("");
    y += rowHeight + layout.cardGap;
    return rowSvg;
  }).join("");
}

function renderCard(card, x, y, cardWidth, cardHeight, layout) {
  const avatarX = x;
  const bubbleX = x + layout.avatarSize + layout.avatarMarginRight;
  const bubbleWidth = cardWidth - (layout.avatarSize + layout.avatarMarginRight);
  
  const avatarY = y + card.nameHeight + 8 + card.bubbleHeight - layout.avatarSize;

  const nameY = y + layout.nameFontSize;
  const bubbleY = y + card.nameHeight + 8;
  const clueStartY = bubbleY + layout.cardPaddingY + layout.clueFontSize - 4;
  
  const avatarColor = pickColor(card.index);
  const nameColor = pickColorLight(card.index);

  const nameText = card.nameLines.map((line, index) => (
    `<tspan x="${bubbleX + 16}" dy="${index === 0 ? 0 : layout.nameFontSize * 1.2}">${renderEmoji(escapeXml(line))}</tspan>`
  )).join("");

  const clueText = card.clueLines.map((line, index) => (
    `<tspan x="${bubbleX + layout.cardPaddingX}" dy="${index === 0 ? 0 : layout.lineHeight}">${renderEmoji(escapeXml(line))}</tspan>`
  )).join("");

  const tailPath = `M ${bubbleX + 24} ${bubbleY + card.bubbleHeight} C ${bubbleX + 8} ${bubbleY + card.bubbleHeight} ${bubbleX - 4} ${bubbleY + card.bubbleHeight + 4} ${bubbleX - 8} ${bubbleY + card.bubbleHeight + 10} C ${bubbleX - 2} ${bubbleY + card.bubbleHeight - 4} ${bubbleX + 6} ${bubbleY + card.bubbleHeight - 12} ${bubbleX + 6} ${bubbleY + card.bubbleHeight - 12}`;

  return `
  <g>
    <circle cx="${avatarX + layout.avatarSize / 2}" cy="${avatarY + layout.avatarSize / 2}" r="${layout.avatarSize / 2}" fill="${avatarColor}"/>
    ${card.avatar ? "" : `<text x="${avatarX + layout.avatarSize / 2}" y="${avatarY + layout.avatarSize / 2 + layout.avatarTextSize * 0.35}" text-anchor="middle" font-family="${fontFamily}" font-size="${layout.avatarTextSize}" font-weight="700" fill="#ffffff">${escapeXml(initials(playerDisplayName(card.player)))}</text>`}
    <text x="${bubbleX + 16}" y="${nameY}" font-family="${fontFamily}" font-size="${layout.nameFontSize}" font-weight="600" fill="${nameColor}">${nameText}</text>
    
    <path d="${tailPath}" fill="#262628"/>
    <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleWidth}" height="${card.bubbleHeight}" rx="${layout.cardRadius}" fill="#262628"/>
    
    <text x="${bubbleX + layout.cardPaddingX}" y="${clueStartY}" font-family="${fontFamily}" font-size="${layout.clueFontSize}" font-weight="400" fill="#ffffff">${clueText}</text>
  </g>`;
}

function paginateCards(cards, layout) {
  if (layout === compactLayout && cards.length <= compactPlayerLimit) return [cards];

  const pages = [];
  let current = [];
  let currentHeight = 0;
  const availableHeight = maxImageHeight - margin * 2 - titleHeight - footerHeight;

  for (const card of cards) {
    const nextHeight = currentHeight + card.height + (current.length > 0 ? layout.cardGap : 0);
    if (current.length > 0 && nextHeight > availableHeight) {
      pages.push(current);
      current = [card];
      currentHeight = card.height;
    } else {
      current.push(card);
      currentHeight = nextHeight;
    }
  }

  if (current.length > 0) pages.push(current);
  return pages.length ? pages : [[]];
}

function pageContentHeight(cards, layout) {
  if (layout.columns === 1) {
    return cards.reduce((sum, card) => sum + card.height, 0) + Math.max(0, cards.length - 1) * layout.cardGap;
  }

  const rows = chunk(cards, layout.columns);
  return rows.reduce((sum, row) => sum + Math.max(...row.map((card) => card.height)), 0) + Math.max(0, rows.length - 1) * layout.cardGap;
}

function avatarPlacement(card, cardX, cardY, layout) {
  const avatarY = cardY + card.nameHeight + 8 + card.bubbleHeight - layout.avatarSize;
  return {
    avatar: card.avatar,
    x: cardX,
    y: avatarY,
    size: layout.avatarSize
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function circularAvatar(buffer, size) {
  try {
    const mask = Buffer.from(`
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/>
</svg>`);

    return sharp(buffer)
      .resize(size, size, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch (error) {
    console.error("Avatar render failed:", error.message);
    return null;
  }
}

function wrapText(value, maxChars) {
  const words = String(value).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (line) lines.push(line);
      lines.push(word.slice(0, maxChars - 1));
      line = word.slice(maxChars - 1);
      continue;
    }

    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function initials(name) {
  const parts = String(name).replace(/^@/, "").split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "?";
}

function pickColor(index) {
  const colors = ["#0A84FF", "#30D158", "#5E5CE6", "#FF9F0A", "#FF453A", "#FF375F", "#BF5AF2", "#32ADE6"];
  return colors[index % colors.length];
}

function pickColorLight(index) {
  const colors = ["#64D2FF", "#30D158", "#5E5CE6", "#FFD60A", "#FF6961", "#FF375F", "#BF5AF2", "#64D2FF"];
  return colors[index % colors.length];
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
