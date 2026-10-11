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
  const currentEntries = new Map<string, AllTimeSnapshotEntry[]>();
  for (const entry of current.entries) {
    const key = allTimeRecordKey(current, entry);
    currentEntries.set(key, [...(currentEntries.get(key) ?? []), entry]);
  }
  const matches = new Map<AllTimeSnapshotEntry, AllTimeSnapshotEntry>();
  for (const [key, entries] of currentEntries) {
    const candidates = previousEntries.get(key) ?? [];
    if (entries.length === 1 && candidates.length === 1) {
      matches.set(entries[0], candidates[0]);
      continue;
    }
    const used = new Set<AllTimeSnapshotEntry>();
    // Require uniqueness on BOTH sides before pairing. Never use row order or
    // rank as identity, and never consume one baseline row more than once.
    const pairUnique = (identity: (entry: AllTimeSnapshotEntry) => string) => {
      for (const entry of entries) {
        if (matches.has(entry)) continue;
        const token = identity(entry);
        const left = candidates.filter((candidate) => identity(candidate) === token);
        const right = entries.filter((candidate) => identity(candidate) === token);
        if (left.length === 1 && right.length === 1 && !used.has(left[0])) {
          matches.set(entry, left[0]);
          used.add(left[0]);
        }
      }
    };
    pairUnique((entry) => entry.id);
    // Historical season/game totals can distinguish colliding display IDs.
    // Career totals are mutable, so they cannot resolve ambiguous identities.
    if (current.period !== "career") {
      pairUnique((entry) => JSON.stringify([normalize(entry.context), entry.value]));
    }
  }
  const events: AllTimeSignal[] = [];
  for (const entry of current.entries) {
    const key = allTimeRecordKey(current, entry);
    const candidates = previousEntries.get(key) ?? [];
    const prior = matches.get(entry);
    // Existing but unresolved identity is not evidence of a new entry or move.
    if (!prior && candidates.length) continue;
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
