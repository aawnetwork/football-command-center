type Row = Record<string, string>;
const categories = { passing_yards: "Passing Yards", rushing_yards: "Rushing Yards", receiving_yards: "Receiving Yards" };
const numeric = (value: string | undefined) => value?.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
const key = (row: Row) => `${row.player_id}:${row.game_id}`;

// Conservative: require every earlier team game to have a player row, including
// zero-stat games. Missing rows (injury, transfer, incomplete feed) suppress badges.
export function nflSeasonHighs(stats: Row[], schedule: Row[], season: number, today: string): Map<string, string[]> {
  const games = schedule.filter((row) => Number(row.season) === season && row.game_type === "REG");
  const gameById = new Map(games.map((row) => [row.game_id, row]));
  const grouped = new Map<string, Row[]>();
  for (const row of stats) {
    if (Number(row.season) !== season || row.season_type !== "REG" || !row.player_id || !row.game_id) continue;
    grouped.set(row.player_id, [...(grouped.get(row.player_id) ?? []), row]);
  }
  const completed = (game: Row) => {
    const home = numeric(game.home_score), away = numeric(game.away_score);
    // Historical source has no live status. Final result/total plus a prior date
    // deliberately withhold same-day badges rather than claiming a live high.
    return Boolean(/^\d{4}-\d{2}-\d{2}$/.test(game.gameday ?? "") && game.gameday < today && home !== null && away !== null &&
      numeric(game.result) === home - away && numeric(game.total) === home + away);
  };
  const highs = new Map<string, string[]>();
  for (const rows of grouped.values()) {
    for (const current of rows) {
      const game = gameById.get(current.game_id);
      const week = Number(current.week);
      if (!game || !completed(game) || week !== Number(game.week) || week < 2 ||
        ![game.home_team, game.away_team].includes(current.team)) continue;
      const previous = rows.filter((row) => Number(row.week) < week);
      if (!previous.length) continue;
      const teams = new Set([current.team, ...previous.map((row) => row.team)]);
      // A full regular-season schedule is required, not a truncated history.
      if ([...teams].some((team) => games.filter((g) => [g.home_team, g.away_team].includes(team)).length !== 17)) continue;
      const required = games.filter((g) => Number(g.week) < week && [g.home_team, g.away_team].some((team) => teams.has(team)));
      if (!required.length || required.some((g) => !completed(g) || g.gameday >= game.gameday)) continue;
      if (games.some((g) => g.game_id !== game.game_id && Number(g.week) >= week &&
        [g.home_team, g.away_team].some((team) => teams.has(team)) && g.gameday < game.gameday)) continue;
      if (required.some((g) => previous.filter((row) => row.game_id === g.game_id && Number(row.week) === Number(g.week) && [g.home_team, g.away_team].includes(row.team)).length !== 1)) continue;
      if (previous.some((row) => !required.some((g) => g.game_id === row.game_id)) || rows.filter((row) => row.game_id === current.game_id).length !== 1) continue;
      const labels = Object.entries(categories).filter(([field]) => {
        const value = numeric(current[field]);
        const history = previous.map((row) => numeric(row[field]));
        return value !== null && history.every((entry) => entry !== null) && value > Math.max(...history as number[]);
      }).map(([, label]) => label);
      if (labels.length) highs.set(key(current), labels);
    }
  }
  return highs;
}
