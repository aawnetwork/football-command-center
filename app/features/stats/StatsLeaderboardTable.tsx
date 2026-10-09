type LeaderboardRow = {
  id: string;
  name: string;
  team?: string;
  value: string;
};

type StatsLeaderboardTableProps = {
  title: string;
  subtitle: string;
  rows: LeaderboardRow[];
  showTeam?: boolean;
};

const headerCellStyle = {
  padding: "14px 18px",
  textAlign: "left" as const,
  color: "#94a3b8",
  fontSize: "13px",
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  borderBottom: "1px solid #1e293b",
};

const bodyCellStyle = {
  padding: "14px 18px",
  borderBottom: "1px solid #1e293b",
};

export function StatsLeaderboardTable({
  title,
  subtitle,
  rows,
  showTeam = false,
}: StatsLeaderboardTableProps) {
  return (
    <div
      data-desk-export="stats" data-export-label={`${title} · ${subtitle}`}
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "18px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "22px" }}>{title}</h2>
        <p style={{ color: "#94a3b8", marginBottom: 0 }}>{subtitle}</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {showTeam ? (
              <>
                <col style={{ width: "12%" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "36%" }} />
                <col style={{ width: "20%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "16%" }} />
                <col style={{ width: "60%" }} />
                <col style={{ width: "24%" }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th style={headerCellStyle}>Rank</th>
              <th style={headerCellStyle}>{showTeam ? "Player" : "Team"}</th>
              {showTeam && <th style={headerCellStyle}>Team</th>}
              <th style={headerCellStyle}>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td style={bodyCellStyle}>{index + 1}</td>
                <td style={{ ...bodyCellStyle, fontWeight: 700 }}>
                  {row.name}
                </td>
                {showTeam && <td style={bodyCellStyle}>{row.team}</td>}
                <td style={{ ...bodyCellStyle, fontWeight: 800 }}>
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
