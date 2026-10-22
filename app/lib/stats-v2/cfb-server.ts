import { statsV2Access } from './release-access';
import { stableGameDiscovery, observedGame, shouldReadGame } from './stable-game-discovery';
import { cfbSeasonResponse, retainedCfbPositions } from './cfb-season';
import { reviewedCfbWeek7, withReviewedCfbHistory, reviewedCfbHistoryTeams } from './cfb-week7-reviewed';
import { buildReportedCfbModel, cfbReportedConfidence, isVerifiedCfbFbsTeam } from './cfb-reported-rankings';
import { publicSource, batches } from './public-source';
import { cfbRosterPositions, cfbConferenceMemberships, cfbAthletePosition } from './cfb-metadata';
import { filterCfbConference } from './cfb-statlines';
import { NFL_METRICS, NFL_RATES, NFL_DERIVED, type Category } from './nfl-statlines';
import type { EspnEvent, EspnSummary } from './nfl-source-types';
type Model = ReturnType<typeof buildReportedCfbModel>&{events:EspnEvent[]};
export function createCfbStatsV2Route(discover:typeof stableGameDiscovery=stableGameDiscovery){
const observations = new Map<string, { model: Model; expires: number; conference: string | null }>();
const pending = new Map<string, Promise<Model>>();
async function json(url: string) { return (await publicSource(url)).value as { season?: {year?:number;type?:number}; leagues?: {season?: {year?:number;type?:{type?:number}}}[]; week?:{number?:number}; events?:EspnEvent[] }; }
async function scoreboard(week: number | null) {
      // Keep limit=100. A year-wide dates query without an explicit week can return
      // older events rather than the current slate; let ESPN resolve its current period.
      const board = await json(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?groups=80&limit=100&seasontype=2${week ? `&dates=2026&week=${week}` : ''}`);
      const selected = week ?? board.week?.number ?? 0;
      const sourceSeason = board.season ?? {year:board.leagues?.[0]?.season?.year,type:board.leagues?.[0]?.season?.type?.type};
      if (!Number.isSafeInteger(selected) || selected < 1 || selected > 16 || sourceSeason.year !== 2026 || sourceSeason.type !== 2) throw Error('Season or week unavailable');
      const events = (board.events as (EspnEvent & { week?: {number?:number} })[] ?? []).filter(event => event.season?.year === 2026 && event.season.type === 2 && event.week?.number === selected);
      if (events.length > 100 || new Set(events.map(e => e.id)).size !== events.length) throw Error('Game coverage ambiguous');
      return { selected, events:discover({...board,season:{year:2026,type:2},week:{number:selected},events},'CFB').events! };
}
async function load(week: number | null) {
  const key = String(week); let operation = pending.get(key);
  if (!operation) {
    if (pending.size >= 4) throw Error('Too many active selections');
    operation = (async () => {
      const { selected, events } = await scoreboard(week);
      // Small batches bound provider concurrency. No history downloads or card requests.
      const summaries: (EspnSummary|null)[] = [];
      for (let i=0;i<events.length;i+=6) summaries.push(...await Promise.all(events.slice(i,i+6).map(async event => {
        if (!shouldReadGame(event)) return null;
        try { const summary=(await publicSource(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${event.id}`)).value as EspnSummary;const observed=observedGame(event,summary,2026,selected);Object.assign(event,observed);return summary; } catch { return null; }
      })));
      const retainedPositions=retainedCfbPositions();
      const teamIds=[...new Set(summaries.flatMap(summary=>summary?.boxscore?.players?.filter(box=>isVerifiedCfbFbsTeam(box.team?.id)&&box.statistics?.some(group=>group.name==='passing'&&group.athletes?.some(row=>/^[1-9]\d*$/.test(row.athlete?.id??'')&&!row.athlete?.position?.abbreviation&&!retainedPositions.some(p=>p.teamId===box.team?.id&&p.athleteId===row.athlete?.id)))).map(box=>box.team?.id).filter((id):id is string=>Boolean(id&&/^[1-9]\d*$/.test(id)))??[]))];
      const positions=[...retainedPositions,...(await batches(teamIds,async id=>{try{return (await publicSource(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/${id}/roster?season=2026`,true,input=>cfbRosterPositions(input,id,2026),'positions')).value as ReturnType<typeof cfbRosterPositions>;}catch{return [];}})).flat()];
      const missing=new Map<string,string>();
      for(const summary of summaries)for(const box of summary?.boxscore?.players??[])for(const group of box.statistics??[])if(isVerifiedCfbFbsTeam(box.team?.id)&&group.name==='passing')for(const row of group.athletes??[]){const id=row.athlete?.id,team=box.team?.id;if(id&&team&&/^[1-9]\d*$/.test(id)&&!row.athlete?.position?.abbreviation&&!positions.some(p=>p.teamId===team&&p.athleteId===id))missing.set(id,team);}
      positions.push(...(await batches([...missing],async([id,team])=>{try{return (await publicSource(`https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes/${id}?season=2026`,true,input=>cfbAthletePosition(input,id,team,2026),'position:'+team)).value as ReturnType<typeof cfbAthletePosition>;}catch{return [];} })).flat());
      let memberships:ReturnType<typeof cfbConferenceMemberships>=[];
      try{memberships=cfbConferenceMemberships((await publicSource('https://site.api.espn.com/apis/v2/sports/football/college-football/standings?season=2026&type=0',true)).value,2026);}catch{throw Error('Conference evidence unavailable; retain the previous leaderboard');}
      return {...buildReportedCfbModel({positions,memberships,period:{season:2026,phase:'REG',week:selected},observedAt:new Date().toISOString(),events,summaries}),events};
    })().finally(() => pending.delete(key)); pending.set(key, operation);
  }
  return operation;
}
async function GET(request: Request) {
  // Incomplete foundation is local-review only; the existing CFB Stats remains default.
  if (!statsV2Access()) return new Response(null,{status:404});
  const headers = {'Cache-Control':'no-store'};
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['mode','week','view','category','snapshot','players','conference'].includes(key) || params.getAll(key).length!==1)) return Response.json({error:'Invalid selection'},{status:400,headers});
    if(params.has('conference')&&!/^[1-9]\d*$/.test(params.get('conference')!))return Response.json({error:'Invalid conference'},{status:400,headers});
    const mode=params.get('mode')??'weekly', view=params.get('view')??'leaders', category=params.get('category') as Category;
    if (!['weekly','season'].includes(mode) || !['leaders','details','export','status'].includes(view)) return Response.json({error:'Invalid selection'},{status:400,headers});
    if(mode==='season'&&(params.has('week')||view==='leaders'&&(!['QB','Rush','Rec','Def'].includes(category)||params.has('snapshot')||params.has('players'))))return Response.json({error:'Invalid season selection'},{status:400,headers});
    if(mode==='season'&&view!=='status')return cfbSeasonResponse(params,view,category,params.get('conference'),view==='leaders'?await load(null):undefined);
    if(view==='export')return Response.json({error:'CFB league ranking coverage is not verified'},{status:409,headers});
    const raw=params.get('week'), week=raw===null?null:Number(raw);
    if(mode==='season'&&raw!==null)return Response.json({error:'Invalid season selection'},{status:400,headers});
    if(raw!==null&&(!/^[1-9]\d*$/.test(raw)||week!>16))return Response.json({error:'Invalid week'},{status:400,headers});
    const conference=params.get('conference');
    if(conference!==null&&!/^[1-9]\d*$/.test(conference))return Response.json({error:'Invalid conference'},{status:400,headers});
    if (view === 'status') {
      if (params.has('players') || params.has('snapshot')) return Response.json({error:'Invalid status selection'},{status:400,headers});
      const { selected, events } = await scoreboard(week);
      const games = events.map(event => {
        const status = event.competitions?.[0]?.status?.type;
        if (!event.id || !Number.isFinite(Date.parse(event.date ?? '')) || !status || !['pre','in','post'].includes(status.state ?? '') || (status.state === 'post' && !status.completed)) throw Error('Unverified game status');
        return {id:event.id,startDate:event.date!,live:status.state==='in',completed:status.completed===true};
      });
      return Response.json({period:{season:2026,phase:'REG',week:mode==='season'?null:selected},currentWeek:selected,games},{headers});
    }
    const reviewed = reviewedCfbWeek7(params, week, view, category, conference);
    if (reviewed) return reviewed;
    // Keep the four bounded detail snapshots usable while idle; leaders are never served from this registry.
    if(view==='details') {
      const stored=observations.get(params.get('snapshot')??''), ids=params.get('players')?.split(',')??[];
      if(!stored)return Response.json({error:'Refresh the leaderboard'},{status:409,headers});
      if(stored.conference!==conference||(week!==null&&week!==stored.model.period.week)||!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some(id=>!stored.model.lines.some(line=>line.id===id)))return Response.json({error:'Invalid player selection'},{status:400,headers});
      return Response.json({snapshot:params.get('snapshot'),observationAt:stored.model.checkedAt,period:stored.model.period,lines:stored.model.lines.filter(line=>ids.includes(line.id)).map(line=>withReviewedCfbHistory(line, stored.model.period.week!, stored.model.period))},{headers});
    }
    if(!['QB','Rush','Rec','Def'].includes(category)||params.has('snapshot')||params.has('players'))return Response.json({error:'Invalid category'},{status:400,headers});
    const full=await load(week), model=conference?{...full,lines:filterCfbConference(full,conference)}:full, snapshot=crypto.randomUUID();
    while(observations.size>=4)observations.delete(observations.keys().next().value!);
    observations.set(snapshot,{model,conference,expires:Date.now()+30000});
    const columns=[...Object.keys(NFL_METRICS),...Object.keys(NFL_RATES),...Object.keys(NFL_DERIVED)] as (keyof typeof model.lines[number]['metrics'])[];
    return Response.json({version:1,snapshot,observationAt:model.checkedAt,period:model.period,complete:false,confidence:cfbReportedConfidence(model,category),rankScope:'reported-values',independentNationalCertification:false,sourceAttribution:`ESPN reported player statistics · Week ${model.period.week}`,collection:{...model.collection,missingCategoryTeamObservations:model.collection.expectedTeamObservations-model.collection.teamGroups[category]},scope:'supplied-games',coveredGames:model.coveredGames,teamContextRows:model.teamContext.length,columns,teams:{...reviewedCfbHistoryTeams,...model.teams},conferences:[...new Map(Object.values(model.teams).filter(t=>t.conferenceId).map(t=>[t.conferenceId,t.conferenceName])).entries()].map(([id,name])=>({id,name})),logos:Object.fromEntries(Object.entries(model.teams).map(([id,t])=>[id,t.logo])),coverage:{warnings:['FBS-wide game coverage is unverified; these are players from the supplied ESPN games, not a complete league ranking',...model.issues]},sources:{live:{status:'partial'}},lines:model.lines.filter(line=>line.categories.includes(category)).map(line=>({id:line.id,name:line.name,teams:line.teams,playingNow:line.playingNow,values:columns.map(key=>line.metrics[key].value),notApplicable:columns.filter(key=>line.metrics[key].state==='not-applicable')}))},{headers});
  }catch(error){console.error('Local CFB Stats source check:',error instanceof Error?error.message:'unknown source error');return Response.json({error:'CFB source unavailable. Use the existing Stats view.'},{status:503,headers});}
}

return GET;
}
export const respondCfbStatsV2=createCfbStatsV2Route();
