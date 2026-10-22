import type { CardMetricKey, CardMetrics } from '../../lib/stats-v2/cfb-card-metrics';
import type { Category, MetricKey } from '../../lib/stats-v2/nfl-statlines';

const fields: Record<Category, MetricKey[]> = {
  QB: ['completions', 'attempts', 'passing_yards', 'completion_pct', 'passing_tds', 'passing_interceptions', 'passing_yards_per_attempt', 'sacks_suffered', 'sack_yards_lost', 'passing_first_downs', 'passing_air_yards', 'passing_yards_after_catch'],
  Rush: ['carries', 'rushing_yards', 'rushing_yards_per_carry', 'rushing_tds', 'rushing_first_downs', 'rushing_fumbles_lost'],
  Rec: ['receptions', 'targets', 'receiving_yards', 'catch_pct', 'receiving_yards_per_reception', 'receiving_tds', 'receiving_first_downs', 'receiving_air_yards', 'receiving_yards_after_catch', 'receiving_fumbles_lost'],
  Def: ['tackles', 'def_tackles_solo', 'def_tackle_assists', 'def_sacks', 'def_tackles_for_loss', 'def_interceptions', 'def_pass_defended', 'def_fumbles_forced', 'def_qb_hits', 'def_tds', 'fumble_recovery_opp'],
};

/** Presentation only: missing/NA cells stay in the data model, never become zeros. */
export function playerCardMetrics(category: Category, metrics: CardMetrics, league: 'NFL' | 'CFB' = 'NFL'): CardMetricKey[] {
  const rushing = category === 'QB' && ['carries', 'rushing_yards', 'rushing_tds'].some(key => {
    const cell = metrics[key as MetricKey];
    return cell?.state === 'value' && Number.isFinite(cell.value) && cell.value !== 0;
  });
  const cfb: CardMetricKey[] = league !== 'CFB' ? [] : category === 'Rush' || category === 'QB' ? ['rushing_long'] : category === 'Rec' ? ['receiving_long'] : ['def_qb_hurries'];
  return [...fields[category], ...(rushing ? fields.Rush : []), ...cfb].filter(key => {
    const cell = metrics[key];
    return cell?.state === 'value' && Number.isFinite(cell.value);
  });
}
