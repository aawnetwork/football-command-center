export type ApprovedBroadcast = {
  league: 'CFB' | 'NFL'; event_id: string; event_date: string;
  away_team: string; home_team: string; source_date: string;
  source_time: string; source_matchup: string;
  dazn: boolean; disney_plus: boolean; sky_sports: boolean; channel_5: boolean;
};
export type BroadcastPublication = { feed_id: string; version: number; league: 'CFB' | 'NFL'; records: ApprovedBroadcast[] };
export function validatePublication(value: unknown): BroadcastPublication {
  if (!value || typeof value !== 'object') throw Error('Publication required.');
  const p = value as BroadcastPublication;
  if (typeof p.feed_id !== 'string' || !/^\d{1,20}$/.test(p.feed_id || '') || !Number.isSafeInteger(p.version) || p.version < 1 || !['CFB','NFL'].includes(p.league)) throw Error('Invalid publication identity.');
  if (!Array.isArray(p.records) || !p.records.length || p.records.length > 1000) throw Error('Publish between 1 and 1000 broadcast records.');
  const seen = new Set<string>();
  const records = p.records.map(r => {
    if (!r || r.league !== p.league || typeof r.event_id !== 'string' || !/^\d{1,15}$/.test(r.event_id) || Number(r.event_id) < 1 || seen.has(r.event_id)) throw Error('Invalid or duplicate event identity.');
    seen.add(r.event_id);
    if (typeof r.event_date !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(r.event_date) || !Number.isFinite(Date.parse(r.event_date))) throw Error('Invalid kickoff timestamp.');
    for (const key of ['away_team','home_team','source_date','source_matchup'] as const) if (typeof r[key] !== 'string' || !r[key].trim() || r[key].length > 300) throw Error('Missing or invalid ' + key + '.');
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(r.source_date) || typeof r.source_time !== 'string' || (r.source_time!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.source_time))) throw Error('Invalid source date/time.');
    for (const key of ['dazn','disney_plus','sky_sports','channel_5'] as const) if (typeof r[key] !== 'boolean') throw Error('All platform flags must be explicit booleans.');
    return {league:r.league,event_id:r.event_id,event_date:new Date(r.event_date).toISOString(),away_team:r.away_team,home_team:r.home_team,source_date:r.source_date,source_time:r.source_time,source_matchup:r.source_matchup,dazn:r.dazn,disney_plus:r.disney_plus,sky_sports:r.sky_sports,channel_5:r.channel_5};
  });
  return {feed_id:p.feed_id,version:p.version,league:p.league,records};
}
