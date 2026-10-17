import type { Game, Leader } from "./cfb-helpers";
import { resolveTeam, type LogoTeam } from "./team-logos";

// NCAA names use school names; ESPN's existing directory supplies exact aliases
// and IDs. Ambiguous/missing identities fail closed rather than fuzzy matching.
export function withSeasonPlayingStatus(
  leaders: Leader[], games: Game[], teams: LogoTeam[], now = Date.now()
): Leader[] {
  const playingIds = new Set(games.filter((game) => {
    const checkedAt = Date.parse(game.context?.sourceCheckedAt ?? "");
    const kickoff = Date.parse(game.startDate);
    return kickoff <= now && now - kickoff <= 24 * 60 * 60_000 && game.live && !game.completed && game.context?.verified === true && game.context.status === "live" &&
      checkedAt <= now && now - checkedAt <= 60_000;
  }).flatMap((game) => game.playingTeamIds ?? []));
  return leaders.map((leader) => {
    const team = resolveTeam(leader.team, teams);
    return { ...leader, playingNow: Boolean(team?.id && playingIds.has(team.id)) };
  });
}
