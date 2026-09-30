"use client";

import { useEffect, useState } from "react";

import {
  nflAllTimeCareerIndividual,
  nflAllTimeSeasonIndividual,
  nflAllTimeSingleGameIndividual,
  type NflAllTimeCategory,
  type NflAllTimeSingleGameCategory,
} from "../../nfl/data/nfl-all-time-career";
import {
  nflAllTimeCareerTeam,
  type NflAllTimeTeamCategory,
} from "../../nfl/data/nfl-all-time-team";
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

  useEffect(() => {
    let cancelled = false;

    fetch("/api/all-time/leaderboards?league=NFL")
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
      })
      .catch(() => {
        // The bundled record book remains the reliable fallback while offline.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const recordsFor = (audience: "individual" | "team", recordPeriod: "career" | "season" | "single-game", category: string, fallback: AllTimeRecord[]) =>
    liveLeaderboards[`NFL:${audience}:${recordPeriod}:${category}`] ?? fallback;

  const individualRecords =
    view === "individual" && period === "career"
      ? nflAllTimeCareerIndividual
      : view === "individual" && period === "season"
        ? nflAllTimeSeasonIndividual
        : view === "individual" && period === "single-game"
          ? nflAllTimeSingleGameIndividual
        : null;
  const teamRecords = view === "team" && period === "career" ? nflAllTimeCareerTeam : null;
  const records = individualRecords ?? teamRecords;
  const availablePeriods =
    view === "individual"
      ? (["career", "season", "single-game"] as const)
      : (["career", "season"] as const);
  const activeCategories = period === "single-game" ? singleGameCategories : categories;

  return (
    <section className="all-time-panel">
      <div className="all-time-panel__header">
        <h2>🏆 All-Time</h2>
        <p>
          NFL record leaders, organized by record holder and record type.
        </p>
      </div>

      <div className="all-time-panel__controls">
        {(["individual", "team"] as const).map((option) => (
          <button
            key={option}
            aria-pressed={view === option}
            onClick={() => {
              onViewChange(option);
              if (option === "team" && period === "single-game") {
                onPeriodChange("career");
              }
            }}
          >
            {option === "individual" ? "Individual" : "Team"}
          </button>
        ))}
        <span aria-hidden="true" />
        {availablePeriods.map((option) => (
          <button key={option} aria-pressed={period === option} onClick={() => onPeriodChange(option)}>
            {option === "single-game" ? "Single Game" : option === "season" ? "Season" : "Career"}
          </button>
        ))}
      </div>

      <AllTimeRecordGrid
        unavailableMessage={
          records
            ? undefined
            : view === "team" && period === "season"
              ? "Team season records are being sourced next."
              : view === "team"
                ? "Team record sets are being sourced."
              : "Individual record sets are ready for their source data."
        }
        categories={
          individualRecords
            ? activeCategories.flatMap(([title, category]) => {
                const categoryRecords = individualRecords[category as NflAllTimeCategory];
                return categoryRecords
                  ? [{ title, records: recordsFor("individual", period, category, categoryRecords) }]
                  : [];
              })
            : teamRecords
              ? teamCareerCategories.map(([title, category, unit]) => ({
                  title,
                  unit,
                  records: recordsFor("team", "career", category, teamRecords[category] as AllTimeRecord[]),
                }))
            : undefined
        }
      />

      <p className="all-time-panel__source">
        <strong>Historical source:</strong> NFL Record &amp; Fact Book,
        compiled by the Elias Sports Bureau. <strong>Active-player updates:</strong>{" "}
        ESPN career stats, with roster status from nflverse.
      </p>
    </section>
  );
}
