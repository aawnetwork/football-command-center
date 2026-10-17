import type { Game, PlayerStat, SeasonStat } from "./cfb-helpers";
import { resolveTeam, type LogoTeam } from "./team-logos";

function throughDay(updated?: string) {
  const date = updated?.match(/Through games \w+, (\w+ \d{1,2}, \d{4})/i)?.[1];
  const time = date ? Date.parse(`${date} 00:00:00 GMT`) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : undefined;
}
function gameDay(date: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(date));
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}
const playerKey = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Rebuild from the published baseline on every refresh. Never increment a prior
// merged total, and exclude every game already covered by NCAA's through-date.
export function mergeLiveSeasonStats(baseline: SeasonStat[], weekly: PlayerStat[], games: Game[], teams: LogoTeam[], now = Date.now()): SeasonStat[] {
  const schoolIds = new Map<string, string | undefined>();
  const schoolId = (name: string) => {
    if (!schoolIds.has(name)) schoolIds.set(name, resolveTeam(name, teams)?.id);
    return schoolIds.get(name);
  };
  // Resolve each school and game date once, rather than for every row in the
  // complete NCAA catalogue on every live tick.
  const candidates = games.filter((game) => Number.isFinite(Date.parse(game.startDate)) && Date.parse(game.startDate) <= now &&
    (game.live || game.completed) && game.context?.verified === true).map((game) => ({
      game, day: gameDay(game.startDate), home: schoolId(game.homeTeam), away: schoolId(game.awayTeam),
    }));
  const statsBySchool = new Map<string, PlayerStat[]>();
  for (const stat of weekly) {
    const id = schoolId(stat.team);
    if (id) { const rows = statsBySchool.get(id) ?? []; rows.push(stat); statsBySchool.set(id, rows); }
  }
  return baseline.map((row) => {
    const cutoff = throughDay(row.sourceUpdated);
    const id = schoolId(row.team);
    if (!cutoff || !id) return row;
    const additions = candidates.filter((entry) => entry.day > cutoff && [entry.home, entry.away].includes(id)).map((entry) => entry.game);
    if (!additions.length) return row;
    const relevant = (statsBySchool.get(id) ?? []).filter((stat) => additions.some((game) => game.id === stat.gameId));
    if (row.type === "individual") {
      const category = row.category === "tackles" || row.category === "sacks" ? "defensive" : row.category;
      const label = row.statType === "TACKLES" ? "TOT" : row.statType;
      const matches = relevant.filter((stat) => Number.isFinite(stat.playerId) && stat.playerId > 0 &&
        playerKey(stat.player) === playerKey(row.name) && stat.category === category && stat.stat === label);
      // A duplicate name for one school is ambiguous. Do not merge athletes.
      if (new Set(matches.map((stat) => stat.playerId)).size > 1) return row;
      const unique = new Map(matches.map((stat) => [`${stat.gameId}:${stat.playerId}:${stat.stat}`, stat]));
      return { ...row, stat: row.stat + [...unique.values()].reduce((sum, stat) => sum + stat.value, 0) };
    }
    let delta = 0, count = 0;
    for (const game of additions) {
      const home = schoolId(game.homeTeam) === id;
      const opponent = schoolId(home ? game.awayTeam : game.homeTeam);
      const ownRows = relevant.filter((stat) => stat.gameId === game.id);
      const opponentRows = (opponent ? statsBySchool.get(opponent) ?? [] : weekly.filter((stat) => stat.team === (home ? game.awayTeam : game.homeTeam))).filter((stat) => stat.gameId === game.id);
      const sumYards = (rows: PlayerStat[], categories: string[]) => {
        const unique = new Map(rows.filter((stat) => Number.isFinite(stat.playerId) && stat.stat === "YDS" && categories.includes(stat.category))
          .map((stat) => [`${stat.playerId}:${stat.category}`, stat.value]));
        return [...unique.values()].reduce((total, value) => total + value, 0);
      };
      // An absent box score must not turn an incomplete fetch into a zero game.
      if (!ownRows.length) continue;
      switch (row.category) {
        case "total-offense": delta += sumYards(ownRows, ["passing", "rushing"]); break;
        case "rushing-offense": delta += sumYards(ownRows, ["rushing"]); break;
        case "passing-offense": delta += sumYards(ownRows, ["passing"]); break;
        case "total-defense": if (!opponentRows.length) continue; delta += sumYards(opponentRows, ["passing", "rushing"]); break;
        case "rushing-defense": if (!opponentRows.length) continue; delta += sumYards(opponentRows, ["rushing"]); break;
        case "passing-defense": if (!opponentRows.length) continue; delta += sumYards(opponentRows, ["passing"]); break;
        case "scoring-offense": { const points = home ? game.homePoints : game.awayPoints; if (points == null) continue; delta += points; break; }
        case "scoring-defense": { const points = home ? game.awayPoints : game.homePoints; if (points == null) continue; delta += points; break; }
        case "sacks": { const aggregate = ownRows.find((stat) => !Number.isFinite(stat.playerId) && stat.stat === "SACKS"); if (!aggregate) continue; delta += aggregate.value; break; }
        case "turnover-margin": { const aggregate = ownRows.find((stat) => !Number.isFinite(stat.playerId) && stat.stat === "MARGIN"); if (!aggregate) continue; delta += aggregate.value; break; }
        default: continue;
      }
      count++;
    }
    const average = ["total-defense", "rushing-defense", "passing-defense", "scoring-offense", "scoring-defense"].includes(row.category);
    if (average) {
      if (!Number.isFinite(row.seasonTotal) || !Number.isFinite(row.gamesPlayed) || !count) return row;
      return { ...row, stat: Number(((row.seasonTotal! + delta) / (row.gamesPlayed! + count)).toFixed(1)) };
    }
    return { ...row, stat: row.stat + delta };
  });
}
