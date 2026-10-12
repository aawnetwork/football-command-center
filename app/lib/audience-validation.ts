import "server-only";
import { assessGameContext, normalizeGameContext, type League } from "./game-context";
import { standingsEntries } from "./team-logos";
import { ParticipationError } from "./participation-store";
import type { ContributionRequest } from "./audience-contributions";

const sport = { NFL: "nfl", CFB: "college-football" };
const leagueId = { NFL: "28", CFB: "23" };
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<any>>();
async function metadata(url: string) {
  const found = cache.get(url);
  if (found && found.until > Date.now()) return found.value;
  if (pending.has(url)) return pending.get(url);
  const task = (async () => {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ParticipationError("Canonical football data is unavailable. Your local selection is unchanged.");
    const date = Date.parse(response.headers.get("date") ?? "");
    const age = Number(response.headers.get("age") ?? 0);
    if (!Number.isFinite(date) || Math.abs(Date.now() - date) > 60_000 || !Number.isFinite(age) || age > 60)
      throw new ParticipationError("Canonical football data is stale. Please try a new selection later.");
    const value = await response.json();
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(url, { until: Date.now() + 30_000, value });
    return value;
  })();
  pending.set(url, task);
  try { return await task; } finally { pending.delete(url); }
}

export function verifiedSummary(league: League, season: number, eventId: string, data: any, checkedAt: string) {
  const h = data?.header;
  if (!h || h.id !== eventId || h.league?.id !== leagueId[league] || h.league?.slug !== sport[league] || ![2, 3].includes(h.season?.type))
    throw new ParticipationError("Game identity could not be verified.", 422);
  const event = { ...h, date: h.competitions?.[0]?.date, week: { number: h.week } };
  const context = normalizeGameContext(league, event, {}, { season, seasonType: h.season.type }, checkedAt);
  if (!assessGameContext(context, checkedAt).usable) throw new ParticipationError("Game context is uncertain; selection was not collected.", 422);
  return context;
}

export function verifiedFavourite(league: League, teamId: string, data: any): number {
  if (data?.uid !== (league === "CFB" ? "s:20~l:23~g:80" : "s:20~l:28~g:9") ||
      !Number.isInteger(data.season?.year) || data.season.year < 2000 || data.season.year > 2100)
    throw new ParticipationError("Team and season metadata could not be verified.", 422);
  const entries = (data.children ?? []).flatMap((group: any) => standingsEntries<any>(group));
  if (entries.filter((entry: any) => entry.team?.id === teamId).length !== 1)
    throw new ParticipationError("This team is not recognised in the selected league.", 422);
  return data.season.year;
}

export async function validateContribution(change: ContributionRequest): Promise<{ season: number | null; seasonType: string | null }> {
  if (change.kind === "tier") {
    const data = await metadata(`https://site.api.espn.com/apis/site/v2/sports/football/${sport[change.league]}/summary?event=${change.eventId}`);
    const context = verifiedSummary(change.league, change.season, change.eventId, data, new Date().toISOString());
    return { season: context.season, seasonType: context.seasonType };
  }
  if (change.kind === "favourite" && change.teamId !== null) {
    const data = await metadata(`https://site.api.espn.com/apis/v2/sports/football/${sport[change.league]}/standings${change.league === "CFB" ? "?groups=80" : ""}`);
    return { season: verifiedFavourite(change.league, change.teamId, data), seasonType: null };
  }
  // Removal needs no speculative feed lookup: it only deletes owned records.
  return { season: null, seasonType: null };
}
