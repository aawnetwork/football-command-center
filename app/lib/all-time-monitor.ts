import {nflCareerRecordSets, nflCareerPublication, retainedNflCareerSource, careerIdentityMap} from "./all-time-nfl-careers";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rankHistoricalRecords } from "./all-time-records";
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
  nflAllTimeSeasonIndividual,
  nflAllTimeSingleGameIndividual,
  type NflAllTimeCategory,
  type NflAllTimeRecord,
} from "../nfl/data/nfl-all-time-career";
import { nflTeamRecordSets, type NflTeamLedger } from "./all-time-nfl-teams";
import { loadNflTeamResults } from "./all-time-nfl-results";
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
  playerId?: string;
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
  nflTeamLedger?: NflTeamLedger;
  nflTeamRefreshFailedAt?: string;
  nflCareerSource?: NflLiveCareerSource;
  nflCareerRefreshFailedAt?: string;
};

const monitorCatalogVersion = "espn-active-career-v4";

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
      id: `${id}:${(record as CatalogRecord & {playerId?:string}).playerId ?? slug(`${record.player}-${record.team}-${record.years}`)}`,
      rank: record.rank,
      name: String(record.player),
      context: String(record.team),
      years: String(record.years),
      value: Number(record.value),
      isActive: isActiveRecord(record),
      playerId: (record as CatalogRecord & {playerId?:string}).playerId,
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
  nflCareerRecords: Record<NflAllTimeCategory, CatalogRecord[]> = nflCareerRecordSets(),
): AllTimeSnapshot[] => [
  ...snapshotsFromRecordSet("CFB", "individual", "career", cfbAllTimeCareerIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "season", cfbAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "individual", "single-game", cfbAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("CFB", "team", "career", cfbAllTimeCareerProgram, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "career", nflCareerRecords, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "season", nflAllTimeSeasonIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "individual", "single-game", nflAllTimeSingleGameIndividual, checkedAt),
  ...snapshotsFromRecordSet("NFL", "team", "career", nflTeamRecordSets(), checkedAt),
];

const normalizePlayer = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const buildNflCareerRecords = (liveSource: NflLiveCareerSource) => nflCareerRecordSets(liveSource);

const mergeCareerSources = (prior: NflLiveCareerSource | undefined, fresh: NflLiveCareerSource): NflLiveCareerSource => {
  const base: NflLiveCareerSource = prior && Date.parse(prior.checkedAt) >= Date.parse(nflCareerPublication.checkedAt) ? prior : retainedNflCareerSource();
  return {...fresh,identities:[...careerIdentityMap({identities:[...(base.identities??[]),...(fresh.identities??[])]}).values()],categories:Object.fromEntries(Object.keys(base.categories).map(category => {
    const key = category as NflAllTimeCategory;
    const updates = fresh.categories[key];
    const ids = new Set(updates.map(row => row.playerId));
    return [key,[...base.categories[key].filter(row => !ids.has(row.playerId)).map(row => ({...row,isActive:false})),...updates]];
  })) as NflLiveCareerSource["categories"]};
};
const buildLatestAllTimeCatalog = async (checkedAt: string, league?: AllTimeLeague, prior?: NflLiveCareerSource) => {
  if (league === "CFB") return {snapshots:buildAllTimeCatalog(checkedAt).filter(snapshot => snapshot.league === "CFB")};
  const liveNflSource = mergeCareerSources(prior, await loadNflActiveCareerSource(prior));
  const snapshots = buildAllTimeCatalog(checkedAt,buildNflCareerRecords(liveNflSource))
    .filter(snapshot => !league || snapshot.league === league)
    .map(snapshot => snapshot.league === "NFL" && snapshot.audience === "individual" && snapshot.period === "career"
      ? {...snapshot,checkedAt:liveNflSource.checkedAt} : snapshot);
  return {snapshots,liveNflSource};
};

const storeVersions = new WeakMap<MonitorStore, string | null>();

const readStore = async (): Promise<MonitorStore> => {
  assertStoreConfiguration();
  if (isSupabaseConfigured()) {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/all_time_monitor_state?select=state,updated_at&id=eq.global`,
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
    const rows = (await response.json()) as { state?: MonitorStore; updated_at?: string }[];
    const store = rows[0]?.state ?? emptyStore();
    storeVersions.set(store, rows.length ? rows[0].updated_at ?? "missing" : null);
    return store;
  }

  try {
    return JSON.parse(await readFile(storePath, "utf8")) as MonitorStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
};

const writeStore = async (store: MonitorStore, expected?: MonitorStore) => {
  assertStoreConfiguration();
  if (isSupabaseConfigured()) {
    if (expected) {
      const version = storeVersions.get(expected);
      if (version === undefined || version === "missing") throw new Error("Monitor persistence version unavailable; publication retained.");
      const insert = version === null;
      const url = insert ? `${supabaseUrl}/rest/v1/all_time_monitor_state?on_conflict=id`
        : `${supabaseUrl}/rest/v1/all_time_monitor_state?id=eq.global&updated_at=eq.${encodeURIComponent(version)}`;
      const response = await fetch(url, {
        method: insert ? "POST" : "PATCH",
        headers: { apikey:supabaseSecret!, Authorization:`Bearer ${supabaseSecret!}`, "Content-Type":"application/json",
          Prefer:insert ? "resolution=ignore-duplicates,return=representation" : "return=representation" },
        body:JSON.stringify(insert ? {id:"global",state:store} : {state:store}), cache:"no-store",
      });
      if (!response.ok) throw new Error("Failed monitor publication; no retry performed.");
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error("Concurrent monitor publication; no retry performed.");
      return;
    }
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
  catch (error) {
    // A storage outage must not roll a published NFL ledger back to its base.
    if (league === "NFL" && isSupabaseConfigured()) throw error;
    publicationAvailable = false;
  }
  const retainedCareer: NflLiveCareerSource = league === "NFL" && store.nflCareerSource && Date.parse(store.nflCareerSource.checkedAt) >= Date.parse(nflCareerPublication.checkedAt)
    ? store.nflCareerSource : retainedNflCareerSource();
  const bundled = buildAllTimeCatalog(undefined,nflCareerRecordSets(retainedCareer)).filter(snapshot => snapshot.league === league);
  const stored = new Map(store.snapshots.map(snapshot => [snapshot.id, snapshot]));
  const activeCareer = league === "NFL" && store.catalogVersion === monitorCatalogVersion;
  const leaderboards: Record<string, AllTimeSnapshotEntry[]> = {};
  const datasets: Record<string, { mode: "record-book" | "active-career" | "team-results" | "verified-baseline"; checkedAt: string | null }> = {};
  let teamSets = nflTeamRecordSets();
  let verifiedTeamLedger: NflTeamLedger | undefined;
  if (league === "NFL" && store.nflTeamLedger) {
    try { teamSets = nflTeamRecordSets(store.nflTeamLedger); verifiedTeamLedger = store.nflTeamLedger; }
    catch { throw new Error("Stored NFL team publication could not be verified."); }
  }
  for (const snapshot of bundled) {
    if (league === "NFL" && snapshot.audience === "team") {
      const records = teamSets[snapshot.category as keyof typeof teamSets];
      leaderboards[snapshot.id] = createSnapshot("NFL", "team", "career", snapshot.category, records, verifiedTeamLedger?.checkedAt ?? snapshot.checkedAt).entries;
      datasets[snapshot.id] = {mode: verifiedTeamLedger ? "team-results" : "verified-baseline", checkedAt: verifiedTeamLedger?.checkedAt ?? null};
      continue;
    }
    const published = stored.get(snapshot.id);
    const activeEntries = Array.isArray(published?.entries) ? published.entries.filter(entry => entry?.isActive === true && typeof entry.name === "string") : [];
    const activeNames = new Set(activeEntries.map(entry => normalizePlayer(entry.name)));
    const usePublished = activeCareer && snapshot.audience === "individual" && snapshot.period === "career" &&
      published?.entries.length && activeEntries.every(entry => typeof entry.playerId === "string" && [...careerIdentityMap(retainedCareer).values()].some(player => player.playerId === entry.playerId && normalizePlayer(player.name) === normalizePlayer(entry.name))) && Date.parse(published.checkedAt) >= Date.parse(retainedCareer.checkedAt) && activeEntries.length && activeNames.size === activeEntries.length && Number.isFinite(Date.parse(published.checkedAt)) &&
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
      rank: entry.rank, player: entry.name, team: entry.context, years: entry.years, value: entry.value, isActive: entry.isActive, playerId: entry.playerId,
    }))).slice(0, snapshot.audience === "team" ? selected.entries.length : 25);
    leaderboards[snapshot.id] = ranked.map((record) => ({
      id: `${snapshot.id}:${(record as typeof record & {playerId?:string}).playerId ?? slug(`${record.player}-${record.team}-${record.years}`)}`,
      rank: record.rank, name: record.player, context: record.team, years: record.years, value: record.value,
      playerId: (record as typeof record & {playerId?:string}).playerId,
      isActive: snapshot.audience === "individual" && snapshot.period === "career" &&
        (record.isActive ?? /(?:^|\D)2026(?:\D|$)/.test(record.years)),
    }));
    const career = league === "NFL" && snapshot.audience === "individual" && snapshot.period === "career";
    datasets[snapshot.id] = {mode: usePublished || career ? "active-career" : "record-book", checkedAt: usePublished ? published!.checkedAt : career ? retainedCareer.checkedAt : null};
  }
  const careerChecks = Object.values(datasets).filter(dataset => dataset.mode === "active-career").map(dataset => dataset.checkedAt!).sort();
  const checkedAt = careerChecks[0] ?? null;
  return { leaderboards, datasets, source: {
    mode: careerChecks.length ? "active-career" : "record-book",
    checkedAt,
    publicationAvailable,
    careerFailedAt:store.nflCareerRefreshFailedAt ?? null,
    careerCutoff:nflCareerPublication.cutoff,
    discovery:retainedCareer.discovery ? {checkedAt:retainedCareer.discovery.checkedAt,sourceUrl:retainedCareer.discovery.sourceUrl,coverage:retainedCareer.discovery.coverage} : null,
    team: league === "NFL" ? {baselineThroughSeason:2025, checkedAt:verifiedTeamLedger?.checkedAt ?? null, games:verifiedTeamLedger?.games.length ?? 0, failedAt:store.nflTeamRefreshFailedAt ?? null} : null,
    provider: careerChecks.length ? "ESPN career statistics; nflverse roster selection" : "Bundled record-book snapshot",
    coverage: careerChecks.length ? "Verified ESPN/GSIS candidates plus scheduled source/roster discovery; receiving-yard and tackle discovery remain limited; other tables remain snapshots" : "Static historical catalog; check time is not a new source publication",
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
  let currentSnapshots: AllTimeSnapshot[];
  let liveNflSource: NflLiveCareerSource | undefined;
  let nextTeamLedger = store.nflTeamLedger;
  let teamError: unknown;
  let careerError: unknown;
  if (league === "CFB") {
    currentSnapshots = buildAllTimeCatalog(checkedAt).filter(snapshot => snapshot.league === "CFB");
  } else {
    // Independent publications: an individual provider failure must not prevent
    // confirmed team results from updating, nor erase the previous career feed.
    try { nextTeamLedger = await loadNflTeamResults(store.nflTeamLedger); } catch (error) { teamError = error; }
    let built: Awaited<ReturnType<typeof buildLatestAllTimeCatalog>> | undefined;
    try { built = await buildLatestAllTimeCatalog(checkedAt, league, store.nflCareerSource); liveNflSource = built.liveNflSource; }
    catch (error) { careerError = error; }
    if (teamError && careerError) throw careerError;
    currentSnapshots = built?.snapshots ?? buildAllTimeCatalog(checkedAt).filter(snapshot => !league || snapshot.league === league);
    if (careerError) currentSnapshots = currentSnapshots.map(snapshot =>
      snapshot.league === "NFL" && snapshot.audience === "individual" && snapshot.period === "career"
        ? store.snapshots.find(prior => prior.id === snapshot.id) ?? snapshot : snapshot);
    const teams = nflTeamRecordSets(nextTeamLedger);
    currentSnapshots = currentSnapshots.map(snapshot => snapshot.league === "NFL" && snapshot.audience === "team"
      ? createSnapshot("NFL", "team", "career", snapshot.category, teams[snapshot.category as keyof typeof teams], nextTeamLedger?.checkedAt ?? checkedAt) : snapshot);
  }
  const previousSnapshots = new Map(store.snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const needsNflRebaseline =
    (league === undefined || league === "NFL") && !careerError && store.catalogVersion !== monitorCatalogVersion;
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
      league === "CFB" || careerError ? store.catalogVersion : monitorCatalogVersion,
    snapshots: [...retainedSnapshots, ...currentSnapshots],
    signals: retainAllTimeSignals(store.signals, signals),
    lastCheckedAt: checkedAt,
    nflTeamLedger: nextTeamLedger,
    nflCareerSource:liveNflSource ?? store.nflCareerSource,
    nflCareerRefreshFailedAt:league === "CFB" ? store.nflCareerRefreshFailedAt : careerError ? checkedAt : undefined,
    nflTeamRefreshFailedAt: league === "CFB" ? store.nflTeamRefreshFailedAt : teamError ? checkedAt : undefined,
  };
  await writeStore(updatedStore, store);

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
    teamResults: nextTeamLedger ? {games:nextTeamLedger.games.length,checkedAt:nextTeamLedger.checkedAt} : null,
    failures: {team:Boolean(teamError),individual:Boolean(careerError)},
    activeEntries: currentSnapshots.reduce(
      (total, snapshot) => total + snapshot.entries.filter((entry) => entry.isActive).length,
      0,
    ),
  };
}
