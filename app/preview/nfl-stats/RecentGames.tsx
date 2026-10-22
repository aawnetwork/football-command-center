import type { Category, GameLine, MetricKey } from '../../lib/stats-v2/nfl-statlines';

type Column = { label: string; keys: MetricKey[] };
const columns: Record<Category, Column[]> = {
  QB: [{ label: 'C/ATT', keys: ['completions', 'attempts'] }, { label: 'YDS', keys: ['passing_yards'] }, { label: 'TD', keys: ['passing_tds'] }, { label: 'INT', keys: ['passing_interceptions'] }],
  Rush: [{ label: 'CAR', keys: ['carries'] }, { label: 'YDS', keys: ['rushing_yards'] }, { label: 'Y/C', keys: ['rushing_yards_per_carry'] }, { label: 'TD', keys: ['rushing_tds'] }],
  Rec: [{ label: 'REC', keys: ['receptions'] }, { label: 'TGT', keys: ['targets'] }, { label: 'YDS', keys: ['receiving_yards'] }, { label: 'TD', keys: ['receiving_tds'] }],
  Def: [{ label: 'TKL', keys: ['tackles'] }, { label: 'SACK', keys: ['def_sacks'] }, { label: 'TFL', keys: ['def_tackles_for_loss'] }, { label: 'INT', keys: ['def_interceptions'] }],
};

export function RecentGames({ games, category, teamName, className }: {
  games: readonly GameLine[]; category: Category; teamName: (team: string) => string; className: string;
}) {
  // All supplied games belong to the selected season/phase; week is their verified period.
  const recent = [...games].sort((a, b) => b.week - a.week).slice(0, 5);
  if (!recent.length) return <p>Recent games are unavailable.</p>;
  const visible = columns[category].filter(column => recent.some(game => column.keys.some(key => game.metrics[key]?.state === 'value')));
  const cell = (game: GameLine, key: MetricKey) => {
    const metric = game.metrics[key];
    return metric?.state === 'value' ? Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)
      : metric?.state === 'not-applicable' ? 'N/A' : '—';
  };
  return <div className={className} tabIndex={0} role="region" aria-label="Scrollable recent games">
    <table aria-label="Recent Games"><thead><tr><th scope="col">WEEK</th><th scope="col">OPPONENT</th>{visible.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
      <tbody>{recent.map(game => <tr key={game.gameId}><th scope="row">{game.week}</th><td>{teamName(game.opponent)}</td>{visible.map(column => <td key={column.label}>{column.keys.map(key => cell(game, key)).join('/')}</td>)}</tr>)}</tbody>
    </table>
  </div>;
}
