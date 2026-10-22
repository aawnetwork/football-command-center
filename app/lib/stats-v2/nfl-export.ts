import { NFL_METRICS, NFL_RATES, NFL_DERIVED, nflTeamCode, type Category, type Foundation, type MetricKey } from './nfl-statlines';

export type NflRankingSelection = {
  category: Category; statistic: MetricKey; limit?: number; direction?: 'asc' | 'desc'; team?: string;
};
/** Validate before any server source work, including category/metric pairing. */
export function validateNflRankingSelection(selection: NflRankingSelection) {
  const definition = NFL_METRICS[selection.statistic as keyof typeof NFL_METRICS] ?? NFL_RATES[selection.statistic as keyof typeof NFL_RATES] ?? NFL_DERIVED[selection.statistic as keyof typeof NFL_DERIVED];
  const limit = selection.limit ?? 10;
  const direction = selection.direction ?? 'desc';
  const team = selection.team === undefined ? null : nflTeamCode(selection.team);
  const allowed = selection.category === 'QB' ? ['completions', 'attempts', 'sacks_suffered', 'sack_yards_lost', 'completion_pct', ...Object.keys(NFL_METRICS).filter(k => k.startsWith('passing_')), 'passing_yards_per_attempt']
    : selection.category === 'Rush' ? ['carries', ...Object.keys(NFL_METRICS).filter(k => k.startsWith('rushing_')), 'rushing_yards_per_carry']
    : selection.category === 'Rec' ? ['targets', 'receptions', ...Object.keys(NFL_METRICS).filter(k => k.startsWith('receiving_')), 'catch_pct', 'receiving_yards_per_reception']
    : selection.category === 'Def' ? [...Object.keys(NFL_METRICS).filter(k => k.startsWith('def_')), 'fumble_recovery_opp', 'tackles'] : [];
  if (!definition || !allowed.includes(selection.statistic) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !['asc', 'desc'].includes(direction) || (selection.team !== undefined && !team)) throw Error('Unverified ranking selection or incomplete input');
  return { definition, limit, direction, team };
}

/** Explicit presentation projection. Never scrape columns or expanded cards.
 * No participation cutoffs: rate opportunities remain in the foundation. */
export function projectNflRanking(snapshot: Foundation, selection: NflRankingSelection, logos: Readonly<Record<string, string>> = {}) {
  if (!snapshot.complete) throw Error('Incomplete ranking input');
  const { definition, limit, direction, team } = validateNflRankingSelection(selection);
  const eligible = snapshot.lines.flatMap(line => {
    const stint = team ? line.stints.find(stint => stint.team === team) : null;
    if (team && !stint) return [];
    if (!(stint?.categories ?? line.categories).includes(selection.category)) return [];
    const cell = (stint?.metrics ?? line.metrics)[selection.statistic];
    if (cell.state !== 'value') return [];
    return [{ line, teams: stint ? [stint.team] : line.teams, value: cell.value }];
  }).sort((a, b) => (direction === 'asc' ? a.value - b.value : b.value - a.value) || a.line.id.localeCompare(b.line.id));
  return {
    league: 'NFL' as const, accent: '#FFC720', period: { ...snapshot.period }, coverage: snapshot.coverage,
    scope: team ? { kind: 'team-contributions' as const, team } : { kind: 'whole-period' as const },
    statistic: { key: selection.statistic, label: definition[0], unit: definition[1], direction },
    checkedAt: snapshot.checkedAt,
    rows: eligible.slice(0, limit).map((row, index) => ({
      rank: index > 0 && eligible[index - 1].value === row.value ? eligible.findIndex(item => item.value === row.value) + 1 : index + 1,
      player: { id: row.line.identity.key, name: row.line.name },
      teams: row.teams.map(code => ({ id: `nfl:team:${code}`, code, logo: logos[code] ?? null })),
      value: row.value,
    })),
  };
}
