import type { RaceEntry, RaceSeries } from './race-data';
export const RACE_FPS = 30;
export const RACE_STEP_SECONDS = 2;
export const RACE_START_HOLD = 1.5;
export const RACE_END_HOLD = 3;
export function raceDuration(series: RaceSeries) { return RACE_START_HOLD + Math.max(0, series.checkpoints.length - 1) * RACE_STEP_SECONDS + RACE_END_HOLD; }
const sorted = (entries: RaceEntry[]) => [...entries].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
const prepared = new WeakMap<RaceSeries, { points: { entries: RaceEntry[]; ranks: Map<string, RaceEntry & { rank: number }> }[]; minimum: number; maximum: number }>();
function prepare(series: RaceSeries) {
  const previous = prepared.get(series);
  if (previous) return previous;
  let minimum = 0, maximum = 1;
  const points = series.checkpoints.map(point => {
    const entries = sorted(point.entries);
    entries.forEach(entry => { minimum = Math.min(minimum, entry.value); maximum = Math.max(maximum, entry.value); });
    return { entries, ranks: new Map(entries.map((entry, rank) => [entry.id, { ...entry, rank }])) };
  });
  const value = { points, minimum, maximum }; prepared.set(series, value); return value;
}
export function raceFrame(series: RaceSeries, seconds: number, limit: number) {
  const position = Math.max(0, Math.min(series.checkpoints.length - 1, (seconds - RACE_START_HOLD) / RACE_STEP_SECONDS));
  const index = Math.floor(position), progress = position - index;
  const from = series.checkpoints[index], to = series.checkpoints[Math.min(index + 1, series.checkpoints.length - 1)];
  const prepared = prepare(series);
  const a = prepared.points[index].entries, b = prepared.points[Math.min(index + 1, series.checkpoints.length - 1)].entries;
  const before = prepared.points[index].ranks;
  const after = prepared.points[Math.min(index + 1, series.checkpoints.length - 1)].ranks;
  const ease = progress * progress * (3 - 2 * progress);
  const ids = new Set([...a.slice(0, limit).map(e => e.id), ...b.slice(0, limit).map(e => e.id)]);
  const entries = [...ids].map(id => {
    const start = before.get(id), end = after.get(id)!;
    // New players enter from below using their first observed value, never a fabricated zero.
    return { ...end, value: start ? start.value + (end.value - start.value) * ease : end.value,
      rank: Math.min(start?.rank ?? limit - 1, limit - 1) + (Math.min(end.rank, limit - 1) - Math.min(start?.rank ?? limit - 1, limit - 1)) * ease,
      alpha: start ? 1 : ease };
  });
  const top = entries.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, limit);
  return { entries: top, fromWeek: from.week, toWeek: to.week, progress };
}
function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight = 700) {
  const family = ctx.canvas.style?.fontFamily || 'Inter, Arial, sans-serif';
  while (size > 18) { ctx.font = `${weight} ${size}px ${family}`; if (ctx.measureText(text).width <= width) break; size--; }
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillText(text, x, y, width);
}
export function drawRaceFrame(ctx: CanvasRenderingContext2D, series: RaceSeries, seconds: number, options: { logos?: Map<string, ImageBitmap> }) {
  const { logos } = options;
  const limit = 10;
  const scale = ctx.canvas.width / 1080;
  ctx.save(); ctx.scale(scale, scale);
  const background = '#fffdf7', ink = '#0b1f33', muted = '#536471';
  const accent = series.league === 'CFB' ? '#ff6b00' : '#ffc720';
  ctx.fillStyle = background; ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 1080, 10);
  ctx.fillStyle = muted; fit(ctx, `AAW HUB / ${series.league} ${series.season}`, 64, 130, 952, 28);
  ctx.fillStyle = ink; fit(ctx, series.metric, 64, 230, 952, 65, 800);
  ctx.fillStyle = muted; fit(ctx, 'TOP 10 · SEASON TOTALS', 64, 290, 952, 26);
  const frame = raceFrame(series, seconds, limit);
  ctx.fillStyle = accent;
  fit(ctx, frame.fromWeek === frame.toWeek || frame.progress === 0 ? `WEEK ${frame.fromWeek}` : `WEEK ${frame.fromWeek} → ${frame.toWeek}`, 64, 390, 952, 52, 800);
  const minimum = Math.min(0, ...frame.entries.map(entry => entry.value));
  const maximum = Math.max(1, ...frame.entries.map(entry => entry.value));
  const chartLeft = 370, chartWidth = 560;
  const zero = chartLeft + (0 - minimum) / (maximum - minimum) * chartWidth;
  const rowHeight = limit === 10 ? 112 : 190, top = 480;
  ctx.save(); ctx.beginPath(); ctx.rect(40, top - 14, 1000, limit * rowHeight + 14); ctx.clip();
  for (const entry of frame.entries.sort((a, b) => b.rank - a.rank)) {
    if (entry.rank >= limit || entry.alpha <= 0) continue;
    const y = top + entry.rank * rowHeight;
    ctx.globalAlpha = entry.alpha;
    ctx.fillStyle = ink; fit(ctx, entry.name, 64, y + 32, 280, 30);
    ctx.fillStyle = muted; fit(ctx, entry.team, 64, y + 66, 280, 21, 500);
    const valueX = chartLeft + (entry.value - minimum) / (maximum - minimum) * chartWidth;
    ctx.fillStyle = entry.color ?? '#536471'; ctx.fillRect(Math.min(zero, valueX), y + 10, Math.max(2, Math.abs(valueX - zero)), 68);
    const logo = entry.logo ? logos?.get(entry.logo) : undefined;
    if (logo) {
      const badge = Math.min(56, Math.max(2, Math.abs(valueX - zero) - 8));
      const x = Math.max(zero, valueX) - badge - 4, cy = y + 44;
      ctx.fillStyle = background; ctx.beginPath(); ctx.arc(x + badge / 2, cy, badge / 2, 0, Math.PI * 2); ctx.fill();
      const s = Math.min((badge - 6) / logo.width, (badge - 6) / logo.height);
      if (s > 0) ctx.drawImage(logo, x + (badge - logo.width * s) / 2, cy - logo.height * s / 2, logo.width * s, logo.height * s);
    }
    ctx.fillStyle = ink; ctx.textAlign = 'right'; fit(ctx, Math.round(entry.value).toLocaleString('en-GB'), 1016, y + 55, 130, 34, 800); ctx.textAlign = 'left';
  }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.fillStyle = muted; fit(ctx, 'Source: AAW Hub statistics', 64, 1750, 952, 23, 500);
  fit(ctx, 'AAWNETWORK.CO.UK', 64, 1820, 952, 26);
  ctx.fillStyle = accent; ctx.fillRect(64, 1860, 952 * Math.min(1, Math.max(0, seconds / raceDuration(series))), 5);
  ctx.restore();
}
