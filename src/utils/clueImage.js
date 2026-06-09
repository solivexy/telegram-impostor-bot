import sharp from "sharp";
import { playerDisplayName } from "./telegram.js";

const fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const emojiFontFamily = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'";

function renderEmoji(text) {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu;
  return text.replace(emojiRegex, `<tspan font-family="${emojiFontFamily}">$&</tspan>`);
}

const baseLayout = {
  columns: 1,
  columnGap: 0,
  minCardHeight: 0
};

const iphoneLayout = {
  ...baseLayout,
  width: 1080,
  margin: 24,
  titleHeight: 250,
  footerHeight: 230,
  imageHeight: 2332,
  cardGap: 16,
  cardPaddingX: 32,
  cardPaddingY: 24,
  lineHeight: 56,
  avatarSize: 104,
  avatarMarginRight: 24,
  nameFontSize: 42,
  clueFontSize: 48,
  timeFontSize: 32,
  nameMaxChars: 40,
  clueMaxChars: 40,
  cardRadius: 50,
  avatarTextSize: 42,
};

const ipadMiniLayout = {
  ...baseLayout,
  width: 1536,
  margin: 28,
  titleHeight: 290,
  footerHeight: 260,
  imageHeight: 2048,
  cardGap: 18,
  cardPaddingX: 38,
  cardPaddingY: 28,
  lineHeight: 64,
  avatarSize: 124,
  avatarMarginRight: 28,
  nameFontSize: 48,
  clueFontSize: 56,
  timeFontSize: 38,
  nameMaxChars: 65,
  clueMaxChars: 65,
  cardRadius: 58,
  avatarTextSize: 48,
};

const ipadProLayout = {
  ...baseLayout,
  width: 2048,
  margin: 32,
  titleHeight: 330,
  footerHeight: 300,
  imageHeight: 2732,
  cardGap: 20,
  cardPaddingX: 42,
  cardPaddingY: 32,
  lineHeight: 74,
  avatarSize: 140,
  avatarMarginRight: 32,
  nameFontSize: 56,
  clueFontSize: 64,
  timeFontSize: 42,
  nameMaxChars: 85,
  clueMaxChars: 85,
  cardRadius: 65,
  avatarTextSize: 56,
};

export async function renderCluesImages({ game, players, clueByUser, avatarsByUserId = new Map() }) {
  let layout = iphoneLayout;
  if (players.length > 6 && players.length <= 10) layout = ipadMiniLayout;
  if (players.length > 10) layout = ipadProLayout;
  const cards = players.map((player, index) => {
    const clue = clueByUser.get(player.userId) || "No clue submitted.";
    const nameLines = wrapText(playerDisplayName(player), layout.nameMaxChars);
    const clueLines = wrapText(clue, layout.clueMaxChars);
    
    const nameHeight = nameLines.length * (layout.nameFontSize * 1.2);
    const contentGap = 6;
    const clueHeight = (clueLines.length - 1) * layout.lineHeight + layout.clueFontSize;
    const timeGap = 12;
    const bubbleHeight = layout.cardPaddingY * 2 + nameHeight + contentGap + clueHeight + timeGap + layout.timeFontSize;
    const height = Math.max(layout.avatarSize, bubbleHeight);

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
  const { width, margin, titleHeight, footerHeight, imageHeight } = layout;
  const contentHeight = pageContentHeight(cards, layout);
  const height = Math.max(imageHeight, margin + titleHeight + contentHeight + footerHeight + margin); // Dynamic height for scrolling screenshots
  const placements = [];
  const cardSvg = renderCards(cards, layout, margin + titleHeight, placements);

  const scale = width / 1080;
  const s = (val) => val * scale;

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#000000"/>
  
  ${cardSvg}

  <!-- Header -->
  <rect x="0" y="0" width="${width}" height="${titleHeight}" fill="#1C1C1D"/>
  <rect x="0" y="${titleHeight - 2}" width="${width}" height="2" fill="#2C2C2E"/>
  <text x="${s(40)}" y="${titleHeight * 0.65}" font-family="${fontFamily}" font-size="${s(48)}" font-weight="400" fill="#0A84FF">‹ Chats</text>
  <text x="${width / 2}" y="${titleHeight * 0.55}" text-anchor="middle" font-family="${fontFamily}" font-size="${s(46)}" font-weight="600" fill="#FFFFFF">Clues</text>
  <text x="${width / 2}" y="${titleHeight * 0.85}" text-anchor="middle" font-family="${fontFamily}" font-size="${s(34)}" font-weight="400" fill="#8E8E93">Round ${escapeXml(String(game.roundNumber || 1))}${totalPages > 1 ? ` • Page ${pageNumber}/${totalPages}` : ""}</text>
  <circle cx="${width - s(80)}" cy="${titleHeight * 0.6}" r="${s(45)}" fill="#30D158"/>
  <text x="${width - s(80)}" y="${titleHeight * 0.6 + s(14)}" text-anchor="middle" font-family="${fontFamily}" font-size="${s(40)}" font-weight="600" fill="#FFFFFF">G</text>

  <!-- Footer -->
  <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="#1C1C1D"/>
  <rect x="0" y="${height - footerHeight}" width="${width}" height="2" fill="#2C2C2E"/>
  <text x="${s(60)}" y="${height - footerHeight + footerHeight * 0.5 + s(20)}" font-family="${fontFamily}" font-size="${s(84)}" font-weight="300" fill="#8E8E93">+</text>
  <text x="${width - s(100)}" y="${height - footerHeight + footerHeight * 0.5 + s(10)}" font-family="${emojiFontFamily}" font-size="${s(64)}" fill="#8E8E93">🎤</text>
  <rect x="${s(130)}" y="${height - footerHeight + footerHeight * 0.15}" width="${width - s(270)}" height="${footerHeight * 0.5}" rx="${footerHeight * 0.25}" fill="#000000" stroke="#2C2C2E" stroke-width="2"/>
  <text x="${s(170)}" y="${height - footerHeight + footerHeight * 0.15 + footerHeight * 0.35}" font-family="${fontFamily}" font-size="${s(42)}" font-weight="400" fill="#8E8E93">Message</text>
  <rect x="${width / 2 - s(180)}" y="${height - s(24)}" width="${s(360)}" height="${s(10)}" rx="${s(5)}" fill="#FFFFFF"/>
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
  const { width, margin } = layout;
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
  const maxLineLength = Math.max(
    ...card.clueLines.map(l => l.length),
    ...card.nameLines.map(l => l.length * (layout.nameFontSize / layout.clueFontSize))
  );
  const estimatedTextWidth = maxLineLength * layout.clueFontSize * 0.55 + 100;
  const maxBubbleWidth = cardWidth - (layout.avatarSize + layout.avatarMarginRight);
  const bubbleWidth = Math.max(layout.cardPaddingX * 3, Math.min(estimatedTextWidth + layout.cardPaddingX * 2, maxBubbleWidth));
  
  const avatarY = y + card.height - layout.avatarSize;
  const bubbleY = y + card.height - card.bubbleHeight;

  const nameY = bubbleY + layout.cardPaddingY + layout.nameFontSize - 4;
  const clueStartY = bubbleY + layout.cardPaddingY + card.nameHeight + 6 + layout.clueFontSize - 4;
  
  const avatarColor = pickColor(card.index);
  const nameColor = pickColorLight(card.index);

  const nameText = card.nameLines.map((line, index) => (
    `<tspan x="${bubbleX + layout.cardPaddingX}" dy="${index === 0 ? 0 : layout.nameFontSize * 1.2}">${renderEmoji(escapeXml(line))}</tspan>`
  )).join("");

  const clueText = card.clueLines.map((line, index) => (
    `<tspan x="${bubbleX + layout.cardPaddingX}" dy="${index === 0 ? 0 : layout.lineHeight}">${renderEmoji(escapeXml(line))}</tspan>`
  )).join("");

  const r = layout.cardRadius;
  const h = card.bubbleHeight;
  const w = bubbleWidth;

  const tailScale = r / 50;
  const t = (val) => val * tailScale;

  const tailPath = `
    M ${bubbleX + r} ${bubbleY}
    L ${bubbleX + w - r} ${bubbleY}
    A ${r} ${r} 0 0 1 ${bubbleX + w} ${bubbleY + r}
    L ${bubbleX + w} ${bubbleY + h - r}
    A ${r} ${r} 0 0 1 ${bubbleX + w - r} ${bubbleY + h}
    L ${bubbleX + t(26)} ${bubbleY + h}
    C ${bubbleX + t(12)} ${bubbleY + h} ${bubbleX} ${bubbleY + h - t(2)} ${bubbleX - t(10)} ${bubbleY + h}
    C ${bubbleX - t(4)} ${bubbleY + h - t(4)} ${bubbleX} ${bubbleY + h - t(12)} ${bubbleX} ${bubbleY + h - t(24)}
    L ${bubbleX} ${bubbleY + r}
    A ${r} ${r} 0 0 1 ${bubbleX + r} ${bubbleY}
    Z
  `;

  const timeY = bubbleY + h - layout.cardPaddingY / 2;
  const timeX = bubbleX + w - layout.cardPaddingX;

  return `
  <g>
    <circle cx="${avatarX + layout.avatarSize / 2}" cy="${avatarY + layout.avatarSize / 2}" r="${layout.avatarSize / 2}" fill="${avatarColor}"/>
    ${card.avatar ? "" : `<text x="${avatarX + layout.avatarSize / 2}" y="${avatarY + layout.avatarSize / 2 + layout.avatarTextSize * 0.35}" text-anchor="middle" font-family="${fontFamily}" font-size="${layout.avatarTextSize}" font-weight="700" fill="#ffffff">${escapeXml(initials(playerDisplayName(card.player)))}</text>`}
    
    <path d="${tailPath}" fill="#262628"/>
    
    <text x="${bubbleX + layout.cardPaddingX}" y="${nameY}" font-family="${fontFamily}" font-size="${layout.nameFontSize}" font-weight="600" fill="${nameColor}">${nameText}</text>
    <text x="${bubbleX + layout.cardPaddingX}" y="${clueStartY}" font-family="${fontFamily}" font-size="${layout.clueFontSize}" font-weight="400" fill="#ffffff">${clueText}</text>
    <text x="${timeX}" y="${timeY}" text-anchor="end" font-family="${fontFamily}" font-size="${layout.timeFontSize}" font-weight="400" fill="#8E8E93">10:42</text>
  </g>`;
}

function paginateCards(cards, layout) {
  // Never paginate: return all cards as a single page to create a scrolling screenshot
  return [cards];
}

function pageContentHeight(cards, layout) {
  if (layout.columns === 1) {
    return cards.reduce((sum, card) => sum + card.height, 0) + Math.max(0, cards.length - 1) * layout.cardGap;
  }

  const rows = chunk(cards, layout.columns);
  return rows.reduce((sum, row) => sum + Math.max(...row.map((card) => card.height)), 0) + Math.max(0, rows.length - 1) * layout.cardGap;
}

function avatarPlacement(card, cardX, cardY, layout) {
  const avatarY = cardY + card.height - layout.avatarSize;
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
