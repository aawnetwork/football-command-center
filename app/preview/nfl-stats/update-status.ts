type StatusData = {
  scope?: string;
  liveWeek?:number;
  observationAt?: string;
  lines: readonly { playingNow: boolean | null }[];
};
const time = (value: number) => new Date(value).toLocaleTimeString('en-GB');

/** Check time describes successful client retrieval, never a statistical change or publication. */
export function statsUpdateStatus(data: StatusData | null, lastChecked: number | null, checking: boolean, failed: boolean) {
  const fixed = data?.scope === 'reviewed-espn-week' || data?.scope === 'retained-espn-season' && !data.liveWeek;
  const live = !fixed && !failed && Boolean(data?.lines.some(row => row.playingNow === true));
  const checked = lastChecked === null ? null : `Last checked ${time(lastChecked)}`;
  const observed = fixed && data?.observationAt ? Date.parse(data.observationAt) : NaN;
  return {
    heading: [failed ? 'Check failed' : checking ? 'Checking…' : null, checked].filter(Boolean).join(' · ') || 'Loading…',
    cadence: fixed ? 'Historical ESPN snapshot' : live ? 'LIVE · updates every 30 seconds' : 'Automatic checks every 30 seconds',
    snapshot: Number.isFinite(observed) ? `Snapshot through ${new Date(observed).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : null,
  };
}

export function playerDetailCheckLabel(lastChecked: number | null, checking: boolean, failed: boolean) {
  return [lastChecked === null ? null : `Last checked ${time(lastChecked)}`, failed ? 'Check failed.' : checking ? 'Checking…' : null].filter(Boolean).join(' · ');
}
