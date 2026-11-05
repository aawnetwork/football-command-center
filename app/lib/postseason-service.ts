import { espnFootball, footballSport, espnImage, type FootballLeague, type EspnData } from './espn-football';
import { normalizeGameContext } from './game-context';
import { postseasonRound, roundNames, type PostRound } from './postseason-model';
export type PostGame = {
  id:string; label:string; round:PostRound; playoff:boolean; date:string; timeTbd:boolean;
  status:string; statusLabel:string; completed:boolean; live:boolean; venue:string|null;
  teams:{id:string;name:string;logo:string|null;score:string|null;winner:boolean;seed:number|null;record:string|null}[];
  context:ReturnType<typeof normalizeGameContext>;
};
/** Reader is injectable so coverage and year-boundary handling can be checked without changing app state. */
export async function loadPostseason(league:FootballLeague,season:number,read:typeof espnFootball=espnFootball) {
  const root=`https://site.api.espn.com/apis/site/v2/sports/football/${footballSport(league)}/scoreboard?dates=${season}&seasontype=3&limit=100${league==='CFB'?'&groups=80':''}`;
  const initial=await read(root).catch(()=>null);
  const calendar=initial?.leagues?.[0]?.calendar?.find((c:EspnData)=>String(c.value)==='3');
  const entries:EspnData[]=calendar?.entries??[];
  const published=entries.filter(e=>!(/pro bowl|all.star/i.test(e.label??''))).map(e=>String(e.value)).filter(v=>/^\d+$/.test(v));
  // College's calendar often puts every bowl in 1 and all CFP rounds in 999.
  // Query both even before the CFP selection appears in the calendar.
  const selections=[...new Set(league==='CFB'?[...published,'1','999']:published.length?published:['1','2','3','5'])];
  const results=await Promise.allSettled(selections.map(week=>read(`${root}&week=${week}`)));
  if(!initial&&results.every(r=>r.status==='rejected'))throw new Error('Postseason games are temporarily unavailable. Please try again.');
  const issues:string[]=[];
  const withheld=new Set<string>();
  const events=new Map<string,{event:EspnData;feed:EspnData;fromCfp:boolean}>();
  const add=(feed:EspnData,fromCfp:boolean)=>{
    const matching=(feed.events??[]).filter((e:EspnData)=>(e.season?.year??feed.season?.year)===season&&(e.season?.type??feed.season?.type)===3);
    if(matching.length>=100)issues.push('ESPN reached the response limit; some games may be missing.');
    for(const e of matching){
      if(!/^\d+$/.test(e.id)||withheld.has(e.id))continue;
      const previous=events.get(e.id);
      if(previous){
        const ids=(event:EspnData)=>(event.competitions?.[0]?.competitors??[]).map((t:EspnData)=>String(t.team?.id??'')).filter((id:string)=>/^[1-9]\d*$/.test(id)).sort().join(':');
        if(ids(previous.event)&&ids(e)&&ids(previous.event)!==ids(e)){issues.push('A game has conflicting team information and has been withheld.');events.delete(e.id);withheld.add(e.id);continue;}
      }
      events.set(e.id,{event:e,feed,fromCfp:fromCfp||!!previous?.fromCfp});
    }
  };
  if(initial)add(initial,false);
  results.forEach((r,i)=>{
    if(r.status==='fulfilled')add(r.value,league==='CFB'&&(selections[i]==='999'||/CFP|playoff/i.test(entries.find(e=>String(e.value)===selections[i])?.label??'')));
    else issues.push(`Unable to refresh ${entries.find(e=>String(e.value)===selections[i])?.label??'a postseason round'}. Other published games remain visible.`);
  });
  const checkedAt=new Date().toISOString(),games:PostGame[]=[];
  for(const {event:e,feed,fromCfp} of events.values()){
    const c=e.competitions?.[0];if(!c)continue;
    const label=(c.notes??[]).filter((n:EspnData)=>n.type==='event').map((n:EspnData)=>n.headline??'').join(' · ');
    const calendarLabel=entries.find(entry=>String(entry.value)===String(e.week?.number))?.label??'';
    if(/pro bowl|all.star/i.test(`${label} ${calendarLabel}`)||(league==='NFL'&&!entries.length&&e.week?.number===4))continue;
    const round=postseasonRound(league,label,e.week?.number??null,calendarLabel);
    const playoff=league==='NFL'||fromCfp||/college football playoff|\bCFP\b/i.test(label)||league==='CFB'&&round!=='other';
    const normalized=normalizeGameContext(league,e,feed,{season,seasonType:3},checkedAt);
    const context={...normalized,competitionKind:playoff?'playoff' as const:normalized.competitionKind,postseasonRound:{sourceNumber:e.week?.number??feed.week?.number??null,label:round==='other'?label||null:roundNames[round]}};
    const teams=[...(c.competitors??[])].sort((a:EspnData,b:EspnData)=>(a.homeAway==='home'?0:1)-(b.homeAway==='home'?0:1)).map((t:EspnData)=>{
      const sourceRank=Number(t.seed??t.curatedRank?.current);
      return {id:String(t.team?.id??''),name:String(t.team?.displayName??'To be determined'),logo:espnImage(t.team?.logo??t.team?.logos?.[0]?.href),score:t.score==null?null:String(t.score),winner:t.winner===true,seed:sourceRank>0&&sourceRank<99?sourceRank:null,record:(t.records??[]).find((r:EspnData)=>r.type==='total'||r.name==='overall')?.summary??null};
    });
    const status=c.status?.type??e.status?.type??{};
    const statusLabel=/CANCEL/i.test(status.name??'')?'CANCELLED':/POSTPON/i.test(status.name??'')?'POSTPONED':status.completed?'FINAL':status.state==='in'?'LIVE':'SCHEDULED';
    games.push({id:e.id,label:label||calendarLabel||'Postseason',round,playoff,date:e.date,timeTbd:c.timeValid===false||e.timeValid===false||/TBD|TBA/i.test(status.shortDetail??''),status:status.shortDetail??'Scheduled',statusLabel,venue:c.venue?.fullName??null,completed:status.completed===true,live:status.state==='in',teams,context});
  }
  games.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||a.id.localeCompare(b.id));
  return {league,season,games,issues:[...new Set(issues)],checkedAt};
}
