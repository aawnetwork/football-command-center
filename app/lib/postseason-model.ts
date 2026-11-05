export type PostRound = 'wild-card' | 'divisional' | 'conference' | 'super-bowl' | 'first-round' | 'quarterfinal' | 'semifinal' | 'championship' | 'other';
export const roundNames: Record<PostRound, string> = { 'wild-card':'Wild Card', divisional:'Divisional', conference:'Conference Championships', 'super-bowl':'Super Bowl', 'first-round':'First Round', quarterfinal:'Quarterfinals', semifinal:'Semifinals', championship:'National Championship', other:'Other postseason games' };
export function postseasonRound(league: 'NFL' | 'CFB', label: string, sourceWeek: number | null, calendarLabel = ''): PostRound {
  const text = `${label} ${calendarLabel}`;
  if (league === 'NFL') {
    if (/pro bowl|all.star/i.test(text)) return 'other';
    if (/super bowl/i.test(text)) return 'super-bowl';
    if (/wild card/i.test(text)) return 'wild-card';
    if (/divisional/i.test(text)) return 'divisional';
    if (/conference championship|[AN]FC championship/i.test(text)) return 'conference';
    return ({1:'wild-card',2:'divisional',3:'conference',5:'super-bowl'} as Record<number,PostRound>)[sourceWeek ?? 0] ?? 'other';
  }
  if (/national championship/i.test(text)) return 'championship';
  if (/semifinal/i.test(text)) return 'semifinal';
  if (/quarterfinal/i.test(text)) return 'quarterfinal';
  if (/first round/i.test(text)) return 'first-round';
  return 'other';
}
export type BracketTeam = { id: string; name: string; logo: string | null; seed: number; possibleSeeds?: number[]; rank?: number; record?: string; reason?: string; conference?: string };
/** 2026 rules: P4 champions, highest-ranked other-conference team, ND guarantee, then at-large. */
export function selectCfp2026(ranked: BracketTeam[], champions: BracketTeam[], other: BracketTeam) {
  if (champions.length !== 4 || new Set(champions.map(t=>t.id)).size !== 4) throw new Error('All four conference projections are needed.');
  const autos = [...champions.map(t => ({...t, reason:`${t.conference} champion projection`})), {...other, reason:'Highest-ranked team from the other six conferences'}];
  const nd = ranked.find(t => t.id === '87' && (t.rank ?? Infinity) <= 12);
  if (nd) autos.push({...nd, reason:'Notre Dame top-12 guarantee'});
  const selected = new Map(autos.map(t=>[t.id,t]));
  for (const t of ranked) { if (selected.size >= 12) break; if (!selected.has(t.id)) selected.set(t.id,{...t,reason:'At-large projection'}); }
  if (selected.size !== 12) throw new Error('The CFP rankings do not contain enough identified teams.');
  const ordered=[...selected.values()].sort((a,b)=>(a.rank ?? Infinity)-(b.rank ?? Infinity));
  const unranked=ordered.filter(t=>!Number.isInteger(t.rank));
  return ordered.map((t,i)=>!Number.isInteger(t.rank)&&unranked.length>1?{...t,seed:0,possibleSeeds:Array.from({length:unranked.length},(_,j)=>ordered.length-unranked.length+j+1)}:{...t,seed:i+1});
}
export function nflSeedField(teams: BracketTeam[]) {
  const field = teams.filter(t=>Number.isInteger(t.seed)&&t.seed>=1&&t.seed<=7).sort((a,b)=>a.seed-b.seed);
  if (field.length!==7 || new Set(field.map(t=>t.seed)).size!==7 || new Set(field.map(t=>t.id)).size!==7) throw new Error('A complete set of current conference seeds is unavailable.');
  return field;
}
