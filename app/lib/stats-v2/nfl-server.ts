import { loadNflHistorySources } from './nfl-history-source';
import { certifyNflRankings } from './nfl-confidence';
import { createNflIdentityIndex } from './nfl-identity';
import { loadNflverseSnapshot, parseWeeklyPlayers } from '../nflverse-snapshots';
import { loadNflStatsV2LiveSource } from '../../api/nfl/live-stats';
import { buildNflStatlines, nflTeamCode, type Period, type Foundation, type Category, type MetricKey, NFL_METRICS, NFL_RATES, NFL_DERIVED } from './nfl-statlines';
import { reconcileNflSources } from './nfl-reconcile';
import { projectNflRanking, validateNflRankingSelection } from './nfl-export';
import { parseNflSourceCsv, parseNflIdentityPairs } from './nfl-source-csv';

export class NflStatsV2Error extends Error {
  constructor(message: string, public status: number) { super(message); }
}
type Selection = { mode: 'weekly' | 'season'; week: number | null; live: boolean };
type Snapshot = Awaited<ReturnType<typeof loadNflverseSnapshot>>;
function fresh(snapshot: Snapshot | null, now: number): snapshot is Snapshot {
  return Boolean(snapshot?.ok && Number.isFinite(snapshot.observedAt) && snapshot.observedAt <= now &&
    Number.isFinite(snapshot.expiresAt) && snapshot.expiresAt > now && now - snapshot.observedAt < 300_000 &&
    snapshot.expiresAt <= snapshot.observedAt + 300_000);
}
const metadata = (snapshot: Snapshot) => ({ firstObservedAt: new Date(snapshot.firstObservedAt ?? snapshot.observedAt).toISOString(), observedAt: new Date(snapshot.observedAt).toISOString(), expiresAt: new Date(snapshot.expiresAt).toISOString(), upstreamUpdatedAt: null });

/** Active builds only; no live TTL or persistent response cache. Published
 * derivations are bounded and scoped to exact source objects. */
export function createNflStatsV2Service(dependencies: {
  snapshot?: typeof loadNflverseSnapshot; live?: typeof loadNflStatsV2LiveSource;
  now?: () => number; build?: typeof buildNflStatlines; history?: typeof loadNflHistorySources;
} = {}) {
  const snapshot = dependencies.snapshot ?? loadNflverseSnapshot, liveSource = dependencies.live ?? loadNflStatsV2LiveSource;
  const now = dependencies.now ?? Date.now, build = dependencies.build ?? buildNflStatlines;
  const published = new WeakMap<object, WeakMap<object, Map<string, Foundation>>>();
  const noRoster: Record<string, string>[] = [];
  const linkedRosters = new WeakMap<object, WeakMap<object, Map<string, Record<string, string>[]>>>();
  const pending = new Map<string, Promise<Awaited<ReturnType<typeof compute>>>>();
  async function compute(selection: Selection) {
    const [playerResult, rosterResult, scheduleResult, liveResult] = await Promise.allSettled([
      snapshot('player', 'weekly', parseWeeklyPlayers),
      snapshot('roster', 'stats-v2', parseNflSourceCsv),
      selection.live ? snapshot('schedule', 'stats-v2', parseNflSourceCsv) : Promise.resolve(null),
      selection.live ? liveSource() : Promise.resolve(null),
    ]);
    let time = now();
    if (playerResult.status !== 'fulfilled' || !fresh(playerResult.value, time)) throw new NflStatsV2Error('Published NFL snapshot unavailable or expired', 503);
    const players = playerResult.value;
    const roster = rosterResult.status === 'fulfilled' && fresh(rosterResult.value, time) ? rosterResult.value : null;
    const schedule = scheduleResult.status === 'fulfilled' && fresh(scheduleResult.value, time) ? scheduleResult.value : null;
    const live = liveResult.status === 'fulfilled' ? liveResult.value : null;
    const liveWeek = live && live.observedAt <= time && time - live.observedAt <= 60_000 && live.scoreboard.season?.year === 2026 && live.scoreboard.season.type === 2 ? live.scoreboard.week?.number : null;
    const weeks = players.rows.map(row => Number(row.week)).filter(week => Number.isSafeInteger(week) && week > 0 && week <= 18);
    const week = selection.mode === 'season' ? null : selection.week ?? liveWeek ?? Math.max(0, ...weeks);
    if (week !== null && (!Number.isSafeInteger(week) || week < 1 || week > 18)) throw new NflStatsV2Error('No verified regular-season week', 503);
    const period: Period = { season: 2026, phase: 'REG', week };
    const warnings: string[] = [];
    let history: Awaited<ReturnType<typeof loadNflHistorySources>> = [];
    if (selection.live && liveWeek && (week === null || week < liveWeek)) {
      const needed = week === null ? Array.from({length:liveWeek-1},(_,i)=>i+1) : [week];
      try { history = await (dependencies.history ?? (dependencies.snapshot ? async()=>[] : loadNflHistorySources))(needed); } catch { warnings.push('Earlier-week independent verification unavailable'); }
      time = now();
    }
    let identitySnapshot: Snapshot | null = null;
    let rosterRows = roster?.rows ?? noRoster;
    // The public register is a fallback for explicit IDs only. Names, teams and
    // positions from a seasonless register must never establish current eligibility.
    const index = createNflIdentityIndex(rosterRows, 2026);
    const unknownIds = new Set([...history, ...(live ? [live] : [])].flatMap(source=>source.summaries).flatMap(summary => summary?.boxscore?.players?.flatMap(team => team.statistics?.flatMap(group => group.athletes?.flatMap(player => { const id = player.athlete?.id ?? ''; return /^[1-9]\d*$/.test(id) && !index.resolve('espn', id)?.gsisId ? [id] : []; }) ?? []) ?? []) ?? []) ?? []);
    if (selection.live && unknownIds.size) {
      try {
        const candidate = await snapshot('identity', 'stats-v2', parseNflIdentityPairs);
        time = now();
        if (fresh(candidate, time)) {
          identitySnapshot = candidate;
          let byRegister = linkedRosters.get(rosterRows);
          if (!byRegister) { byRegister = new WeakMap(); linkedRosters.set(rosterRows, byRegister); }
          let selections = byRegister.get(candidate.rows);
          if (!selections) { selections = new Map(); byRegister.set(candidate.rows, selections); }
          const selectionKey = JSON.stringify([...unknownIds].sort());
          let linked = selections.get(selectionKey);
          if (!linked) {
            linked = [...rosterRows, ...candidate.rows.filter(row => unknownIds.has(row.espn_id ?? '') && /^00-\d{7}$/.test(row.gsis_id ?? '') && /^[1-9]\d*$/.test(row.espn_id ?? '')).map(row => ({ season: '2026', gsis_id: row.gsis_id!, espn_id: row.espn_id! }))];
            if (selections.size >= 16) selections.delete(selections.keys().next().value!);
            selections.set(selectionKey, linked);
          }
          rosterRows = linked;
        } else warnings.push('Explicit player identity register unavailable');
      } catch { warnings.push('Explicit player identity register unavailable'); }
    }
    if (!fresh(players, time)) throw new NflStatsV2Error('Published NFL snapshot expired during identity lookup', 503);
    if (!roster) warnings.push('Roster unavailable: ESPN identity reconciliation withheld');
    if (!schedule && selection.live) warnings.push('Schedule unavailable: live game reconciliation withheld');
    const reconciled = selection.live
      ? reconcileNflSources(players.rows, rosterRows, schedule?.rows ?? [], period, roster && schedule ? live : null, time)
      : { rows: players.rows, issues: [], playing: new Set<string>(), observed: new Set<string>(), replaced: new Set<string>(), replacedPlayers:new Set<string>(), liveVerified: false };
    warnings.push(...reconciled.issues);
    const checkedAt = new Date(time).toISOString();
    let foundation: Foundation;
    if (reconciled.replaced.size) foundation = { ...build(reconciled.rows, period, checkedAt, rosterRows), source: 'nflverse-with-espn' };
    else {
      let byRoster = published.get(players.rows);
      if (!byRoster) { byRoster = new WeakMap(); published.set(players.rows, byRoster); }
      let byPeriod = byRoster.get(rosterRows);
      if (!byPeriod) { byPeriod = new Map(); byRoster.set(rosterRows, byPeriod); }
      const key = String(week);
      let cached = byPeriod.get(key);
      if (!cached) {
        cached = build(players.rows, period, metadata(players).observedAt, rosterRows);
        if (byPeriod.size >= 32) byPeriod.delete(byPeriod.keys().next().value!);
        byPeriod.set(key, cached);
      }
      foundation = cached;
    }
    const model = { ...foundation, checkedAt,
      complete: foundation.complete && (!selection.live || warnings.length === 0),
      lines: foundation.lines.map(line => {
        let annotated: (typeof line.games[number] & { source: string })[] | undefined;
        return { ...line,
        playingNow: !selection.live ? null : reconciled.observed.has(line.identity.key) ? reconciled.playing.has(line.identity.key)
          : reconciled.liveVerified && !warnings.length ? false : null,
        get games() {
          return annotated ??= line.games.map(game => ({ ...game, source: reconciled.replacedPlayers.has(`${game.gameId}:${line.identity.key}`) ? 'espn-observed' : 'nflverse-published' }));
        },
      }; }),
    };
    const logos: Record<string, string> = {};
    // Branding is supplied metadata, never an extra image/standings request.
    if (reconciled.liveVerified) for (const event of live?.scoreboard.events ?? []) for (const competitor of event.competitions?.[0]?.competitors ?? []) {
      const team = competitor.team;
      const code = nflTeamCode(team?.abbreviation);
      if (code && team?.logo?.startsWith('https://a.espncdn.com/')) logos[code] = team.logo;
    }
    // Details reuse this exact source snapshot; never download a week per card.
    // Index lazily so ordinary 30-second leaderboard checks do no extra history work.
    let historyRows: Map<string, typeof reconciled.rows> | undefined;
    const playerHistories = new Map<string, Foundation['lines'][number]['games']>();
    const historyCutoff = week ?? liveWeek ?? Math.max(0, ...weeks);
    function playerHistory(id: string) {
      if (!historyRows) {
        historyRows = new Map();
        const identities = createNflIdentityIndex(rosterRows, period.season);
        for (const row of reconciled.rows) {
          if (row.season !== String(period.season) || row.season_type !== period.phase || !/^[1-9]\d*$/.test(row.week ?? '') || Number(row.week) > historyCutoff) continue;
          const key = identities.resolve('gsis', row.player_id ?? '')?.key;
          if (!key) continue;
          const playerId = `nfl:${period.season}:${period.phase}:${key}`;
          const records = historyRows.get(playerId) ?? []; records.push(row); historyRows.set(playerId, records);
        }
      }
      let games = playerHistories.get(id);
      if (!games) {
        // Existing validation handles exact identities, transfers and conflicting duplicates.
        games = buildNflStatlines(historyRows.get(id) ?? [], { ...period, week: null }, checkedAt, rosterRows).lines.find(line => line.id === id)?.games ?? [];
        games = games.slice(-5).reverse().map(game => ({ ...game, source: reconciled.replacedPlayers.has(`${game.gameId}:${id.split(':').slice(3).join(':')}`) ? 'espn-observed' : 'nflverse-published' }));
        if (playerHistories.size >= 20) playerHistories.delete(playerHistories.keys().next().value!);
        playerHistories.set(id, games);
      }
      return games;
    }
    const confidence = certifyNflRankings(foundation, rosterRows, schedule?.rows ?? [], live, time, history);
    return { version: 1, observationAt: checkedAt, confidence, playerHistory,
      sourceAttribution:selection.mode==='season'?`nflverse published player-game records through reported Week ${Math.max(0,...weeks)}${liveWeek?` + ESPN Week ${liveWeek} observations (in-progress games provisional; published finals take precedence)`:''}`:undefined,
      sources: { history:history.map(source=>({week:source.scoreboard.week?.number,observedAt:new Date(source.observedAt).toISOString(),expiresAt:new Date(source.observedAt+300_000).toISOString()})), identity: identitySnapshot ? metadata(identitySnapshot) : null, player: metadata(players), roster: roster ? metadata(roster) : null, schedule: schedule ? metadata(schedule) : null,
        live: { status: !selection.live ? 'disabled' : reconciled.liveVerified ? warnings.length ? 'partial' : 'verified' : 'unavailable',
          observedAt: live && Number.isFinite(live.observedAt) ? new Date(live.observedAt).toISOString() : null, maxAgeMs: 60_000 } },
      coverage: { scope: 'supplied-records-only', upstreamPublicationTimeKnown: false, warnings: [...warnings, ...foundation.issues] }, model, logos };
  }
  return function load(selection: Selection) {
    const key = JSON.stringify(selection);
    let operation = pending.get(key);
    if (!operation) {
      if (pending.size >= 16) throw new NflStatsV2Error('Too many distinct active statistical selections', 503);
      operation = compute(selection).finally(() => pending.delete(key)); pending.set(key, operation);
    }
    return operation;
  };
}
export const loadNflStatsV2 = createNflStatsV2Service();

// Bounded immutable detail observations. Export expiry remains strict; leader refreshes always invoke the loader.
// Bounded per instance; a missing token requires a fresh leaderboard, never a name join.
const categoryMetrics = Object.fromEntries((['QB', 'Rush', 'Rec', 'Def'] as Category[]).map(category => [category, [...Object.keys(NFL_METRICS), ...Object.keys(NFL_RATES), ...Object.keys(NFL_DERIVED)].filter(key => { try { validateNflRankingSelection({ category, statistic: key as MetricKey }); return true; } catch { return false; } })])) as Record<Category, MetricKey[]>;
const leaderProjections = new WeakMap<object, Map<Category, unknown>>();
const observations = new Map<string, { result: Awaited<ReturnType<typeof loadNflStatsV2>>; load: typeof loadNflStatsV2; live: boolean; selection: string; expiresAt: number }>();

export async function respondNflStatsV2(request: Request, load = loadNflStatsV2, now: () => number = Date.now): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' };
  try {
    const params = new URL(request.url).searchParams;
    const allowed = ['snapshot', 'players', 'mode', 'season', 'week', 'live', 'view', 'offset', 'limit', 'category', 'statistic', 'direction', 'team'];
    if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) throw new NflStatsV2Error('Unknown or repeated selection parameter', 400);
    const mode = params.get('mode') ?? 'weekly', rawWeek = params.get('week'), rawLive = params.get('live') ?? '1', view = params.get('view') ?? 'data';
    if (!['weekly', 'season'].includes(mode) || !['0', '1'].includes(rawLive) || !['data', 'export', 'leaders', 'details'].includes(view) ||
      (params.has('season') && params.get('season') !== '2026') || (mode === 'season' && rawWeek !== null) ||
      (rawWeek !== null && (!/^[1-9]\d*$/.test(rawWeek) || Number(rawWeek) > 18))) throw new NflStatsV2Error('Unsupported period/selection', 400);
    const integer = (key: string, fallback: number, max: number, min: number) => {
      const raw = params.get(key); if (raw === null) return fallback;
      const n = Number(raw); if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) throw new NflStatsV2Error('Invalid pagination', 400);
      return n;
    };
    const offset = integer('offset', 0, 10000, 0), limit = integer('limit', view === 'export' ? 10 : 25, view === 'export' ? 100 : 50, 1);
    if ((view === 'data' && ['category', 'statistic', 'direction', 'team'].some(k => params.has(k))) || (view === 'export' && params.has('offset'))) throw new NflStatsV2Error('Incompatible view parameters', 400);
    const exportSelection = { category: params.get('category') as Category, statistic: params.get('statistic') as MetricKey,
      direction: (params.get('direction') ?? 'desc') as 'asc' | 'desc', team: params.get('team') ?? undefined, limit };
    if (view === 'export') {
      try { validateNflRankingSelection(exportSelection); }
      catch { throw new NflStatsV2Error('Invalid export selection', 400); }
    }
    if (view === 'leaders' && (!['QB', 'Rush', 'Rec', 'Def'].includes(params.get('category') ?? '') || ['statistic','direction','team','offset','limit'].some(k => params.has(k)))) throw new NflStatsV2Error('Invalid leaderboard selection', 400);
    if (view === 'details' && ['category','statistic','direction','team','offset','limit'].some(k => params.has(k))) throw new NflStatsV2Error('Invalid details selection', 400);
    const token = params.get('snapshot');
    if ((params.has('players') && view !== 'details') || (token && !['details', 'export'].includes(view)) || (view === 'details' && !token)) throw new NflStatsV2Error('Incompatible snapshot parameters', 400);
    const stored = token ? observations.get(token) : undefined;
    if (token && (!stored || (view !== 'details' && stored.expiresAt <= now()) || stored.load !== load)) throw new NflStatsV2Error('Observation expired; refresh the leaderboard', 409);
    const result = stored?.result ?? await load({ mode: mode as Selection['mode'], week: rawWeek === null ? null : Number(rawWeek), live: rawLive === '1' });
    let body: unknown;
    if (stored && (result.model.period.week !== (mode === 'season' ? null : rawWeek === null ? result.model.period.week : Number(rawWeek)) || stored.selection !== JSON.stringify([mode, rawWeek, rawLive]))) throw new NflStatsV2Error('Observation period mismatch', 400);
    if (view === 'leaders') {
      const category = params.get('category') as Category;
      if (!['QB', 'Rush', 'Rec', 'Def'].includes(category) || ['statistic','direction','team','offset','limit'].some(k => params.has(k))) throw new NflStatsV2Error('Invalid leaderboard selection', 400);
      const existing = [...observations].find(([, item]) => item.result === result && item.selection === JSON.stringify([mode, rawWeek, rawLive]) && item.expiresAt > now());
      const snapshot = existing?.[0] ?? crypto.randomUUID();
      const expiry = Math.min(now() + 30_000, ...result.sources.history.map(source=>Date.parse(source.expiresAt)), ...[result.sources.player, result.sources.roster, result.sources.schedule, result.sources.identity].flatMap(source => source ? [Date.parse(source.expiresAt)] : []), ...(result.sources.live.observedAt ? [Date.parse(result.sources.live.observedAt) + 60_000] : []));
      // Retain at most four detail snapshots while idle; these never serve leader refreshes.
      if (!existing) {
        while (observations.size >= 4) observations.delete(observations.keys().next().value!);
        observations.set(snapshot, { result, load, live: rawLive === '1', selection: JSON.stringify([mode, rawWeek, rawLive]), expiresAt: expiry });
      }
      let projections = leaderProjections.get(result);
      if (!projections) { projections = new Map(); leaderProjections.set(result, projections); }
      let lines = projections.get(category);
      if (!lines) {
        lines = result.model.lines.filter(line => line.categories.includes(category)).map(line => ({ id: line.id, identity: line.identity, name: line.name, teams: line.teams, playingNow: line.playingNow,
          values: categoryMetrics[category].map(key => line.metrics[key].value),
          notApplicable: Object.entries(line.metrics).filter(([, cell]) => cell.state === 'not-applicable').map(([key]) => key) }));
        projections.set(category, lines);
      }
      body = { version: 1, snapshot, observationAt: result.observationAt, period: result.model.period, complete: result.model.complete, confidence: result.confidence[category], sourceAttribution:result.sourceAttribution, sources: result.sources, coverage: result.coverage, logos: result.logos, columns: categoryMetrics[category], lines };
    } else if (view === 'details') {
      const ids = params.get('players')?.split(',') ?? [];
      if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => !result.model.lines.some(line => line.id === id))) throw new NflStatsV2Error('Invalid player selection', 400);
      body = { snapshot: token, observationAt: result.observationAt, period: result.model.period, lines: result.model.lines.filter(line => ids.includes(line.id)).map(line => { const games = result.playerHistory(line.id); return { ...line, games, gameLog: { returned: games.length, scope: 'latest-five-verified-player-games-through-selection' } }; }) };
    } else if (view === 'export') {
      if (result.confidence[exportSelection.category]?.[exportSelection.statistic]?.status !== 'verified') throw new NflStatsV2Error('Incomplete source coverage cannot be exported as a ranking', 409);
      try {
        body = { version: result.version, sources: result.sources, coverage: result.coverage,
          export: projectNflRanking({ ...result.model, complete: true }, exportSelection, result.logos) };
      } catch { throw new NflStatsV2Error('Invalid export selection', 400); }
    } else {
      const { logos: _logos, model, ...metadata } = result;
      void _logos;
      body = { ...metadata, model: { ...model, lines: model.lines.slice(offset, offset + limit).map(line => ({ ...line,
        games: line.games.slice(-5), gameLog: { supplied: line.games.length, returned: Math.min(5, line.games.length), scope: 'last-five-supplied-games' } })) },
        pagination: { offset, limit, total: model.lines.length, nextOffset: offset + limit < model.lines.length ? offset + limit : null } };
    }
    const json = JSON.stringify(body);
    if (new TextEncoder().encode(json).length > 2_000_000) throw new NflStatsV2Error('Response too large; request a smaller page', 413);
    return new Response(json, { headers: { ...headers, 'Content-Type': 'application/json' } });
  } catch (error) {
    return Response.json({ error: error instanceof NflStatsV2Error ? error.message : 'NFL Stats 2.0 source unavailable' }, { status: error instanceof NflStatsV2Error ? error.status : 503, headers });
  }
}
