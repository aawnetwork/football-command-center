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
                return categoryRecords ? [{ title, records: categoryRecords }] : [];
              })
            : teamRecords
              ? teamCareerCategories.map(([title, category, unit]) => ({
                  title,
                  unit,
                  records: teamRecords[category] as AllTimeRecord[],
                }))
            : undefined
        }
      />

      <p className="all-time-panel__source">
        <strong>Historical source:</strong> NFL Record &amp; Fact Book,
        compiled by the Elias Sports Bureau.
      </p>
    </section>
  );
}
