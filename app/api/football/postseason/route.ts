import { footballSelection, footballClock } from '../../../lib/espn-football';
import { loadPostseason } from '../../../lib/postseason-service';
export async function GET(request: Request) {
  try {
    const {p,league,season:requested}=footballSelection(request);
    if(p.get('view')==='status')return Response.json(await footballClock(league));
    const season=requested??(await footballClock(league)).season;
    return Response.json(await loadPostseason(league,season));
  } catch(error) { return Response.json({error:(error as Error).message},{status:503}); }
}
