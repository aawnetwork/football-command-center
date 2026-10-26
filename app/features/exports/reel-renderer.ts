import type { OverlayGame, OverlayTeam } from './game-overlay';

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export const REEL_FPS = 30;
export const REEL_SECONDS = 9;

export type ReelTreatment = 'dark' | 'light';
export type ReelImages = {
  awayLogo: ImageBitmap;
  homeLogo: ImageBitmap;
  wordmark: ImageBitmap;
  photo?: ImageBitmap | null;
};

export type ReelFrame = {
  game: OverlayGame;
  treatment: ReelTreatment;
  images: ReelImages;
  time: number;
  sans: string;
  display: string;
};

export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const easeOut = (n: number) => 1 - Math.pow(1 - clamp(n), 3);
export const revealAt = (time: number, start: number, length = 0.7) => easeOut((time - start) / length);

const NAVY = '#071827';
const CREAM = '#fffaf0';

function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number, zoom = 1) {
  const scale = Math.max(w / image.width, h / image.height) * zoom;
  const iw = image.width * scale, ih = image.height * scale;
  ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function contain(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / image.width, h / image.height);
  const iw = image.width * scale, ih = image.height * scale;
  ctx.drawImage(image, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

function textFit(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, maxFont: number, minFont: number, family: string, weight = 800) {
  let size = maxFont;
  while (size > minFont) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(value).width <= maxWidth) break;
    size -= 2;
  }
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillText(value, x, y, maxWidth);
}

function teamRow(ctx: CanvasRenderingContext2D, game: OverlayGame, team: OverlayTeam, logo: ImageBitmap, y: number, treatment: ReelTreatment, delay: number, time: number, sans: string, accent: string) {
  const progress = revealAt(time, delay, 0.85);
  if (progress <= 0) return;
  const dark = treatment === 'dark';
  ctx.save();
  ctx.globalAlpha = progress;
  ctx.translate(0, (1 - progress) * 95);
  ctx.fillStyle = dark ? 'rgba(7,24,39,0.93)' : 'rgba(255,250,240,0.95)';
  ctx.fillRect(66, y, 948, 235);
  ctx.fillStyle = team.color && /^#[a-f\d]{6}$/i.test(team.color) ? team.color : accent;
  ctx.fillRect(66, y, 9, 235);
  ctx.fillStyle = CREAM;
  ctx.fillRect(96, y + 29, 169, 174);
  contain(ctx, logo, 113, y + 44, 135, 144);
  ctx.fillStyle = dark ? CREAM : NAVY;
  textFit(ctx, team.name.toUpperCase(), 290, y + 120, game.stage === 'final' ? 435 : 655, 51, 31, sans);
  ctx.fillStyle = dark ? '#b9c9d7' : '#546578';
  const detail = [team.rank === null ? null : `#${team.rank}`, team.record].filter(Boolean).join('  ·  ');
  ctx.font = `600 27px ${sans}`;
  if (detail) ctx.fillText(detail, 293, y + 166, 415);
  if (game.stage === 'final') {
    ctx.fillStyle = dark ? CREAM : NAVY;
    ctx.textAlign = 'right';
    ctx.font = `900 137px ${sans}`;
    ctx.fillText(String(team.score), 977, y + 158);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

export function drawReelFrame(ctx: CanvasRenderingContext2D, frame: ReelFrame) {
  const { game, treatment, images, sans, display } = frame;
  const time = clamp(frame.time, 0, REEL_SECONDS);
  const dark = treatment === 'dark';
  const accent = game.league === 'CFB' ? '#ff6b00' : '#ffc720';
  const ink = dark ? CREAM : NAVY;
  const { canvas } = ctx;
  ctx.save();
  ctx.setTransform(canvas.width / REEL_WIDTH, 0, 0, canvas.height / REEL_HEIGHT, 0, 0);
  ctx.clearRect(0, 0, REEL_WIDTH, REEL_HEIGHT);

  // Full-bleed, slow-moving photography is the visual anchor, not a stretched score card.
  ctx.fillStyle = dark ? NAVY : CREAM;
  ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT);
  if (images.photo) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, REEL_WIDTH, REEL_HEIGHT); ctx.clip();
    cover(ctx, images.photo, 0, 0, REEL_WIDTH, REEL_HEIGHT, 1.04 + time * 0.008);
    ctx.restore();
  } else {
    const background = ctx.createLinearGradient(0, 0, REEL_WIDTH, REEL_HEIGHT);
    background.addColorStop(0, dark ? '#1c3a52' : '#dde7e7');
    background.addColorStop(0.55, dark ? '#10293c' : '#f4e9d9');
    background.addColorStop(1, dark ? '#071827' : '#fffaf0');
    ctx.fillStyle = background; ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT);
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(7,24,39,.08)';
    ctx.lineWidth = 3;
    for (let i = -4; i < 7; i++) { ctx.beginPath(); ctx.moveTo(i * 260, 0); ctx.lineTo(i * 260 + 840, REEL_HEIGHT); ctx.stroke(); }
  }
  const wash = ctx.createLinearGradient(0, 0, 0, REEL_HEIGHT);
  if (dark) {
    wash.addColorStop(0, 'rgba(4,16,27,.65)');
    wash.addColorStop(.42, 'rgba(4,16,27,.35)');
    wash.addColorStop(1, 'rgba(4,16,27,.92)');
  } else {
    wash.addColorStop(0, 'rgba(255,250,240,.80)');
    wash.addColorStop(.42, 'rgba(255,250,240,.48)');
    wash.addColorStop(1, 'rgba(255,250,240,.96)');
  }
  ctx.fillStyle = wash; ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT);

  // Fixed AAW identity and time-progress keyline.
  ctx.fillStyle = accent; ctx.fillRect(66, 92, 86, 8);
  ctx.fillStyle = ink;
  ctx.font = `800 33px ${sans}`;
  ctx.fillText(game.league === 'CFB' ? 'COLLEGE FOOTBALL' : 'NFL', 66, 154);
  ctx.textAlign = 'right';
  ctx.font = `700 25px ${sans}`;
  ctx.fillText('AAW NETWORK', 1014, 152);
  ctx.textAlign = 'left';

  const intro = 1 - revealAt(time, 1.2, .85);
  if (intro > 0) {
    ctx.save(); ctx.globalAlpha = intro;
    ctx.fillStyle = ink;
    ctx.font = `900 169px ${display}`;
    ctx.fillText(game.stage === 'final' ? 'FINAL' : 'GAME', 66, 795, 965);
    ctx.fillStyle = accent;
    ctx.fillRect(66, 826, 530, 14);
    ctx.font = `800 49px ${sans}`;
    ctx.fillStyle = ink;
    ctx.fillText(game.stage === 'final' ? 'THE RESULT' : 'MATCHUP PREVIEW', 67, 903);
    ctx.restore();
  }

  const details = revealAt(time, 1.2, .9) * (1 - revealAt(time, 7.25, .9));
  if (details > 0) {
    ctx.save(); ctx.globalAlpha = details;
    ctx.fillStyle = ink;
    ctx.font = `900 126px ${display}`;
    ctx.fillText(game.stage === 'final' ? game.finalLabel : 'GAME DAY', 66, 685, 945);
    ctx.fillStyle = accent; ctx.fillRect(66, 710, 948, 12);
    ctx.restore();
    teamRow(ctx, game, game.away, images.awayLogo, 838, treatment, 1.4, time, sans, accent);
    teamRow(ctx, game, game.home, images.homeLogo, 1100, treatment, 1.75, time, sans, accent);
    ctx.save(); ctx.globalAlpha = details;
    ctx.fillStyle = ink;
    ctx.font = `800 34px ${sans}`;
    const sub = game.stage === 'final' ? (game.context ?? 'FINAL SCORE') : 'UPCOMING MATCHUP';
    ctx.fillText(sub.toUpperCase(), 66, 1429, 948);
    if (game.stage === 'pregame') {
      const kickoff = new Date(game.kickoff);
      const label = Number.isFinite(kickoff.getTime())
        ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(kickoff)
        : 'KICKOFF TO BE CONFIRMED';
      ctx.font = `700 38px ${sans}`;
      ctx.fillText(label.toUpperCase(), 66, 1510, 948);
    }
    ctx.restore();
  }

  const outro = revealAt(time, 7.25, 1.05);
  if (outro > 0) {
    ctx.save();
    ctx.globalAlpha = outro;
    ctx.fillStyle = dark ? 'rgba(7,24,39,.96)' : 'rgba(255,250,240,.97)';
    ctx.fillRect(0, 0, REEL_WIDTH, REEL_HEIGHT);
    ctx.fillStyle = accent; ctx.fillRect(66, 686, 948, 9);
    // Supplied AAW wordmark is white, so give it an explicit navy surface in both treatments.
    ctx.fillStyle = NAVY; ctx.fillRect(66, 736, 948, 315);
    contain(ctx, images.wordmark, 111, 833, 858, 125);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.font = `800 34px ${sans}`;
    ctx.fillText('AMERICAN FOOTBALL', 540, 1150);
    ctx.font = `700 28px ${sans}`;
    ctx.fillText('AAWNETWORK.CO.UK', 540, 1210);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  ctx.fillStyle = dark ? 'rgba(255,255,255,.24)' : 'rgba(7,24,39,.18)';
  ctx.fillRect(66, 1817, 948, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(66, 1817, 948 * time / REEL_SECONDS, 5);
  ctx.restore();
}
