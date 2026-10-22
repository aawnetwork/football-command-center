"use client";

import { useEffect, useState } from "react";

import {
  cfbAllTimeCareerIndividual,
  cfbAllTimeSeasonIndividual,
  cfbAllTimeSingleGameIndividual,
  type CfbAllTimeCategory,
} from "../../cfb/data/cfb-all-time-career";
import {
  cfbAllTimeCareerProgram,
  type CfbAllTimeProgramCategory,
} from "../../cfb/data/cfb-all-time-program";
import { AllTimeSources, recordSourceLabel, type AllTimeDatasetSources, type AllTimeSources as SourceInfo } from "./AllTimeSources";
import { AllTimeRecordGrid, type AllTimeRecord } from "./AllTimeRecordGrid";

type CfbAllTimePanelProps = {
  view: "individual" | "team";
  period: "season" | "career" | "single-game";
  onViewChange: (view: "individual" | "team") => void;
  onPeriodChange: (period: "season" | "career" | "single-game") => void;
};

const categories: [string, CfbAllTimeCategory, string][] = [
  ["🏈 Passing Yards", "passing-yards", "yards"],
  ["🎯 Passing TDs", "passing-td", "TD"],
  ["🏃 Rushing Yards", "rushing-yards", "yards"],
  ["🔥 Rushing TDs", "rushing-td", "TD"],
  ["🙌 Receiving Yards", "receiving-yards", "yards"],
  ["🎯 Receiving TDs", "receiving-td", "TD"],
  ["⚡ Total Offense", "total-offense-yards", "yards"],
  ["🏅 Points", "points", "points"],
  ["🛡️ Tackles", "tackles", "tackles"],
  ["💥 Sacks", "sacks", "sacks"],
  ["🖐️ Interceptions", "interceptions", "INT"],
];

const programCareerCategories: [string, CfbAllTimeProgramCategory, string][] = [
  ["🏈 All-Time Wins", "wins", "wins"],
  ["📈 Winning Percentage", "winning-percentage", "%"],
];

export function CfbAllTimePanel({
  view,
  period,
  onViewChange,
  onPeriodChange,
}: CfbAllTimePanelProps) {
  const [liveLeaderboards, setLiveLeaderboards] = useState<Record<string, AllTimeRecord[]>>({});

  const [source, setSource] = useState<SourceInfo | null>(null);

  const [datasetSources, setDatasetSources] = useState<AllTimeDatasetSources>({});

  useEffect(() => {
    let cancelled = false;

    const loadLeaderboards = () => fetch("/api/all-time/leaderboards?league=CFB")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load CFB all-time updates.");
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
        // The bundled NCAA record-book snapshot remains available offline.
      });

    loadLeaderboards();
    const interval = window.setInterval(loadLeaderboards, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const recordsFor = (audience: "individual" | "team", recordPeriod: "career" | "season" | "single-game", category: string, fallback: AllTimeRecord[]) =>
    liveLeaderboards[`CFB:${audience}:${recordPeriod}:${category}`]?.length ? liveLeaderboards[`CFB:${audience}:${recordPeriod}:${category}`] : fallback;

  const displayPeriod = view === "team" ? "career" : period;

  const individualRecords =
    view === "individual" && displayPeriod === "career"
      ? cfbAllTimeCareerIndividual
      : view === "individual" && displayPeriod === "season"
        ? cfbAllTimeSeasonIndividual
        : view === "individual" && displayPeriod === "single-game"
          ? cfbAllTimeSingleGameIndividual
        : null;
  const programRecords = view === "team" && displayPeriod === "career" ? cfbAllTimeCareerProgram : null;
  const records = individualRecords ?? programRecords;
  const availablePeriods =
    view === "individual"
      ? (["career", "season", "single-game"] as const)
      : (["career"] as const);

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
        <p>Individual and program records from retained historical sources.</p>
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
            ? categories.flatMap(([label, category, unit]) => {
                const categoryRecords = individualRecords[category];
                if (!categoryRecords) return [];

                return [{
                  title: label,
                  unit,
                  records: recordsFor("individual", displayPeriod, category, categoryRecords as AllTimeRecord[]),
                  sourceLabel: recordSourceLabel(datasetSources[`CFB:individual:${displayPeriod}:${category}`]),
                }];
              })
            : programRecords
              ? programCareerCategories.flatMap(([label, category, unit]) => {
                  const categoryRecords = programRecords[category];
                  if (!categoryRecords) return [];

                return [{
                  title: label,
                  unit,
                  records: recordsFor("team", "career", category, categoryRecords as AllTimeRecord[]).map(record => ({...record, years: "Cutoff unverified", isActive: false})),
                  sourceLabel: "Retained program snapshot · 25 programs",
                }];
                })
            : undefined
        }
      />

      <AllTimeSources league="CFB" audience={view} period={displayPeriod} source={source} />

    </section>
  );
}
