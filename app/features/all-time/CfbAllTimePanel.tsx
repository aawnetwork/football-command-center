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
  const individualRecords =
    view === "individual" && period === "career"
      ? cfbAllTimeCareerIndividual
      : view === "individual" && period === "season"
        ? cfbAllTimeSeasonIndividual
        : view === "individual" && period === "single-game"
          ? cfbAllTimeSingleGameIndividual
        : null;
  const programRecords = view === "team" && period === "career" ? cfbAllTimeCareerProgram : null;
  const records = individualRecords ?? programRecords;
  const availablePeriods =
    view === "individual"
      ? (["career", "season", "single-game"] as const)
      : (["career", "season"] as const);

  return (
    <section className="all-time-panel">
      <div className="all-time-panel__header">
        <h2>🏆 All-Time</h2>
        <p>Historical FBS leaders, organized by record holder and record type.</p>
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
              ? "Program season records are being sourced next."
              : view === "team"
                ? "Program record sets are being sourced."
              : "Individual record sets are ready for their source data."
        }
        categories={
          individualRecords
            ? categories.flatMap(([label, category, unit]) => {
                const categoryRecords = individualRecords[category];
                if (!categoryRecords) return [];

                return [{
                  title: label,
                  unit,
                  records: categoryRecords as AllTimeRecord[],
                }];
              })
            : programRecords
              ? programCareerCategories.flatMap(([label, category, unit]) => {
                  const categoryRecords = programRecords[category];
                  if (!categoryRecords) return [];

                  return [{
                    title: label,
                    unit,
                    records: categoryRecords as AllTimeRecord[],
                  }];
                })
            : undefined
        }
      />

      <p className="all-time-panel__source">
        <strong>Historical data:</strong> NCAA FBS football record book. The
        complete Top 25 for each category is retained in the underlying data;
        this view displays ranks 1–10.
      </p>
    </section>
  );
}
