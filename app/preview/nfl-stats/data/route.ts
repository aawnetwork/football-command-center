import { createNflStatsV2Service, respondNflStatsV2 } from '../../../lib/stats-v2/nfl-server';
import { NFL_METRICS } from '../../../lib/stats-v2/nfl-statlines';

// Synthetic design fixtures only: never a fallback in the real NFL data path.
const names = ['Jordan Ellis', 'Marcus Reed', 'Alex Carter', 'Devin Brooks', 'Taylor James', 'Cameron Scott', 'Riley Morgan', 'Casey Ward', 'Jamie Cole', 'Drew Hayes', 'Sam Rivers', 'Morgan Bell'];
const rows = names.flatMap((name, index) => Array.from({ length: 6 }, (_, offset) => {
  const week = offset + 1, position = ['QB', 'RB', 'WR', 'LB'][index % 4];
  const row: Record<string, string> = { ...Object.fromEntries(Object.keys(NFL_METRICS).map(key => [key, ''])), player_id: `00-${String(9000000 + index)}`, player_display_name: name,
    season: '2026', season_type: 'REG', position, week: String(week), team: 'KC', opponent_team: 'DEN', game_id: `2026_${String(week).padStart(2, '0')}_KC_DEN` };
  const set = (values: Record<string, number>) => { for (const [key, value] of Object.entries(values)) row[key] = String(value); };
  if (position === 'QB') set({ completions: 18 + index, attempts: 28 + index, passing_yards: 230 + index * 11 + week * 7, passing_tds: 2, passing_interceptions: 0, sacks_suffered: 2, sack_yards_lost: 12, passing_first_downs: 12, passing_air_yards: 180, passing_yards_after_catch: 90 });
  if (position === 'RB') set({ carries: 14 + index, rushing_yards: 65 + index * 5 + week, rushing_tds: 1, rushing_first_downs: 6, rushing_fumbles_lost: 0 });
  if (position === 'WR') set({ receptions: 5 + index, targets: 8 + index, receiving_yards: 72 + index * 6 + week, receiving_tds: 1, receiving_first_downs: 5, receiving_yards_after_catch: 35, receiving_air_yards: 60, receiving_fumbles_lost: 0 });
  if (position === 'LB') set({ def_tackles_solo: 5 + index, def_tackle_assists: 3, def_sacks: 0.5, def_tackles_for_loss: 1, def_interceptions: 0, def_pass_defended: 1, def_fumbles_forced: 0, def_qb_hits: 2, def_tds: 0, fumble_recovery_opp: 0 });
  return row;
}));
const service = createNflStatsV2Service({ snapshot: async kind => ({ ok: true, status: 200, firstObservedAt: Date.now(), observedAt: Date.now(), expiresAt: Date.now() + 300_000, rows: kind === 'player' ? rows : [] }) });
const fixtureLoad: typeof service = async selection => {
  const result = await service({ ...selection, live: false });
  return { ...result, model: { ...result.model, lines: result.model.lines.map((line, index) => ({ ...line, playingNow: index % 3 === 0 })) } };
};
export async function GET(request: Request) {
  if (process.env.AAW_STATS_V2_LOCAL_PREVIEW !== '1' || process.env.VERCEL) return new Response(null, { status: 404 });
  return respondNflStatsV2(request, fixtureLoad);
}
