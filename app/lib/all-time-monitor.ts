import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gamesPlayedRecords, rankHistoricalRecords } from "./all-time-records";
import { compareSnapshot } from "./all-time-comparison";
import { retainAllTimeSignals } from "./all-time-signal-retention";

import {
  cfbAllTimeCareerIndividual,
  cfbAllTimeSeasonIndividual,
  cfbAllTimeSingleGameIndividual,
  type CfbAllTimeRecord,
} from "../cfb/data/cfb-all-time-career";
import { cfbAllTimeCareerProgram } from "../cfb/data/cfb-all-time-program";
import {
  nflAllTimeCareerIndividual,
  nflAllTimeSeasonIndividual,
  nflAllTimeSingleGameIndividual,
  type NflAllTimeCategory,
  type NflAllTimeRecord,
} from "../nfl/data/nfl-all-time-career";
import { nflAllTimeCareerTeam } from "../nfl/data/nfl-all-time-team";
import {
  loadNflActiveCareerSource,
  type NflLiveCareerSource,
} from "./all-time-live-sources";

export type AllTimeLeague = "CFB" | "NFL";
export type AllTimePeriod = "career" | "season" | "single-game";
export type AllTimeAudience = "individual" | "team";

type SourceRecord = CfbAllTimeRecord | NflAllTimeRecord;
type CatalogRecord = Omit<SourceRecord, "player" | "team" | "years" | "value"> & {
  player: string | number;
  team: string | number;
  years: string | number;
  value: string | number;
};

export type AllTimeSnapshotEntry = {
  id: string;
  rank: number;
  name: string;
  context: string;
  years: string;
  value: number;
  isActive: boolean;
};

export type AllTimeSnapshot = {
  id: string;
  league: AllTimeLeague;
  audience: AllTimeAudience;
  period: AllTimePeriod;
  category: string;
  checkedAt: string;
  entries: AllTimeSnapshotEntry[];
};

export type AllTimeSignal = {
  id: string;
  league: AllTimeLeague;
  audience: AllTimeAudience;
  period: AllTimePeriod;
  category: string;
  type: "new-entry" | "rank-movement" | "record-holder";
  player: string;
  isActive: boolean;
  previousRank?: number;
  currentRank: number;
  createdAt: string;
};

type MonitorStore = {
  version: 1;
  catalogVersion?: string;
  snapshots: AllTimeSnapshot[];
  signals: AllTimeSignal[];
  lastCheckedAt?: string;
};

const monitorCatalogVersion = "espn-active-career-v3";

const storePath = path.join(process.cwd(), "data", "all-time-monitor.json");
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

const emptyStore = (): MonitorStore => ({ version: 1, snapshots: [], signals: [] });

const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseSecret);

const assertStoreConfiguration = () => {
  if (Boolean(supabaseUrl) !== Boolean(supabaseSecret)) {
    throw new Error("Set both SUPABASE_URL and SUPABASE_SECRET_KEY to use cloud monitoring storage.");
  }
  if (process.env.NODE_ENV === "production" && !isSupabaseConfigured()) {
    throw new Error("Supabase must be configured before production monitoring can run.");
  }
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const isActiveRecord = (record: CatalogRecord) =>
  record.isActive ?? /(?:^|\D)2026(?:\D|$)/.test(String(record.years));

const createSnapshot = (
  league: AllTimeLeague,
  audience: AllTimeAudience,
  period: AllTimePeriod,
  category: string,
  records: readonly CatalogRecord[],
  checkedAt: string,
): AllTimeSnapshot => {
  const id = `${league}:${audience}:${period}:${category}`;

  return {
    id,
    league,
    audience,
    period,
    category,
    checkedAt,
    entries: rankHistoricalRecords(records as SourceRecord[]).slice(0, audience === "team" ? records.length : 25).map((record) => ({
      id: `${id}:${slug(`${record.player}-${record.team}-${record.years}`)}`,
      rank: record.rank,
      name: String(record.player),
      context: String(record.team),
      years: String(record.years),
      value: Number(record.value),
      isActive: isActiveRecord(record),
    })),
  };
};

const snapshotsFromRecordSet = (
  league: AllTimeLeague,
  audience: AllTimeAudience,
  period: AllTimePeriod,
  recordSet: Record<string, readonly CatalogRecord[] | undefined>,
  checkedAt: string,
) =>
  Object.entries(recordSet).flatMap(([category, records]) =>
    records?.length
      ? [createSnapshot(league, audience, period, category, records, checkedAt)]
      : [],
  );

export const buildAllTimeCatalog = (
  checkedAt = new Date().toISOString(),
  nflCareerRecords: Record<NflAllTimeCategory, CatalogRecord[]> = nflAllTimeCareerIndividual,
): AllTimeSnapshot[] => [
  ...snapshotsFromRecordSet("CFB", "individual", "career", cfbAllTimeCareerIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "season", cfbAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "single-game", cfbAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "team", "career", cfbAllTimeCareerProgram, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "career", nflCareerRecords, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "season", nflAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "single-game", nflAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "team", "career", { ...nflAllTimeCareerTeam, "games-played": gamesPlayedRecords(nflAllTimeCareerTeam.wins) }, checkedAt),
];

const normalizePlayer = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const buildNflCareerRecords = (
  liveSource: NflLiveCareerSource,
): Record<NflAllTimeCategory, CatalogRecord[]> =>
  Object.entries(nflAllTimeCareerIndividual).reduce<Record<NflAllTimeCategory, CatalogRecord[]>>(
    (recordSets, [category, staticRecords]) => {
      const typedCategory = category as NflAllTimeCategory;
      const livePlayers = new Set(
        liveSource.categories[typedCategory].map((record) => normalizePlayer(record.player)),
      );
      const merged = staticRecords
        .filter((record) => !livePlayers.has(normalizePlayer(record.player)))
        .map((record) => ({ ...record }));

      for (const liveRecord of liveSource.categories[typedCategory]) {
        merged.push({
          rank: 0,
          player: liveRecord.player,
          team: liveRecord.team,
          years: liveRecord.years,
          // Active-player totals come from ESPN regular-season career rows.
          // Static record-book values are only a
          // fallback for retired players, not an upper bound for live totals.
          value: liveRecord.value,
          isActive: true,
        });
      }

      recordSets[typedCategory] = merged
        .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player))
        .slice(0, 25)
        .map((record, index) => ({ ...record, rank: index + 1 }));
      return recordSets;
    },
    {} as Record<NflAllTimeCategory, CatalogRecord[]>,
  );

const buildLatestAllTimeCatalog = async (checkedAt: string, league?: AllTimeLeague) => {
  if (league === "CFB") {
    return { snapshots: buildAllTimeCatalog(checkedAt).filter((snapshot) => snapshot.league === "CFB") };
  }

  const liveNflSource = await loadNflActiveCareerSource();
  const nflCareerRecords = buildNflCareerRecords(liveNflSource);
  const snapshots = buildAllTimeCatalog(checkedAt, nflCareerRecords).filter(
    (snapshot) => !league || snapshot.league === league,
  );

  return { snapshots, liveNflSource };
};

const readStore = async (): Promise<MonitorStore> => {
  assertStoreConfiguration();
  if (isSupabaseConfigured()) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/all_time_monitor_state?select=state&id=eq.global`,
      {
        headers: {
          apikey: supabaseSecret!,
          Authorization: `Bearer ${supabaseSecret!}`,
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(`Supabase monitor read failed (${response.status}).`);
    }
    const rows = (await response.json()) as { state?: MonitorStore }[];
    return rows[0]?.state ?? emptyStore();
  }

  try {
    return JSON.parse(await readFile(storePath, "utf8")) as MonitorStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
};

const writeStore = async (store: MonitorStore) => {
  assertStoreConfiguration();
  if (isSupabaseConfigured()) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/all_time_monitor_state?on_conflict=id`,
      {
        method: "POST",
        headers: {
          apikey: supabaseSecret!,
          Authorization: `Bearer ${supabaseSecret!}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ id: "global", state: store }),
      },
    );
    if (!response.ok) {
      throw new Error(`Supabase monitor write failed (${response.status}).`);
    }
    return;
  }

  await mkdir(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
};

export async function getAllTimeMonitorStatus() {
  const store = await readStore();
  return {
    lastCheckedAt: store.lastCheckedAt ?? null,
    snapshots: store.snapshots.length,
    recentSignals: store.signals.slice(0, 50),
  };
}

export async function getAllTimeLeaderboardFeed(league: AllTimeLeague) {
  // Fixed record-book corrections travel with the deployment. A stale monitor
  // copy must not overwrite them or require a database refresh to become visible.
  let store = emptyStore();
  let publicationAvailable = true;
  try { store = await readStore(); }
  catch { publicationAvailable = false; }
  const bundled = buildAllTimeCatalog().filter(snapshot => snapshot.league === league);
  const stored = new Map(store.snapshots.map(snapshot => [snapshot.id, snapshot]));
  const activeCareer = league === "NFL" && store.catalogVersion === monitorCatalogVersion;
  const leaderboards: Record<string, AllTimeSnapshotEntry[]> = {};
  const datasets: Record<string, { mode: "record-book" | "active-career"; checkedAt: string | null }> = {};
  for (const snapshot of bundled) {
    const published = stored.get(snapshot.id);
    const activeEntries = Array.isArray(published?.entries) ? published.entries.filter(entry => entry?.isActive === true && typeof entry.name === "string") : [];
    const activeNames = new Set(activeEntries.map(entry => normalizePlayer(entry.name)));
    const usePublished = activeCareer && snapshot.audience === "individual" && snapshot.period === "career" &&
      published?.entries.length && activeEntries.length && activeNames.size === activeEntries.length && Number.isFinite(Date.parse(published.checkedAt)) &&
      published.entries.every(entry => entry && typeof entry.value === "number" && Number.isFinite(entry.value) &&
        typeof entry.name === "string" && entry.name.trim() && typeof entry.context === "string" && typeof entry.years === "string");
    // A published career table contains both live candidates and copied retired
    // rows. Reconcile only its verified active candidates into the current book;
    // never let an older copy regress a newly reviewed retired-player record.
    const selected = usePublished ? {...published!, entries: [
      ...snapshot.entries.filter(entry => !activeNames.has(normalizePlayer(entry.name))),
      ...activeEntries,
    ]} : snapshot;
    const ranked = rankHistoricalRecords(selected.entries.map(entry => ({
      rank: entry.rank, player: entry.name, team: entry.context, years: entry.years, value: entry.value, isActive: entry.isActive,
    }))).slice(0, snapshot.audience === "team" ? selected.entries.length : 25);
    leaderboards[snapshot.id] = ranked.map((record) => ({
      id: `${snapshot.id}:${slug(`${record.player}-${record.team}-${record.years}`)}`,
      rank: record.rank, name: record.player, context: record.team, years: record.years, value: record.value,
      isActive: snapshot.audience === "individual" && snapshot.period === "career" &&
        (record.isActive ?? /(?:^|\D)2026(?:\D|$)/.test(record.years)),
    }));
    datasets[snapshot.id] = { mode: usePublished ? "active-career" : "record-book", checkedAt: usePublished ? published!.checkedAt : null };
  }
  const careerChecks = Object.values(datasets).filter(dataset => dataset.mode === "active-career").map(dataset => dataset.checkedAt!).sort();
  const checkedAt = careerChecks[0] ?? null;
  return { leaderboards, datasets, source: {
    mode: careerChecks.length ? "active-career" : "record-book",
    checkedAt,
    publicationAvailable,
    provider: careerChecks.length ? "ESPN career statistics; nflverse roster selection" : "Bundled record-book snapshot",
    coverage: careerChecks.length ? "NFL career candidates already represented in the bundled catalog; other tables remain snapshots" : "Static historical catalog; check time is not a new source publication",
  } };
}

export async function getAllTimeLeaderboards(league: AllTimeLeague) {
  return (await getAllTimeLeaderboardFeed(league)).leaderboards;
}

export async function resetAllTimeMonitor() {
  await writeStore(emptyStore());
}

export async function refreshAllTimeMonitor(league?: AllTimeLeague) {
  const checkedAt = new Date().toISOString();
  const store = await readStore();
  const { snapshots: currentSnapshots, liveNflSource } = await buildLatestAllTimeCatalog(
    checkedAt,
    league,
  );
  const previousSnapshots = new Map(store.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const needsNflRebaseline =
    (league === undefined || league === "NFL") && store.catalogVersion !== monitorCatalogVersion;
  const signals = needsNflRebaseline
    ? []
    : currentSnapshots.flatMap((snapshot) =>
        compareSnapshot(previousSnapshots.get(snapshot.id), snapshot),
      );
  const retainedSnapshots = league
    ? store.snapshots.filter((snapshot) => snapshot.league !== league)
    : [];

  const updatedStore: MonitorStore = {
    version: 1,
    catalogVersion:
      league === "CFB" ? store.catalogVersion : monitorCatalogVersion,
    snapshots: [...retainedSnapshots, ...currentSnapshots],
    signals: retainAllTimeSignals(store.signals, signals),
    lastCheckedAt: checkedAt,
  };
  await writeStore(updatedStore);

  return {
    checkedAt,
    league: league ?? "all",
    snapshots: currentSnapshots.length,
    signals,
    source: liveNflSource
      ? {
          provider: "ESPN career statistics; nflverse roster selection",
          checkedAt: liveNflSource.checkedAt,
          coverage: "Active NFL career leaders",
        }
      : null,
    rebaselined: needsNflRebaseline,
    activeEntries: currentSnapshots.reduce(
      (total, snapshot) => total + snapshot.entries.filter((entry) => entry.isActive).length,
      0,
    ),
  };
}
