import { resolveTeamLogo, type LogoTeam } from "../../lib/team-logos";
import type { PollEntry } from "./poll-model";

export function pollTeamLogo(entry: PollEntry, teams: LogoTeam[]): string | undefined {
  if (entry.teamId) {
    const exact = teams.filter(team => team.id === entry.teamId);
    // A supplied stable identity is authoritative; do not substitute a different
    // school's artwork merely because its name or abbreviation looks similar.
    return (exact.length === 1 ? exact[0].logo : null) || entry.logo || undefined;
  }
  // Explicit historical poll spelling, not a fuzzy Miami/Miami (OH) match.
  const name = entry.team.trim().toLowerCase() === "miami (fl)" ? "Miami Hurricanes" : entry.team;
  return resolveTeamLogo(name, teams) || resolveTeamLogo(entry.abbreviation, teams) || entry.logo || undefined;
}
