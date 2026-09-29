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
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        marginBottom: "28px",
      }}
    >
      {positions.map((position) => (
        <button
          key={position.id}
          type="button"
          aria-pressed={value === position.id}
          onClick={() => onChange(position.id)}
          style={{
            padding: "8px 14px",
            borderRadius: "8px",
            border: "1px solid",
            borderColor:
              value === position.id ? "#ef4444" : "#334155",
            background:
              value === position.id ? "#3f0d12" : "#0f172a",
            color:
              value === position.id ? "#fca5a5" : "#94a3b8",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {position.label}
        </button>
      ))}
    </div>
  );
}
