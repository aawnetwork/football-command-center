const SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
const SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary";

const value = (input: unknown) => {
  const parsed = Number(String(input ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

type LivePlayer = {
  player_id: string;
  player_display_name: string;
  recent_team: string;
  passing_yards: number;
  passing_tds: number;
  rushing_yards: number;
  rushing_tds: number;
  receiving_yards: number;
  receiving_tds: number;
  tackles: number;
  sacks: number;
  interceptions: number;
};

export async function loadLiveNflStats() {
  const scoreboardResponse = await fetch(SCOREBOARD_URL, { cache: "no-store" });
  if (!scoreboardResponse.ok) throw new Error("ESPN NFL scoreboard request failed.");
  const scoreboard = await scoreboardResponse.json();
  const events = scoreboard.events ?? [];
  const summaries = await Promise.all(events.map(async (event: any) => {
    const response = await fetch(`${SUMMARY_URL}?event=${event.id}`, { cache: "no-store" });
    return response.ok ? response.json() : null;
  }));
  const players = new Map<string, LivePlayer>();
  const teamScores = new Map<string, number>();

  for (const summary of summaries) {
    if (!summary) continue;
    const competitors = summary.header?.competitions?.[0]?.competitors ?? [];
    for (const competitor of competitors) teamScores.set(competitor.team?.displayName ?? "", value(competitor.score));

    for (const teamBox of summary.boxscore?.players ?? []) {
      const team = teamBox.team?.displayName ?? "";
      for (const category of teamBox.statistics ?? []) {
        const categoryName = category.name?.toLowerCase();
        if (!["passing", "rushing", "receiving", "defensive"].includes(categoryName)) continue;
        const labels = category.labels ?? [];
        for (const athlete of category.athletes ?? []) {
          const athleteInfo = athlete.athlete;
          if (!athleteInfo?.id) continue;
          const player = players.get(athleteInfo.id) ?? {
            player_id: athleteInfo.id,
            player_display_name: athleteInfo.displayName ?? "",
            recent_team: team,
            passing_yards: 0, passing_tds: 0, rushing_yards: 0, rushing_tds: 0,
            receiving_yards: 0, receiving_tds: 0, tackles: 0, sacks: 0, interceptions: 0,
          };
          (athlete.stats ?? []).forEach((stat: unknown, index: number) => {
            const label = labels[index];
            if (categoryName === "passing" && label === "YDS") player.passing_yards += value(stat);
            if (categoryName === "passing" && label === "TD") player.passing_tds += value(stat);
            if (categoryName === "rushing" && label === "YDS") player.rushing_yards += value(stat);
            if (categoryName === "rushing" && label === "TD") player.rushing_tds += value(stat);
            if (categoryName === "receiving" && label === "YDS") player.receiving_yards += value(stat);
            if (categoryName === "receiving" && label === "TD") player.receiving_tds += value(stat);
            if (categoryName === "defensive" && label === "TOT") player.tackles += value(stat);
            if (categoryName === "defensive" && label === "SACKS") player.sacks += value(stat);
            if (categoryName === "defensive" && label === "INT") player.interceptions += value(stat);
          });
          players.set(athleteInfo.id, player);
        }
      }
    }
  }

  const teams = new Map<string, Record<string, string>>();
  for (const player of players.values()) {
    const team = teams.get(player.recent_team) ?? {
      team: player.recent_team, passing_yards: "0", passing_tds: "0", rushing_yards: "0", rushing_tds: "0",
      receiving_yards: "0", receiving_tds: "0", def_tackles_solo: "0", def_tackle_assists: "0", def_sacks: "0", points: String(teamScores.get(player.recent_team) ?? 0),
    };
    for (const field of ["passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "receiving_yards", "receiving_tds", "sacks"] as const) {
      const target = field === "sacks" ? "def_sacks" : field;
      team[target] = String(value(team[target]) + player[field]);
    }
    team.def_tackles_solo = String(value(team.def_tackles_solo) + player.tackles);
    teams.set(player.recent_team, team);
  }

  return { week: scoreboard.week?.number ?? null, players: [...players.values()], teams: [...teams.values()] };
}
