import { GameCard } from "../../components/GameCard";
import {
  formatGameTime,
  getNflDivisionalIndicator,
  getNflPrimeTimeIndicator,
  tierInfo,
  type NFLGame,
  type NFLTier,
} from "../../lib/nfl-helpers";
import { GameTierControls } from "./GameTierControls";

type NflGamesGridProps = {
  games: NFLGame[];
  gameTiers: Record<number, NFLTier>;
  onSetTier: (gameId: number, tier: NFLTier) => void;
};

export function NflGamesGrid({
  games,
  gameTiers,
  onSetTier,
}: NflGamesGridProps) {
  return (
    <div className="command-center__game-grid">
      {games.map((game) => {
        const tier = gameTiers[game.id];
        const suggestedTier = game.importance ?? "C";
        const indicator =
          getNflPrimeTimeIndicator(game) ??
          getNflDivisionalIndicator(game);

        return (
          <GameCard
            key={game.id}
            status={game.completed ? "FINAL" : game.status.toUpperCase()}
            awayTeam={game.awayTeam}
            awayMeta={game.awayRecord ?? "No record available"}
            awayScore={game.awayPoints}
            homeTeam={game.homeTeam}
            homeMeta={game.homeRecord ?? "No record available"}
            homeScore={game.homePoints}
            time={formatGameTime(game.startDate)}
            indicator={indicator}
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
