import 'server-only';
import { participationRpc } from './participation-store';
import { verifiedSummary } from './audience-validation';
import { preferredTeamLogo, standingsEntries } from './team-logos';
import type { AudienceReport, ReportFilters } from './audience-report';

const sports={NFL:'nfl',CFB:'college-football'};
async function teamNames(report:AudienceReport) {
  await Promise.all((['NFL','CFB'] as const).map(async league=> {
    if (!report.favourites.some(t=>t.league===league)) return;
    try {
      const response=await fetch(`https://site.api.espn.com/apis/v2/sports/football/${sports[league]}/standings${league==='CFB'?'?groups=80':''}`, {next:{revalidate:300},signal:AbortSignal.timeout(5000)});
      if (!response.ok) return;
      const data=await response.json();
      if (data.uid!==(league==='NFL'?'s:20~l:28~g:9':'s:20~l:23~g:80')) return;
      const entries=standingsEntries<any>(data);
      for (const row of report.favourites.filter(t=>t.league===league)) {
        const matches=entries.filter(t=>t.team?.id===row.teamId);
        if (matches.length!==1) continue;
        row.name=matches[0].team.displayName;
        row.logo=preferredTeamLogo(matches[0].team.logos, null, "dark");
      }
    } catch { /* Canonical IDs remain readable when metadata is unavailable. */ }
  }));
}
export async function loadAudienceReport(filters:ReportFilters):Promise<AudienceReport> {
  const report=await participationRpc('hub_audience_report',{p_league:filters.league,p_season:filters.season,p_game:filters.game,p_view:filters.view,p_phase:filters.phase,p_offset:filters.offset}) as AudienceReport;
  // Metadata only, not audience aggregates, is cached. No polling or reporting snapshots.
  await teamNames(report);
  // A summary lookup is made only for an explicitly selected game, never every row.
  const game=filters.game ? report.games.find(g=>g.gameId===filters.game) : undefined;
  if (game) try {
    const response=await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/${sports[game.league]}/summary?event=${game.eventId}`,{cache:'no-store',signal:AbortSignal.timeout(5000)});
    const sourceTime=Date.parse(response.headers.get('date')??'');
    const age=Number(response.headers.get('age')??0);
    if (!response.ok || !Number.isFinite(sourceTime) || Math.abs(Date.now()-sourceTime)>60000 || !Number.isFinite(age) || age>60) return report;
    const data=await response.json(), checkedAt=new Date().toISOString();
    const context=verifiedSummary(game.league,game.season,game.eventId,data,checkedAt);
    const competitors=data.header.competitions[0].competitors;
    const home=competitors.find((t:any)=>t.team?.id===context.homeTeamId && t.homeAway==='home');
    const away=competitors.find((t:any)=>t.team?.id===context.awayTeamId && t.homeAway==='away');
    if (typeof home?.team?.displayName==='string' && typeof away?.team?.displayName==='string') {
      game.matchup=`${away.team.displayName} @ ${home.team.displayName}`;
      game.kickoff=context.kickoffAt??undefined;game.status=context.status;game.metadataCheckedAt=checkedAt;
    }
  } catch { /* Do not invent current status from old opinions or kickoff alone. */ }
  return report;
}
