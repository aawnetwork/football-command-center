import history from './nfl-team-history-2026.json';
import type { WeeklyTeamRow } from './nfl-weekly-team-stats';
import { teamNumber } from './nfl-weekly-team-stats';

/** Final team boxscores only; no player sums, inferred sack losses or live data. */
export function aggregateRetainedTeams(weeks: {week:number;games:number;rows:WeeklyTeamRow[]}[], throughWeek:number) {
  const selected=weeks.filter(w=>w.week<=throughWeek);
  if(selected.length!==throughWeek||new Set(selected.map(w=>w.week)).size!==throughWeek||selected.some(w=>w.rows.length!==w.games*2))throw Error('Incomplete retained team weeks');
  const grouped=new Map<string,WeeklyTeamRow[]>(),games=new Set<string>();
  for(const week of selected)for(const row of week.rows){
    const key=`${row.team}:${row.game_id}`;
    if(row.team_stat_source!=='espn-team-boxscore'||!row.game_id||games.has(key))throw Error('Conflicting retained team game');
    games.add(key);const rows=grouped.get(row.team)??[];rows.push(row);grouped.set(row.team,rows);
  }
  const fields=['total_yards','passing_yards','rushing_yards','def_total_yards','def_passing_yards','def_rushing_yards','points','def_points','def_sacks'];
  return [...grouped].map(([team,rows])=>({team,season:'2026',season_type:'REG',aaw_season_verified:'1',team_stat_source:'espn-team-boxscore-season',games_played:rows.length,
    ...Object.fromEntries(fields.map(field=>{const values=rows.map(r=>teamNumber(r[field]));return [field,values.every(n=>n!==null)?values.reduce<number>((sum,n)=>sum+n!,0):null];}))}));
}
export function retainedNflTeams(mode:'weekly'|'season',week:number|null) {
  const availableWeeks=history.weeks.map(w=>w.week);
  const common={season:2026,mode,availableWeeks,passingBasis:'net',snapshot:true,throughWeek:history.throughWeek};
  if(mode==='season')return {...common,week:null,stats:aggregateRetainedTeams(history.weeks,history.throughWeek),
    coverage:`ESPN season totals through Week ${history.throughWeek} (${history.weeks.reduce((n,w)=>n+w.games,0)} final games). Passing yards are net of sacks. Later games are not included.`};
  const selected=history.weeks.find(w=>w.week===week);
  return selected?{...common,week:selected.week,throughWeek:selected.week,stats:selected.rows,
    coverage:`ESPN final team boxscores · ${selected.games} games. Historical snapshot; later statistical corrections are not automatically included.`}:null;
}
