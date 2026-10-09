import {
  getNflTeamName,
  type NFLPerformance,
} from "../../lib/nfl-helpers";

type NflPerformanceCardProps = {
  performance: NFLPerformance;
  contentAngle: string;
};

function getResultLabel(performance: NFLPerformance) {
  if (!performance.game_score) {
    return performance.result === "W" ? "WIN" : "LOSS";
  }

  return performance.game_score
    .replace(/^W\s*/i, "WIN ")
    .replace(/^L\s*/i, "LOSS ");
}

export function NflPerformanceCard({
  performance,
  contentAngle,
}: NflPerformanceCardProps) {
  const stats = [
    performance.passing_yards > 0 && {
      label: "Passing Yards",
      value: `${performance.passing_yards.toLocaleString()} yards`,
    },
    performance.passing_tds > 0 && {
      label: "Passing TD",
      value: `${performance.passing_tds} TD`,
    },
    performance.rushing_yards > 0 && {
      label: "Rushing Yards",
      value: `${performance.rushing_yards.toLocaleString()} yards`,
    },
    performance.rushing_tds > 0 && {
      label: "Rushing TD",
      value: `${performance.rushing_tds} TD`,
    },
    performance.receiving_yards > 0 && {
      label: "Receiving Yards",
      value: `${performance.receiving_yards.toLocaleString()} yards`,
    },
    performance.receiving_tds > 0 && {
      label: "Receiving TD",
      value: `${performance.receiving_tds} TD`,
    },
    performance.tackles > 0 && {
      label: "Tackles",
      value: `${performance.tackles} tackles`,
    },
    performance.sacks > 0 && {
      label: "Sacks",
      value: `${performance.sacks} sacks`,
    },
  ].filter(
    (stat): stat is { label: string; value: string } => Boolean(stat)
  );

  return (
    <div
      data-desk-export="performance" data-export-label={`${performance.player_display_name} · ${getNflTeamName(performance.recent_team)}`}
      style={{
        padding: "18px",
        border: "1px solid #334155",
        borderRadius: "10px",
        background: "#020617",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: "20px", fontWeight: 800 }}>
            🔥 {performance.player_display_name} ·{" "}
            {getNflTeamName(performance.recent_team)}
          </div>
          {performance.opponent_team && (
            <div data-export-omit style={{ color: "#cbd5e1", marginTop: "6px" }}>
              vs. {getNflTeamName(performance.opponent_team)}
            </div>
          )}
        </div>

        <div
          style={{
            color: "#fbbf24",
            fontWeight: 800,
            fontSize: "16px",
          }}
        >
          {getResultLabel(performance)}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginTop: "16px",
        }}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "#0f172a",
              border: "1px solid #1e293b",
              minWidth: "110px",
            }}
          >
            <div
              style={{
                color: "#94a3b8",
                fontSize: "11px",
                textTransform: "uppercase",
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontSize: "18px",
                fontWeight: 800,
                marginTop: "4px",
              }}
            >
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      <div
        data-export-omit
        style={{
          marginTop: "16px",
          padding: "12px 14px",
          borderRadius: "8px",
          background: "#111827",
          border: "1px solid #334155",
        }}
      >
        <div
          style={{
            color: "#60a5fa",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "0.08em",
            marginBottom: "6px",
          }}
        >
          📣 CONTENT ANGLE
        </div>
        <div
          style={{
            color: "#e2e8f0",
            fontWeight: 700,
            lineHeight: 1.5,
          }}
        >
          {contentAngle}
        </div>
      </div>
    </div>
  );
}
