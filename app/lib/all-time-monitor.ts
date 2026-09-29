import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

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

const monitorCatalogVersion = "nflverse-active-career-v1";

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
    entries: records.slice(0, 25).map((record) => ({
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
  ...snapshotsFromRecordSet("NFL", "team", "career", nflAllTimeCareerTeam, checkedAt),
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
      const staticByPlayer = new Map(
        staticRecords.map((record) => [normalizePlayer(record.player), record]),
      );
      const livePlayers = new Set(
        liveSource.categories[typedCategory].map((record) => normalizePlayer(record.player)),
      );
      const merged = staticRecords
        .filter((record) => !livePlayers.has(normalizePlayer(record.player)))
        .map((record) => ({ ...record }));

      for (const liveRecord of liveSource.categories[typedCategory]) {
        const staticRecord = staticByPlayer.get(normalizePlayer(liveRecord.player));
        // The record-book value is retained if the public live feed has not yet
        // published a newer season. This prevents a source lag from moving a
        // player backwards in the all-time table.
        const value = Math.max(staticRecord?.value ?? 0, liveRecord.value);
        merged.push({
          rank: 0,
          player: liveRecord.player,
          team: liveRecord.team,
          years: liveRecord.years,
          value,
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

const compareSnapshot = (
  previous: AllTimeSnapshot | undefined,
  current: AllTimeSnapshot,
): AllTimeSignal[] => {
  if (!previous) return [];

  const previousEntries = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const events: AllTimeSignal[] = [];

  for (const entry of current.entries) {
    const prior = previousEntries.get(entry.id);
    const base = {
      league: current.league,
      audience: current.audience,
      period: current.period,
      category: current.category,
      player: entry.name,
      isActive: entry.isActive,
      currentRank: entry.rank,
      createdAt: current.checkedAt,
    };

    if (!prior) {
      events.push({
        ...base,
        id: `${current.id}:${entry.id}:new-entry:${current.checkedAt}`,
        type: "new-entry",
      });
      continue;
    }

    if (prior.rank !== entry.rank) {
      events.push({
        ...base,
        id: `${current.id}:${entry.id}:rank-movement:${current.checkedAt}`,
        type: "rank-movement",
        previousRank: prior.rank,
      });
    }

    if (entry.rank === 1 && prior.rank !== 1) {
      events.push({
        ...base,
        id: `${current.id}:${entry.id}:record-holder:${current.checkedAt}`,
        type: "record-holder",
        previousRank: prior.rank,
      });
    }
  }

  return events;
};

export async function getAllTimeMonitorStatus() {
  const store = await readStore();
  return {
    lastCheckedAt: store.lastCheckedAt ?? null,
    snapshots: store.snapshots.length,
    recentSignals: store.signals.slice(0, 50),
  };
}

export async function getAllTimeLeaderboards(league: AllTimeLeague) {
  const store = await readStore();
  return store.snapshots
    .filter((snapshot) => snapshot.league === league)
    .reduce<Record<string, AllTimeSnapshotEntry[]>>((leaderboards, snapshot) => {
      leaderboards[snapshot.id] = snapshot.entries.map((entry) => ({ ...entry }));
      return leaderboards;
    }, {});
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
  const retainedSignals = league
    ? store.signals.filter((signal) => signal.league !== league)
    : [];

  const updatedStore: MonitorStore = {
    version: 1,
    catalogVersion:
      league === "CFB" ? store.catalogVersion : monitorCatalogVersion,
    snapshots: [...retainedSnapshots, ...currentSnapshots],
    signals: [...signals, ...retainedSignals].slice(0, 250),
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
          provider: "nflverse",
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
