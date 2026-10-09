import type { ReactNode } from "react";

type GameCardProps = {
  status: string;
  statusKind?: "live" | "final" | "scheduled";
  statusDetail?: string | null;
  awayLogo?: string | null;
  homeLogo?: string | null;
  awayTeam: string;
  awayMeta: string;
  awayScore: number | null;
  homeTeam: string;
  homeMeta: string;
  homeScore: number | null;
  time: string;
  indicator?: {
    label: string;
    color: string;
  } | null;
  headerRight?: ReactNode;
  footer: ReactNode;
};

export function GameCard({
  status,
  statusKind = "scheduled",
  statusDetail,
  awayLogo,
  homeLogo,
  awayTeam,
  awayMeta,
  awayScore,
  homeTeam,
  homeMeta,
  homeScore,
  time,
  indicator,
  headerRight,
  footer,
}: GameCardProps) {
  return (
    <article className="game-card" data-desk-export="game" data-export-label={`${awayTeam} @ ${homeTeam}`}>
      <div className="game-card__status-row">
        <div className="game-card__status-left">
          <div className={`game-card__status game-card__status--${statusKind}`}>{status}</div>
          {statusDetail && <span className="game-card__clock">{statusDetail}</span>}
          {indicator && (
            <div className="game-card__indicator" style={{ color: indicator.color }}>
              {indicator.label}
            </div>
          )}
        </div>
        {headerRight && <div className="game-card__header-right">{headerRight}</div>}
      </div>

      <div className="game-card__teams">
        <div className="game-card__team-row">
          <div>
            <div className="game-card__team-name">{awayLogo && <img className="game-card__logo" src={awayLogo} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}{awayTeam}</div>
            <div className="game-card__team-meta">{awayMeta}</div>
          </div>
          <div className="game-card__score">{awayScore ?? "—"}</div>
        </div>

        <div className="game-card__divider" />

        <div className="game-card__team-row">
          <div>
            <div className="game-card__team-name">{homeLogo && <img className="game-card__logo" src={homeLogo} alt="" onError={(event) => { event.currentTarget.hidden = true; }} />}{homeTeam}</div>
            <div className="game-card__team-meta">{homeMeta}</div>
          </div>
          <div className="game-card__score">{homeScore ?? "—"}</div>
        </div>
      </div>

      <div className="game-card__footer" data-export-omit>
        <div className="game-card__time">{time}</div>
        {footer}
      </div>
    </article>
  );
}
