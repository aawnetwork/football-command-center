import { NFLVERSE_URLS } from './nflverse-snapshots';
import { parseNflSourceCsv } from './stats-v2/nfl-source-csv';
import { nflFranchise, reconcileNflTeamGames, type FinalNflGame, type NflTeamLedger } from './all-time-nfl-teams';

/** Scheduled refresh only: one existing schedule feed and at most 18 weekly
 * scoreboards for new/corrected results. Public page reads never run this loader. */
export async function loadNflTeamResults(previous?:NflTeamLedger,request:typeof fetch=fetch,now:()=>number=Date.now):Promise<NflTeamLedger> {
 let requests=0,totalBytes=0;const deadline=Date.now()+45_000;
 async function read(url:string){
  if(++requests>19)throw Error('NFL automatic result request budget exceeded');
  const remaining=deadline-Date.now();if(remaining<=0)throw Error('NFL automatic result time budget exceeded');
  const response=await request(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(15_000,remaining))});
  if(!response.ok)throw Error(`NFL result source unavailable (${response.status})`);
  const reader=response.body?.getReader();if(!reader)throw Error('Empty NFL source');
  const chunks:Uint8Array[]=[];
  while(true){const chunk=await reader.read();if(chunk.done)break;totalBytes+=chunk.value.byteLength;if(totalBytes>5_000_000){await reader.cancel();throw Error('NFL automatic result byte budget exceeded');}chunks.push(chunk.value);}
  return Buffer.concat(chunks).toString('utf8');
 }
 const checkedAt=new Date(now()).toISOString();
 // Use the canonical raw URL for the same existing GitHub file; github.com/raw
 // redirects, which this bounded loader deliberately rejects.
 const scheduleUrl=NFLVERSE_URLS.schedule.replace('https://github.com/nflverse/nfldata/raw/','https://raw.githubusercontent.com/nflverse/nfldata/');
 const rows=parseNflSourceCsv(await read(scheduleUrl));
 const latestSeason=Math.max(...rows.filter(row=>row.game_type==='REG').map(row=>Number(row.season)).filter(Number.isInteger));
 const year=new Date(checkedAt).getUTCFullYear();
 if(!rows.length||latestSeason<Math.max(2026,year-1)||latestSeason>year+1)throw Error('NFL schedule season coverage unavailable');
 const previousById=new Map(previous?.games.map(game=>[game.id,game])??[]);
 const groups=new Map<string,FinalNflGame[]>(),seen=new Map<string,FinalNflGame>();
 for(const row of rows){
  const season=Number(row.season);if(!Number.isInteger(season)||season<=2025||row.game_type!=='REG')continue;
  // Empty score cells are not zero; live/future results require a final ESPN confirmation below.
  if(!row.home_score?.trim()||!row.away_score?.trim()){if(previousById.has(`espn:nfl:game:${row.espn}`))throw Error('Previously final NFL result is now unavailable; publication retained');continue;}
  if(!/^\d+$/.test(row.espn??''))throw Error('NFL result lacks exact ESPN game identity');
  const game={id:`espn:nfl:game:${row.espn}`,season,week:Number(row.week),home:nflFranchise(row.home_team),away:nflFranchise(row.away_team),homeScore:Number(row.home_score),awayScore:Number(row.away_score)};
  if(![game.homeScore,game.awayScore].every(n=>Number.isInteger(n)&&n>=0&&n<=100)||!row.result?.trim()||Number(row.result)!==game.homeScore-game.awayScore)throw Error('Invalid NFL published result');
  reconcileNflTeamGames(undefined,[game],checkedAt);
  const duplicate=seen.get(game.id);if(duplicate&&JSON.stringify(duplicate)!==JSON.stringify(game))throw Error('Conflicting NFL schedule result');seen.set(game.id,game);
  const old=previousById.get(game.id);if(old&&JSON.stringify(old)===JSON.stringify(game))continue;
  const key=`${season}:${game.week}`;if(!groups.has(key))groups.set(key,[]);if(!groups.get(key)!.some(item=>item.id===game.id))groups.get(key)!.push(game);
 }
 if(groups.size>18)throw Error('NFL result catch-up exceeds bounded refresh; publication retained');
 const confirmed:FinalNflGame[]=[];
 for(const [key,games] of groups){
  const [season,week]=key.split(':').map(Number);
  const board=JSON.parse(await read(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}&limit=100`));
  if(board.season?.year!==season||board.season?.type!==2||board.week?.number!==week||!Array.isArray(board.events))throw Error('NFL confirmation period mismatch');
  const events=new Map<string,Record<string,unknown>>();
  for(const event of board.events){if(events.has(event.id))throw Error('Duplicate NFL confirmation game');events.set(event.id,event);}
  for(const game of games){
   const event=events.get(game.id.split(':').at(-1)!) as {status?:{type?:{completed?:boolean;state?:string}};competitions?:{status?:{type?:{completed?:boolean;state?:string}};competitors?:{homeAway:string;score:string;team:{abbreviation:string}}[]}[]}|undefined;
   const competition=event?.competitions?.[0],status=competition?.status?.type??event?.status?.type;
   if(!event||!status?.completed||status.state!=='post')throw Error('NFL published result has no verified final observation');
   const teams=competition?.competitors;if(teams?.length!==2)throw Error('Invalid final NFL participants');
   const home=teams.find(team=>team.homeAway==='home'),away=teams.find(team=>team.homeAway==='away');
   if(!home||!away||nflFranchise(home.team.abbreviation)!==game.home||nflFranchise(away.team.abbreviation)!==game.away||!home.score.trim()||!away.score.trim()||Number(home.score)!==game.homeScore||Number(away.score)!==game.awayScore)throw Error('NFL providers disagree on final participants/result');
   confirmed.push(game);
  }
 }
 // Missing rows never delete retained verified finals. Explicit, final corrections replace by game ID.
 return reconcileNflTeamGames(previous,confirmed,checkedAt);
}
