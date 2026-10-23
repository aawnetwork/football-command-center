"use client";

import { useEffect, useState } from "react";

import {
  nflAllTimeSeasonIndividual,
  nflAllTimeSingleGameIndividual,
  type NflAllTimeCategory,
  type NflAllTimeSingleGameCategory,
} from "../../nfl/data/nfl-all-time-career";
import {
  type NflAllTimeTeamCategory,
} from "../../nfl/data/nfl-all-time-team";
import {nflCareerRecordSets, nflCareerPublication, nflCareerCategories} from "../../lib/all-time-nfl-careers";
import { AllTimeSources, recordSourceLabel, type AllTimeDatasetSources, type AllTimeSources as SourceInfo } from "./AllTimeSources";
import { nflTeamRecordSets } from "../../lib/all-time-nfl-teams";
import { AllTimeRecordGrid, type AllTimeRecord } from "./AllTimeRecordGrid";

type NflAllTimePanelProps = {
  view: "individual" | "team";
  period: "season" | "career" | "single-game";
  onViewChange: (view: "individual" | "team") => void;
  onPeriodChange: (period: "season" | "career" | "single-game") => void;
};

const categories: [string, NflAllTimeCategory][] = [
  ["🏈 Passing Yards", "passing-yards"],
  ["🏈 Passing TDs", "passing-td"],
  ["🏃 Rushing Yards", "rushing-yards"],
  ["🏃 Rushing TDs", "rushing-td"],
  ["🙌 Receiving Yards", "receiving-yards"],
  ["🙌 Receiving TDs", "receiving-td"],
  ["🛡️ Tackles", "tackles"],
  ["🔥 Sacks", "sacks"],
  ["🎯 Interceptions", "interceptions"],
];

const singleGameCategories: [string, NflAllTimeSingleGameCategory][] = [
  ...categories,
  ["⚡ Yards From Scrimmage", "yards-from-scrimmage"],
];

const teamCareerCategories: [string, NflAllTimeTeamCategory, string][] = [
  ["🏈 All-Time Wins", "wins", "wins"],
  ["📈 Winning Percentage", "winning-percentage", "%"],
];

export function NflAllTimePanel({
  view,
  period,
  onViewChange,
  onPeriodChange,
}: NflAllTimePanelProps) {
  const [liveLeaderboards, setLiveLeaderboards] = useState<Record<string, AllTimeRecord[]>>({});

  const [source, setSource] = useState<SourceInfo | null>({mode:"active-career",checkedAt:nflCareerPublication.checkedAt,careerCutoff:nflCareerPublication.cutoff});

  const [datasetSources, setDatasetSources] = useState<AllTimeDatasetSources>(Object.fromEntries(nflCareerCategories.map(category => [`NFL:individual:career:${category}`,{mode:"active-career",checkedAt:nflCareerPublication.checkedAt}])));

  useEffect(() => {
    let cancelled = false;

    const loadLeaderboards = () => fetch("/api/all-time/leaderboards?league=NFL")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load NFL all-time updates.");
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;

        const leaderboards = Object.entries(data.leaderboards ?? {}).reduce<Record<string, AllTimeRecord[]>>(
          (records, [key, entries]) => {
            records[key] = (entries as {
              rank: number;
              name: string;
              context: string;
              years: string;
              value: number;
              isActive: boolean;
            }[]).map((entry) => ({
              rank: entry.rank,
              player: entry.name,
              team: entry.context,
              years: entry.years,
              value: entry.value,
              isActive: entry.isActive,
            }));
            return records;
          },
          {},
        );
        setLiveLeaderboards(leaderboards);
        setSource(data.source ?? null);
        setDatasetSources(data.datasets ?? {});
      })
      .catch(() => {
        // Keep the last received observations, not a rollback to the older base.
        setSource(previous => previous ? {...previous, publicationAvailable:false} : {mode:"record-book",checkedAt:null,publicationAvailable:false});
      });

    loadLeaderboards();
    const interval = window.setInterval(loadLeaderboards, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const recordsFor = (audience: "individual" | "team", recordPeriod: "career" | "season" | "single-game", category: string, fallback: AllTimeRecord[]) =>
    liveLeaderboards[`NFL:${audience}:${recordPeriod}:${category}`]?.length ? liveLeaderboards[`NFL:${audience}:${recordPeriod}:${category}`] : fallback;

  const displayPeriod = view === "team" ? "career" : period;

  const individualRecords =
    view === "individual" && displayPeriod === "career"
      ? nflCareerRecordSets()
      : view === "individual" && displayPeriod === "season"
        ? nflAllTimeSeasonIndividual
        : view === "individual" && displayPeriod === "single-game"
          ? nflAllTimeSingleGameIndividual
        : null;
  const teamRecords = view === "team" && displayPeriod === "career" ? nflTeamRecordSets() : null;
  const records = individualRecords ?? teamRecords;
  const availablePeriods =
    view === "individual"
      ? (["career", "season", "single-game"] as const)
      : (["career"] as const);
  const activeCategories = displayPeriod === "single-game" ? singleGameCategories : categories;

  return (
    <section className="all-time-panel">
      <div className="centre-secondary-nav" role="group" aria-label="Record holders">
        {(["individual", "team"] as const).map((option) => (
          <button
            key={option}
            aria-pressed={view === option}
            onClick={() => {
              onViewChange(option);
              if (option === "team" && period !== "career") {
                onPeriodChange("career");
              }
            }}
          >
            {option === "individual" ? "Individual" : "Team"}
          </button>
        ))}
      </div>

      <div className="all-time-panel__header centre-section-header">
        <h2>🏆 All-Time Records</h2>
        <p>
          Individual and franchise records from retained historical sources.
        </p>
      </div>

      <div className="all-time-panel__controls centre-category-controls" role="group" aria-label="Record period">
        {availablePeriods.map((option) => (
          <button key={option} aria-pressed={displayPeriod === option} onClick={() => onPeriodChange(option)}>
            {view === "team" ? "All-Time" : option === "single-game" ? "Single Game" : option === "season" ? "Season" : "Career"}
          </button>
        ))}
        {view === "team" && <button disabled title="Verified historical team-season records are not available from retained sources.">Single Season · Unavailable</button>}
      </div>
      {view === "team" && <p className="all-time-panel__availability" role="status">Single Season records are unavailable until verified historical tables are added.</p>}

      <AllTimeRecordGrid
        period={displayPeriod}
        audience={view}
        unavailableMessage={records ? undefined : "No verified records are available for this selection."}
        categories={
          individualRecords
            ? activeCategories.flatMap(([title, category]) => {
                const categoryRecords = individualRecords[category as NflAllTimeCategory];
                return categoryRecords
                  ? [{ title, records: recordsFor("individual", displayPeriod, category, categoryRecords), sourceLabel: recordSourceLabel(datasetSources[`NFL:individual:${displayPeriod}:${category}`]) }]
                  : [];
              })
            : teamRecords
              ? [...teamCareerCategories.map(([title, category, unit]) => ({
                  title, unit,
                  records: recordsFor("team", "career", category, teamRecords[category]).map(record => ({...record, isActive: false})),
                  sourceLabel: recordSourceLabel(datasetSources[`NFL:team:career:${category}`] ?? {mode:"verified-baseline",checkedAt:null}),
                })), {
                  title: "🏟️ Games Played", unit: "games",
                  records: recordsFor("team", "career", "games-played", teamRecords["games-played"]).map(record => ({...record, isActive: false})),
                  sourceLabel: recordSourceLabel(datasetSources["NFL:team:career:games-played"] ?? {mode:"verified-baseline",checkedAt:null}),
                }]
            : undefined
        }
      />

      <AllTimeSources league="NFL" audience={view} period={displayPeriod} source={source} />

    </section>
  );
}
