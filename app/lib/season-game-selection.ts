import type { PostRound } from './postseason-model';
export type GamePhase = 'regular' | 'bowls' | 'playoffs';
export const nflPostRounds: PostRound[] = ['wild-card', 'divisional', 'conference', 'super-bowl'];
export const cfbPostRounds: PostRound[] = ['first-round', 'quarterfinal', 'semifinal', 'championship'];
export function seasonGameSelection(params: URLSearchParams | { getAll(key:string):string[] }, league:'NFL'|'CFB', clock: {season:number;phase:number}|null) {
  const one=(key:string)=>{const values=params.getAll(key);return values.length===1?values[0]:null;};
  const explicit=one('gamePhase');
  const phase:GamePhase=explicit==='regular'||explicit==='playoffs'||explicit==='bowls'&&league==='CFB'?explicit:clock?.phase===3?(league==='CFB'?'bowls':'playoffs'):'regular';
  const year=one('postSeason');
  const season=year&&/^\d{4}$/.test(year)&&+year>=2024&&+year<=(clock?.season??2100)?+year:clock?.season??null;
  const chosen=one('postRound');
  const allowed=league==='NFL'?nflPostRounds:cfbPostRounds;
  const round=phase==='playoffs'&&chosen&&(allowed.includes(chosen as PostRound)||chosen==='other')?chosen as PostRound:'all';
  return {phase,season,round};
}
export function seasonGameUrl(href:string, change:{phase?:GamePhase;season?:number;round?:PostRound|'all'}) {
  const url=new URL(href);
  if(change.phase!==undefined){url.searchParams.set('gamePhase',change.phase);url.searchParams.delete('postRound');}
  if(change.season!==undefined){url.searchParams.set('postSeason',String(change.season));url.searchParams.delete('postRound');}
  if(change.round!==undefined){if(change.round==='all')url.searchParams.delete('postRound');else url.searchParams.set('postRound',change.round);}
  return `${url.pathname}${url.search}${url.hash}`;
}
export function postseasonTime(date:string,timeTbd:boolean) {
  if(!Number.isFinite(Date.parse(date)))return 'Date and time TBA';
  return timeTbd?`${new Date(date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'America/New_York'})} · Time TBA`:new Date(date).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
}

export function postseasonDay(date:string,timeTbd:boolean) {
  return Number.isFinite(Date.parse(date))?new Date(date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:timeTbd?'America/New_York':'Europe/London'}):'Date TBA';
}
