import { NextResponse } from "next/server";
import { loadNflLiveSource } from "../live-stats";
import { projectWeeklyTeams } from "../../../lib/nfl-weekly-team-stats";
import { retainedNflTeams } from "../../../lib/retained-team-stats";

export async function GET(request: Request) {
  try {
    const {searchParams}=new URL(request.url);
    const mode=searchParams.get('mode')==='season'?'season':'weekly';
    const raw=searchParams.get('week');
    if(mode==='weekly'&&raw!==null&&(!/^[1-9]\d*$/.test(raw)||Number(raw)>18))return NextResponse.json({error:'Invalid NFL team week'},{status:400});
    const requested=raw===null?null:Number(raw);
    const retained=retainedNflTeams(mode,requested);
    if(retained)return NextResponse.json(retained);
    // Current Week retains its existing fresh source. Historical snapshots never
    // masquerade as current observations, and team requests do not need player CSVs.
    const live=await loadNflLiveSource();
    const week=requested??live.scoreboard.week?.number??null;
    const stats=week?projectWeeklyTeams(live,week):[];
    return NextResponse.json({season:2026,mode,week,availableWeeks:[...new Set([1,2,3,4,5,6,...(week?[week]:[])])],stats,passingBasis:'net',snapshot:false,
      coverage:stats.length?'ESPN team boxscores. Rankings cover reported values; games still to play will add teams.':'Team boxscores for this week are not retained. Choose Weeks 1–6 for completed-game statistics.'});
  } catch {
    return NextResponse.json({error:'Team statistics could not be checked. Historical Weeks 1–6 remain available.'},{status:503});
  }
}
