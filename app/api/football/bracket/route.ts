import { footballSelection, footballClock, footballTeams, standingStat, espnFootball, espnImage, footballSport, type EspnData } from '../../../lib/espn-football';
import { loadPostseason } from '../../../lib/postseason-service';
import { nflSeedField, selectCfp2026, type BracketTeam } from '../../../lib/postseason-model';
import { confirmedCfpField } from '../../../lib/playoff-bracket';
import { nflDivisionByTeam } from '../../../nfl/data/divisions';
export async function GET(request:Request) {
  try {
    const {p,league,season:requested}=footballSelection(request);
    const season=requested??(await footballClock(league)).season;
    const [standingsResult,postResult]=await Promise.all([footballTeams(league,season).then(data=>({data,error:null})).catch((e:Error)=>({data:null,error:e.message})),loadPostseason(league,season).then(data=>({data,error:null})).catch((e:Error)=>({data:null,error:e.message}))]);
    const post=postResult.data;
    const games=post?.games.filter(g=>g.playoff)??[];
    const base={league,season,games,checkedAt:new Date().toISOString(),issues:[...(post?.issues??[]),...(postResult.error?['Postseason schedule unavailable; showing current projection.']:[])]};
    if(league==='CFB') {
      const confirmed=confirmedCfpField(games);
      if(confirmed)return Response.json({...base,state:'confirmed',conferences:[{name:'CFP',teams:confirmed}],assumptions:['Confirmed CFP selections and seeds from the published ESPN playoff schedule.','Winners advance through their fixed bracket paths; there is no reseeding.'],championOptions:[]});
    }
    const standings=standingsResult.data;
    if(!standings)throw new Error(standingsResult.error??'Standings unavailable.');
    if(league==='NFL') {
      const conferences=['American Football Conference','National Football Conference'].map((name,i)=>{
        const teams=standings.teams.filter(t=>t.conference===name).map(t=>({id:t.id,name:t.name,logo:t.logo,seed:Number(standingStat(t.entry,'playoffseed')?.value??standingStat(t.entry,'playoffSeed')?.value),record:standingStat(t.entry,'total')?.displayValue??'—',conference:i===0?'AFC':'NFC',reason:Number(standingStat(t.entry,'playoffseed')?.value)<=4?'Division leader':'Wild card'}));
        const field=nflSeedField(teams);
        const divisions=new Set(field.filter(t=>t.seed<=4).map(t=>nflDivisionByTeam[t.name]));
        if(divisions.size!==4||field.filter(t=>t.seed<=4).some(t=>!nflDivisionByTeam[t.name]))throw new Error('The supplied NFL seeds do not identify four division leaders.');
        return {name:i===0?'AFC':'NFC',teams:field,contenders:teams.filter(t=>t.seed>=8&&t.seed<=10).sort((a,b)=>a.seed-b.seed)};
      });
      const allFinal=standings.teams.length===32&&standings.teams.every(t=>{
        const record=String(standingStat(t.entry,'total')?.displayValue??'').split('-').map(Number);
        return record.length>=2&&record.every(Number.isFinite)&&record.reduce((a,b)=>a+b,0)===17;
      });
      const scheduledField=new Set(games.filter(g=>g.round==='wild-card'||g.round==='divisional').flatMap(g=>g.teams.map(t=>t.id)).filter(id=>/^[1-9]\d*$/.test(id)));
      return Response.json({...base,state:allFinal||scheduledField.size===14?'confirmed':'projected',conferences,assumptions:['Current ESPN conference seeds determine division leaders, wild cards and tiebreak order.','The No. 1 seed has a bye. After the Wild Card round, the highest seed hosts the lowest remaining seed.']});
    }
    if(season!==2026)return Response.json({...base,state:'unavailable',conferences:[],assumptions:['An official bracket has not been published for this season. Projections currently use the 2026 qualification rules.'],championOptions:[]});
    const rankings=await espnFootball(`https://site.api.espn.com/apis/site/v2/sports/football/${footballSport(league)}/rankings?seasons=${season}`,300);
    const poll=(rankings.rankings??[]).find((r:EspnData)=>r.type==='cfp'&&r.season?.year===season);
    if(!poll)throw new Error('The CFP committee rankings are not yet available for this season.');
    const ranked:BracketTeam[]=(poll.ranks??[]).filter((r:EspnData)=>/^[1-9]\d*$/.test(r.team?.id)&&r.current>0).map((r:EspnData)=>({id:String(r.team.id),name:standings.teams.find(t=>t.id===String(r.team.id))?.name??r.team.displayName??`${r.team.location??""} ${r.team.nickname??r.team.name??""}`.trim(),logo:espnImage(r.team.logo??r.team.logos?.[0]?.href),rank:Number(r.current),seed:0,record:r.recordSummary??r.record?.summary??'',conference:standings.teams.find(t=>t.id===String(r.team.id))?.conference}));
    if(new Set(ranked.map(t=>t.id)).size!==ranked.length)throw new Error('CFP ranking identities are ambiguous.');
    const power=['1','4','5','8'],otherConferences=['151','12','15','17','9','37'];
    const championshipWeeks=Number(poll.occurrence?.number??16)>=14?[15,16]:[];
    const titleResults=await Promise.allSettled(championshipWeeks.map(week=>espnFootball(`https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard?dates=${season}&seasontype=2&week=${week}&groups=80&limit=100`,300)));
    const decidedChampions=new Map<string,string>();
    for(const result of titleResults)if(result.status==='fulfilled')for(const event of result.value.events??[]){
      if(event.season?.year!==season||event.season?.type!==2)continue;
      const competition=event.competitions?.[0];
      const label=(competition?.notes??[]).map((n:EspnData)=>n.headline??'').join(' ');
      if(!/championship/i.test(label)||!competition?.status?.type?.completed)continue;
      const participants=competition.competitors??[],winner=participants.find((t:EspnData)=>t.winner===true);
      const members=participants.map((t:EspnData)=>standings.teams.find(s=>s.id===String(t.team?.id)));
      if(winner&&members.length===2&&members.every((t:typeof standings.teams[number]|undefined)=>t&&t.conferenceId===members[0]?.conferenceId)&&power.includes(members[0]?.conferenceId??''))decidedChampions.set(members[0]!.conferenceId,String(winner.team.id));
    }
    const overrides=new Map<string,string>();
    for(const value of p.getAll('champion')) {
      const [conference,id]=value.split(':');
      if(!power.includes(conference)||!standings.teams.some(t=>t.conferenceId===conference&&t.id===id)||overrides.has(conference))return Response.json({error:'Invalid conference champion selection.'},{status:400});
      overrides.set(conference,id);
    }
    const championOptions=power.map(id=>{
      const members=standings.teams.filter(t=>t.conferenceId===id);
      const leaders=members.filter(t=>Number(standingStat(t.entry,'playoffseed')?.value)===1);
      const chosen=decidedChampions.get(id)??overrides.get(id)??(leaders.length===1?leaders[0].id:null);
      if(!chosen)throw new Error('A conference leader is not yet available for the CFP projection.');
      return {id,name:members[0]?.conference??id,selected:chosen,confirmed:decidedChampions.has(id),teams:members.map(t=>({id:t.id,name:t.name}))};
    });
    const champions=championOptions.map(option=>{
      const t=standings.teams.find(t=>t.id===option.selected)!;
      return {...(ranked.find(r=>r.id===t.id)??{id:t.id,name:t.name,logo:t.logo,seed:0}),conference:option.name};
    });
    const other=ranked.find(t=>otherConferences.includes(standings.teams.find(s=>s.id===t.id)?.conferenceId??''));
    if(!other)throw new Error('The highest-ranked team from the other six conferences cannot be established from the published CFP rankings.');
    const teams=selectCfp2026(ranked,champions,other).map(t=>decidedChampions.get(standings.teams.find(s=>s.id===t.id)?.conferenceId??'')===t.id?{...t,reason:`${t.conference} champion`}:t);
    if(teams.some(t=>t.possibleSeeds?.length))base.issues.push('Multiple assumed champions are outside the published CFP top 25. Their places are included, but their relative seeds remain TBA.');
    return Response.json({...base,state:'projected',conferences:[{name:'CFP',teams}],championOptions,rankingDate:poll.lastUpdated??poll.date,assumptions:['2026 rules: ACC, Big Ten, Big 12 and SEC champions; highest-ranked team from the other six conferences; remaining places by CFP ranking, including the Notre Dame top-12 guarantee.','Completed conference championship winners take their automatic places. For undecided championships, the ESPN conference leader is assumed to win; change those assumptions below.','Seeds 1–4 receive byes. This projection is not the committee’s final selection.']});
  }catch(error){return Response.json({error:(error as Error).message},{status:503});}
}
