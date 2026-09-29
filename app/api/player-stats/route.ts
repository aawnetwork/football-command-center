import { NextResponse } from "next/server";

export const revalidate = 30;

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";

const ESPN_SUMMARY_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");
  try {
    // Get this week's FBS games from ESPN.
    const scoreboardUrl = new URL(ESPN_SCOREBOARD_URL);
    scoreboardUrl.searchParams.set("seasontype", "2");
    scoreboardUrl.searchParams.set("groups", "80");

    if (week !== null && week !== "") {
      scoreboardUrl.searchParams.set("week", week);
    }

    const scoreboardResponse = await fetch(
      scoreboardUrl.toString(),
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

    // Fetch all game's full box scores in parallel.
    const summaries = await Promise.all(
      events.map(async (event: any) => {
        const gameId = Number(event.id);

        if (!gameId) {
          return null;
        }

        try {
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

            return null;
          }

          return {
            gameId,
            summary: await summaryResponse.json(),
          };
        } catch (error) {
          console.error(
            `ESPN summary request failed for game ${gameId}:`,
            error
          );

          return null;
        }
      })
    );

    for (const result of summaries) {
      if (!result) {
        continue;
      }

      const { gameId, summary } = result;

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
              "defensive",
              "interceptions",
              "fumbles",
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

              const supportedLabels =
                categoryName === "defensive"
                  ? ["TOT", "SACKS", "TFL", "PD", "TD", "INT", "FF", "FR"]
                  : categoryName === "interceptions"
                    ? ["INT", "TD"]
                    : categoryName === "fumbles"
                      ? ["REC"]
                  : ["YDS", "TD", "INT"];

              if (!supportedLabels.includes(label)) {
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

              const defensiveStat =
                categoryName === "interceptions"
                  ? label === "TD"
                    ? "TD"
                    : "INT"
                  : categoryName === "fumbles"
                    ? "FR"
                    : label;

              playerStats.push({
                playerId: Number(
                  player.id
                ),
                player:
                  player.displayName,
                team: teamName,
                category:
                  categoryName === "defensive" ||
                  categoryName === "interceptions" ||
                  categoryName === "fumbles"
                    ? "defensive"
                    : categoryName,
                stat: defensiveStat,
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
