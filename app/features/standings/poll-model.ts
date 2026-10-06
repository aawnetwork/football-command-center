export type PollKind = "ap" | "cfp" | "uki";
export type PollPhase = "preseason" | "regular" | "postseason";
export type PollEntry = {
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
  return `${p.season} · ${p.phase === "preseason" ? "Preseason" : p.phase === "postseason" ? `Postseason week ${p.week}` : `Week ${p.week}`}`;
}
export function pollKey(p: PollIdentity) { return `${p.kind}:${p.season}:${p.phase}:${p.week}`; }
export function previousRankLabel(entry: PollEntry) {
  return entry.previousRankStatus === "unranked" ? "NR" : entry.previousRank ?? "—";
}
