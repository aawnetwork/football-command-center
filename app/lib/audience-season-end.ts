import { validateSeasonEnd } from "./game-context";
const authorities = ["nfl.com", "espn.com", "ncaa.com", "collegefootballplayoff.com"];
// Calendar envelope endDate is not proof that all postseason games have finished.
// An authenticated administrator must attest to that fact using an official source.
export function seasonEndConfirmation(value: unknown, now: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid season confirmation.");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["league", "season", "endedAt", "reference", "postseasonComplete"].includes(key)) ||
      !["NFL", "CFB"].includes(v.league as string) || typeof v.endedAt !== "string" || typeof v.reference !== "string" || v.reference.length > 1024 || v.postseasonComplete !== true) throw Error("Confirm all postseason play has ended and supply its official reference.");
  const url = new URL(v.reference);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !authorities.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) throw Error("Use an official NFL, NCAA, CFP or ESPN HTTPS reference.");
  const end = { league: v.league as "NFL" | "CFB", season: v.season as number, endedAt: v.endedAt, confirmedAt: now, postseasonComplete: true, source: "administrator" as const, reference: url.toString() };
  const { expiresAt } = validateSeasonEnd(end, now);
  return { ...end, endedAt: new Date(end.endedAt).toISOString(), expiresAt };
}
