import { createNflIdentityIndex, type SourceRow } from './nfl-identity';
import { nflTeamCode, type Period } from './nfl-statlines';
import { isTeamPlaying } from '../gameday-status';
import type { NflLiveSource } from './nfl-source-types';

const scalar = (raw: unknown): string | undefined => typeof raw === 'string' && /^-?\d+(?:\.\d+)?$/.test(raw.replace(/,/g, '')) ? raw.replace(/,/g, '') : undefined;
const fields: Record<string, Record<string, string>> = {
  passing: { YDS: 'passing_yards', TD: 'passing_tds', INT: 'passing_interceptions', CMP: 'completions', ATT: 'attempts' },
  rushing: { CAR: 'carries', YDS: 'rushing_yards', TD: 'rushing_tds' },
  receiving: { REC: 'receptions', TGTS: 'targets', YDS: 'receiving_yards', TD: 'receiving_tds' },
  defensive: { TOT: 'reported_tackles', SOLO: 'def_tackles_solo', AST: 'def_tackle_assists', SACKS: 'def_sacks', TFL: 'def_tackles_for_loss', PD: 'def_pass_defended', INT: 'def_interceptions', FF: 'def_fumbles_forced', TD: 'def_tds' },
  interceptions: { INT: 'def_interceptions', TD: 'def_tds' },
};

export function reconcileNflSources(published: readonly SourceRow[], rosters: readonly SourceRow[], schedule: readonly SourceRow[], period: Period, live: NflLiveSource | null, now: number) {
  const issues: string[] = [], playing = new Set<string>(), observed = new Set<string>(), replaced = new Set<string>(), replacedPlayers = new Set<string>();
  let rows = [...published];
  const valid = live !== null && Number.isFinite(live.observedAt) && live.observedAt <= now && now - live.observedAt <= 60_000 &&
    live.scoreboard.season?.year === period.season && live.scoreboard.season?.type === 2 &&
    Number.isSafeInteger(live.scoreboard.week?.number);
  if (!valid) return { rows, issues: ['Live source unavailable, stale or outside the verified period'], playing, observed, replaced, replacedPlayers, liveVerified: false };
  if (period.week !== null && period.week !== live!.scoreboard.week!.number) return { rows, issues, playing, observed, replaced, replacedPlayers, liveVerified: true };
  const identities = createNflIdentityIndex(rosters, period.season);
  const games = new Map<string, SourceRow[]>();
  for (const row of schedule) if (row.season === String(period.season) && row.game_type === period.phase && row.espn) {
    const group = games.get(row.espn) ?? []; group.push(row); games.set(row.espn, group);
  }
  const seen = new Set<string>();
  const events = live!.scoreboard.events ?? [];
  const eventCounts = new Map<string, number>();
  for (const event of events) if (event.id) eventCounts.set(event.id, (eventCounts.get(event.id) ?? 0) + 1);
  for (const [index, event] of (live!.scoreboard.events ?? []).entries()) {
    if (!event.id || eventCounts.get(event.id) !== 1) { if (!seen.has(event.id ?? '')) issues.push('Duplicate/missing live event identity'); seen.add(event.id ?? ''); continue; }
    seen.add(event.id);
    const candidates = games.get(event.id) ?? [];
    const unique = new Set(candidates.map(row => JSON.stringify([row.game_id, row.week, row.home_team, row.away_team])));
    const game = candidates[0], competition = event.competitions?.[0];
    // Scheduled fixtures need no live identity/summary and are not a coverage
    // failure merely because kickoff is still in the future.
    if (competition?.status?.type?.state === 'pre' && competition.status.type.completed !== true) continue;
    const competitors = competition?.competitors ?? [];
    const home = competitors.filter(c => c.homeAway === 'home'), away = competitors.filter(c => c.homeAway === 'away');
    const kickoff = Date.parse(event.date ?? '');
    const parts = game?.game_id?.match(/^(2026)_(\d{2})_([A-Z]{2,3})_([A-Z]{2,3})$/);
    if (unique.size !== 1 || !game || Number(game.week) !== live!.scoreboard.week!.number ||
        event.season?.year !== period.season || event.season?.type !== 2 ||
        competitors.length !== 2 || home.length !== 1 || away.length !== 1 || !home[0].team?.id || !away[0].team?.id || home[0].team.id === away[0].team.id ||
        nflTeamCode(home[0].team.abbreviation) !== nflTeamCode(game.home_team) || nflTeamCode(away[0].team.abbreviation) !== nflTeamCode(game.away_team) ||
        !Number.isFinite(kickoff) || kickoff > now || !parts || Number(parts[2]) !== Number(game.week) || nflTeamCode(parts[3]) !== nflTeamCode(game.away_team) || nflTeamCode(parts[4]) !== nflTeamCode(game.home_team)) { issues.push('Live game could not be uniquely linked to the schedule'); continue; }
    const active = competition?.status?.type?.state === 'in' && competition.status.type.completed !== true;
    const final = competition?.status?.type?.state === 'post' && competition.status.type.completed === true;
    if (!active && !final) continue;
    if (active && now - kickoff > 24 * 60 * 60_000) { issues.push('Live kickoff is too old to verify'); continue; }
    const summary = live!.summaries[index];
    if (!summary || summary.header?.id !== event.id || summary.header.competitions?.[0]?.id !== event.id) { issues.push('Missing/mismatched live summary'); continue; }
    const headerTeams = summary.header.competitions?.[0]?.competitors ?? [];
    if (headerTeams.length !== 2 || competitors.some(c => headerTeams.filter(h => h.team?.id === c.team?.id && h.homeAway === c.homeAway).length !== 1)) { issues.push('Summary teams contradict scoreboard'); continue; }
    const players = new Map<string, Record<string, string>>(), conflicts = new Set<string>();
    let failed = false;
    for (const box of summary.boxscore?.players ?? []) {
      const competitor = competitors.filter(c => c.team?.id === box.team?.id);
      const team = competitor.length === 1 ? nflTeamCode(competitor[0].team?.abbreviation) : null;
      if (!team) { failed = true; continue; }
      const opponent = team === nflTeamCode(game.home_team) ? nflTeamCode(game.away_team) : nflTeamCode(game.home_team);
      for (const category of box.statistics ?? []) {
        const mapping = fields[category.name ?? ''];
        if (!mapping) continue;
        for (const athlete of category.athletes ?? []) {
          const id = identities.resolve('espn', athlete.athlete?.id ?? '');
          if (!id?.gsisId) { failed = true; continue; }
          const row: Record<string, string> = players.get(id.key) ?? {
            season: String(period.season), season_type: period.phase, week: game.week!, game_id: game.game_id!,
            player_id: id.gsisId, player_display_name: athlete.athlete?.displayName ?? id.key,
            team, opponent_team: opponent ?? '', position: athlete.athlete?.position?.abbreviation ?? '',
          };
          if (row.team !== team || (row.position && athlete.athlete?.position?.abbreviation && row.position !== athlete.athlete.position.abbreviation)) conflicts.add(id.key);
          const put = (key: string, raw: unknown) => {
            const number = scalar(raw);
            if (number === undefined) return;
            if (row[key] !== undefined && row[key] !== number) conflicts.add(id.key);
            row[key] = number;
          };
          for (const [i, label] of (category.labels ?? []).entries()) {
            if (category.name === 'passing' && label === 'C/ATT') {
              const pair = String(athlete.stats?.[i] ?? '').match(/^(\d+)\/(\d+)$/);
              if (pair) { put('completions', pair[1]); put('attempts', pair[2]); }
            } else if (mapping[label]) put(mapping[label], athlete.stats?.[i]);
          }
          players.set(id.key, row);
          observed.add(id.key);
          if (isTeamPlaying(competition, box.team?.id)) playing.add(id.key);
        }
      }
    }
    if (failed || conflicts.size || !players.size) {
      for (const id of conflicts) { observed.delete(id); playing.delete(id); }
      issues.push('Incomplete or ambiguous live player identities; only exact non-conflicting player observations can replace published facts');
      if(!players.size)continue; }
    const hasPublished = rows.some(row => row.game_id === game.game_id && row.season === String(period.season) && row.season_type === period.phase);
    // A completed published game wins over ESPN. An active game's cumulative
    // boxscore replaces its whole published game, never increments it.
    if (final && hasPublished) continue;
    const accepted=[...players].filter(([id])=>!conflicts.has(id));
    const acceptedIds=new Set(accepted.map(([,row])=>row.player_id));
    rows = rows.filter(row => row.game_id !== game.game_id || row.season !== String(period.season) || row.season_type !== period.phase || !acceptedIds.has(row.player_id??''));
    rows.push(...accepted.map(([,row])=>row));
    if(accepted.length)replaced.add(`nflverse:game:${game.game_id}`);
    for(const [id]of accepted)replacedPlayers.add(`nflverse:game:${game.game_id}:${id}`);
  }
  return { rows, issues, playing, observed, replaced, replacedPlayers, liveVerified: true };
}
