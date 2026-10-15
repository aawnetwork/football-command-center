import { requireAdmin } from "../../lib/require-admin";
import { AdminCentre } from "../../components/AdminCentre";
import { loadAudienceReport } from '../../lib/audience-report-store';
import { reportFilters, percentage, sampleLabel, sortFavourites } from '../../lib/audience-report';
import { participationEnabled } from '../../lib/participation-security';
import GameOpinions from '../../features/audience/GameOpinions';
export const dynamic = "force-dynamic";
export const metadata = { title: "AAW Hub · User Stats", robots: { index: false, follow: false } };
export default async function UserStatsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  await requireAdmin();
  const raw=await searchParams, params=new URLSearchParams();
  for (const [key,value] of Object.entries(raw)) if (value!==undefined) for(const v of Array.isArray(value)?value:[value]) params.append(key,v);
  let filters;
  try { filters=reportFilters(params); } catch { return <AdminCentre current="/admin/user-stats"><main className="hub-admin__intro"><h1>User Stats</h1><p role="alert">Invalid report filters.</p><a href="/admin/user-stats">Reset filters</a></main></AdminCentre>; }
  let report;
  try { report=await loadAudienceReport(filters); } catch { return <AdminCentre current="/admin/user-stats"><main className="hub-admin__intro"><h1>User Stats</h1><p role="alert">Audience reporting is unavailable. These are not zero results. Please refresh to retry.</p></main></AdminCentre>; }
  const enabled=participationEnabled(process.env), o=report.overview;
  return <AdminCentre current="/admin/user-stats"><main className="hub-admin__intro audience-report">
    <h1>User Stats</h1><p>Private audience intelligence · voluntary browser participation, not unique people.</p>
    {!enabled && <p className="audience-notice">Audience participation is disabled. {o.currentRatings===0 && o.nflFavourites===0 && o.cfbFavourites===0 && o.pregame===0 && o.live===0 && o.postgame===0 ? 'No audience contributions are available. Reporting will populate once participation is approved and enabled.' : 'Only existing retained contributions are shown.'}</p>}
    <form className="audience-filters" action="/admin/user-stats">
      <label>League<select name="league" defaultValue={filters.league??''}><option value="">Both leagues</option><option>NFL</option><option>CFB</option></select></label>
      <label>Season<select name="season" defaultValue={filters.season??''}><option value="">All retained seasons</option>{[...new Set([...report.seasons.map(s=>s.season),...(filters.season?[filters.season]:[])])].sort((a,b)=>b-a).map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Favourite sorting<select name="sort" defaultValue={filters.sort}><option value="popular">Most popular</option><option value="alphabetical">Alphabetical</option></select></label>
      <button type="submit">Apply / refresh</button><a href="/admin/user-stats">Reset</a>
    </form>
    <section aria-labelledby="overview"><h2 id="overview">Overview</h2><p>League and season filters apply to this overview and favourites. Game opinions has its own weekly controls. Active participating browsers is the global count of current, unexpired, unwithdrawn consent records; it does not measure recent visits.</p>
      <dl className="audience-overview">{[['Active participating browsers (all)',o.activeBrowsers],['Current game ratings',o.currentRatings],['NFL favourites',o.nflFavourites],['CFB favourites',o.cfbFavourites],['Games receiving contributions',o.games],['Pregame snapshots',o.pregame],['Live snapshots',o.live],['Postgame snapshots',o.postgame]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p>Latest retained contribution: {o.latestContribution?new Date(o.latestContribution).toLocaleString('en-GB',{timeZone:'Europe/London'}):'None'}.</p>
      <p>Trends are unavailable: overwritten current selections and bounded phase snapshots are not a complete activity time series. Phase counts are not added together as unique browsers.</p>
    </section>
    <section aria-labelledby="favourites"><h2 id="favourites">Favourite teams</h2>
      {(['NFL','CFB'] as const).filter(l=>!filters.league||l===filters.league).map(league=>{const rows=sortFavourites(report.favourites.filter(t=>t.league===league),filters.sort), n=league==='NFL'?o.nflFavourites:o.cfbFavourites;return <details key={league} open><summary>{league} · {n} current favourite selections · {sampleLabel(n)}</summary>
        {rows.length===0?<p>No favourite selections in this scope.</p>:<div className="audience-table"><table><thead><tr><th>Team</th><th>Browsers / league selections</th><th>Percentage</th></tr></thead><tbody>{rows.map(t=><tr key={t.teamId}><td>{t.logo && <img src={t.logo} width="28" height="28" alt=""/>}{t.name??`${league} team ${t.teamId} (metadata unavailable)`}</td><td>{t.count} / {t.denominator}</td><td>{percentage(t.count,t.denominator)}</td></tr>)}</tbody></table></div>}</details>;})}
      <p>Each league has its own denominator. Unselected favourites are not votes; percentages describe only that league’s current selections.</p>
    </section>
    <GameOpinions initialLeague={filters.league??'NFL'} initialSeason={filters.season??new Date().getUTCFullYear()} seasons={report.seasons.map(s=>s.season)}/>
    <section aria-labelledby="operations"><h2 id="operations">Operational status</h2><p>Participation: {enabled?'Enabled':'Disabled'} · reporting is read-only.</p>
      <p>Retention: {report.retention?.status??'No execution recorded'}<br/>Last successful execution: {report.retention?.lastSuccessAt??'None recorded'}<br/>Last failure: {report.retention?.lastFailureAt??'None recorded'}</p>
      <details><summary>Season-end confirmations</summary>{report.seasons.length===0?<p>No season-end records or stored contribution seasons. NFL and CFB season ends remain unconfirmed.</p>:<ul>{report.seasons.map(s=><li key={`${s.league}:${s.season}`}>{s.league} {s.season}: {s.endedAt?`confirmed end ${s.endedAt}; expires ${s.expiresAt}`:'Unconfirmed / unknown — no inferred expiry'}</li>)}</ul>}</details>
      <p>Expired contributions are excluded before scheduled deletion. Withdrawals affect the next report request. No permanent report snapshots are kept.</p>
    </section>
  </main></AdminCentre>;
}
