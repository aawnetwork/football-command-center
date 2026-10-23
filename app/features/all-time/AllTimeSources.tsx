export type AllTimeSources = {
  mode: string;
  checkedAt: string | null;
  careerFailedAt?: string | null;
  careerCutoff?: string;
  publicationAvailable?: boolean;
  team?: {baselineThroughSeason:number;checkedAt:string|null;games:number;failedAt:string|null}|null;
};
export type AllTimeDatasetSources = Record<string, { mode: string; checkedAt: string | null }>;

export function recordSourceLabel(source?: {mode: string; checkedAt: string | null}) {
  if(source?.mode==='verified-baseline')return 'Hall of Fame baseline · Through 2025 regular season';
  if(source?.mode==='team-results'&&source.checkedAt)return `Confirmed NFL results · Updated ${new Date(source.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK`;
  if (source?.mode === 'active-career' && source.checkedAt && Number.isFinite(Date.parse(source.checkedAt))) {
    return `ESPN regular-season career totals · Verified ${new Date(source.checkedAt).toLocaleString('en-GB', {timeZone: 'Europe/London'})} UK`;
  }
  return 'Record-book snapshot · Publication cutoff unverified';
}

export function AllTimeSources({league, audience, period, source}: {
  league: 'NFL' | 'CFB'; audience: 'individual' | 'team'; period: string; source: AllTimeSources | null;
}) {
  const active = league === 'NFL' && audience === 'individual' && period === 'career' && source?.mode === 'active-career';
  if(league==='NFL'&&audience==='team')return <p className="all-time-panel__source">
    <strong>Source:</strong> Pro Football Hall of Fame franchise records through the 2025 regular season, plus nflverse results confirmed final by ESPN. All 32 franchises; ties count as half a win.
    {source?.team?.checkedAt ? <> Last successful update: {new Date(source.team.checkedAt).toLocaleString('en-GB',{timeZone:'Europe/London'})} UK · {source.team.games} confirmed games since the baseline. Automatic refresh: Tuesdays at 12:00 UTC.</> : <> Verified historical baseline shown; awaiting the first scheduled source refresh.</>}
    {source?.team?.failedAt && <> The latest result check failed; the last verified records are retained.</>}
    {source?.publicationAvailable===false && <> The current publication is unavailable; showing the last received records or the verified 2025 baseline.</>}
  </p>;
  return <p className="all-time-panel__source">
    <strong>Source:</strong> {league === 'NFL' ? 'Retained NFL / Elias record-book tables.' : 'Retained NCAA FBS record-book tables.'}{' '}
    {active ? <>Tables marked ESPN combine verified regular-season career observations with retained retired-player records. Scheduled refresh: Tuesdays at 12:00 UTC. The reviewed candidate registry is not exhaustive discovery of future entrants.</>
      : <>Fixed historical snapshot, not live. New records and corrections require a reviewed source update.</>}{' '}
    {audience === 'team' ? <>{league === 'NFL' ? '32 retained current franchises; regular season only.' : '25 retained programs per table; program histories can predate FBS membership.'}{' '}
      Source cutoff has not been verified.
      {league === 'NFL' && <> Games Played = wins + losses + ties.</>}
    </> : <>{active ? (source?.careerCutoff ?? "2026 regular-season career observations; an exact through-games date is not supplied.") : "Snapshot publication cutoff is not retained."} ACTIVE indicates roster status, not a live game.</>}
    {active && source?.careerFailedAt && <> The last career refresh failed; verified observations are retained.</>}
    {source?.publicationAvailable === false && <> Published updates are temporarily unavailable; bundled records remain visible.</>}
  </p>;
}
