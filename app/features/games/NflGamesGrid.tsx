import { GameCard } from "../../components/GameCard";
import type { BroadcastAvailability } from "../../lib/broadcast-availability";
import {
  formatGameTime,
  getNflInternationalIndicator,
  getNflPrimeTimeIndicator,
  tierInfo,
  type NFLGame,
  type NFLTier,
} from "../../lib/nfl-helpers";
import { GameTierControls } from "./GameTierControls";

type NflGamesGridProps = {
  games: NFLGame[];
  gameTiers: Record<number, NFLTier>;
  broadcastAvailability: Record<number, BroadcastAvailability["platforms"]>;
  onSetTier: (gameId: number, tier: NFLTier) => void;
};

export function NflGamesGrid({
  games,
  gameTiers,
  broadcastAvailability,
  onSetTier,
}: NflGamesGridProps) {
  return (
    <div className="command-center__game-grid">
      {games.map((game) => {
        const tier = gameTiers[game.id];
        const suggestedTier = game.importance ?? "C";
        const indicator =
          getNflInternationalIndicator(game) ??
          getNflPrimeTimeIndicator(game);

        return (
          <GameCard
            key={game.id}
            status={game.completed ? "FINAL" : game.live ? "LIVE" : game.status.toLowerCase() === "scheduled" ? "SCHEDULED" : game.status.toUpperCase()}
            statusKind={game.completed ? "final" : game.live ? "live" : "scheduled"}
            statusDetail={game.statusDetail}
            homeLogo={game.homeLogo}
            awayLogo={game.awayLogo}
            awayTeam={game.awayTeam}
            awayMeta={game.awayRecord ?? "No record available"}
            awayScore={game.awayPoints}
            homeTeam={game.homeTeam}
            homeMeta={game.homeRecord ?? "No record available"}
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
                tier={tier}
                suggestedTier={suggestedTier}
                tiers={tierInfo}
                onSelect={(nextTier) => onSetTier(game.id, nextTier)}
              />
            }
          />
        );
      })}
    </div>
  );
}
