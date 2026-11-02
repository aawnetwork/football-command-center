import { recordEnvelope } from "./basement-export";
import { getPinnedRecordStore, getAllTimeLeaderboardFeed } from "./all-time-monitor";
import { nflTeamNameByAbbreviation } from "../nfl/data/divisions";
import { nflCareerPublication, retainedNflCareerSource, careerIdentityMap } from "./all-time-nfl-careers";
import type { NflLiveCareerSource } from "./all-time-live-sources";
/** Single pinned durable read. Public tables stay in Hub; private interpretation belongs to Basement. */
export async function getBasementRecordPublication() {
  const store = await getPinnedRecordStore();
  const career: NflLiveCareerSource = store.nflCareerSource && Date.parse(store.nflCareerSource.checkedAt) >= Date.parse(nflCareerPublication.checkedAt)
    ? store.nflCareerSource : retainedNflCareerSource();
  const reverseTeams = new Map(Object.entries(nflTeamNameByAbbreviation).map(([code, name]) => [name, code]));
  const playerIdentities = [...careerIdentityMap(career).values()].map(identity => {
    const rows = Object.values(career.categories).flat().filter(row => row.playerId === identity.playerId);
    const teams = [...new Set(rows.map(row => reverseTeams.get(row.team)).filter(Boolean))];
    return {...identity, team: teams.length === 1 ? teams[0] : null, observedAt: career.checkedAt,
      sourceUrls: [...new Set(rows.flatMap(row => [row.sourceUrl, row.verificationUrl]).filter(Boolean))]};
  });
  async function basementFeed(league: "NFL" | "CFB") {
    const feed = await getAllTimeLeaderboardFeed(league, store);
    const rejectedTables: Record<string, {reason:string; rows:unknown[]}> = {};
    for (const [id, rows] of Object.entries(feed.leaderboards)) {
      const ids = rows.map(row => row.id);
      const players = rows.flatMap(row => row.playerId ? [row.playerId] : []);
      if (new Set(ids).size !== ids.length || new Set(players).size !== players.length) {
        rejectedTables[id] = {reason: "Conflicting record identities; table withheld from automatic findings", rows};
        delete feed.leaderboards[id]; delete feed.datasets[id]; continue;
      }
      if (id.startsWith("NFL:team:")) for (const row of rows) Object.assign(row, {teamId: reverseTeams.get(row.name) ?? null});
    }
    return {...feed, rejectedTables};
  }
  return recordEnvelope({kind: "record-facts", source: "AAW Hub factual record publications", catalogVersion: store.catalogVersion ?? null,
    lastCheckedAt: store.lastCheckedAt ?? null,
    leagues: {CFB: await basementFeed("CFB"), NFL: await basementFeed("NFL")},
    playerIdentities, legacySignals: store.signals,
    limitations: ["Detection timestamps do not identify achievement games.", "CFB record books are historical snapshots, not live career totals.", "Public factual collection remains in Hub; private milestone interpretation belongs to Basement."]});
}
