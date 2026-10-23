import {NextResponse} from 'next/server';
import {projectOverlayGames} from '../../../features/exports/game-overlay';
import {contextSelection} from '../../../lib/game-context';
// The existing /api/admin/* proxy gate protects this read-only Studio source.
export async function GET(request:Request){
 const params=new URL(request.url).searchParams,league=params.get('league');
 if(league!=='CFB'&&league!=='NFL')return NextResponse.json({error:'Choose CFB or NFL.'},{status:400});
 let selection;try{selection=contextSelection(params,league);}catch{return NextResponse.json({error:'Invalid season or week.'},{status:400});}
 try{
  const url=new URL(`https://site.api.espn.com/apis/site/v2/sports/football/${league==='CFB'?'college-football':'nfl'}/scoreboard`);
  url.searchParams.set('limit','100');url.searchParams.set('seasontype',String(selection.seasonType));
  if(league==='CFB')url.searchParams.set('groups','80');
  if(selection.season!==undefined){url.searchParams.set('year',String(selection.season));if(selection.seasonType===3)url.searchParams.set('dates',String(selection.season));}
  if(selection.week!==undefined)url.searchParams.set('week',String(selection.week===0?1:selection.week));
  const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Error('Schedule unavailable');
  const observedAt=new Date().toISOString();
  return NextResponse.json({games:projectOverlayGames(await response.json(),league,observedAt),observedAt},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return NextResponse.json({error:'Schedule unavailable. Try again later; no export has been generated.'},{status:502});}
}
