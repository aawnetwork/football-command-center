type ScoreboardGame = {
  startDate: string;
  completed: boolean;
  live: boolean;
};

const LIVE_REFRESH_MS = 30_000;
const KICKOFF_BUFFER_MS = 15_000;

/**
 * Keep scoreboards live when they need to be, without repeatedly fetching an
 * inactive slate. Upcoming games get one check just after the next kickoff.
 */
export function getScoreboardRefreshDelay(
  games: ScoreboardGame[],
  now = Date.now()
) {
  if (games.some((game) => game.live)) {
    return LIVE_REFRESH_MS;
  }

  const nextKickoff = games
    .filter((game) => !game.completed)
    .map((game) => Date.parse(game.startDate))
    .filter((startDate) => Number.isFinite(startDate) && startDate > now)
    .sort((a, b) => a - b)[0];

  if (nextKickoff === undefined) {
    return null;
  }

  return Math.max(LIVE_REFRESH_MS, nextKickoff - now + KICKOFF_BUFFER_MS);
}
