import type { BracketTeam, PostRound } from './postseason-model';
import type { PostGame } from './postseason-service';
export type BracketSlot={key:string;label:string;teams:(BracketTeam|string)[];game?:PostGame};
export type BracketColumn={key:string;name:string;slots:BracketSlot[]};
export type BracketPath={columns:BracketColumn[];champion:BracketTeam|null};
const identified=(id:string)=>/^[1-9]\d*$/.test(id);
const isTeam=(team:BracketTeam|string):team is BracketTeam=>typeof team!=='string';
export function bracketWinner(slot:BracketSlot):BracketTeam|null {
  if(!slot.game?.completed)return null;
  const winners=slot.game.teams.filter(t=>t.winner&&identified(t.id));
  if(winners.length!==1)return null;
  return slot.teams.filter(isTeam).find(t=>t.id===winners[0].id)??null;
}
function bySeed(teams:BracketTeam[],seed:number):BracketTeam|string {
  return teams.find(t=>t.seed===seed)??`Seed ${seed} · qualifier order TBA`;
}
function ids(teams:(BracketTeam|string)[]){return teams.filter(isTeam).map(t=>t.id);}
function actualSlot(game:PostGame,field:BracketTeam[],key:string):BracketSlot {
  return {key,label:game.label,game,teams:game.teams.map(t=>field.find(p=>p.id===t.id)??(identified(t.id)?{id:t.id,name:t.name,logo:t.logo,seed:t.seed??0}:'To be determined'))};
}
function slot(round:PostRound,key:string,label:string,fallback:(BracketTeam|string)[],candidates:string[],games:PostGame[],field:BracketTeam[]):BracketSlot {
  const matches=games.filter(g=>g.round===round).map(game=>({game,known:game.teams.filter(t=>identified(t.id))})).filter(({known})=>known.length>0&&known.every(t=>candidates.includes(t.id))).sort((a,b)=>b.known.length-a.known.length);
  return matches.length?actualSlot(matches[0].game,field,key):{key,label,teams:fallback};
}
/** Canonical branch order is independent of kickoff dates and bowl names. */
export function cfpBracket(teams:BracketTeam[],games:PostGame[]):BracketPath {
  const pairs=[[8,9],[5,12],[7,10],[6,11]];
  const first=pairs.map(([a,b],i)=>slot('first-round',`first-${i}`,`Winner advances to the ${[1,4,2,3][i]} seed's quarterfinal`,[bySeed(teams,a),bySeed(teams,b)],ids([bySeed(teams,a),bySeed(teams,b)]),games,teams));
  const branches=pairs.map(([a,b],i)=>ids([bySeed(teams,[1,4,2,3][i]),bySeed(teams,a),bySeed(teams,b)]));
  const quarters=[1,4,2,3].map((seed,i)=>slot('quarterfinal',`quarter-${i}`,'Seeds 1–4 receive a first-round bye',[bySeed(teams,seed),bracketWinner(first[i])??`Winner of ${pairs[i].join(' / ')}`],branches[i],games,teams));
  const semis=[[0,1],[2,3]].map(([a,b],i)=>slot('semifinal',`semi-${i}`,'Fixed CFP bracket · no reseeding',[bracketWinner(quarters[a])??`Winner of ${[1,4,2,3][a]} seed's quarterfinal`,bracketWinner(quarters[b])??`Winner of ${[1,4,2,3][b]} seed's quarterfinal`],[...branches[a],...branches[b]],games,teams));
  const final=slot('championship','cfp-final','National Championship',[bracketWinner(semis[0])??'Semifinal winner',bracketWinner(semis[1])??'Semifinal winner'],teams.map(t=>t.id),games,teams);
  return {columns:[{key:'first',name:'First Round',slots:first},{key:'quarters',name:'Quarterfinals',slots:quarters},{key:'semis',name:'Semifinals',slots:semis},{key:'final',name:'National Championship',slots:[final]}],champion:bracketWinner(final)};
}
export function nflBracket(teams:BracketTeam[],games:PostGame[],conference:string):BracketPath {
  const conferenceGames=games.filter(g=>g.teams.some(t=>teams.some(p=>p.id===t.id))&&g.teams.filter(t=>identified(t.id)).every(t=>teams.some(p=>p.id===t.id)));
  const wild=[[2,7],[3,6],[4,5]].map(([a,b],i)=>slot('wild-card',`${conference}-wild-${i}`,`${conference} Wild Card`,[bySeed(teams,a),bySeed(teams,b)],ids([bySeed(teams,a),bySeed(teams,b)]),conferenceGames,teams));
  const winners=wild.map(bracketWinner).filter((t):t is BracketTeam=>!!t).sort((a,b)=>a.seed-b.seed);
  const resolved=winners.length===3;
  const fallback:(BracketTeam|string)[][]=resolved?[[bySeed(teams,1),winners[2]],[winners[0],winners[1]]]:[[bySeed(teams,1),'Lowest remaining seed'],['Higher remaining seed','Other Wild Card winner']];
  const candidates=resolved?fallback.map(ids):[teams.map(t=>t.id),teams.filter(t=>t.seed!==1).map(t=>t.id)];
  // The first Divisional branch always contains the No. 1 seed. A source game
  // without that seed must never be duplicated into both branches.
  const divGames=conferenceGames.filter(g=>g.round==='divisional');
  const numberOne=ids([bySeed(teams,1)])[0];
  const firstDiv=divGames.filter(g=>g.teams.some(t=>t.id===numberOne));
  const divisions=fallback.map((pair,i)=>slot('divisional',`${conference}-div-${i}`,i===0?'No. 1 seed has a bye · hosts the lowest remaining seed':'Higher remaining seed hosts',pair,candidates[i],i===0?firstDiv:divGames.filter(g=>!firstDiv.some(f=>f.id===g.id)),teams));
  const finalists=divisions.map(bracketWinner).filter((t):t is BracketTeam=>!!t).sort((a,b)=>a.seed-b.seed);
  const championship=slot('conference',`${conference}-final`,`${conference} Championship · higher seed hosts`,finalists.length===2?finalists:divisions.map((d,i)=>bracketWinner(d)??`Winner of Divisional game ${i+1}`),teams.map(t=>t.id),conferenceGames,teams);
  return {columns:[{key:'wild',name:'Wild Card',slots:wild},{key:'div',name:'Divisional',slots:divisions},{key:'conference',name:`${conference} Championship`,slots:[championship]}],champion:bracketWinner(championship)};
}
export function superBowl(conferences:{name:string;teams:BracketTeam[]}[],games:PostGame[]):BracketSlot {
  const teams=conferences.flatMap(c=>c.teams);
  const finalists=conferences.map(c=>nflBracket(c.teams,games,c.name).champion??`${c.name} champion`);
  return slot('super-bowl','super-bowl','Super Bowl',finalists,teams.map(t=>t.id),games,teams);
}
export function confirmedCfpField(games:PostGame[]):BracketTeam[]|null {
  const opening=games.filter(g=>g.round==='first-round'&&g.teams.length===2&&g.teams.every(t=>identified(t.id)));
  const quarters=games.filter(g=>g.round==='quarterfinal');
  if(opening.length!==4)return null;
  const known=new Map<string,BracketTeam>();
  for(const g of [...opening,...quarters])for(const t of g.teams)if(identified(t.id)) {
    const seed=t.seed??0,prior=known.get(t.id);
    if(prior&&seed>0&&prior.seed>0&&seed!==prior.seed)return null;
    known.set(t.id,{id:t.id,name:t.name,logo:t.logo,seed:seed||prior?.seed||0,record:t.record??undefined,reason:'Confirmed CFP selection'});
  }
  const field=[...known.values()].sort((a,b)=>a.seed-b.seed);
  if(field.length!==12||field.some(t=>t.seed<1||t.seed>12)||new Set(field.map(t=>t.seed)).size!==12)return null;
  return field;
}
