import { createNflIdentityIndex, type NflIdentity, type SourceRow } from './nfl-identity';

export type Metric = { state: 'value'; value: number } | { state: 'missing' | 'not-applicable'; value: null };
export const NFL_METRICS = {
  completions: ['Completions', 'count'], attempts: ['Pass attempts', 'count'],
  passing_yards: ['Passing yards', 'yards'], passing_tds: ['Passing TD', 'count'],
  passing_interceptions: ['Passing INT', 'count'], sacks_suffered: ['Sacks suffered', 'count'],
  sack_yards_lost: ['Sack yards lost', 'yards'], passing_first_downs: ['Passing first downs', 'count'],
  passing_air_yards: ['Passing air yards', 'yards'], passing_yards_after_catch: ['Passing YAC', 'yards'],
  carries: ['Carries', 'count'], rushing_yards: ['Rushing yards', 'yards'], rushing_tds: ['Rushing TD', 'count'],
  rushing_first_downs: ['Rushing first downs', 'count'], rushing_fumbles_lost: ['Rushing fumbles lost', 'count'],
  receptions: ['Receptions', 'count'], targets: ['Targets', 'count'],
  receiving_yards: ['Receiving yards', 'yards'], receiving_tds: ['Receiving TD', 'count'],
  receiving_first_downs: ['Receiving first downs', 'count'], receiving_air_yards: ['Receiving air yards', 'yards'],
  receiving_yards_after_catch: ['Receiving YAC', 'yards'], receiving_fumbles_lost: ['Receiving fumbles lost', 'count'],
  def_tackles_solo: ['Solo tackles', 'count'], def_tackle_assists: ['Tackle assists', 'count'],
  def_sacks: ['Sacks', 'count'], def_interceptions: ['Defensive INT', 'count'],
  def_tackles_for_loss: ['Tackles for loss', 'count'], def_qb_hits: ['QB hits', 'count'],
  def_pass_defended: ['Passes defended', 'count'], def_fumbles_forced: ['Forced fumbles', 'count'],
  def_tds: ['Defensive TD', 'count'], fumble_recovery_opp: ['Opponent fumble recoveries', 'count'],
} as const;
export const NFL_RATES = {
  completion_pct: ['Completion percentage', '%', 'completions', 'attempts', 100],
  passing_yards_per_attempt: ['Passing yards per attempt', 'yards/attempt', 'passing_yards', 'attempts', 1],
  rushing_yards_per_carry: ['Rushing yards per carry', 'yards/carry', 'rushing_yards', 'carries', 1],
  receiving_yards_per_reception: ['Receiving yards per reception', 'yards/reception', 'receiving_yards', 'receptions', 1],
  catch_pct: ['Catch percentage', '%', 'receptions', 'targets', 100],
} as const;
export const NFL_DERIVED = { tackles: ['Tackles', 'count'] } as const;
export type CountKey = keyof typeof NFL_METRICS;
export type MetricKey = CountKey | keyof typeof NFL_RATES | keyof typeof NFL_DERIVED;
export type Metrics = Record<MetricKey, Metric>;
export type Category = 'QB' | 'Rush' | 'Rec' | 'Def';
export type Period = { season: number; phase: 'REG' | 'POST'; week: number | null };
export type GameLine = {
  identity: NflIdentity; name: string; team: string; opponent: string;
  gameId: string; week: number; position: string | null; metrics: Metrics;
};
export type PlayerLine = {
  id: string; identity: NflIdentity; name: string; teams: string[];
  categories: Category[]; metrics: Metrics;
  stints: { team: string; categories: Category[]; metrics: Metrics }[]; games: GameLine[];
};
export type Foundation = {
  period: Period; checkedAt: string; source: 'nflverse-published' | 'nflverse-with-espn';
  coverage: 'supplied-records-only';
  complete: boolean; issues: string[]; lines: PlayerLine[];
};
const keys = Object.keys(NFL_METRICS) as CountKey[];
const missing = (): Metric => ({ state: 'missing', value: null });
const value = (n: number): Metric => ({ state: 'value', value: n });
const codes = new Set('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LV LAC LAR MIA MIN NE NO NYG NYJ PHI PIT SF SEA TB TEN WAS'.split(' '));
export function nflTeamCode(raw?: string): string | null {
  const code = raw === 'LA' ? 'LAR' : raw === 'WSH' ? 'WAS' : raw;
  return code && codes.has(code) ? code : null;
}
function numeric(raw: string | undefined, key: CountKey): Metric {
  if (!raw || !/^-?\d+(?:\.\d+)?$/.test(raw)) return missing();
  const n = Number(raw);
  if (!Number.isFinite(n) || (!key.endsWith('yards') && !key.endsWith('yards_lost') && n < 0)) return missing();
  if (key === 'def_sacks' || key === 'def_tackles_for_loss') {
    if (!Number.isSafeInteger(n * 2)) return missing();
  } else if (!Number.isSafeInteger(n)) return missing();
  return value(n);
}
function rates(counts: Record<CountKey, Metric>): Metrics {
  const result = { ...counts } as Metrics;
  const solo = counts.def_tackles_solo, assists = counts.def_tackle_assists;
  result.tackles = solo.state === 'value' && assists.state === 'value' && Number.isSafeInteger(solo.value + assists.value)
    ? value(solo.value + assists.value) : missing();
  for (const [key, definition] of Object.entries(NFL_RATES)) {
    const [, , numerator, denominator, scale] = definition;
    const a = counts[numerator], b = counts[denominator];
    result[key as keyof typeof NFL_RATES] = a.state !== 'value' || b.state !== 'value' ||
      ((key === 'completion_pct' || key === 'catch_pct') && a.value > b.value) ? missing()
      : b.value === 0 ? { state: 'not-applicable', value: null } : value(a.value / b.value * scale);
  }
  return result;
}
function totals(games: readonly GameLine[]): Metrics {
  const result = rates(Object.fromEntries(keys.map(key => {
    const cells = games.map(game => game.metrics[key]);
    const sum = cells.reduce((n, cell) => n + (cell.value ?? 0), 0);
    return [key, cells.some(cell => cell.state !== 'value') || !Number.isSafeInteger(sum * 2) ? missing() : value(sum)];
  })) as Record<CountKey, Metric>);
  const tackles = games.map(game => game.metrics.tackles);
  const total = tackles.reduce((sum, cell) => sum + (cell.value ?? 0), 0);
  result.tackles = tackles.every(cell => cell.state === 'value') && Number.isSafeInteger(total) ? value(total) : missing();
  return result;
}
const positive = (games: readonly GameLine[], fields: readonly CountKey[]) => games.some(game => fields.some(key => (game.metrics[key].value ?? 0) > 0));
function eligibility(games: readonly GameLine[]): Category[] {
  const categories: Category[] = [];
  if (games.every(game => game.position === 'QB')) categories.push('QB');
  if (positive(games, ['carries', 'rushing_yards', 'rushing_tds'])) categories.push('Rush');
  if (positive(games, ['targets', 'receptions', 'receiving_yards', 'receiving_tds'])) categories.push('Rec');
  // Opponent recoveries alone may include special teams, not defensive activity.
  if (positive(games, keys.filter(key => key.startsWith('def_'))) || games.some(game => (game.metrics.tackles.value ?? 0) > 0)) categories.push('Def');
  return categories;
}

/** Pure projection: callers supply normalized per-game facts. Live facts require
 * explicit player/team/game reconciliation before entering this projection. No fetches, persistent cache, qualification thresholds or writes.
 * Completeness refers to accepted input, not certified upstream season coverage. */
export function buildNflStatlines(rows: readonly SourceRow[], period: Period, checkedAt: string, rosters: readonly SourceRow[] = []): Foundation {
  if (period.season !== 2026 || !['REG', 'POST'].includes(period.phase) ||
      (period.week !== null && (!Number.isSafeInteger(period.week) || period.week < 1 || period.week > 22)) ||
      !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(checkedAt) || !Number.isFinite(Date.parse(checkedAt))) throw Error('Unverified NFL period or observation time');
  const identities = createNflIdentityIndex(rosters, period.season);
  const positions = new Map<string, Set<string>>();
  for (const row of rosters) {
    if (row.season !== String(period.season) || row.game_type !== period.phase || !row.position) continue;
    const team = nflTeamCode(row.team);
    const key = `${row.gsis_id}:${row.week}:${team}`;
    if (!positions.has(key)) positions.set(key, new Set());
    positions.get(key)!.add(row.position);
  }
  const facts = new Map<string, { signature: string; game: GameLine }>();
  const conflicts = new Set<string>(), issues: string[] = [];
  for (const row of rows) {
    if (row.season !== String(period.season) || row.season_type !== period.phase || (period.week !== null && row.week !== String(period.week))) continue;
    const contextOnly = !row.player_id && !row.player_display_name && !row.player_name && !row.position &&
      Object.keys(NFL_METRICS).every(key => row[key] === undefined || row[key] === '' || /^0(?:\.0+)?$/.test(row[key]!)) &&
      Object.entries(row).every(([key, raw]) => !raw || ['season', 'season_type', 'week', 'game_id', 'team', 'opponent_team', 'penalties', 'penalty_yards', 'def_safeties'].includes(key) || /^0(?:\.0+)?$/.test(raw)) &&
      !row.reported_tackles && ['penalties', 'penalty_yards', 'def_safeties'].some(key => /^(?:[1-9]\d*)(?:\.0+)?$/.test(row[key] ?? ''));
    const id = identities.resolve('gsis', row.player_id ?? '');
    const team = nflTeamCode(row.team), opponent = nflTeamCode(row.opponent_team);
    const week = Number(row.week);
    const game = row.game_id?.match(/^(\d{4})_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/);
    const participants = game ? [nflTeamCode(game[3]), nflTeamCode(game[4])] : [];
    const validGame = Boolean(team && opponent && team !== opponent && game && Number(game[1]) === period.season && Number(game[2]) === week && Number.isSafeInteger(week) && week >= 1 && week <= 22 && participants.includes(team) && participants.includes(opponent));
    if (contextOnly && validGame) continue;
    if (!id || !team || !opponent || team === opponent || !game || Number(game[1]) !== period.season || Number(game[2]) !== week ||
        !Number.isSafeInteger(week) || week < 1 || week > 22 || !participants.includes(team) || !participants.includes(opponent)) {
      issues.push('Rejected invalid/conflicting player, team or game identity'); continue;
    }
    const rosterPositions = positions.get(`${id.gsisId}:${row.week}:${team}`);
    const supplied = new Set([row.position, ...(rosterPositions ?? [])].filter((p): p is string => Boolean(p)));
    const position = supplied.size === 1 ? [...supplied][0] : null;
    const metrics = rates(Object.fromEntries(keys.map(key => [key, numeric(row[key], key)])) as Record<CountKey, Metric>);
    // A verified ESPN TOT can remain known even when its components are absent.
    const reportedTackles = numeric(row.reported_tackles, 'def_tackles_solo');
    if (metrics.tackles.state !== 'value' && reportedTackles.state === 'value') metrics.tackles = reportedTackles;
    const fact: GameLine = { identity: id, name: row.player_display_name || row.player_name || id.key,
      team, opponent, gameId: `nflverse:game:${row.game_id}`, week, position, metrics };
    const key = `${id.key}:${fact.gameId}`;
    const signature = JSON.stringify(fact);
    if (facts.has(key) && facts.get(key)!.signature !== signature) conflicts.add(key);
    else facts.set(key, { signature, game: fact });
  }
  for (const key of conflicts) { facts.delete(key); issues.push(`Conflicting duplicate ${key}`); }
  const players = new Map<string, GameLine[]>();
  for (const { game } of facts.values()) {
    if (!players.has(game.identity.key)) players.set(game.identity.key, []);
    players.get(game.identity.key)!.push(game);
  }
  const lines = [...players].sort(([a], [b]) => a.localeCompare(b)).map(([key, games]): PlayerLine => {
    games.sort((a, b) => a.week - b.week || a.gameId.localeCompare(b.gameId));
    const teams = [...new Set(games.map(game => game.team))].sort();
    return { id: `nfl:${period.season}:${period.phase}:${key}`, identity: games[0].identity,
      name: games.at(-1)!.name, teams, categories: eligibility(games), metrics: totals(games), games,
      stints: teams.map(team => {
        const stint = games.filter(game => game.team === team);
        return { team, categories: eligibility(stint), metrics: totals(stint) };
      }) };
  });
  return { period: { ...period }, checkedAt, source: 'nflverse-published', coverage: 'supplied-records-only', complete: issues.length === 0, issues, lines };
}
