import { NextResponse } from "next/server";

export const revalidate = 30;

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

const ESPN_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";

export async function GET() {
  try {
    // Get this week's FBS games from ESPN.
    const scoreboardResponse = await fetch(
      `${ESPN_SCOREBOARD_URL}?seasontype=2&groups=80`,
      {
        cache: "no-store",
      }
    );

    if (!scoreboardResponse.ok) {
      return NextResponse.json(
        {
          error: "ESPN scoreboard request failed.",
          status: scoreboardResponse.status,
        },
        { status: scoreboardResponse.status }
      );
    }

    const scoreboard = await scoreboardResponse.json();

    const events = scoreboard.events ?? [];

    const playerStats: any[] = [];
    const teamStats: any[] = [];

    // Fetch each game's full box score.
    for (const event of events) {
      const gameId = Number(event.id);

      if (!gameId) {
        continue;
      }

      const summaryResponse = await fetch(
        `${ESPN_SUMMARY_URL}?event=${gameId}`,
        {
          cache: "no-store",
        }
      );

      if (!summaryResponse.ok) {
        console.error(
          `ESPN summary failed for game ${gameId}:`,
          summaryResponse.status
        );

        continue;
      }

      const summary = await summaryResponse.json();

      const competition =
        summary.header?.competitions?.[0];

      if (!competition) {
        continue;
      }

      const competitors =
        competition.competitors ?? [];

      const homeTeam =
        competitors.find(
          (team: any) =>
            team.homeAway === "home"
        );

      const awayTeam =
        competitors.find(
          (team: any) =>
            team.homeAway === "away"
        );

      const homeTeamName =
        homeTeam?.team?.displayName ??
        homeTeam?.team?.shortDisplayName ??
        "";

      const awayTeamName =
        awayTeam?.team?.displayName ??
        awayTeam?.team?.shortDisplayName ??
        "";

      const boxscorePlayers =
        summary.boxscore?.players ?? [];

      for (const teamBox of boxscorePlayers) {
        const teamName =
          teamBox.team?.displayName ??
          teamBox.team?.shortDisplayName ??
          "";

        const opponent =
          teamName === homeTeamName
            ? awayTeamName
            : homeTeamName;

        const statistics =
  teamBox.statistics ?? [];
  const defensiveStats = statistics.find(
  (category: any) =>
    category.name?.toLowerCase() === "defensive"
);

if (defensiveStats?.totals) {
  const labels = defensiveStats.labels ?? [];
  const totals = defensiveStats.totals;

  for (
    let index = 0;
    index < totals.length;
    index++
  ) {
    const label = labels[index];

    if (
      ![
        "TOT",
        "SACKS",
        "TFL",
        "PD",
        "TD",
      ].includes(label)
    ) {
      continue;
    }

    const numericValue = Number(
      String(totals[index])
        .replace(/,/g, "")
        .replace(/[^0-9.-]/g, "")
    );

    if (!Number.isFinite(numericValue)) {
      continue;
    }

    teamStats.push({
      team: teamName,
      category: "defensive",
      stat: label,
      value: numericValue,
      gameId,
      opponent,
    });
  }
}

        for (const category of statistics) {
          const categoryName =
            category.name?.toLowerCase();

          if (
            ![
              "passing",
              "rushing",
              "receiving",
            ].includes(categoryName)
          ) {
            continue;
          }

          const athletes =
            category.athletes ?? [];

          for (const athlete of athletes) {
            const player =
              athlete.athlete;

            if (!player?.displayName) {
              continue;
            }

            const stats =
              athlete.stats ?? [];

            const labels =
              category.labels ?? [];

            for (
              let index = 0;
              index < stats.length;
              index++
            ) {
              const statValue = stats[index];

              const label =
                labels[index];

              if (
                !["YDS", "TD", "INT"].includes(
                  label
                )
              ) {
                continue;
              }

              const numericValue =
                Number(
                  String(statValue)
                    .replace(/,/g, "")
                    .replace(/[^0-9.-]/g, "")
                );

              if (
                !Number.isFinite(
                  numericValue
                )
              ) {
                continue;
              }

              playerStats.push({
                playerId: Number(
                  player.id
                ),
                player:
                  player.displayName,
                team: teamName,
                category: categoryName,
                stat: label,
                value: numericValue,
                gameId,
                opponent,
              });
            }
          }
        }
      }
    }

    return NextResponse.json([
  ...playerStats,
  ...teamStats,
]);
  } catch (error) {
    console.error(
      "ESPN player stats error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load ESPN player stats.",
      },
      { status: 500 }
    );
  }
}