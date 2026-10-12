export type PreferenceLeague = "NFL" | "CFB";
export const favouriteKeys = { NFL: "aaw-hub-favourite-nfl-v1", CFB: "aaw-hub-favourite-cfb-v1" } as const;
export const invitationKey = "aaw-hub-participation-preview-seen-v1";
export const validTeamId = (id: unknown): id is string => typeof id === "string" && /^\d+$/.test(id);
export function parseFavourite(value: string | null): string | null {
  try { const stored = JSON.parse(value ?? "null"); return stored?.version === 1 && validTeamId(stored.teamId) ? stored.teamId : null; }
  catch { return null; }
}
export function writeFavourite(storage: Pick<Storage, "setItem" | "removeItem">, league: PreferenceLeague, id: string | null): boolean {
  if (id !== null && !validTeamId(id)) return false;
  try { if (id === null) storage.removeItem(favouriteKeys[league]); else storage.setItem(favouriteKeys[league], JSON.stringify({ version: 1, teamId: id })); return true; }
  catch { return false; }
}
export function favouriteSides(context: { league: string; homeTeamId: string | null; awayTeamId: string | null } | undefined, league: PreferenceLeague, id: string | null) {
  return { home: Boolean(validTeamId(id) && context?.league === league && context.homeTeamId === id), away: Boolean(validTeamId(id) && context?.league === league && context.awayTeamId === id) };
}
export function shouldInvite(enabled: boolean, seen: boolean, interaction: boolean) { return enabled && !seen && interaction; }
