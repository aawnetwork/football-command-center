import "./all-time.css";
import { rankHistoricalRecords } from "../../lib/all-time-records";

export type AllTimeRecord = {
  rank: number;
  player: string;
  team: string;
  years: string;
  value: number;
  isActive?: boolean;
};

type AllTimeRecordGridProps = {
  period?: "career" | "season" | "single-game";
  categories?: {
    title: string;
    unit?: string;
    sourceLabel?: string;
    records: AllTimeRecord[];
  }[];
  unavailableMessage?: string;
  audience?: "individual" | "team";
};

export function AllTimeRecordGrid({
  period = "career",
  categories = [],
  unavailableMessage,
  audience = "individual",
}: AllTimeRecordGridProps) {
  if (unavailableMessage) {
    return <div className="all-time-panel__unavailable">{unavailableMessage}</div>;
  }

  const tables = categories.map(category => ({...category, records: rankHistoricalRecords(category.records)}))
    .filter(category => category.records.length > 0);
  if (!tables.length) return <div className="all-time-panel__unavailable">No verified records are available for this selection.</div>;

  return (
    <div className="all-time-record-grid">
      {tables.map(({ title, unit, records: ranked, sourceLabel }) => {
        const boundary = ranked[9]?.value;
        const visible = ranked.filter((record, index) => index < 10 || record.value === boundary);
        return (
        <article className="all-time-record-card" data-desk-export="all-time" data-export-label={`${audience === "team" ? period === "season" ? "Single Season" : "All-Time" : period === "single-game" ? "Single Game" : period === "season" ? "Season" : "Career"} · ${title}`} key={title}>
          <div className="all-time-record-card__title">
            <span>{title}</span>
            <small>Top {visible.length} of {ranked.length}</small>
          </div>
          {sourceLabel && <p className="all-time-record-card__source">{sourceLabel}</p>}
          {visible.map((record) => {
            // A historical season/date is not evidence that a player is active.
            const isActive = audience === "individual" && period === "career" &&
              (record.isActive ?? /(?:^|\D)2026(?:\D|$)/.test(record.years));

            return (
              <div
                className={`all-time-record-row${isActive ? " all-time-record-row--active" : ""}`}
                key={`${title}-${record.rank}-${record.player}-${record.team}-${record.years}`}
              >
                <span className="all-time-record-row__rank">{record.rank}</span>
                <div className="all-time-record-row__player">
                  <div>
                    {record.player}
                    {isActive && <span className="all-time-record-row__active">ACTIVE</span>}
                  </div>
                  <small>
                    {record.team}
                    {record.years ? ` · ${record.years}` : ""}
                  </small>
                </div>
                <strong>
                  {record.value.toLocaleString("en-GB")}
                  {unit ? ` ${unit}` : ""}
                </strong>
              </div>
            );
          })}
        </article>
      );})}
    </div>
  );
}
