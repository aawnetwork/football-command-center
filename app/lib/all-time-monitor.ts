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
  type NflAllTimeRecord,
} from "../nfl/data/nfl-all-time-career";
import { nflAllTimeCareerTeam } from "../nfl/data/nfl-all-time-team";

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
  snapshots: AllTimeSnapshot[];
  signals: AllTimeSignal[];
  lastCheckedAt?: string;
};

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

export const buildAllTimeCatalog = (checkedAt = new Date().toISOString()): AllTimeSnapshot[] => [
  ...snapshotsFromRecordSet("CFB", "individual", "career", cfbAllTimeCareerIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "season", cfbAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "single-game", cfbAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "team", "career", cfbAllTimeCareerProgram, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "career", nflAllTimeCareerIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "season", nflAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "single-game", nflAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "team", "career", nflAllTimeCareerTeam, checkedAt),
];

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

export async function resetAllTimeMonitor() {
  await writeStore(emptyStore());
}

export async function refreshAllTimeMonitor(league?: AllTimeLeague) {
  const checkedAt = new Date().toISOString();
  const store = await readStore();
  const currentSnapshots = buildAllTimeCatalog(checkedAt).filter(
    (snapshot) => !league || snapshot.league === league,
  );
  const previousSnapshots = new Map(store.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const signals = currentSnapshots.flatMap((snapshot) =>
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
    activeEntries: currentSnapshots.reduce(
      (total, snapshot) => total + snapshot.entries.filter((entry) => entry.isActive).length,
      0,
    ),
  };
}
