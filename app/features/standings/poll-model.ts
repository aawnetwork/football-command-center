export type PollKind = "ap" | "cfp" | "uki";
export type PollPhase = "preseason" | "regular" | "postseason";
export type PollEntry = {
  teamId?: string | null;
  rank: number; previousRank: number | null;
  previousRankStatus: "ranked" | "unranked" | "unknown";
  team: string; abbreviation: string; logo: string | null; record: string;
  points: number | null; firstPlaceVotes: number | null;
};
export type PollIdentity = { kind: PollKind; season: number; phase: PollPhase; week: number };
export type PollMetadata = PollIdentity & {
  id: string; source: string; publishedAt: string | null; capturedAt: string; revision: number;
};
export type Poll = PollMetadata & { available: boolean; entries: PollEntry[] };
export type PollResponse = {
  league: "CFB"; kind: PollKind; selectionMode: "latest" | "snapshot";
  latest: PollMetadata | null; selected: PollIdentity | null; poll: Poll | null;
  availableSnapshots: PollMetadata[]; availableWeeks: number[];
  currentWeek: number | null; selectedWeek: number | null;
  polls: Poll[]; currentMeans: string; error?: string;
};
export function pollLabel(p: PollIdentity) {
  return `${p.season} · ${p.phase === "preseason" ? `Preseason week ${p.week}` : p.phase === "postseason" ? `Postseason week ${p.week}` : `Week ${p.week}`}`;
}
export function pollKey(p: PollIdentity) { return `${p.kind}:${p.season}:${p.phase}:${p.week}`; }
export function previousRankLabel(entry: PollEntry) {
  return entry.previousRankStatus === "unranked" ? "NR" : entry.previousRank ?? "—";
}

export type PollWeek = Omit<PollIdentity, "kind">;
// Display weeks follow UKI numbering. Archive identities remain untouched.
export function comparisonWeek(p: PollIdentity): PollWeek | null {
  if (p.phase === "preseason") return { season: p.season, phase: "preseason", week: 0 };
  if (p.kind === "cfp") return null; // Its cross-source mapping has not been confirmed.
  if (p.phase === "postseason") return { season: p.season, phase: p.phase, week: p.week };
  if (p.kind === "ap" && p.week < 2) return null;
  return { season: p.season, phase: "regular", week: Math.max(1, p.week - (p.kind === "ap" ? 1 : 0)) };
}
export function comparisonSnapshots(snapshots: PollMetadata[]): PollMetadata[] {
  return snapshots.flatMap(p => { const week = comparisonWeek(p); return week ? [{ ...p, ...week }] : []; });
}
export function comparisonSource(snapshots: PollMetadata[], kind: PollKind, selected: PollWeek): PollMetadata | undefined {
  return snapshots.filter(p => {
    const week = comparisonWeek(p);
    return p.kind === kind && week && pollWeekKey(week) === pollWeekKey(selected);
  }).sort((a,b) => {
    // Prefer canonical stored releases over legacy W0 / extra preseason aliases.
    const preferred = (p: PollMetadata) => p.phase === "preseason" ? p.week === 0 : p.week === selected.week + (kind === "ap" ? 1 : 0);
    return Number(preferred(b)) - Number(preferred(a)) || b.revision-a.revision;
  })[0];
}
export function comparisonPoll(poll: Poll | null | undefined, kind: PollKind, selected: PollWeek | null, snapshots: PollMetadata[]): Poll | null {
  const source = selected && comparisonSource(snapshots, kind, selected);
  return source && poll?.available && pollKey(poll) === pollKey(source) ? poll : null;
}
export function pollWeekButtonLabel(p: PollWeek) {
  return p.phase === "preseason" ? "Preseason" : p.phase === "postseason" ? `Post W${p.week}` : `W${p.week}`;
}
export const pollKinds: PollKind[] = ["ap", "uki", "cfp"];
export const pollTitles: Record<PollKind, string> = { ap: "AP Top 25", uki: "UK & Ireland Top 25", cfp: "CFP Top 25" };
export const pollWeekKey = (p: PollWeek) => `${p.season}:${p.phase}:${p.week}`;
export function parsePollWeek(value: string | null): PollWeek | null {
  const match = value?.match(/^(\d{4}):(preseason|regular|postseason):(\d{1,2})$/);
  if (!match || +match[1] < 1869 || +match[1] > 2200 || +match[3] > 30) return null;
  return { season: +match[1], phase: match[2] as PollPhase, week: +match[3] };
}
const phaseOrder = { preseason: 0, regular: 1, postseason: 2 };
export function latestPollWeek(snapshots: PollMetadata[], season?: number): PollWeek | null {
  const latest = snapshots.filter(p => season === undefined || p.season === season).sort((a,b) => b.season-a.season || phaseOrder[b.phase]-phaseOrder[a.phase] || b.week-a.week)[0];
  return latest ? { season: latest.season, phase: latest.phase, week: latest.week } : null;
}
export function pollWeekOptions(snapshots: PollMetadata[], season: number): PollWeek[] {
  const rows = snapshots.filter(p => p.season === season);
  if (!rows.length) return [];
  const options: PollWeek[] = [];
  for (const phase of ["preseason", "regular", "postseason"] as const) {
    const weeks = rows.filter(p => p.phase === phase).map(p => p.week);
    if (!weeks.length) continue;
    const start = phase === "regular" && !weeks.includes(0) ? 1 : Math.min(...weeks);
    for (let week=start; week<=Math.max(...weeks); week++) options.push({ season, phase, week });
  }
  return options;
}
export function selectedPoll(poll: Poll | null | undefined, kind: PollKind, selected: PollWeek | null): Poll | null {
  return poll?.available && poll.kind === kind && selected && pollWeekKey(poll) === pollWeekKey(selected) ? poll : null;
}
export function pollMovement(entry: PollEntry) {
  if (entry.previousRankStatus === "unranked" || (entry.previousRankStatus === "ranked" && entry.previousRank !== null && entry.previousRank > 25))
    return { text: "NEW", tone: "up", label: "New to the Top 25" };
  if (entry.previousRankStatus !== "ranked" || entry.previousRank === null)
    return { text: "—", tone: "neutral", label: "Movement unavailable: previous poll ranking not supplied" };
  const delta = entry.previousRank - entry.rank;
  return delta > 0 ? { text: `↑ ${delta}`, tone: "up", label: `Up ${delta} ${delta === 1 ? "place" : "places"}` } : delta < 0
    ? { text: `↓ ${-delta}`, tone: "down", label: `Down ${-delta} ${delta === -1 ? "place" : "places"}` }
    : { text: "—", tone: "neutral", label: "Unchanged from the previous poll" };
}
