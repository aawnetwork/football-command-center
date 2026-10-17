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

// Anonymous CORS keeps the export canvas downloadable. A missing or blocked
// mark must never prevent sharing the team names or the rest of the deck.
function loadLogo(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const finish = (value: HTMLImageElement | null) => {
      window.clearTimeout(timeout);
      image.onload = image.onerror = null;
      resolve(value);
    };
    const timeout = window.setTimeout(() => finish(null), 5_000);
    image.crossOrigin = "anonymous";
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = src;
  });
}

export async function createDeckPng(season: number, week: number, groups: Groups): Promise<Blob> {
  if (!groups.length) throw new Error("No assigned games selected");
  await document.fonts.ready;
  const rootStyles = getComputedStyle(document.documentElement);
  const styles = getComputedStyle(document.querySelector(".command-center--cfb") ?? document.documentElement);
  const bodyFont = rootStyles.getPropertyValue("--font-montserrat").trim() || "sans-serif";
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const colours = {
    navy: token("--cc-text", "#0b1f33"),
    canvas: token("--cc-canvas", "#f3f0e7"),
    surface: token("--cc-surface", "#fffdf7"),
    border: token("--cc-border", "#d8d6cd"),
    muted: token("--cc-muted", "#52606a"),
    yellow: "#ffc720",
    orange: "#ff6b00",
  };
  await Promise.all([800, 700, 500].map((weight) => document.fonts.load(`${weight} 36px ${bodyFont}`)));

  const canvas = document.createElement("canvas");
  const renderingContext = canvas.getContext("2d");
  if (!renderingContext) throw new Error("Canvas is unavailable");
  const context = renderingContext;
  context.font = `700 36px ${bodyFont}`;
  const rows = groups.map((group) => ({ ...group, games: group.games.map((game) => {
    const awayLines = wrap(context, game.awayTeam, 828);
    const homeLines = wrap(context, game.homeTeam, 828);
    return { ...game, awayLines, homeLines, height: 80 + (awayLines.length + homeLines.length) * 44 };
  }) }));
  const sources = [...new Set(groups.flatMap((group) => group.games.flatMap((game) => [game.awayLogo, game.homeLogo])).filter((src): src is string => Boolean(src)))];
  const logos = new Map(await Promise.all(sources.map(async (src) => [src, await loadLogo(src)] as const)));
  const height = Math.max(720, 310 + rows.reduce((total, group) => total + 64 + group.games.reduce((sum, game) => sum + game.height + 12, 0) + 24, 0) + 104);
  // Preserve the existing high-resolution PNG and every selected game, even
  // for long decks; only physical pixel density is bounded.
  const scale = Math.min(2, 16000 / height);
  canvas.width = Math.round(1080 * scale); canvas.height = Math.round(height * scale);
  context.scale(scale, scale);
  context.fillStyle = colours.canvas; context.fillRect(0, 0, 1080, height);
  context.fillStyle = colours.navy; context.fillRect(0, 0, 1080, 210);
  context.fillStyle = colours.yellow; context.fillRect(0, 210, 1080, 6);
  context.textBaseline = "alphabetic";

  context.fillStyle = colours.surface; context.font = `800 76px ${bodyFont}`;
  context.fillText("The HUB", 56, 116);
  const brandWidth = context.measureText("The HUB").width;
  context.fillStyle = colours.orange; context.fillRect(56 + brandWidth + 10, 103, 12, 12);
  context.fillStyle = "#c8d0d5"; context.font = `500 23px ${bodyFont}`;
  context.fillText(`${season} · COLLEGE FOOTBALL`, 58, 166);
  context.fillStyle = colours.yellow; context.font = `700 20px ${bodyFont}`;
  context.textAlign = "right"; context.fillText("WEEK", 1024, 70);
  context.fillStyle = colours.surface; context.font = `800 66px ${bodyFont}`;
  context.fillText(String(week), 1024, 143);
  context.textAlign = "left";
  context.fillStyle = colours.navy; context.font = `800 44px ${bodyFont}`;
  context.fillText(groups.length === 1 && groups[0].tier === "S" ? "My must-watch games" : "My CFB watchlist", 56, 286);

  function team(lines: string[], src: string | null | undefined, top: number) {
    const image = src ? logos.get(src) : null;
    const teamHeight = lines.length * 44;
    if (image) {
      // Fit each mark without stretching unusually wide or tall logos.
      const ratio = Math.min(48 / image.naturalWidth, 48 / image.naturalHeight);
      const width = image.naturalWidth * ratio, logoHeight = image.naturalHeight * ratio;
      context.drawImage(image, 88 + (48 - width) / 2, top + (teamHeight - logoHeight) / 2, width, logoHeight);
    }
    context.fillStyle = colours.navy; context.font = `700 36px ${bodyFont}`;
    lines.forEach((line, index) => context.fillText(line, 156, top + 34 + index * 44));
  }

  let y = 318;
  for (const group of rows) {
    context.fillStyle = colours.navy; context.fillRect(56, y, 46, 42);
    context.fillStyle = colours.yellow; context.font = `800 28px ${bodyFont}`;
    context.textAlign = "center"; context.fillText(group.tier, 79, y + 31);
    context.textAlign = "left"; context.fillStyle = colours.navy; context.font = `700 22px ${bodyFont}`;
    context.fillText(group.tier === "S" ? "MUST WATCH" : `${group.tier} TIER`, 120, y + 29);
    context.textAlign = "right"; context.fillStyle = colours.muted; context.font = `500 20px ${bodyFont}`;
    context.fillText(`${group.games.length} ${group.games.length === 1 ? "GAME" : "GAMES"}`, 1024, y + 29);
    context.textAlign = "left";
    y += 64;
    for (const game of group.games) {
      context.fillStyle = colours.surface; context.fillRect(56, y, 968, game.height);
      context.strokeStyle = colours.border; context.lineWidth = 1; context.strokeRect(56, y, 968, game.height);
      team(game.awayLines, game.awayLogo, y + 24);
      context.fillStyle = colours.muted; context.font = `700 16px ${bodyFont}`;
      context.fillText("AT", 156, y + 24 + game.awayLines.length * 44 + 19);
      team(game.homeLines, game.homeLogo, y + 56 + game.awayLines.length * 44);
      y += game.height + 12;
    }
    y += 24;
  }
  context.strokeStyle = colours.border; context.beginPath(); context.moveTo(56, height - 92); context.lineTo(1024, height - 92); context.stroke();
  context.fillStyle = colours.muted; context.font = `500 22px ${bodyFont}`;
  context.fillText("Build your own deck", 56, height - 45);
  context.textAlign = "right"; context.fillStyle = colours.navy; context.font = `700 26px ${bodyFont}`;
  context.fillText("hub.aawnetwork.co.uk", 1024, height - 45);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG creation failed")), "image/png"));
}
