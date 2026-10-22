export type PerformancePosition = "all" | "qb" | "rb" | "wr" | "def";

const positions: Array<{
  id: PerformancePosition;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "qb", label: "QB" },
  { id: "rb", label: "RB" },
  { id: "wr", label: "REC" },
  { id: "def", label: "DEF" },
];

type PerformancePositionControlsProps = {
  value: PerformancePosition;
  onChange: (value: PerformancePosition) => void;
};

export function PerformancePositionControls({
  value,
  onChange,
}: PerformancePositionControlsProps) {
  return (
    <div className="centre-category-controls" role="group" aria-label="Performance categories">
      {positions.map((position) => (
        <button
          key={position.id}
          type="button"
          aria-pressed={value === position.id}
          onClick={() => onChange(position.id)}
        >
          {position.label}
        </button>
      ))}
    </div>
  );
}
