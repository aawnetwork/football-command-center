export type AllTimeRecord = {
  rank: number;
  player: string;
  team: string;
  years: string;
  value: number;
  isActive?: boolean;
};

type AllTimeRecordGridProps = {
  categories?: {
    title: string;
    unit?: string;
    records: AllTimeRecord[];
  }[];
  unavailableMessage?: string;
};

export function AllTimeRecordGrid({
  categories = [],
  unavailableMessage,
}: AllTimeRecordGridProps) {
  if (unavailableMessage) {
    return <div className="all-time-panel__unavailable">{unavailableMessage}</div>;
  }

  return (
    <div className="all-time-record-grid">
      {categories.map(({ title, unit, records }) => (
        <article className="all-time-record-card" key={title}>
          <div className="all-time-record-card__title">
            <span>{title}</span>
            <small>Top {Math.min(10, records.length)} of {records.length}</small>
          </div>
          {[...records]
            .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player))
            .slice(0, 10)
            .map((record, index) => {
            const isActive = record.isActive ?? /(?:^|\D)2026(?:\D|$)/.test(record.years);

            return (
              <div
                className={`all-time-record-row${isActive ? " all-time-record-row--active" : ""}`}
                key={`${title}-${record.rank}-${record.player}`}
              >
                <span className="all-time-record-row__rank">{index + 1}</span>
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
                  {record.value.toLocaleString()}
                  {unit ? ` ${unit}` : ""}
                </strong>
              </div>
            );
          })}
        </article>
      ))}
    </div>
  );
}
