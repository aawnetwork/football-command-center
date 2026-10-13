// Pure report contract: no participant-scoped fields are returned or accepted.
export type ReportFilters = { league: 'NFL' | 'CFB' | null; season: number | null; game: string | null; view: 'current' | 'phases'; phase: 'pregame' | 'live' | 'postgame' | null; offset: number; sort: 'popular' | 'alphabetical' };
export function reportFilters(params: URLSearchParams): ReportFilters {
  const allowed = ['league','season','game','view','phase','offset','sort'];
  for (const key of params.keys()) if (!allowed.includes(key) || params.getAll(key).length!==1) throw new Error('Invalid report filters.');
  const league=params.get('league') || null, season=params.get('season') || null, game=params.get('game') || null;
  const view=params.get('view') || 'current', phase=params.get('phase') || null, offset=params.get('offset') || '0', sort=params.get('sort') || 'popular';
  if ((league!==null && !['NFL','CFB'].includes(league)) || (season!==null && (!/^20\d{2}$|^2100$/.test(season))) ||
    !['current','phases'].includes(view) || (phase!==null && !['pregame','live','postgame'].includes(phase)) ||
    (view==='current' && phase!==null) || !/^\d{1,5}$/.test(offset) || Number(offset)>10000 ||
    !['popular','alphabetical'].includes(sort) || (game!==null && (!/^(NFL|CFB):(20\d{2}|2100):[1-9]\d{0,11}$/.test(game) ||
    (league!==null && game.split(':')[0]!==league) || (season!==null && game.split(':')[1]!==season)))) throw new Error('Invalid report filters.');
  return { league, season:season===null?null:Number(season),game,view,phase,offset:Number(offset),sort } as ReportFilters;
}
export const reportTiers = ['S','A','B','C','D'] as const;
export type Sample = { count:number; tiers:Record<typeof reportTiers[number],number> };
export function sampleLabel(count:number) { return count<25 ? 'Insufficient sample' : '25+ participating browsers'; }
export function percentage(count:number,denominator:number) { return denominator>0 ? `${(100*count/denominator).toFixed(1)}%` : '—'; }
export type ReportTeam = { league:'NFL'|'CFB';teamId:string;count:number;denominator:number;name?:string;logo?:string|null };
export function sortFavourites(teams:ReportTeam[],sort:ReportFilters['sort']) {
  return [...teams].sort((a,b)=> (sort==='popular' ? b.count-a.count : 0) || (a.name??`Team ${a.teamId}`).localeCompare(b.name??`Team ${b.teamId}`) || a.teamId.localeCompare(b.teamId));
}
export type AudienceReport = {
  overview:{ activeBrowsers:number;currentRatings:number;nflFavourites:number;cfbFavourites:number;games:number;pregame:number;live:number;postgame:number;latestContribution:string|null };
  favourites:ReportTeam[];gameTotal:number;
  games:{league:'NFL'|'CFB';season:number;eventId:string;gameId:string;samples:Partial<Record<'current'|'pregame'|'live'|'postgame',Sample>>;matchup?:string;kickoff?:string;status?:string;metadataCheckedAt?:string}[];
  seasons:{league:string;season:number;endedAt:string|null;expiresAt:string|null}[];
  retention:{status:string;lastSuccessAt:string|null;lastFailureAt:string|null}|null;
};
