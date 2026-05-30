import sharp from "sharp";
import { playerDisplayName } from "./telegram.js";

const width = 1080;
const margin = 48;
const cardGap = 22;
const cardPaddingX = 30;
const cardPaddingY = 24;
const lineHeight = 34;
const titleHeight = 92;
const footerHeight = 58;
const maxImageHeight = 1900;
const avatarSize = 58;
const compactPlayerLimit = 12;

const regularLayout = {
  columns: 1,
  cardGap,
  columnGap: 0,
  cardPaddingX,
  cardPaddingY,
  lineHeight,
  avatarSize,
  nameFontSize: 27,
  clueFontSize: 25,
  nameMaxChars: 34,
  clueMaxChars: 50,
  cardRadius: 18,
  avatarTextSize: 24,
  minCardHeight: 0
};

const compactLayout = {
  columns: 2,
  cardGap: 16,
  columnGap: 18,
  cardPaddingX: 18,
  cardPaddingY: 17,
  lineHeight: 27,
  avatarSize: 42,
  nameFontSize: 22,
  clueFontSize: 20,
  nameMaxChars: 22,
  clueMaxChars: 31,
  cardRadius: 14,
  avatarTextSize: 18,
  minCardHeight: 108
};

export async function renderCluesImages({ game, players, clueByUser, avatarsByUserId = new Map() }) {
  const layout = players.length <= compactPlayerLimit ? compactLayout : regularLayout;
  const cards = players.map((player, index) => {
    const clue = clueByUser.get(player.userId) || "No clue submitted.";
    const nameLines = wrapText(playerDisplayName(player), layout.nameMaxChars);
    const clueLines = wrapText(clue, layout.clueMaxChars);
    const height = Math.max(
      layout.minCardHeight,
      layout.cardPaddingY * 2 + nameLines.length * layout.lineHeight + 8 + clueLines.length * layout.lineHeight
    );

    return {
      index,
      player,
      nameLines,
      clueLines,
      height,
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
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#171717"/>
      <stop offset="100%" stop-color="#263238"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#000000" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${margin}" y="${margin + 42}" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff">Who's Impostor?</text>
  <text x="${margin}" y="${margin + 78}" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="500" fill="#b8c7cc">Clues • Round ${escapeXml(String(game.roundNumber || 1))}${totalPages > 1 ? ` • Page ${pageNumber}/${totalPages}` : ""}</text>
  ${cardSvg}
  <text x="${margin}" y="${height - margin}" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="600" fill="#cfd8dc">Vote for who you think is the impostor.</text>
</svg>`;

  const overlays = [];
  for (const placement of placements) {
    if (!placement.avatar) continue;
    const input = await circularAvatar(placement.avatar, placement.size);
    if (input) overlays.push({ input, left: placement.x, top: placement.y });
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
  const avatarX = x + layout.cardPaddingX;
  const textX = avatarX + layout.avatarSize + 14;
  const nameY = y + layout.cardPaddingY + Math.round(layout.nameFontSize * 1.05);
  const clueStartY = nameY + card.nameLines.length * layout.lineHeight + 12;
  const avatarColor = pickColor(card.index);

  const nameText = card.nameLines.map((line, index) => (
    `<tspan x="${textX}" dy="${index === 0 ? 0 : layout.lineHeight}">${escapeXml(line)}</tspan>`
  )).join("");

  const clueText = card.clueLines.map((line, index) => (
    `<tspan x="${textX}" dy="${index === 0 ? 0 : layout.lineHeight}">${escapeXml(line)}</tspan>`
  )).join("");

  return `
  <g filter="url(#shadow)">
    <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="${layout.cardRadius}" fill="#f8fafc"/>
    <circle cx="${avatarX + layout.avatarSize / 2}" cy="${y + layout.cardPaddingY + layout.avatarSize / 2}" r="${layout.avatarSize / 2}" fill="${avatarColor}"/>
    ${card.avatar ? "" : `<text x="${avatarX + layout.avatarSize / 2}" y="${y + layout.cardPaddingY + Math.round(layout.avatarSize * 0.68)}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${layout.avatarTextSize}" font-weight="800" fill="#ffffff">${escapeXml(initials(playerDisplayName(card.player)))}</text>`}
    <text x="${textX}" y="${nameY}" font-family="Inter, Arial, sans-serif" font-size="${layout.nameFontSize}" font-weight="800" fill="#102027">${nameText}</text>
    <text x="${textX}" y="${clueStartY}" font-family="Inter, Arial, sans-serif" font-size="${layout.clueFontSize}" font-weight="500" fill="#37474f">${clueText}</text>
  </g>`;
}

function paginateCards(cards, layout) {
  if (layout === compactLayout && cards.length <= compactPlayerLimit) return [cards];

  const pages = [];
  let current = [];
  let currentHeight = 0;
  const availableHeight = maxImageHeight - margin * 2 - titleHeight - footerHeight;

  for (const card of cards) {
    const nextHeight = currentHeight + card.height + (current.length > 0 ? cardGap : 0);
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
  return {
    avatar: card.avatar,
    x: cardX + layout.cardPaddingX,
    y: cardY + layout.cardPaddingY,
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
  const colors = ["#1976d2", "#00897b", "#7b1fa2", "#c2185b", "#5d4037", "#455a64", "#ef6c00", "#2e7d32"];
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
