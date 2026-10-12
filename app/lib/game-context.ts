export type League = "NFL" | "CFB";
export type GameState = "scheduled" | "live" | "completed" | "postponed" | "cancelled" | "uncertain";
export type GameContext = {
  league: League; season: number | null; eventId: string | null; identity: string | null;
  seasonType: "regular" | "postseason" | "unknown";
  regularWeek: number | null;
  postseasonRound: { sourceNumber: number | null; label: string | null } | null;
  competitionKind: "regular" | "conference-championship" | "bowl" | "playoff" | "postseason-unspecified" | "unknown";
  competitionLabel: string | null; kickoffAt: string | null;
  homeTeamId: string | null; awayTeamId: string | null;
  status: GameState; sourceCheckedAt: string; sourceUpdatedAt: null;
  verified: boolean; issues: string[];
};
type Feed = Record<string, any>;
export type ContextSelection = { season?: number; seasonType: 2 | 3; week?: number };
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const id = (value: unknown) => typeof value === "string" && /^\d+$/.test(value) ? value : null;
const instant = (value: unknown) => typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
export function contextSelection(params: URLSearchParams, league: League): ContextSelection {
  for (const key of ["season", "seasontype", "week"]) if (params.getAll(key).length > 1) throw new Error("Duplicate selection parameter.");
  const type = params.get("seasontype") ?? "2";
  const season = params.get("season"), week = params.get("week");
  if (!["2", "3"].includes(type) || (season !== null && (!/^\d{4}$/.test(season) || Number(season) < 2000 || Number(season) > 2100)) ||
    (week !== null && (!/^\d+$/.test(week) || Number(week) > (league === "CFB" && type === "2" ? 16 : 30) || (Number(week) === 0 && (league !== "CFB" || type !== "2" || (season !== null && season !== "2026")))))) throw new Error("Invalid season, season type or week.");
  return { seasonType: Number(type) as 2 | 3, ...(season !== null ? { season: Number(season) } : {}), ...(week !== null ? { week: Number(week) } : {}) };
}

export function normalizeGameContext(league: League, event: Feed, feed: Feed, selection: ContextSelection, checkedAt: string): GameContext {
  const issues: string[] = [];
  const eventId = id(event.id);
  if (!eventId) issues.push("missing_event_id");
  const eventSeason = integer(event.season?.year), envelopeSeason = integer(feed.season?.year);
  const season = eventSeason ?? envelopeSeason;
  if (season === null || season < 2000 || season > 2100) issues.push("missing_or_invalid_season");
  if (eventSeason !== null && envelopeSeason !== null && eventSeason !== envelopeSeason) issues.push("contradictory_season");
  if (selection.season !== undefined && selection.season !== season) issues.push("requested_season_mismatch");
  const eventType = integer(event.season?.type), envelopeType = integer(feed.season?.type);
  const type = eventType ?? envelopeType;
  const seasonType = type === 2 ? "regular" : type === 3 ? "postseason" : "unknown";
  if (seasonType === "unknown") issues.push("missing_season_type");
  if (eventType !== null && envelopeType !== null && eventType !== envelopeType) issues.push("contradictory_season_type");
  if (type !== selection.seasonType) issues.push("requested_season_type_mismatch");
  const competition = event.competitions?.[0];
  const kickoffAt = instant(event.date);
  if (!kickoffAt) issues.push("missing_or_invalid_kickoff");
  if (kickoffAt && season !== null && (new Date(kickoffAt).getUTCFullYear() < season || new Date(kickoffAt).getUTCFullYear() > season + 1)) issues.push("kickoff_season_mismatch");
  if (competition?.date && instant(competition.date) !== kickoffAt) issues.push("contradictory_kickoff");
  const teams = competition?.competitors ?? [];
  const home = teams.filter((team: Feed) => team.homeAway === "home"), away = teams.filter((team: Feed) => team.homeAway === "away");
  const homeTeamId = home.length === 1 ? id(home[0].team?.id) : null;
  const awayTeamId = away.length === 1 ? id(away[0].team?.id) : null;
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) issues.push("unverified_team_identity");
  const sourceWeek = integer(event.week?.number) ?? integer(feed.week?.number);
  const regularWeek = seasonType === "regular" && league === "CFB" && season === 2026 && sourceWeek === 1 && kickoffAt && kickoffAt < "2026-09-01T00:00:00.000Z" ? 0 : seasonType === "regular" ? sourceWeek : null;
  if (seasonType === "regular" && (regularWeek === null || regularWeek < (league === "NFL" ? 1 : 0) || regularWeek > (league === "NFL" ? 18 : 16))) issues.push("missing_or_invalid_regular_week");
  const selectedWeek = seasonType === "regular" ? regularWeek : sourceWeek;
  if (selection.week !== undefined && selection.week !== selectedWeek) issues.push("requested_week_mismatch");
  const label = (competition?.notes ?? []).find((note: Feed) => note.type === "event" && typeof note.headline === "string")?.headline ?? null;
  const competitionKind = /conference championship|(?:SEC|ACC|Big Ten|Big 12|Mountain West|Sun Belt|MAC|American|Pac-12).*championship/i.test(label ?? "") ? "conference-championship" : /playoff|super bowl|wild card|divisional|AFC Championship|NFC Championship/i.test(label ?? "") ? "playoff" : /bowl/i.test(label ?? "") ? "bowl" : seasonType === "postseason" ? "postseason-unspecified" : seasonType === "regular" ? "regular" : "unknown";
  const a = event.status?.type, b = competition?.status?.type;
  if (a && b && ["state", "name", "completed"].some((field) => a[field] !== undefined && b[field] !== undefined && a[field] !== b[field])) issues.push("contradictory_status");
  const statusType = b ?? a;
  let status: GameState = "uncertain";
  const name = statusType?.name ?? "";
  if (/POSTPONED/.test(name)) status = "postponed";
  else if (/CANCELED|CANCELLED/.test(name)) status = "cancelled";
  else if (statusType?.state === "pre" && name === "STATUS_SCHEDULED" && statusType.completed === false) status = "scheduled";
  else if (statusType?.state === "in" && ["STATUS_IN_PROGRESS", "STATUS_HALFTIME", "STATUS_END_PERIOD"].includes(name) && statusType.completed === false) status = "live";
  else if (statusType?.state === "post" && /^STATUS_FINAL/.test(name) && statusType.completed === true) status = "completed";
  if (status === "uncertain") issues.push("unverified_status");
  if (status === "scheduled" && kickoffAt && Date.parse(kickoffAt) <= Date.parse(checkedAt)) issues.push("scheduled_kickoff_passed");
  if (["live", "completed"].includes(status) && kickoffAt && Date.parse(kickoffAt) > Date.parse(checkedAt)) issues.push("started_game_has_future_kickoff");
  if (!instant(checkedAt)) issues.push("invalid_check_timestamp");
  return { league, season, eventId, identity: eventId && season !== null ? `${league}:${season}:${eventId}` : null, seasonType, regularWeek,
    postseasonRound: seasonType === "postseason" ? { sourceNumber: sourceWeek, label: typeof event.week?.text === "string" ? event.week.text : label } : null,
    competitionKind, competitionLabel: label, kickoffAt, homeTeamId, awayTeamId,
    status: issues.length ? "uncertain" : status, sourceCheckedAt: checkedAt, sourceUpdatedAt: null, verified: issues.length === 0, issues };
}

export function assessGameContext(context: GameContext, now: string, maxAgeMs = 60_000) {
  const age = Date.parse(now) - Date.parse(context.sourceCheckedAt);
  const stale = !Number.isFinite(age) || age < 0 || age > maxAgeMs;
  const kickoffPassed = context.status === "scheduled" && context.kickoffAt !== null && Date.parse(context.kickoffAt) <= Date.parse(now);
  return { usable: context.verified && !stale && !kickoffPassed && ["scheduled", "live", "completed"].includes(context.status), stale,
    issues: [...context.issues, ...(stale ? ["stale_check"] : []), ...(kickoffPassed ? ["scheduled_kickoff_passed"] : [])], upstreamFreshness: "unknown" as const };
}
export function supersedeGameContext(previous: GameContext, next: GameContext) {
  if (!previous.identity || previous.identity !== next.identity) throw new Error("Cannot merge different or unverified identities.");
  if (!Number.isFinite(Date.parse(next.sourceCheckedAt))) throw new Error("Cannot supersede with an invalid observation time.");
  if (Date.parse(next.sourceCheckedAt) <= Date.parse(previous.sourceCheckedAt)) return { context: previous, changes: [] as string[] };
  const changes = ["kickoffAt", "status", "regularWeek", "postseasonRound", "seasonType"].filter((field) => JSON.stringify(previous[field as keyof GameContext]) !== JSON.stringify(next[field as keyof GameContext]));
  return { context: next, changes };
}

export type ConfirmedSeasonEnd = { league: League; season: number; endedAt: string; confirmedAt: string; postseasonComplete: boolean; source: "administrator" | "verified-source"; reference: string };
export function validateSeasonEnd(end: ConfirmedSeasonEnd, now: string): { expiresAt: string } {
  const endedAt = instant(end.endedAt), confirmedAt = instant(end.confirmedAt), current = instant(now);
  if (!["NFL", "CFB"].includes(end.league) || !Number.isSafeInteger(end.season) || end.season < 2000 || end.season > 2100 || !endedAt || !confirmedAt || !current ||
    endedAt > confirmedAt || confirmedAt > current || !end.postseasonComplete || !["administrator", "verified-source"].includes(end.source) || !end.reference.trim() ||
    endedAt < `${end.season + 1}-01-01T00:00:00.000Z` || endedAt >= `${end.season + 2}-01-01T00:00:00.000Z`) throw new Error("Season end requires explicit, dated postseason-complete confirmation.");
  return { expiresAt: new Date(Date.parse(endedAt) + 90 * 86400000).toISOString() };
}
