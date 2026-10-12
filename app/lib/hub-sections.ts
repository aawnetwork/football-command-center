export const hubSections = ["games", "performances", "stats", "standings", "all-time", "content"] as const;
export type HubSection = (typeof hubSections)[number];
export function hubSection(params: { getAll(name: string): string[] }): HubSection {
  const values = params.getAll("section");
  return values.length === 1 && hubSections.includes(values[0] as HubSection) ? values[0] as HubSection : "games";
}
export function hubSectionUrl(href: string, section: string): string | null {
  if (!hubSections.includes(section as HubSection)) return null;
  const url = new URL(href);
  if (hubSection(url.searchParams) === section) return null;
  url.searchParams.set("section", section);
  return `${url.pathname}${url.search}${url.hash}`;
}
