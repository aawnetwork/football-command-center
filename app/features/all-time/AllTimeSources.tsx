export type AllTimeSources = {
  mode: string;
  checkedAt: string | null;
  publicationAvailable?: boolean;
};
export type AllTimeDatasetSources = Record<string, { mode: string; checkedAt: string | null }>;

export function recordSourceLabel(source?: {mode: string; checkedAt: string | null}) {
  if (source?.mode === 'active-career' && source.checkedAt && Number.isFinite(Date.parse(source.checkedAt))) {
    return `ESPN career totals · Refreshed ${new Date(source.checkedAt).toLocaleString('en-GB', {timeZone: 'Europe/London'})} UK`;
  }
  return 'Record-book snapshot · Publication cutoff unverified';
}

export function AllTimeSources({league, audience, period, source}: {
  league: 'NFL' | 'CFB'; audience: 'individual' | 'team'; period: string; source: AllTimeSources | null;
}) {
  const active = league === 'NFL' && audience === 'individual' && period === 'career' && source?.mode === 'active-career';
  return <p className="all-time-panel__source">
    <strong>Source:</strong> {league === 'NFL' ? 'Retained NFL / Elias record-book tables.' : 'Retained NCAA FBS record-book tables.'}{' '}
    {active ? <>Tables marked ESPN use published career totals for existing record-book candidates. Weekly source refresh is configured; new candidates are not automatically discovered.</>
      : <>Fixed historical snapshot, not live. New records and corrections require a reviewed source update.</>}{' '}
    {audience === 'team' ? <>{league === 'NFL' ? '32 retained current franchises; regular season only.' : '25 retained programs per table; program histories can predate FBS membership.'}{' '}
      Source cutoff has not been verified.
      {league === 'NFL' && <> Games Played = wins + losses + ties.</>}
    </> : <>Snapshot publication cutoff is not retained. A refresh time is not the record-book cutoff; ACTIVE is career-source information, not live game status.</>}
    {source?.publicationAvailable === false && <> Published updates are temporarily unavailable; bundled records remain visible.</>}
  </p>;
}
