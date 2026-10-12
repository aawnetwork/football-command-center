export type LogoTeam = { team: string; logo?: string | null; abbreviation?: string; shortName?: string; location?: string };
const normalize = (name: string) => name.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");
export function resolveTeamLogo(name: string, teams: LogoTeam[]): string | undefined {
  const value = normalize(name);
  if (!value) return undefined;
  const exact = teams.filter((team) => normalize(team.team) === value);
  const matches = exact.length ? exact : teams.filter((team) => [team.abbreviation, team.shortName, team.location].some((alias) => alias && normalize(alias) === value));
  const logos = new Set(matches.map((team) => team.logo).filter((logo): logo is string => Boolean(logo)));
  return matches.length === 1 && logos.size === 1 ? [...logos][0] : undefined;
}
type Directory = { sections: { name: string; teams: LogoTeam[] }[] };
const directories = new Map<string, Promise<Directory>>();
export function loadTeamDirectory(league: "NFL" | "CFB"): Promise<Directory> {
  let request = directories.get(league);
  if (!request) {
    request = fetch(`/api/standings?league=${league}`).then(async (response) => {
      if (!response.ok) throw new Error("Team metadata unavailable");
      return response.json() as Promise<Directory>;
    }).catch((error) => { directories.delete(league); throw error; });
    directories.set(league, request);
  }
  return request;
}
