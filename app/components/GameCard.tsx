import type { ReactNode } from "react";

type GameCardProps = {
  status: string;
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
    <article className="game-card">
      <div className="game-card__status-row">
        <div className="game-card__status">{status}</div>
        {indicator && (
          <div className="game-card__indicator" style={{ color: indicator.color }}>
            {indicator.label}
          </div>
        )}
        {headerRight && <div className="game-card__header-right">{headerRight}</div>}
      </div>

      <div className="game-card__teams">
        <div className="game-card__team-row">
          <div>
            <div className="game-card__team-name">{awayTeam}</div>
            <div className="game-card__team-meta">{awayMeta}</div>
          </div>
          <div className="game-card__score">{awayScore ?? "—"}</div>
        </div>

        <div className="game-card__divider" />

        <div className="game-card__team-row">
          <div>
            <div className="game-card__team-name">{homeTeam}</div>
            <div className="game-card__team-meta">{homeMeta}</div>
          </div>
          <div className="game-card__score">{homeScore ?? "—"}</div>
        </div>
      </div>

      <div className="game-card__footer">
        <div className="game-card__time">{time}</div>
        {footer}
      </div>
    </article>
  );
}
