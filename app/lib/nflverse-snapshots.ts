/** Public nflverse snapshots only. No live ESPN data enters this cache.
 * Process-local: warm requests share downloads and parser-profile results.
 * Different Vercel instances may still load independently. */
export type NflverseRow = Record<string, string>;
export const NFLVERSE_URLS = {
  player: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv',
  schedule: 'https://github.com/nflverse/nfldata/raw/master/data/games.csv',
  team: 'https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_reg_2026.csv',
} as const;
export function createNflverseSnapshots(request: typeof fetch = fetch, now = Date.now) {
  type Raw = { text: string; status: number; ok: boolean; expiresAt: number };
  const raw = new Map<string, Raw>();
  const pending = new Map<string, Promise<Raw>>();
  const parsed = new Map<string, { raw: Raw; rows: NflverseRow[] }>();
  async function download(url: string) {
    const hit = raw.get(url);
    if (hit && now() < hit.expiresAt) return hit;
    let work = pending.get(url);
    if (!work) {
      work = (async () => {
        const response = await request(url, { cache: 'no-store' });
        const entry = { text: response.ok ? await response.text() : '', status: response.status, ok: response.ok, expiresAt: now() + 300_000 };
        if (entry.ok) raw.set(url, entry);
        return entry;
      })().finally(() => pending.delete(url));
      pending.set(url, work);
    }
    return work;
  }
  return async function snapshot(kind: keyof typeof NFLVERSE_URLS, profile: 'weekly' | 'performance' | 'team', parse: (text: string) => NflverseRow[]) {
    const entry = await download(NFLVERSE_URLS[kind]);
    if (!entry.ok) return { ...entry, rows: [] as NflverseRow[] };
    const key = kind + ':' + profile;
    let result = parsed.get(key);
    if (!result || result.raw !== entry) {
      // Synchronous parsing means resumed concurrent callers share one parse.
      result = { raw: entry, rows: parse(entry.text) };
      parsed.set(key, result);
    }
    return { ok: entry.ok, status: entry.status, expiresAt: entry.expiresAt, rows: result.rows };
  };
}
// Delay fetch binding to request time so tests/mocks and runtime instrumentation work.
export const loadNflverseSnapshot = createNflverseSnapshots((...args) => fetch(...args));
export function parseWeeklyPlayers(csv: string): NflverseRow[] {
  const parse = (line: string) => {
    const values: string[] = []; let value = '', quoted = false;
    for (const character of line) {
      if (character === '"') quoted = !quoted;
      else if (character === ',' && !quoted) { values.push(value); value = ''; }
      else value += character;
    }
    values.push(value); return values;
  };
  const lines = csv.split(/\r?\n/).filter(Boolean), headers = parse(lines[0] ?? '');
  return lines.slice(1).map(line => {
    const values = parse(line);
    return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
  }).filter(row => Number(row.season) === 2026 && row.season_type === 'REG');
}
export function parseSeasonTeams(csv: string): NflverseRow[] {
  const lines = csv.split(/\r?\n/).filter(Boolean), headers = (lines[0] ?? '').split(',');
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? '']));
  });
}

// Derived statistics are valid only for this exact parsed snapshot. No live data.
const derived = new WeakMap<NflverseRow[], Map<string, unknown>>();
export function deriveNflverseRows<T>(rows: NflverseRow[], key: string, calculate: () => T): T {
  let entries = derived.get(rows);
  if (!entries) { entries = new Map(); derived.set(rows, entries); }
  if (entries.has(key)) return entries.get(key) as T;
  const result = calculate();
  if (entries.size >= 32) entries.delete(entries.keys().next().value!);
  entries.set(key, result); return result;
}
