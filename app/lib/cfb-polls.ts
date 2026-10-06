// Server-side cloud reader. Never fall back to a privileged write key.
import type { PollEntry, PollIdentity, PollKind, PollMetadata, PollPhase, PollResponse } from "../features/standings/poll-model";

export type ArchiveRow = {
  id: string; poll_type: PollKind; season: number; season_phase: PollPhase; week: number;
  published_at: string | null; captured_at: string; source: string; revision: number;
  entries?: Array<{
    rank: number; previous_rank: number | null; previous_rank_status?: string;
    team_name: string; team_abbreviation: string | null; team_logo_url: string | null;
    record: string | null; points: number | null; first_place_votes: number | null;
  }>;
};
const metadataColumns = "id,poll_type,season,season_phase,week,published_at,captured_at,source,revision";
const phaseOrder = { preseason: 0, regular: 1, postseason: 2 };
export function compareSnapshots(a: ArchiveRow, b: ArchiveRow) {
  return b.season - a.season || phaseOrder[b.season_phase] - phaseOrder[a.season_phase] || b.week - a.week;
}
export function mapMetadata(r: ArchiveRow): PollMetadata {
  return { id: r.id, kind: r.poll_type, season: r.season, phase: r.season_phase, week: r.week,
    publishedAt: r.published_at, capturedAt: r.captured_at, source: r.source, revision: r.revision };
}
export function mapEntries(r: ArchiveRow): PollEntry[] {
  return (r.entries ?? []).map((e): PollEntry => {
    // Null in older archives is ambiguous; never infer NR from it.
    const unranked = e.previous_rank_status === "unranked" || e.previous_rank === 0;
    const known = !unranked && e.previous_rank !== null && Number.isInteger(e.previous_rank) && e.previous_rank > 0;
    return { rank: e.rank, previousRank: known ? e.previous_rank : null,
      previousRankStatus: unranked ? "unranked" : known ? "ranked" : "unknown",
      team: e.team_name, abbreviation: e.team_abbreviation ?? "", logo: e.team_logo_url,
      record: e.record ?? "—", points: e.points ?? null, firstPlaceVotes: e.first_place_votes ?? null };
  }).sort((a,b) => a.rank - b.rank);
}
export function parseSelection(params: URLSearchParams) {
  const kind = params.get("type") ?? "ap";
  if (!["ap", "cfp", "uki"].includes(kind)) throw new Error("Unknown poll type.");
  const seasonText = params.get("season"), weekText = params.get("week"), phaseText = params.get("phase");
  if (seasonText !== null && (!/^\d{4}$/.test(seasonText) || Number(seasonText) < 1869 || Number(seasonText) > 2200)) throw new Error("Invalid poll season.");
  if (weekText !== null && (!/^\d{1,2}$/.test(weekText) || Number(weekText) > 30)) throw new Error("Invalid poll week.");
  if (phaseText !== null && !["preseason", "regular", "postseason"].includes(phaseText)) throw new Error("Invalid poll phase.");
  if (phaseText !== null && weekText === null) throw new Error("A phase requires a poll week.");
  return { kind: kind as PollKind, season: seasonText === null ? null : Number(seasonText),
    week: weekText === null ? null : Number(weekText),
    phase: (phaseText ?? (weekText === "0" ? "preseason" : "regular")) as PollPhase };
}
async function read(resource: string): Promise<ArchiveRow[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_POLL_READ_KEY;
  if (!url || !key) throw new Error("Poll archive read access is not configured.");
  if (!key.startsWith("sb_publishable_")) {
    let role: string | undefined;
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch {}
    if (role !== "anon") throw new Error("A publishable poll read key is required.");
  }
  const response = await fetch(`${url}/rest/v1/ur_cfb_polls?${resource}`, {
    cache: "no-store", headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Poll archive read failed (${response.status}).`);
  return response.json();
}
export async function getArchivePolls(params: URLSearchParams): Promise<PollResponse> {
  const choice = parseSelection(params);
  const filter = `poll_type=eq.${choice.kind}${choice.season === null ? "" : `&season=eq.${choice.season}`}`;
  const rows: ArchiveRow[] = [];
  // Page metadata so growing history cannot silently lose older seasons.
  for (let offset = 0; ; offset += 1000) {
    const page = await read(`${filter}&select=${metadataColumns}&order=season.desc,season_phase.asc,week.desc,id.asc&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  rows.sort(compareSnapshots);
  const latest = rows[0] ? mapMetadata(rows[0]) : null;
  const selected: PollIdentity | null = choice.week === null ? latest : {
    kind: choice.kind, season: choice.season ?? latest?.season ?? new Date().getUTCFullYear(), phase: choice.phase, week: choice.week,
  };
  // Read entries by identity rather than id: a replacement remains the same snapshot.
  const saved = selected ? (await read(`poll_type=eq.${selected.kind}&season=eq.${selected.season}&season_phase=eq.${selected.phase}&week=eq.${selected.week}&select=${metadataColumns},entries&limit=1`))[0] : null;
  const poll = saved ? { ...mapMetadata(saved), available: true, entries: mapEntries(saved) } : null;
  return { league: "CFB", kind: choice.kind, selectionMode: choice.week === null ? "latest" : "snapshot", latest, selected,
    availableSnapshots: rows.map(mapMetadata),
    availableWeeks: [...new Set(rows.filter(r => r.season === selected?.season && r.season_phase === selected?.phase).map(r => r.week))].sort((a,b) => a-b),
    currentWeek: latest?.week ?? null, selectedWeek: selected?.week ?? null, poll, polls: poll ? [poll] : [],
    currentMeans: "Latest stored snapshot by season, phase and week; publication and capture times do not determine which week is current." };
}
