import { footballSelection, footballClock, footballTeams, footballSport, espnFootball, espnImage, type EspnData } from '../../../lib/espn-football';
export async function GET(request: Request) {
  try {
    const {p,league,season:requested}=footballSelection(request);
    const season=requested??(await footballClock(league)).season;
    const team=p.get('team');
    if(team!==null&&!/^[1-9]\d*$/.test(team))return Response.json({error:'Invalid team.'},{status:400});
    if(!team) {
      const {teams}=await footballTeams(league,season);
      return Response.json({season,teams:teams.map(({id,name,logo})=>({id,name,logo})).sort((a,b)=>a.name.localeCompare(b.name))});
    }
    const d=await espnFootball(`https://site.api.espn.com/apis/site/v2/sports/football/${footballSport(league)}/teams/${team}/roster?season=${season}`,300);
    if(d.season?.year!==season||String(d.team?.id)!==team)throw new Error('The roster does not match the selected season and team.');
    const players=(d.athletes??[]).flatMap((group:EspnData)=>(group.items??[]).filter((a:EspnData)=>/^[1-9]\d*$/.test(a.id)).map((a:EspnData)=>({id:String(a.id),name:String(a.displayName),position:a.position?.abbreviation??'',headshot:espnImage(a.headshot?.href),teamId:team,team:d.team.displayName,jersey:a.jersey??''})));
    return Response.json({season,players});
  }catch(error){return Response.json({error:(error as Error).message},{status:503});}
}
