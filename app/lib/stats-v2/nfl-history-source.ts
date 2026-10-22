import { publicSource, batches } from './public-source';
import type { NflLiveSource, EspnScoreboard, EspnSummary } from './nfl-source-types';
/** Only completed earlier weeks. Current-week live observations never enter this cache. */
export async function loadNflHistorySources(weeks: number[]): Promise<NflLiveSource[]> {
  return batches(weeks, async week => {
    if (!Number.isSafeInteger(week) || week<1 || week>18) throw Error('Invalid history week');
    const source=await publicSource(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=2026&seasontype=2&week=${week}&limit=1000`,true,input=>{const board=input as EspnScoreboard;if(board.season?.year!==2026||board.season.type!==2||board.week?.number!==week||!board.events?.length||board.events.some(e=>e.competitions?.[0]?.status?.type?.state!=='post'||!e.competitions?.[0]?.status?.type?.completed))throw Error('Earlier week is not verified final');return board;},'final-scoreboard');
    const scoreboard=source.value as EspnScoreboard;
    if(scoreboard.season?.year!==2026 || scoreboard.season.type!==2 || scoreboard.week?.number!==week || !scoreboard.events?.length || scoreboard.events.some(event=>event.competitions?.[0]?.status?.type?.state!=='post'||!event.competitions?.[0]?.status?.type?.completed))throw Error('Earlier week is not verified final');
    const records=await batches(scoreboard.events,async event=>publicSource(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event.id}`,true, input=>{const summary=input as EspnSummary;if(summary.header?.id!==event.id||summary.header?.competitions?.[0]?.id!==event.id||!summary.header?.competitions?.[0]?.status?.type?.completed||summary.boxscore?.players?.length!==2)throw Error('Incomplete final boxscore');return {header:summary.header,boxscore:summary.boxscore};},'stats-v2')); 
    return {scoreboard,summaries:records.map(r=>r.value as EspnSummary),observedAt:Math.min(source.observedAt,...records.map(r=>r.observedAt))};
  });
}
