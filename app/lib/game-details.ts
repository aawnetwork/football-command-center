/** Compact, exact-identity ESPN game projection shared by NFL and CFB. */
export type DetailIdentity = { league:'NFL'|'CFB'; event:string; season:number; home:string; away:string };
export type DetailStage = 'scheduled'|'live'|'final';
export type DetailStat = { key:string; label:string; home:number|null; away:number|null };
export type DetailPlayer = { id:string; team:string; name:string; category:string; line:string };
export type GameDetails = { identity:DetailIdentity; stage:DetailStage; observedAt:string; kickoff:string|null; week:number|null; teams:{id:string;name:string;score:number|null;rank:number|null}[]; stats:DetailStat[]; players:DetailPlayer[]; scoring:{id:string;text:string;period:number;clock:string;home:number;away:number}[]; leadChanges:number|null; context:string[] };
// ESPN envelopes differ between leagues; validate identities and fields before projecting.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
export const detailNumber=(value:unknown):number|null=>{
 if(typeof value!=='number'&&typeof value!=='string'||typeof value==='string'&&!/^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
};
export function detailStage(status:Raw|undefined):DetailStage {
 if(status?.state==='post'&&status.completed===true&&/^STATUS_FINAL/.test(status.name??''))return 'final';
 if(status?.state==='in'&&status.completed===false)return 'live';
 if(status?.state==='pre'&&status.completed===false&&status.name==='STATUS_SCHEDULED')return 'scheduled';
 throw Error('Game status is not confirmed');
}
export function detailInterval(stage:DetailStage){return stage==='live'?30_000:300_000;}
export function parseDetailIdentity(params:URLSearchParams):DetailIdentity {
 const league=params.get('league'),event=params.get('event'),season=params.get('season'),home=params.get('home'),away=params.get('away');
 if([...params.keys()].some(k=>!['league','event','season','home','away','status'].includes(k)||params.getAll(k).length!==1)||!['NFL','CFB'].includes(league??'')||![event,home,away].every(v=>v&&/^[1-9]\d{0,11}$/.test(v))||(params.has('status')&&!['scheduled','live','final'].includes(params.get('status')!))||home===away||!season||!/^20\d{2}$/.test(season))throw Error('Invalid game identity');
 return {league:league as 'NFL'|'CFB',event:event!,season:Number(season),home:home!,away:away!};
}
const fields=[['totalYards','Total offence'],['netPassingYards','Net passing'],['rushingYards','Rushing'],['turnovers','Turnovers'],['firstDowns','First downs'],['totalPenaltiesYards','Penalties / yards']] as const;
export function projectGameDetails(raw:Raw,identity:DetailIdentity,observedAt:string):GameDetails {
 const header=raw?.header,c=header?.competitions?.[0],participants=c?.competitors;
 if(header?.id!==identity.event||c?.id!==identity.event||header.season?.year!==identity.season||![2,3].includes(header.season?.type)||!Array.isArray(participants)||participants.length!==2||participants.filter(p=>p.homeAway==='home'&&p.team?.id===identity.home).length!==1||participants.filter(p=>p.homeAway==='away'&&p.team?.id===identity.away).length!==1||header.league?.slug&&header.league.slug!==(identity.league==='NFL'?'nfl':'college-football'))throw Error('Game identity does not match');
 const stage=detailStage(c.status?.type),ids=[identity.away,identity.home];
 const teams=ids.map(id=>{const p=participants.find(p=>p.team.id===id);return {id,name:String(p.team.displayName??p.team.abbreviation??id),score:detailNumber(p.score),rank:detailNumber(p.curatedRank?.current)&&p.curatedRank.current<=25?p.curatedRank.current:null};});
 const boxes=raw.boxscore?.teams??[];
 const value=(id:string,key:string)=>{const matches=boxes.filter((b:Raw)=>b.team?.id===id);if(matches.length!==1)return null;const stats=matches[0].statistics?.filter((s:Raw)=>s.name===key)??[];return stats.length===1?detailNumber(stats[0].displayValue):null;};
 const stats:DetailStat[]=fields.filter(([key])=>key!=='totalPenaltiesYards').map(([key,label])=>({key,label,home:value(identity.home,key),away:value(identity.away,key)}));
 const players:DetailPlayer[]=[];
 for(const box of raw.boxscore?.players??[]){
  const team=box.team?.id;if(!ids.includes(team)||(raw.boxscore.players as Raw[]).filter(b=>b.team?.id===team).length!==1)continue;
  for(const category of ['passing','rushing','receiving','defensive']){
   const groups=(box.statistics??[]).filter((g:Raw)=>g.name===category);if(groups.length!==1)continue;
   const group=groups[0],labels:string[]=group.labels??[],metric=category==='defensive'?'TOT':'YDS',index=labels.indexOf(metric);
   if(index<0)continue;
   const rows=(group.athletes??[]).filter((a:Raw)=>/^[1-9]\d*$/.test(a.athlete?.id??'')&&!/^(?:team|team stats)$/i.test(a.athlete?.displayName??'')&&detailNumber(a.stats?.[index])!==null);
   const counts=new Map<string,number>();for(const a of rows)counts.set(a.athlete.id,(counts.get(a.athlete.id)??0)+1);
   rows.filter((a:Raw)=>counts.get(a.athlete.id)===1).sort((a:Raw,b:Raw)=>Number(b.stats[index])-Number(a.stats[index])).slice(0,1).forEach((a:Raw)=>{
    const wanted=category==='passing'?['C/ATT','YDS','TD','INT']:category==='rushing'?['CAR','YDS','TD']:category==='receiving'?['REC','YDS','TD']:['TOT','SACKS','TFL','INT'];
    const line=wanted.flatMap(label=>{const i=labels.indexOf(label),v=a.stats?.[i];return i>=0&&v!==null&&v!==undefined&&/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(String(v))?[`${v} ${label}`]:[];}).join(' · ');
    if(line)players.push({id:`espn:${identity.league.toLowerCase()}:athlete:${a.athlete.id}`,team,name:String(a.athlete.displayName??'Player'),category,line});
   });
  }
 }
 const scoring:GameDetails['scoring']=[];const seen=new Set<string>();let previousHome=0,previousAway=0,leader=0,changes=0,valid=true;
 for(const play of raw.scoringPlays??[]){
  const home=detailNumber(play.homeScore),away=detailNumber(play.awayScore),period=detailNumber(play.period?.number),id=String(play.id??'');
  if(!id||seen.has(id)||home===null||away===null||home<previousHome||away<previousAway||!Number.isSafeInteger(home)||!Number.isSafeInteger(away)||period===null||period<1||!ids.includes(play.team?.id)){valid=false;break;}
  seen.add(id);const next=Math.sign(home-away);if(next&&leader&&next!==leader)changes++;if(next)leader=next;
  scoring.push({id,text:String(play.text??play.type?.text??'Score'),period,clock:String(play.clock?.displayValue??''),home,away});previousHome=home;previousAway=away;
 }
 if(!valid)scoring.length=0;
 const scoresMatch=scoring.length>0&&teams[0].score===previousAway&&teams[1].score===previousHome;
 const context:string[]=[];
 for(const note of c.notes??[])if(note.type==='event'&&typeof note.headline==='string')context.push(note.headline);
 const winner=stage==='final'&&teams.every(t=>t.score!==null)&&teams[0].score!==teams[1].score?teams[0].score!>teams[1].score!?teams[0]:teams[1]:null;
 if(winner){const loser=teams.find(t=>t.id!==winner.id)!;if(loser.rank&&(!winner.rank||winner.rank>loser.rank))context.push(`Confirmed upset: ${winner.name} beat #${loser.rank} ${loser.name}.`);}
 return {identity,stage,observedAt,kickoff:c.date??null,week:typeof header.week==='number'?header.week:header.week?.number??null,teams,stats,players,scoring,leadChanges:scoresMatch?changes:null,context};
}

/** Discard late/lagging summary responses without regressing an established final. */
export function acceptGameDetail<T extends GameDetails>(previous:T|null,next:T,expected:DetailStage):T {
 if(previous&&JSON.stringify(previous.identity)!==JSON.stringify(next.identity))previous=null;
 if(previous&&previous.observedAt>next.observedAt)return previous;
 if(((previous?.stage==='final'||expected==='final')&&next.stage!=='final')||(expected==='live'&&next.stage==='scheduled'))throw Error('Waiting for game details to catch up');
 return next;
}
