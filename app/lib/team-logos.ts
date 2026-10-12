export type LogoTeam = { team: string; logo?: string | null; abbreviation?: string; shortName?: string; location?: string };
const normalize = (name: string) => name.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").replace(/\bst\.?$/, "state");
export function preferredTeamLogo(logos: { href?: string; rel?: string[] }[] = [], fallback?: string | null): string | null {
  return logos.find((logo) => logo.rel?.includes("dark") && logo.href)?.href ??
    logos.find((logo) => logo.rel?.includes("default") && logo.href)?.href ??
    logos.find((logo) => logo.href)?.href ?? fallback ?? null;
}
type StandingsGroup<T> = { standings?: { entries?: T[] }; children?: StandingsGroup<T>[] };
export function standingsEntries<T>(group: StandingsGroup<T>): T[] {
  const entries = group.standings?.entries ?? [];
  return entries.length ? entries : (group.children ?? []).flatMap((child) => standingsEntries<T>(child));
}
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
