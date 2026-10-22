import { CFB_CARD_METRICS, type CardMetricKey, type CfbMetrics } from './cfb-card-metrics';
import { NFL_METRICS, NFL_RATES, type Metric, type Category, type MetricKey, type Period } from './nfl-statlines';
import type { EspnEvent, EspnSummary } from './nfl-source-types';

export type CfbMembership = { season: number; teamId: string; conferenceId: string; conferenceName: string };
export type CfbPosition = { season: number; teamId: string; athleteId: string; position: string };
type Fact = { id: string; name: string; team: string; opponent: string; gameId: string; week: number; kickoff: string; observedAt: string; position: string | null; playingNow: boolean; categories: Category[]; metrics: CfbMetrics };
const missing = (): Metric => ({ state: 'missing', value: null });
const cell = (raw: unknown, key?: CardMetricKey): Metric => {
  if (typeof raw !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(raw.replaceAll(',', ''))) return missing();
  const value = Number(raw.replaceAll(',', ''));
  return Number.isFinite(value) && (key?.endsWith('yards') || key?.endsWith('_long') || value >= 0) && Number.isSafeInteger(value * (key === 'def_sacks' || key === 'def_tackles_for_loss' ? 2 : 1)) ? { state: 'value', value } : missing();
};
const columns: Record<string, Record<string, CardMetricKey>> = {
  passing: { YDS: 'passing_yards', TD: 'passing_tds', INT: 'passing_interceptions' },
  rushing: { LONG: 'rushing_long', CAR: 'carries', YDS: 'rushing_yards', TD: 'rushing_tds' },
  receiving: { LONG: 'receiving_long', REC: 'receptions', YDS: 'receiving_yards', TD: 'receiving_tds', TGTS: 'targets' },
  defensive: { 'QB HUR': 'def_qb_hurries', TD: 'def_tds', TOT: 'tackles', SOLO: 'def_tackles_solo', AST: 'def_tackle_assists', SACKS: 'def_sacks', TFL: 'def_tackles_for_loss', PD: 'def_pass_defended' },
  interceptions: { INT: 'def_interceptions' },
};
const category = (name: string): Category => name === 'passing' ? 'QB' : name === 'rushing' ? 'Rush' : name === 'receiving' ? 'Rec' : 'Def';
function aggregate(facts: readonly Fact[]): CfbMetrics {
  const metrics = Object.fromEntries([...Object.keys(NFL_METRICS), ...Object.keys(CFB_CARD_METRICS), 'tackles'].map(key => {
    const values = facts.map(fact => fact.metrics[key as CardMetricKey]);
    const total = key === 'rushing_long' || key === 'receiving_long'
      ? Math.max(...values.map(value => value?.state === 'value' ? value.value : -Infinity))
      : values.reduce((sum, value) => sum + (value?.value ?? 0), 0);
    return [key, values.length && values.every(value => value?.state === 'value') && Number.isSafeInteger(total * 2) ? { state: 'value', value: total } : missing()];
  })) as CfbMetrics;
  for (const [key, [, , numerator, denominator, scale]] of Object.entries(NFL_RATES)) {
    const a = metrics[numerator], b = metrics[denominator];
    metrics[key as MetricKey] = a.state !== 'value' || b.state !== 'value' || b.value < 0 || ((key === 'completion_pct' || key === 'catch_pct') && a.value > b.value) ? missing()
      : b.value === 0 ? { state: 'not-applicable', value: null } : { state: 'value', value: a.value / b.value * scale };
  }
  return metrics;
}
/** ESPN identities stay namespaced. NCAA rows require an independently verified
 * crosswalk before joining this model; equal names are never evidence. */
export function buildCfbStatlines(input: { period: Period; observedAt: string; events: readonly EspnEvent[]; summaries: readonly (EspnSummary | null)[]; positions?: readonly CfbPosition[]; memberships?: readonly CfbMembership[] }) {
  const { period } = input, warnings = new Set<string>();
  const positionIndex=new Map<string,Set<string>>();
  for(const row of input.positions??[])if(row.season===period.season){const key=`${row.teamId}:${row.athleteId}`;if(!positionIndex.has(key))positionIndex.set(key,new Set());positionIndex.get(key)!.add(row.position);}
  const teamContext: {gameId:string;teamId:string;providerId:string;category:string;labels:string[];stats:unknown[]}[]=[];
  const facts = new Map<string, Fact>(), rejected = new Set<string>(), teams: Record<string, { name: string; logo: string | null; conferenceId: string | null; conferenceName: string | null }> = {};
  const gameCounts = new Map<string, number>();
  for (const event of input.events) if (event.id) gameCounts.set(event.id, (gameCounts.get(event.id) ?? 0) + 1);
  input.events.forEach((event, index) => {
    if (event.season?.year !== period.season || event.season.type !== (period.phase === 'REG' ? 2 : 3)) { warnings.add('Excluded a game from another season or phase'); return; }
    const week = (event as EspnEvent & { week?: { number?: number } }).week?.number;
    if (!Number.isSafeInteger(week) || !week || (period.week !== null && week !== period.week)) { warnings.add('Excluded a game with a different or unknown week'); return; }
    if (!/^[1-9]\d*$/.test(event.id ?? '') || gameCounts.get(event.id!) !== 1) { warnings.add('Duplicate or invalid game identity'); return; }
    const competition = event.competitions?.[0], participants = competition?.competitors ?? [], summary = input.summaries[index];
    if(competition?.id===event.id&&competition?.status?.type?.state==='pre'&&!competition.status.type.completed&&Date.parse(event.date??'')>Date.parse(input.observedAt)&&participants.length===2&&new Set(participants.map(p=>p.team?.id)).size===2&&participants.every(p=>/^[1-9]\d*$/.test(p.team?.id??'')))return;
    if (!competition || participants.length !== 2 || new Set(participants.map(p => p.team?.id)).size !== 2 || !Number.isFinite(Date.parse(event.date ?? '')) || !summary || summary.header?.id !== event.id || summary.header?.competitions?.[0]?.id !== event.id || participants.some(p => !/^[1-9]\d*$/.test(p.team?.id ?? '') || summary.header?.competitions?.[0]?.competitors?.filter(s => s.team?.id === p.team?.id && s.homeAway === p.homeAway).length !== 1)) { warnings.add('Game identity or boxscore unavailable'); return; }
    const state = competition.status?.type;
    if (!state || !['in', 'post'].includes(state.state ?? '') || (state.state === 'post' && !state.completed)) return;
    if (Date.parse(event.date!) > Date.parse(input.observedAt)) { warnings.add('Game kickoff is after observation'); return; }
    for (const participant of participants) {
      const team = participant.team!, matches = (input.memberships ?? []).filter(row => row.season === period.season && row.teamId === team.id);
      const affiliations = new Set(matches.map(row => row.conferenceId));
      teams[team.id!] = { name: team.displayName ?? `Team ${team.id}`, logo: team.logo?.startsWith('https://a.espncdn.com/') ? team.logo : null, conferenceId: affiliations.size === 1 ? matches[0].conferenceId : null, conferenceName: affiliations.size === 1 ? matches[0].conferenceName : null };
    }
    for (const box of summary.boxscore?.players ?? []) {
      const team = box.team?.id, own = participants.filter(p => p.team?.id === team);
      if (own.length !== 1) { warnings.add('Boxscore team identity mismatch'); continue; }
      if (box.team?.logo?.startsWith('https://a.espncdn.com/')) teams[team!].logo = box.team.logo;
      for (const group of box.statistics ?? []) {
        if (!columns[group.name ?? '']) continue;
        const seen = new Set<string>();
        for (const athlete of group.athletes ?? []) {
          const id = athlete.athlete?.id;
          if (/^-\d+$/.test(id??'') && athlete.athlete?.displayName?.trim()==='Team') { teamContext.push({gameId:event.id!,teamId:team!,providerId:id!,category:group.name!,labels:group.labels??[],stats:athlete.stats??[]});continue; }
          if (!/^[1-9]\d*$/.test(id ?? '') || !athlete.athlete?.displayName) { warnings.add('Player identity unavailable'); continue; }
          const key = `${event.id}:${id}`, duplicate = seen.has(id!); seen.add(id!);
          if (duplicate) { rejected.add(key); warnings.add('Duplicate player facts withheld'); continue; }
          const positions = new Set([athlete.athlete?.position?.abbreviation, ...(positionIndex.get(`${team}:${id}`)??[])].filter(Boolean));
          let fact = facts.get(key);
          if (fact && fact.team !== team) { rejected.add(key); warnings.add('Conflicting team identity withheld'); continue; }
          if (!fact) { fact = { id: `espn:cfb:athlete:${id}`, name: athlete.athlete!.displayName!, team: team!, opponent: participants.find(p => p.team?.id !== team)!.team!.id!, gameId: `espn:cfb:game:${event.id}`, week: week!, kickoff: event.date!, observedAt: input.observedAt, position: positions.size === 1 ? [...positions][0]! : null, playingNow: state.state === 'in', categories: [], metrics: Object.fromEntries([...Object.keys(NFL_METRICS), ...Object.keys(CFB_CARD_METRICS), ...Object.keys(NFL_RATES), 'tackles'].map(k => [k, missing()])) as CfbMetrics }; facts.set(key, fact); }
          if (positions.size > 1) { fact.position = null; fact.categories = fact.categories.filter(c => c !== 'QB'); warnings.add('Conflicting player position'); }
          const cat = category(group.name!);
          (group.labels ?? []).forEach((label, i) => {
            const raw = athlete.stats?.[i];
            if (label === 'C/ATT' && typeof raw === 'string' && /^\d+\/\d+$/.test(raw)) { const [a,b] = raw.split('/'); fact!.metrics.completions = cell(a); fact!.metrics.attempts = cell(b); }
            else if (columns[group.name!][label]) fact!.metrics[columns[group.name!][label]] = cell(raw, columns[group.name!][label]);
          });
          if (cat === 'QB' && !fact.position) warnings.add('Passing player without a verified QB position excluded from QB');
          // A supplied activity row establishes eligibility without a participation threshold.
          if ((cat !== 'QB' || fact.position === 'QB') && !fact.categories.includes(cat)) fact.categories.push(cat);
          fact.metrics = aggregate([fact]);
        }
      }
    }
  });
  const byPlayer = new Map<string, Fact[]>();
  for (const [key, fact] of facts) if (!rejected.has(key)) { if (!byPlayer.has(fact.id)) byPlayer.set(fact.id, []); byPlayer.get(fact.id)!.push(fact); }
  const lines = [...byPlayer].map(([id, games]) => {
    games.sort((a,b) => a.week-b.week || a.gameId.localeCompare(b.gameId));
    const ownTeams = [...new Set(games.map(g => g.team))];
    const cats = (facts: Fact[]) => [...new Set(facts.flatMap(f => f.categories))];
    return { id, identity: { key: id, espnId: id.split(':').at(-1), ncaaId: null }, name: games.at(-1)!.name, teams: ownTeams, playingNow: games.some(g => g.playingNow), categories: cats(games), metrics: aggregate(games), games,
      stints: ownTeams.map(team => { const own = games.filter(g => g.team === team); return { team, categories: cats(own), metrics: aggregate(own), conferenceId: teams[team]?.conferenceId ?? null }; }) };
  });
  return { period, checkedAt: input.observedAt, complete: false as const, coverage: 'supplied-games-only' as const, issues: [...warnings], teamContext, teams, lines };
}

/** Filter the player's own team contributions, never their opponent or their last team. */
export function filterCfbConference(model: ReturnType<typeof buildCfbStatlines>, conferenceId: string) {
  return model.lines.flatMap(line => {
    const stints = line.stints.filter(stint => stint.conferenceId === conferenceId);
    if (!stints.length) return [];
    const games = line.games.filter(game => stints.some(stint => stint.team === game.team));
    return [{ ...line, teams: stints.map(s => s.team), stints, games, categories: [...new Set(games.flatMap(g => g.categories))], metrics: aggregate(games) }];
  });
}
