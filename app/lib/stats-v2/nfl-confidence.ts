import { createNflIdentityIndex, type SourceRow } from './nfl-identity';
import { nflTeamCode, NFL_METRICS, NFL_RATES, NFL_DERIVED, type Foundation, type MetricKey, type Category } from './nfl-statlines';
import type { NflLiveSource } from './nfl-source-types';
import { validateNflRankingSelection } from './nfl-export';

export type MetricConfidence = { status: 'verified' | 'incomplete' | 'unverified'; reasons: string[]; expectedGames: number; verifiedGames: number };
export type RankingConfidence = Record<Category, Partial<Record<MetricKey, MetricConfidence>>>;
const fields: Record<string, Record<string, MetricKey>> = {
  passing: { YDS: 'passing_yards', TD: 'passing_tds', INT: 'passing_interceptions', CMP: 'completions', ATT: 'attempts' },
  rushing: { CAR: 'carries', YDS: 'rushing_yards', TD: 'rushing_tds' },
  receiving: { REC: 'receptions', TGTS: 'targets', YDS: 'receiving_yards', TD: 'receiving_tds' },
  defensive: { TOT: 'tackles', SOLO: 'def_tackles_solo', AST: 'def_tackle_assists', SACKS: 'def_sacks', TFL: 'def_tackles_for_loss', PD: 'def_pass_defended', INT: 'def_interceptions', FF: 'def_fumbles_forced', TD: 'def_tds', 'QB HTS': 'def_qb_hits' },
};
const keys = [...Object.keys(NFL_METRICS), ...Object.keys(NFL_RATES), ...Object.keys(NFL_DERIVED)] as MetricKey[];
const categoryOf = (name: string): Category => name === 'passing' ? 'QB' : name === 'rushing' ? 'Rush' : name === 'receiving' ? 'Rec' : 'Def';
const number = (v: unknown) => typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v.replaceAll(',', '')) ? Number(v.replaceAll(',', '')) : null;

/** Independent, category/metric-scoped evidence. A clean parsed CSV alone is not league coverage. */
export function certifyNflRankings(model: Foundation, roster: readonly SourceRow[], schedule: readonly SourceRow[], live: NflLiveSource | null, now: number, history: readonly NflLiveSource[] = []): RankingConfidence {
  const result = Object.fromEntries((['QB','Rush','Rec','Def'] as Category[]).map(category => [category, {}])) as RankingConfidence;
  const currentWeek = live?.scoreboard.week?.number;
  const sources = [...history, ...(live ? [live] : [])];
  const observedGames = new Map(sources.flatMap(source => (source.scoreboard.events ?? []).map((event,index) => [event.id,{source,event,index}] as const)));
  const cutoff = currentWeek ?? model.period.week;
  const expected = schedule.filter(row => row.season === String(model.period.season) && row.game_type === model.period.phase && (model.period.week === null ? Boolean(cutoff && Number(row.week) <= cutoff) : Number(row.week) === model.period.week));
  const fresh = Number.isSafeInteger(currentWeek) && currentWeek! >= 1 && currentWeek! <= 18 && live && live.observedAt <= now && now - live.observedAt <= 60_000 && live.scoreboard.season?.year === model.period.season && live.scoreboard.season.type === 2;
  // Rankings are period-to-date: a proven future fixture has no statistics yet.
  // A scheduled game whose kickoff has passed is deliberately NOT excluded.
  for(let i=expected.length-1;i>=0;i--){
    const row=expected[i], matches=(live?.scoreboard.events??[]).filter(event=>event.id===row.espn), event=matches[0], competition=event?.competitions?.[0], participants=competition?.competitors??[];
    if(fresh&&/^[1-9]\d*$/.test(row.espn??'')&&matches.length===1&&new Set(participants.map(p=>p.team?.id)).size===2&&competition?.id===event.id&&Boolean(nflTeamCode(row.home_team)&&nflTeamCode(row.away_team)&&row.home_team!==row.away_team)&&participants.every(p=>/^[1-9]\d*$/.test(p.team?.id??''))&&Number(row.week)===currentWeek&&event.season?.year===model.period.season&&event.season.type===2&&competition?.status?.type?.state==='pre'&&!competition.status.type.completed&&Date.parse(event.date??'')>now&&participants.length===2&&nflTeamCode(participants.find(p=>p.homeAway==='home')?.team?.abbreviation)===nflTeamCode(row.home_team)&&nflTeamCode(participants.find(p=>p.homeAway==='away')?.team?.abbreviation)===nflTeamCode(row.away_team))expected.splice(i,1);
  }
  const throughWeek=Math.max(0,...expected.map(row=>Number(row.week)));
  const expectedIds=new Set(expected.map(row=>`nflverse:game:${row.game_id}`));
  const identities = createNflIdentityIndex(roster, model.period.season);
  const facts = new Map(model.lines.flatMap(line => line.games.map(game => [`${game.gameId}:${line.identity.key}`, { line, game }] as const)));
  for (const category of ['QB','Rush','Rec','Def'] as Category[]) for (const metric of keys) {
    try { validateNflRankingSelection({ category, statistic: metric }); } catch { continue; }
    const reasons = new Set<string>(); let verifiedGames = 0;
    // Certification rechecks every athlete and metric against both independent
    // team boxscores. A rejected defensive fact must not invalidate passing.
    if (!fresh || !cutoff || (model.period.week !== null && model.period.week > cutoff)) reasons.add('Fresh period and current-week cutoff unavailable');
    if (model.lines.filter(line=>line.categories.includes(category)).some(line=>line.games.some(game=>!expectedIds.has(game.gameId)))) reasons.add('Player records extend beyond the verified period');
    if (model.period.week === null && cutoff && Array.from({length:throughWeek},(_,i)=>i+1).some(week=>!expected.some(row=>Number(row.week)===week))) reasons.add('A prior-week schedule is missing');
    if (!expected.length || new Set(expected.map(g => g.game_id)).size !== expected.length || new Set(expected.map(g => g.espn)).size !== expected.length) reasons.add('Expected game coverage is missing or ambiguous');
    if (!reasons.size) for (const scheduled of expected) {
      const selected = observedGames.get(scheduled.espn);
      const source = selected?.source;
      const events = source?.scoreboard.events ?? [], matches = events.map((event, index) => ({ event, index })).filter(({ event }) => event.id === scheduled.espn);
      if (!source || source.observedAt > now || now-source.observedAt >= (source === live ? 60_000 : 300_000) || source.scoreboard.season?.year !== model.period.season || source.scoreboard.season.type !== 2 || source.scoreboard.week?.number !== Number(scheduled.week)) { reasons.add('A required weekly source is unavailable or expired'); continue; }
      if (matches.length !== 1) { reasons.add('An expected game has no unique current observation'); continue; }
      const { event, index } = matches[0], competition = event.competitions?.[0], competitors = competition?.competitors ?? [];
      if (!['in', 'post'].includes(competition?.status?.type?.state ?? '') || (competition?.status?.type?.state === 'post' && !competition.status.type.completed)) { reasons.add('The selected week still contains unplayed games'); continue; }
      const kickoff = Date.parse(event.date ?? '');
      const home = competitors.find(c => c.homeAway === 'home'), away = competitors.find(c => c.homeAway === 'away');
      const summary = source.summaries[index];
      if (!Number.isFinite(kickoff) || kickoff > now || (competition?.status?.type?.state === 'in' && now - kickoff > 86400000) || event.season?.year !== model.period.season || event.season.type !== 2 || competitors.length !== 2 ||
          nflTeamCode(home?.team?.abbreviation) !== nflTeamCode(scheduled.home_team) || nflTeamCode(away?.team?.abbreviation) !== nflTeamCode(scheduled.away_team) ||
          !summary || summary.header?.id !== event.id || summary.header?.competitions?.[0]?.id !== event.id ||
          competitors.some(c => summary.header?.competitions?.[0]?.competitors?.filter(h => h.team?.id === c.team?.id && h.homeAway === c.homeAway).length !== 1)) { reasons.add('Game identity, cutoff or boxscore could not be validated'); continue; }
      const labels = metric in NFL_RATES ? NFL_RATES[metric as keyof typeof NFL_RATES].slice(2,4) as MetricKey[] : [metric];
      const seen = new Set<string>(); let valid = true, boxes = 0;
      for (const box of summary.boxscore?.players ?? []) {
        const competitor = competitors.filter(c => c.team?.id === box.team?.id);
        if (competitor.length !== 1) { valid = false; continue; }
        const groups = (box.statistics ?? []).filter(group => categoryOf(group.name ?? '') === category && Boolean(fields[group.name ?? '']));
        if (!groups.length) { valid = false; continue; } boxes++;
        for (const group of groups) for (const athlete of group.athletes ?? []) {
          const id = identities.resolve('espn', athlete.athlete?.id ?? '');
          if (!id?.gsisId) { valid = false; continue; }
          const fact = facts.get(`nflverse:game:${scheduled.game_id}:${id.key}`);
          if (!fact || fact.game.team !== nflTeamCode(competitor[0].team?.abbreviation)) { valid = false; continue; }
          if (category === 'QB' && fact.game.position !== 'QB') { if (!fact.game.position) valid = false; continue; }
          seen.add(id.key); const observed: Partial<Record<MetricKey, number | null>> = {};
          (group.labels ?? []).forEach((label, i) => {
            const raw = athlete.stats?.[i];
            if (label === 'C/ATT' && typeof raw === 'string' && /^\d+\/\d+$/.test(raw)) { const [a,b] = raw.split('/').map(Number); observed.completions = a; observed.attempts = b; }
            else if (fields[group.name ?? ''][label]) observed[fields[group.name ?? ''][label]] = number(raw);
          });
          for (const key of labels) if (observed[key] == null || fact.game.metrics[key].state !== 'value' || fact.game.metrics[key].value !== observed[key]) valid = false;
        }
      }
      for (const line of model.lines.filter(line => line.categories.includes(category))) for (const game of line.games.filter(game => game.gameId === `nflverse:game:${scheduled.game_id}`)) {
        if (!seen.has(line.identity.key) && (labels.some(key => game.metrics[key].state === 'value' && game.metrics[key].value !== 0) || category === 'Def')) valid = false;
      }
      if (valid && boxes === 2 && seen.size) verifiedGames++; else reasons.add('Player identity, field coverage or values do not agree with the independent boxscore');
    }
    result[category][metric] = { status: !reasons.size && verifiedGames === expected.length ? 'verified' : !fresh || (model.period.week === null && !history.length) ? 'unverified' : 'incomplete', reasons: [...reasons], expectedGames: expected.length, verifiedGames };
  }
  return result;
}
