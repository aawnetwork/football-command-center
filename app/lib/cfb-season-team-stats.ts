import schools from './cfb-ncaa-season-schools.json';
import type { SeasonStat } from './cfb-helpers';
const eligible=new Set(schools.schools);
export const ncaaTeamDefinitions = {
  'total-offense':{field:'YDS',unit:'yards total',total:'YDS'},
  'rushing-offense':{field:'Rush Yds',unit:'yards total',total:'Rush Yds'},
  'passing-offense':{field:'Pass Yds',unit:'yards total',total:'Pass Yds'},
  'scoring-offense':{field:'PPG',unit:'PPG',total:'Pts'},
  'total-defense':{field:'YPG',unit:'YPG allowed',total:'YDS'},
  'rushing-defense':{field:'YPG',unit:'YPG allowed',total:'Opp Rush Yds'},
  'passing-defense':{field:'YPG',unit:'YPG allowed',total:'Opp Pass <br/>Yds'},
  'scoring-defense':{field:'Avg',unit:'PPG allowed',total:'Pts'},
  sacks:{field:'Sacks',unit:'sacks total',total:'Sacks'},
  'turnover-margin':{field:'Margin',unit:'turnover margin total',total:'Margin'},
} as const;
const definition=(category:string)=>ncaaTeamDefinitions[category as keyof typeof ncaaTeamDefinitions];
/** Reject empty/null/invalid observations instead of coercing them to zero. */
export function ncaaTeamNumber(raw:unknown):number|null {
  if(typeof raw!=='number'&&typeof raw!=='string')return null;
  if(typeof raw==='string'&&!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(raw.trim()))return null;
  const n=typeof raw==='number'?raw:Number(raw.trim().replaceAll(',',''));
  return Number.isFinite(n)?n:null;
}
export function ncaa2026Cutoff(updated:unknown):boolean {
  if(typeof updated!=='string')return false;
  const date=updated.match(/Through games \w+, (\w+ \d{1,2}, (\d{4}))/i);
  return Boolean(date&&date[2]==='2026'&&Number.isFinite(Date.parse(date[1])));
}
/** Preserve the source's exact publication text and raw team names; no player sums. */
export function projectNcaaSeasonTeam(team:Record<string,unknown>,category:string,updated:unknown) {
  const d=definition(category),name=typeof team.Team==='string'?team.Team.trim():'';
  let number=d?ncaaTeamNumber(team[d.field]):null;
  if(number!==null){
    const whole=['total-offense','rushing-offense','passing-offense','turnover-margin'].includes(category);
    if(whole&&!Number.isSafeInteger(number)||category==='sacks'&&(number<0||!Number.isSafeInteger(number*2))||category.startsWith('scoring-')&&number<0)number=null;
  }
  // These tables also expose per-game averages. Without corroborating columns,
  // an unverified field definition must not turn a rate into a season total.
  if(number!==null&&(category==='sacks'||category==='turnover-margin')){
    const games=ncaaTeamNumber(team.G),average=ncaaTeamNumber(team.Avg);
    if(games===null||games<=0||!Number.isSafeInteger(games)||average===null||Math.abs(number/games-average)>0.051)number=null;
  }
  return {id:`${category}-${name}`,name,team:name,category,statType:'TEAM',type:'team',stat:number,
    sourceUpdated:typeof updated==='string'?updated:undefined,gamesPlayed:ncaaTeamNumber(team.G),seasonTotal:d?ncaaTeamNumber(team[d.total]):null};
}
export function cfbSeasonTeamLeaders(stats:readonly SeasonStat[],category:string) {
  const rows=stats.filter(row=>row.type==='team'&&row.category===category);
  const counts=new Map<string,number>();for(const row of rows)counts.set(row.team,(counts.get(row.team)??0)+1);
  const seen=new Set<string>();
  const leaders=rows.filter(row=>eligible.has(row.team)&&!seen.has(row.team)&&seen.add(row.team)).map(row=>{
    const value=counts.get(row.team)===1&&ncaa2026Cutoff(row.sourceUpdated)?ncaaTeamNumber(row.stat):null;
    return {playerId:row.id,player:row.team,team:row.team,playingNow:false,value:value??NaN,rank:null as number|null};
  });
  const ascending=['total-defense','rushing-defense','passing-defense','scoring-defense'].includes(category);
  leaders.sort((a,b)=>!Number.isFinite(a.value)?!Number.isFinite(b.value)?a.team.localeCompare(b.team):1:!Number.isFinite(b.value)?-1:(ascending?a.value-b.value:b.value-a.value)||a.team.localeCompare(b.team));
  for(let i=0;i<leaders.length;i++)if(Number.isFinite(leaders[i].value))leaders[i].rank=i>0&&leaders[i].value===leaders[i-1].value?leaders[i-1].rank:i+1;
  return leaders;
}
export function formatCfbSeasonTeam(category:string,value:number) {
  if(!Number.isFinite(value))return '—';
  const unit=definition(category)?.unit;
  if(category==='turnover-margin')return `${value>0?'+':''}${value} turnover margin total`;
  return `${value.toLocaleString('en-GB',{maximumFractionDigits:3})} ${unit??'reported value'}`;
}
export function cfbSeasonTeamCoverage(stats:readonly SeasonStat[],category:string) {
  const rows=stats.filter(row=>row.type==='team'&&row.category===category),leaders=cfbSeasonTeamLeaders(stats,category);
  const supported=leaders.filter(row=>row.rank!==null).length;
  const dates=[...new Set(rows.map(row=>row.sourceUpdated).filter((date):date is string=>Boolean(date)))];
  const unknown=rows.filter(row=>!eligible.has(row.team)).length;
  return `NCAA FBS reported snapshot: ${supported}/${leaders.length} recognised reported teams have supported values (${schools.schools.length} retained FBS schools). ${leaders.length-supported} unavailable or conflicting observations; ${unknown} unverified school observations excluded. National completeness is unverified. ${category==='sacks'||category==='turnover-margin'?'Totals require matching source games and per-game average fields. ':''}${dates.length?dates.join(' · '):'Source cutoff unavailable.'} Only an explicit 2026 through-games date supports ranks; no live or weekly values are added.`;
}
