import { withCfbPlayerHistory, cfbHistoryTeams } from './cfb-player-history';
import type { CardMetricKey } from './cfb-card-metrics';
import reviewed from './cfb-week7-reviewed.json';
import type { Category, MetricKey, Period } from './nfl-statlines';

type ReviewedRow = [string, string, string, string, string, Category[], (number | null)[], number[], string];
// Bundled server-side display projection only: no private files or operational DB access.
const rows = reviewed.rows as ReviewedRow[];
const cardValuesById = new Map(rows.map((row,index) => [row[0], reviewed.cardMetricValues[index]]));
function reviewedCardMetrics(id: string) {
  const values = cardValuesById.get(id);
  return Object.fromEntries(reviewed.cardMetricColumns.map((key,index) => [key as CardMetricKey, {state:values?.[index] == null ? 'missing' : 'value',value:values?.[index] ?? null}]));
}

const fields: Record<Category, MetricKey[]> = {
  QB: ['passing_yards', 'completions', 'attempts', 'completion_pct', 'passing_tds', 'passing_interceptions', 'passing_yards_per_attempt'],
  Rush: ['rushing_yards', 'carries', 'rushing_yards_per_carry', 'rushing_tds'],
  Rec: ['receiving_yards', 'receptions', 'receiving_yards_per_reception', 'receiving_tds'],
  Def: ['tackles', 'def_tackles_solo', 'def_sacks', 'def_tackles_for_loss', 'def_interceptions', 'def_pass_defended'],
};
const attribution = 'ESPN-based Week 7 statistics · 62 completed games';
const headers = { 'Cache-Control': 'no-store' };
const teams = reviewed.teams as Record<string, { name: string; logo: string | null; conferenceId: string; conferenceName: string | null }>;
const conferences = Object.entries(reviewed.conferences).map(([id, name]) => ({ id, name }));

/** Only the explicit completed Week 7 preview uses this reviewed snapshot.
 * Other periods continue through the existing source path. */
export function reviewedCfbWeek7(params: URLSearchParams, week: number | null, view: string, category: Category, conference: string | null): Response | null {
  if (week !== 7 || (view !== 'details' && (view !== 'leaders' || !Object.hasOwn(fields, category)))) return null;
  if (conference && !conferences.some(c => c.id === conference)) return Response.json({ error: 'Invalid conference' }, { status: 400, headers });
  const snapshot = `cfb-reviewed-week7-${reviewed.reviewSha256}:${conference ?? 'all'}`;
  const selected = rows.filter(row => !conference || teams[row[2]].conferenceId === conference);
  if (view === 'details') {
    // Let existing live snapshots retain their own details handling.
    if (!params.get('snapshot')?.startsWith('cfb-reviewed-week7-')) return null;
    const ids = params.get('players')?.split(',') ?? [];
    if (params.get('snapshot') !== snapshot || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !selected.some(row => row[0] === id))) return Response.json({ error: 'Invalid player selection' }, { status: 400, headers });
    const lines = selected.filter(row => ids.includes(row[0])).map(row => {
      const [id, name, team, opponent, gameId, categories, values, na, observedAt] = row;
      const metrics = Object.fromEntries(reviewed.columns.map((key, index) => [key, { state: na.includes(index) ? 'not-applicable' : values[index] === null ? 'missing' : 'value', value: values[index] }]));
      Object.assign(metrics, reviewedCardMetrics(id));
      metrics.targets = { state: 'unavailable', value: null };
      metrics.catch_pct = { state: 'unavailable', value: null };
      metrics.def_tackle_assists = { state: 'unavailable', value: null };
      metrics.def_fumbles_forced = { state: 'unavailable', value: null };
      return withCfbPlayerHistory({ id, identity: { key: id, espnId: id.split(':').at(-1), ncaaId: null }, name, teams: [team], categories, metrics, playingNow: false,
        games: [{ gameId, week: 7, team, opponent, metrics, observedAt }], stints: [{ team, categories, metrics, conferenceId: teams[team].conferenceId }] }, reviewed.period as Period);
    });
    return Response.json({ snapshot, observationAt: reviewed.observedThrough, period: reviewed.period, lines }, { headers });
  }
  if (params.has('snapshot') || params.has('players')) return Response.json({ error: 'Invalid category' }, { status: 400, headers });
  const columns = fields[category];
  const candidates = selected.filter(row => row[5].includes(category));
  return Response.json({ version: 1, snapshot, observationAt: reviewed.observedThrough, period: reviewed.period,
    complete: false, scope: 'reviewed-espn-week', sourceAttribution: attribution, coveredGames: 62,
    confidence: Object.fromEntries(columns.map(key => {
      const supportedPlayers = candidates.filter(row => row[6][reviewed.columns.indexOf(key)] !== null).length;
      return [key, category === 'Def' ? { status: 'reported-values', supportedPlayers, candidatePlayers: candidates.length, missingPlayers: candidates.length - supportedPlayers } : { status: 'reviewed' }];
    })),
    ...(category === 'Def' ? { rankScope: 'reported-values' } : {}),
    independentNationalCertification: false, observationRange: { from: reviewed.observedFrom, through: reviewed.observedThrough },
    columns, displayColumns: columns, teams: {...cfbHistoryTeams,...teams}, conferences, logos: Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.logo])),
    coverage: { warnings: [] }, sources: { live: { status: 'completed-snapshot' } },
    lines: candidates.map(row => ({ id: row[0], name: row[1], teams: [row[2]], playingNow: false,
      values: columns.map(key => row[6][reviewed.columns.indexOf(key)]), notApplicable: columns.filter(key => row[7].includes(reviewed.columns.indexOf(key))) })) }, { headers });
}

/** Preserve the existing caller contract while supporting the complete retained 2026 history. */
export function withReviewedCfbHistory<T extends { id:string; games:{gameId:string;week:number;team:string;opponent:string;metrics:unknown;kickoff?:string;observedAt?:string}[] }>(line:T,cutoff:number,period:Pick<Period,'season'|'phase'>={season:2026,phase:'REG'}):T {
  return withCfbPlayerHistory(line,{...period,week:cutoff});
}

export const reviewedCfbHistoryTeams = {...cfbHistoryTeams,...teams};
