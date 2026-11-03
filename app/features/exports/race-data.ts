export type RaceEntry = { id: string; name: string; team: string; logo?: string; teamId?: string; color?: string; value: number };
export type RaceCheckpoint = { week: number; entries: RaceEntry[] };
export type RaceSeries = { league: 'CFB' | 'NFL'; season: number; metric: string; checkpoints: RaceCheckpoint[]; reportedOnly: boolean };
export const RACE_METRICS = {
  passing_yards: { label: 'Passing yards', category: 'QB' },
  passing_tds: { label: 'Passing touchdowns', category: 'QB' },
  rushing_yards: { label: 'Rushing yards', category: 'Rush' },
  rushing_tds: { label: 'Rushing touchdowns', category: 'Rush' },
  receiving_yards: { label: 'Receiving yards', category: 'Rec' },
  receiving_tds: { label: 'Receiving touchdowns', category: 'Rec' },
} as const;
export type RaceMetric = keyof typeof RACE_METRICS;
export type WeeklyRaceSource = {
  period: { season: number; week: number | null }; columns: string[];
  lines: { id: string; name: string; teams: string[]; values: (number | null)[]; playingNow?: boolean | null }[];
  logos?: Record<string, string>; teams?: Record<string, { name: string; logo: string | null }>;
  confidence?: Record<string, { status: string }>; complete?: boolean;
};

/** Sum observed weekly records by stable player ID. Missing records are never
 * claimed as zero performances: any incomplete source marks the whole output
 * as reported totals. Load from Week 1 even when playback begins later. */
export function buildRaceSeries(sources: WeeklyRaceSource[], league: 'CFB' | 'NFL', metric: RaceMetric, start: number, end: number): RaceSeries {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > (league === 'NFL' ? 18 : 16) || sources.length !== end) throw Error('Load every week from Week 1 through the selected end week.');
  const totals = new Map<string, RaceEntry>();
  const checkpoints: RaceCheckpoint[] = [];
  const season = sources[0]?.period?.season;
  let reportedOnly = false;
  sources.forEach((source, index) => {
    const week = index + 1;
    if (!season || source.period?.season !== season || source.period.week !== week) throw Error(`The source returned the wrong season or week for Week ${week}.`);
    const column = source.columns?.indexOf(metric) ?? -1;
    if (column < 0 || !Array.isArray(source.lines) || !source.lines.length) throw Error(`Week ${week} has no ${RACE_METRICS[metric].label.toLowerCase()} records.`);
    const status = source.confidence?.[metric]?.status;
    if (!['verified', 'reviewed', 'reported-values'].includes(status ?? '')) throw Error(`Week ${week} has not cleared the Hub's statistical checks for this metric.`);
    if (!source.complete || status !== 'verified') reportedOnly = true;
    const seen = new Set<string>();
    let observed = 0;
    for (const row of source.lines) {
      if (!row.id || !row.name || seen.has(row.id)) throw Error(`Week ${week} contains an invalid or duplicate player identity.`);
      seen.add(row.id);
      if (row.playingNow === true) throw Error(`Week ${week} is still in progress. Choose a completed end week.`);
      const value = row.values[column];
      if (value === null || value === undefined) { reportedOnly = true; continue; }
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Error(`Week ${week} contains an invalid statistic.`);
      const team = row.teams?.at(-1) ?? '';
      const previous = totals.get(row.id);
      totals.set(row.id, { id: row.id, name: row.name, teamId: team, team: source.teams?.[team]?.name ?? team,
        logo: source.teams?.[team]?.logo ?? source.logos?.[team] ?? previous?.logo,
        value: (previous?.value ?? 0) + value });
      observed++;
    }
    if (!observed) throw Error(`Week ${week} contains no reported values for this metric.`);
    if (week >= start) checkpoints.push({ week, entries: [...totals.values()].map(entry => ({ ...entry })) });
  });
  return { league, season, metric: RACE_METRICS[metric].label, checkpoints, reportedOnly };
}

export async function loadRaceSeries(league: 'CFB' | 'NFL', metric: RaceMetric, start: number, end: number, signal: AbortSignal, progress: (week: number) => void): Promise<RaceSeries> {
  const sources: WeeklyRaceSource[] = [];
  for (let week = 1; week <= end; week++) {
    const query = new URLSearchParams({ mode: 'weekly', view: 'leaders', category: RACE_METRICS[metric].category, week: String(week) });
    const statusQuery = new URLSearchParams({ view: 'status', mode: 'weekly', week: String(week) });
    const [response, statusResponse] = await Promise.all([
      fetch(`/api/${league.toLowerCase()}/stats-v2?${query}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]), cache: 'no-store' }),
      fetch(`/api/${league.toLowerCase()}/stats-v2?${statusQuery}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]), cache: 'no-store' }),
    ]);
    const [body, status] = await Promise.all([response.json(), statusResponse.json()]);
    if (!response.ok) throw Error(`Week ${week}: ${body.error ?? 'statistics unavailable'}`);
    if (!statusResponse.ok || status.period?.week !== week || status.period?.season !== body.period?.season || !Array.isArray(status.games) || !status.games.length || status.games.some((game: { completed?: boolean }) => game.completed !== true)) {
      throw Error(`Week ${week} is unfinished or its completion cannot be confirmed. Choose an earlier end week.`);
    }
    sources.push(body);
    progress(week);
  }
  return buildRaceSeries(sources, league, metric, start, end);
}
