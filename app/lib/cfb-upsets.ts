import type { Game, UpsetSignal } from "./cfb-helpers";

export function isUpsetLoss(losingTeamRank: number | null, winningTeamRank: number | null) {
  return losingTeamRank !== null && losingTeamRank <= 25 &&
    (winningTeamRank === null || winningTeamRank > losingTeamRank);
}

export function detectUpsets(games: Game[]): UpsetSignal[] {
  return games.flatMap((game) => {
    if ((!game.live && !game.completed) || game.homePoints === null || game.awayPoints === null) return [];
    const homeUpset = game.homePoints < game.awayPoints && isUpsetLoss(game.homeRank, game.awayRank);
    const awayUpset = game.awayPoints < game.homePoints && isUpsetLoss(game.awayRank, game.homeRank);
    if (!homeUpset && !awayUpset) return [];
    return [{
      gameId: game.id,
      rank: homeUpset ? game.homeRank! : game.awayRank!,
      rankedTeam: homeUpset ? game.homeTeam : game.awayTeam,
      opponent: homeUpset ? game.awayTeam : game.homeTeam,
      result: homeUpset ? `${game.awayPoints}-${game.homePoints}` : `${game.homePoints}-${game.awayPoints}`,
    }];
  });
}

export function upsetLabel(signal: UpsetSignal, completed: boolean) {
  return `🚨 ${completed ? "UPSET" : "UPSET ALERT"} — #${signal.rank} ${signal.rankedTeam} ${completed ? "lost to" : "trailing"} ${signal.opponent} ${signal.result}`;
}
