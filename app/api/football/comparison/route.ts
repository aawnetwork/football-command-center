import { footballSelection, footballClock, footballSport, espnFootball, espnImage } from '../../../lib/espn-football';
import { projectPlayerLog } from '../../../lib/player-comparison';
export async function GET(request:Request) {
  try {
    const {p,league,season:requested}=footballSelection(request);
    const ids=p.get('players')?.split(',')??[];
    const phase=Number(p.get('phase')??'2'),rawWeek=p.get('week'),week=rawWeek===null?null:Number(rawWeek);
    if(ids.length!==2||new Set(ids).size!==2||ids.some(id=>!/^[1-9]\d*$/.test(id))||![2,3].includes(phase)||rawWeek!==null&&(!/^\d+$/.test(rawWeek)||week!<1||week!>30))return Response.json({error:'Choose two different players and a valid period.'},{status:400});
    const season=requested??(await footballClock(league)).season,sport=footballSport(league);
    const results=await Promise.allSettled(ids.map(async id=>{
      const root=`https://site.web.api.espn.com/apis/common/v3/sports/football/${sport}/athletes/${id}`;
      const [bio,log]=await Promise.all([espnFootball(`${root}?season=${season}`,300),espnFootball(`${root}/gamelog?season=${season}&seasontype=${phase}`,30)]);
      const a=bio.athlete;if(String(a?.id)!==id)throw new Error('Player identity unavailable.');
      return {id,name:a.displayName,position:a.position?.abbreviation??'',team:a.team?.displayName??'',headshot:espnImage(a.headshot?.href),...projectPlayerLog(log,season,phase,week)};
    }));
    return Response.json({season,phase,week,checkedAt:new Date().toISOString(),players:results.map((r,i)=>r.status==='fulfilled'?r.value:{id:ids[i],error:(r.reason as Error).message})});
  }catch(error){return Response.json({error:(error as Error).message},{status:503});}
}
