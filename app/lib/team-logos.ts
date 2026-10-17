export type LogoTeam = { id?: string; team: string; logo?: string | null; darkLogo?: string | null; abbreviation?: string; shortName?: string; location?: string };
export const normalizeTeamName = (name: string) => name.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/\bst\.?$/, "state");
export function preferredTeamLogo(logos: { href?: string; rel?: string[] }[] = [], fallback?: string | null, surface: "light" | "dark" = "light"): string | null {
  // ESPN rel=dark means a mark designed for a dark background.
  return logos.find((logo) => logo.rel?.includes(surface === "dark" ? "dark" : "default") && logo.href)?.href ??
    logos.find((logo) => logo.rel?.includes("default") && logo.href)?.href ??
    logos.find((logo) => logo.href)?.href ?? fallback ?? null;
}
type StandingsGroup<T> = { standings?: { entries?: T[] }; children?: StandingsGroup<T>[] };
export function standingsEntries<T>(group: StandingsGroup<T>): T[] {
  const entries = group.standings?.entries ?? [];
  return entries.length ? entries : (group.children ?? []).flatMap((child) => standingsEntries<T>(child));
}
export function resolveTeamLogo(name: string, teams: LogoTeam[], surface: "light" | "dark" = "light"): string | undefined {
  const value = normalizeTeamName(name);
  if (!value) return undefined;
  const exact = teams.filter((team) => normalizeTeamName(team.team) === value);
  const matches = exact.length ? exact : teams.filter((team) => [team.abbreviation, team.shortName, team.location].some((alias) => alias && normalizeTeamName(alias) === value));
  const logos = new Set(matches.map((team) => surface === "dark" ? team.darkLogo || team.logo : team.logo).filter((logo): logo is string => Boolean(logo)));
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
