export type LogoTeam = { id?: string; team: string; logo?: string | null; darkLogo?: string | null; abbreviation?: string; shortName?: string; location?: string };
export const normalizeTeamName = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/[’ʻ']/g, "'").replace(/\s+/g, " ").replace(/\bst\.?$/, "state");
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
// Explicit NCAA school names that differ from ESPN's supplied aliases.
const schoolAliases = new Map([
  ["southern california", "USC Trojans"],
  ["hawaii", "Hawai'i Rainbow Warriors"],
  ["ga. southern", "Georgia Southern Eagles"],
  ["ga southern", "Georgia Southern Eagles"],
  ["eastern mich.", "Eastern Michigan Eagles"],
  ["eastern mich", "Eastern Michigan Eagles"],
]);

export function resolveTeam(name: string, teams: LogoTeam[]): LogoTeam | undefined {
  const value = normalizeTeamName(name);
  if (!value) return undefined;
  const exact = teams.filter((team) => normalizeTeamName(team.team) === value);
  const canonical = schoolAliases.get(value);
  const matches = exact.length ? exact : teams.filter((team) =>
    (canonical && normalizeTeamName(team.team) === normalizeTeamName(canonical)) ||
    [team.abbreviation, team.shortName, team.location].some((alias) => alias && normalizeTeamName(alias) === value));
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveTeamLogo(name: string, teams: LogoTeam[], surface: "light" | "dark" = "light"): string | undefined {
  const team = resolveTeam(name, teams);
  return (surface === "dark" ? team?.darkLogo || team?.logo : team?.logo) || undefined;
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
