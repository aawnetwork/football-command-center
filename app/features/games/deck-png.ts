import type { groupDeckGames } from "../../lib/curated-decks";

type Groups = ReturnType<typeof groupDeckGames>;

function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

async function logo() {
  const image = new Image();
  image.src = "/aaw-network.png";
  await image.decode();
  // Find the existing transparent wordmark's bounds without changing the asset.
  const canvas = document.createElement("canvas");
  canvas.width = 540; canvas.height = 540;
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, 540, 540);
  const pixels = context.getImageData(0, 0, 540, 540).data;
  let left = 540, top = 540, right = 0, bottom = 0;
  for (let y = 0; y < 540; y++) for (let x = 0; x < 540; x++) {
    if (pixels[(y * 540 + x) * 4 + 3] > 20) {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  return { canvas, left, top, width: right - left + 1, height: bottom - top + 1 };
}

export async function createDeckPng(season: number, week: number, groups: Groups): Promise<Blob> {
  if (!groups.length) throw new Error("No assigned games selected");
  await document.fonts.ready;
  const styles = getComputedStyle(document.documentElement);
  const bodyFont = styles.getPropertyValue("--font-montserrat").trim() || "sans-serif";
  const headingFont = styles.getPropertyValue("--font-bebas-neue").trim() || "sans-serif";
  await Promise.all([document.fonts.load(`700 30px ${bodyFont}`), document.fonts.load(`400 76px ${headingFont}`)]);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `700 30px ${bodyFont}`;
  const rows = groups.map((group) => ({ ...group, games: group.games.map((game) => ({
    ...game, lines: wrap(context, `${game.awayTeam} @ ${game.homeTeam}`, 936),
  })) }));
  const height = Math.max(640, 300 + rows.reduce((total, group) => total + 80 + group.games.reduce((sum, game) => sum + game.lines.length * 42 + 26, 0) + 22, 0) + 110);
  // Limit only the physical pixel density for very long lists; retain every game.
  const scale = Math.min(2, 16000 / height);
  canvas.width = Math.round(1080 * scale); canvas.height = Math.round(height * scale);
  context.scale(scale, scale);
  context.fillStyle = "#0B1F33"; context.fillRect(0, 0, 1080, height);
  context.fillStyle = "#FF6B00"; context.fillRect(56, 48, 100, 5);
  context.font = `700 19px ${bodyFont}`; context.fillText("AAW FOOTBALL DESK", 56, 90);
  context.fillStyle = "#f8fafc"; context.font = `400 76px ${headingFont}`;
  context.fillText(groups.length === 1 && groups[0].tier === "S" ? "MY MUST-WATCH GAMES" : "MY CFB WATCHLIST", 56, 180);
  context.fillStyle = "#b3c1d1"; context.font = `500 26px ${bodyFont}`;
  context.fillText(`${season} · COLLEGE FOOTBALL · WEEK ${week}`, 56, 228);
  try {
    const mark = await logo();
    context.drawImage(mark.canvas, mark.left, mark.top, mark.width, mark.height, 740, 64, 284, 284 * mark.height / mark.width);
  } catch { /* Text branding above remains if the local logo cannot load. */ }
  let y = 298;
  for (const group of rows) {
    context.fillStyle = "#FF6B00"; context.font = `400 44px ${headingFont}`;
    context.fillText(`${group.tier} TIER${group.tier === "S" ? " · MUST WATCH" : ""}`, 56, y + 38);
    y += 80;
    for (const game of group.games) {
      context.fillStyle = "#f8fafc"; context.font = `700 30px ${bodyFont}`;
      for (const line of game.lines) { context.fillText(line, 72, y + 30); y += 42; }
      context.strokeStyle = "#29435b"; context.beginPath(); context.moveTo(56, y + 8); context.lineTo(1024, y + 8); context.stroke();
      y += 26;
    }
    y += 22;
  }
  context.fillStyle = "#b3c1d1"; context.font = `500 22px ${bodyFont}`;
  context.fillText("Build your own deck · desk.aawnetwork.co.uk", 56, height - 48);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG creation failed")), "image/png"));
}
