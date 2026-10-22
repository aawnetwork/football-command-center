import type { NflLiveSource, EspnTeam } from './stats-v2/nfl-source-types';

export type WeeklyTeamRow = Record<string, string | number | null> & { team: string };
const fields = {
  'total-offense': 'total_yards', 'passing-offense': 'passing_yards', 'rushing-offense': 'rushing_yards',
  'total-defense': 'def_total_yards', 'passing-defense': 'def_passing_yards', 'rushing-defense': 'def_rushing_yards',
  'scoring-offense': 'points', 'scoring-defense': 'def_points', sacks: 'def_sacks',
} as const;
export function teamNumber(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) return null;
  const n = Number(typeof value === 'string' ? value.trim().replaceAll(',', '') : value);
  return Number.isFinite(n) ? n : null;
}
export function weeklyTeamValue(row: Record<string, unknown>, category: string): number | null {
  if (row.team_stat_source !== 'espn-team-boxscore' || !Object.hasOwn(fields, category)) return null;
  return teamNumber(row[fields[category as keyof typeof fields]]);
}
export const weeklyTeamCode = (code: string) => code === 'WSH' ? 'WAS' : code === 'LA' ? 'LAR' : code;
export function unavailableTeam(team: string): WeeklyTeamRow {
  return { team: weeklyTeamCode(team), team_stat_source: 'unavailable', ...Object.fromEntries(Object.values(fields).map(key => [key, null])) };
}
type Table = { team?: EspnTeam; statistics?: { name?: string; displayValue?: unknown }[] };
/** Explicit ESPN team fields only. No player sums or inferred sack adjustments. */
export function projectWeeklyTeams(source: NflLiveSource | null, week: number, now = Date.now()): WeeklyTeamRow[] {
  if (!source || !Number.isFinite(source.observedAt) || source.scoreboard.season?.year !== 2026 || source.scoreboard.season.type !== 2 || source.scoreboard.week?.number !== week || source.observedAt > now || now-source.observedAt > 60_000) return [];
  const events = source.scoreboard.events ?? [], seenGames = new Set<string>(), seenTeams = new Set<string>();
  const duplicateGames = new Set(events.filter((event, index) => events.findIndex(other => other.id === event.id) !== index).map(event => event.id));
  const teamCounts = new Map<string, number>();
  for (const event of events) for (const p of event.competitions?.[0]?.competitors ?? []) if(p.team?.id) teamCounts.set(p.team.id,(teamCounts.get(p.team.id)??0)+1);
  const rows: WeeklyTeamRow[] = [];
  for (const [index, event] of events.entries()) {
    const id=event.id, competition=event.competitions?.[0], participants=competition?.competitors ?? [];
    if (!id || duplicateGames.has(id) || seenGames.has(id) || competition?.id!==id || event.season?.year!==2026 || event.season.type!==2 || participants.length!==2 || new Set(participants.map(p=>p.team?.id)).size!==2) continue;
    seenGames.add(id);
    const summary = source.summaries[index] as (NonNullable<NflLiveSource['summaries'][number]> & {header?:{season?:{year?:number;type?:number};week?:number};boxscore?:{teams?:Table[]}}) | null;
    const actual=summary?.header?.competitions?.[0], status=competition.status?.type;
    const valid = summary?.header?.id===id && summary.header.season?.year===2026 && summary.header.season.type===2 && summary.header.week===week && actual?.id===id && ['in','post'].includes(status?.state??'') && status?.state===actual.status?.type?.state && status?.completed===actual.status?.type?.completed && (status?.state==='post'?status.completed===true:status?.completed!==true) && Number.isFinite(Date.parse(event.date??'')) && Date.parse(event.date!)<=now && actual.competitors?.length===2 && participants.every(p=>teamCounts.get(p.team?.id??'')===1 && /^[1-9]\d*$/.test(p.team?.id??'') && actual.competitors?.filter(other=>other.team?.id===p.team?.id && other.homeAway===p.homeAway).length===1);
    for (const participant of participants) {
      const code=participant.team?.abbreviation, teamId=participant.team?.id;
      if (!code || !teamId || seenTeams.has(teamId)) continue;
      seenTeams.add(teamId);
      const row=unavailableTeam(code); rows.push(row);
      if (!valid) continue;
      const tables=summary?.boxscore?.teams??[];
      if(tables.length!==2 || new Set(tables.map(t=>t.team?.id)).size!==2 || !tables.every(t=>participants.some(p=>p.team?.id===t.team?.id))) continue;
      const own=tables.find(t=>t.team?.id===teamId)!, opponent=tables.find(t=>t.team?.id!==teamId)!;
      const metric=(table:Table,key:string)=>{const entries=table.statistics?.filter(s=>s.name===key)??[];return entries.length===1?teamNumber(entries[0].displayValue):null;};
      const total=(table:Table)=>{const all=metric(table,'totalYards'),pass=metric(table,'netPassingYards'),rush=metric(table,'rushingYards');return all!==null && (pass===null || rush===null || all===pass+rush)?all:null;};
      row.team_stat_source='espn-team-boxscore';row.game_id=id;row.team_id='espn:nfl:team:'+teamId;row.observed_at=new Date(source.observedAt).toISOString();
      row.total_yards=total(own);row.passing_yards=metric(own,'netPassingYards');row.rushing_yards=metric(own,'rushingYards');
      row.def_total_yards=total(opponent);row.def_passing_yards=metric(opponent,'netPassingYards');row.def_rushing_yards=metric(opponent,'rushingYards');
      const groups=summary?.boxscore?.players?.filter(p=>p.team?.id===teamId).flatMap(p=>p.statistics?.filter(g=>g.name==='defensive')??[])??[];
      const defense=groups.length===1?groups[0] as typeof groups[number]&{totals?:unknown[]}:null;
      const sackIndex=defense?.labels?.indexOf('SACKS')??-1;
      const sacks=sackIndex>=0&&defense?.labels?.filter(label=>label==='SACKS').length===1?teamNumber(defense.totals?.[sackIndex]):null;
      row.def_sacks=sacks!==null&&sacks>=0?sacks:null;
      row.points=teamNumber(actual?.competitors?.find(p=>p.team?.id===teamId)?.score);
      row.def_points=teamNumber(actual?.competitors?.find(p=>p.team?.id!==teamId)?.score);
    }
  }
  return rows;
}
