import type { AllTimeSnapshot, AllTimeSnapshotEntry, AllTimeSignal } from "./all-time-monitor";

const normalize = (value: string) => value.trim().toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");

// Stored IDs historically included display metadata. Derive comparison keys
// from both snapshots so existing history needs no reset or database migration.
export function allTimeRecordKey(snapshot: AllTimeSnapshot, entry: AllTimeSnapshotEntry): string {
  const name = normalize(entry.name);
  if (snapshot.period === "career") return name;
  if (snapshot.period === "season") {
    const season = entry.years.match(/\b(?:19|20)\d{2}\b/g)?.join("-") ?? normalize(entry.years);
    return `${name}:season:${season}`;
  }
  // A season/date identifies a performance, not mutable career metadata.
  // Undated historical games still require their opponent context.
  const date = entry.years.trim();
  return date ? `${name}:game:${normalize(date)}` : `${name}:game:${normalize(entry.context)}`;
}

export function compareSnapshot(previous: AllTimeSnapshot | undefined, current: AllTimeSnapshot): AllTimeSignal[] {
  if (!previous) return [];
  const previousEntries = new Map<string, AllTimeSnapshotEntry[]>();
  for (const entry of previous.entries) {
    const key = allTimeRecordKey(previous, entry);
    previousEntries.set(key, [...(previousEntries.get(key) ?? []), entry]);
  }
  const currentCounts = new Map<string, number>();
  for (const entry of current.entries) {
    const key = allTimeRecordKey(current, entry);
    currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
  }
  const events: AllTimeSignal[] = [];
  for (const entry of current.entries) {
    const key = allTimeRecordKey(current, entry);
    const candidates = previousEntries.get(key) ?? [];
    // Do not merge ambiguous duplicate historical performances.
    const prior = candidates.find((candidate) => candidate.id === entry.id)
      ?? (candidates.length === 1 && currentCounts.get(key) === 1 ? candidates[0] : undefined);
    const base = {
      league: current.league, audience: current.audience, period: current.period,
      category: current.category, player: entry.name, isActive: entry.isActive,
      currentRank: entry.rank, createdAt: current.checkedAt,
    };
    if (!prior) {
      events.push({ ...base, id: `${current.id}:${entry.id}:new-entry:${current.checkedAt}`, type: "new-entry" });
      continue;
    }
    if (prior.rank !== entry.rank) events.push({ ...base,
      id: `${current.id}:${entry.id}:rank-movement:${current.checkedAt}`,
      type: "rank-movement", previousRank: prior.rank });
    if (entry.rank === 1 && prior.rank !== 1) events.push({ ...base,
      id: `${current.id}:${entry.id}:record-holder:${current.checkedAt}`,
      type: "record-holder", previousRank: prior.rank });
  }
  return events;
}

export function allTimeMovementDetail(signal: { player: string; previousRank?: number; currentRank: number }): string {
  if (signal.previousRank === undefined || signal.previousRank === signal.currentRank) {
    return `${signal.player} is ranked #${signal.currentRank} all-time.`;
  }
  const direction = signal.currentRank < signal.previousRank ? "rose" : "fell";
  return `${signal.player} ${direction} from #${signal.previousRank} to #${signal.currentRank} all-time.`;
}
