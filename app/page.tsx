import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#f8fafc",
        padding: "60px 24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: 900,
            letterSpacing: "0.12em",
            color: "#60a5fa",
            marginBottom: "12px",
          }}
        >
          FOOTBALL COMMAND CENTER
        </div>

        <h1
          style={{
            fontSize: "clamp(42px, 7vw, 72px)",
            lineHeight: 1,
            margin: "0 0 20px",
            fontWeight: 900,
          }}
        >
          Your Football
          <br />
          Intelligence Hub
        </h1>

        <p
          style={{
            maxWidth: "620px",
            margin: "0 auto 48px",
            color: "#94a3b8",
            fontSize: "18px",
            lineHeight: 1.6,
          }}
        >
          Find the games, performances and storylines worth talking about.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "24px",
            textAlign: "left",
          }}
        >
          <Link
            href="/cfb"
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                padding: "32px",
                borderRadius: "16px",
                background: "#0f172a",
                border: "1px solid #334155",
                minHeight: "220px",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "20px" }}>
                🏈
              </div>

              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 900,
                  marginBottom: "8px",
                }}
              >
                CFB
              </div>

              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "16px",
                  marginBottom: "28px",
                }}
              >
                College Football
              </div>

              <div
                style={{
                  color: "#60a5fa",
                  fontWeight: 900,
                }}
              >
                ENTER →
              </div>
            </div>
          </Link>

          <Link
            href="/nfl"
            style={{
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                padding: "32px",
                borderRadius: "16px",
                background: "#0f172a",
                border: "1px solid #334155",
                minHeight: "220px",
              }}
            >
              <div style={{ fontSize: "42px", marginBottom: "20px" }}>
                🏈
              </div>

              <div
                style={{
                  fontSize: "28px",
                  fontWeight: 900,
                  marginBottom: "8px",
                }}
              >
                NFL
              </div>

              <div
                style={{
                  color: "#94a3b8",
                  fontSize: "16px",
                  marginBottom: "28px",
                }}
              >
                National Football League
              </div>

              <div
                style={{
                  color: "#ef4444",
                  fontWeight: 900,
                }}
              >
                ENTER →
              </div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}