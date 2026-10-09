import { GameCard } from "../../components/GameCard";
import type { BroadcastAvailability } from "../../lib/broadcast-availability";
import { formatGameTime } from "../../lib/cfb-helpers";
import { GameTierControls } from "./GameTierControls";

type CfbTier = "S" | "A" | "B" | "C" | "D";

type CfbGame = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
  homeRecord: string | null;
  awayRecord: string | null;
  homeConferenceRecord: string | null;
  awayConferenceRecord: string | null;
  homePoints: number | null;
  awayPoints: number | null;
  homeRank: number | null;
  awayRank: number | null;
  completed: boolean;
  live: boolean;
  homeLogo?: string | null;
  awayLogo?: string | null;
  statusDetail?: string | null;
  tier?: CfbTier;
  suggestedTier: CfbTier;
  top10Matchup?: boolean;
  rankedMatchup?: boolean;
  rankedTeamLost?: boolean;
};

type UpsetSignal = {
  gameId: number;
  rank: number;
  rankedTeam: string;
  opponent: string;
  result: string;
};

type RivalryGame = {
  game: { id: number };
  rivalry: { name: string; trophy: string | null };
};

const tierInfo: Record<CfbTier, { name: string; emoji: string }> = {
  S: { name: "Must Watch", emoji: "🔥" },
  A: { name: "High Interest", emoji: "👀" },
  B: { name: "Worth Watching", emoji: "📺" },
  C: { name: "Background", emoji: "🟢" },
  D: { name: "Skip", emoji: "⚪" },
};

function formatRecord(
  overall: string | null,
  conference: string | null
) {
  if (!overall) {
    return "Record unavailable";
  }

  return conference
    ? `${overall} (${conference})`
    : overall;
}

type CfbGamesGridProps = {
  games: CfbGame[];
  upsets: UpsetSignal[];
  rivalryGames: RivalryGame[];
  broadcastAvailability: Record<number, BroadcastAvailability["platforms"]>;
  onSetTier: (gameId: number, tier: CfbTier) => void;
  getStatus: (game: CfbGame) => string;
};

export function CfbGamesGrid({
  games,
  upsets,
  rivalryGames,
  broadcastAvailability,
  onSetTier,
  getStatus,
}: CfbGamesGridProps) {
  return (
    <div className="command-center__game-grid command-center__game-grid--cfb">
      {games.map((game) => {
        const upsetSignal = upsets.find((upset) => upset.gameId === game.id);
        const rivalryGame = rivalryGames.find((item) => item.game.id === game.id);
        const indicator = upsetSignal
          ? {
              label: `🚨 ${game.completed ? "UPSET" : "UPSET ALERT"} — #${upsetSignal.rank} ${upsetSignal.rankedTeam} lost to ${upsetSignal.opponent} ${upsetSignal.result}`,
              color: "#f87171",
            }
          : rivalryGame
            ? {
                label: `🏆 RIVALRY — ${rivalryGame.rivalry.name}${rivalryGame.rivalry.trophy ? ` · ${rivalryGame.rivalry.trophy}` : ""}`,
                color: "#fbbf24",
              }
            : game.top10Matchup
              ? { label: "🔥 TOP-10 SHOWDOWN", color: "#f97316" }
              : game.rankedMatchup
                ? { label: "📈 RANKED MATCHUP", color: "#fbbf24" }
                : game.rankedTeamLost
                  ? { label: "🚨 RANKED UPSET", color: "#fbbf24" }
                  : null;

        return (
          <GameCard
            key={game.id}
            status={getStatus(game)}
            statusKind={game.completed ? "final" : game.live ? "live" : "scheduled"}
            statusDetail={game.statusDetail}
            homeLogo={game.homeLogo}
            awayLogo={game.awayLogo}
            awayTeam={game.awayRank ? `#${game.awayRank} ${game.awayTeam}` : game.awayTeam}
            awayMeta={formatRecord(game.awayRecord, game.awayConferenceRecord)}
            awayScore={game.awayPoints}
            homeTeam={game.homeRank ? `#${game.homeRank} ${game.homeTeam}` : game.homeTeam}
            homeMeta={formatRecord(game.homeRecord, game.homeConferenceRecord)}
            homeScore={game.homePoints}
            time={formatGameTime(game.startDate)}
            indicator={indicator}
            headerRight={
              broadcastAvailability[game.id]?.length ? (
                <div className="game-card__broadcast">📺 {broadcastAvailability[game.id].join(" · ")}</div>
              ) : null
            }
            footer={
              <GameTierControls
                tier={game.tier}
                suggestedTier={game.suggestedTier}
                tiers={tierInfo}
                onSelect={(tier) => onSetTier(game.id, tier)}
              />
            }
          />
        );
      })}
    </div>
  );
}
