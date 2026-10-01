import { NextResponse } from "next/server";

export const revalidate = 300;

const individualSources = [
  {
    category: "rushing",
    endpoint: "469",
    yardsKey: "Rush Yds",
    touchdownsKey: "Rush TD",
  },
  {
    category: "passing",
    endpoint: "453",
    yardsKey: "Pass Yds",
    touchdownsKey: "Pass TD",
  },
  {
    category: "receiving",
    endpoint: "455",
    yardsKey: "Rec Yds",
    touchdownsKey: "Rec TD",
  },
 {
  category: "tackles",
  endpoint: "34",
  yardsKey: "TT",
  touchdownsKey: "",
},
  {
  category: "sacks",
  endpoint: "36",
  yardsKey: "Tot Sack",
  touchdownsKey: "",
},
];

const teamSources = [
  {
    category: "total-offense",
    endpoint: "21",
    statKey: "YDS",
  },
  {
    category: "rushing-offense",
    endpoint: "23",
    statKey: "Rush Yds",
  },
  {
    category: "passing-offense",
    endpoint: "25",
    statKey: "Pass Yds",
  },
  {
    category: "scoring-offense",
    endpoint: "27",
    statKey: "PPG",
  },

  {
  category: "total-defense",
  endpoint: "22",
  statKey: "YPG",
},
  
  {
    category: "rushing-defense",
    endpoint: "24",
    statKey: "Opp Rush Yds",
  },
  {
    category: "passing-defense",
    endpoint: "695",
    statKey: "Opp Pass <br/>Yds",
  },
  {
    category: "scoring-defense",
    endpoint: "28",
    statKey: "Avg",
  },
  {
    category: "sacks",
    endpoint: "466",
    statKey: "Sacks",
  },
  {
    category: "turnover-margin",
    endpoint: "29",
    statKey: "Margin",
  },
];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const mode = "season";

    const baseUrl =
      "https://ncaa-api.henrygd.me/stats/football/fbs";

    const individualBase =
  `${baseUrl}/current/individual`;

const teamBase =
  `${baseUrl}/current/team`;

    // The NCAA provider can throttle a burst of requests. Fetch the small
    // leaderboard catalogue in sequence so one page visit does not turn into
    // fifteen concurrent upstream calls (and a failed entire stats tab).
    const getStatsResponses = async (
      sources: readonly { endpoint: string }[],
      base: string
    ) => {
      const responses: Response[] = [];

      for (const source of sources) {
        responses.push(
          await fetch(`${base}/${source.endpoint}`, {
            next: {
              revalidate: 300,
            },
          })
        );
      }

      return responses;
    };

    const individualResponses = await getStatsResponses(
      individualSources,
      individualBase
    );

    const teamResponses = await getStatsResponses(
      teamSources,
      teamBase
    );

    const allResponses = [
      ...individualResponses,
      ...teamResponses,
    ];

    if (allResponses.some((response) => !response.ok)) {
      return NextResponse.json(
        {
  error: "NCAA stats request failed.",
  mode,
},
        { status: 502 }
      );
    }

    const individualResults = await Promise.all(
      individualResponses.map((response) =>
        response.json()
      )
    );

    const teamResults = await Promise.all(
      teamResponses.map((response) =>
        response.json()
      )
    );

    const stats: any[] = [];

    individualResults.forEach((result, index) => {
      const source = individualSources[index];

      for (const player of result.data ?? []) {
        const playerId = `${player.Name}-${player.Team}`;

        stats.push({
  id: `${playerId}-${source.category}-${source.category === "tackles" ? "TACKLES" : source.category === "sacks" ? "SACKS" : "YDS"}`,
  name: player.Name,
  team: player.Team,
  category: source.category,
  statType:
    source.category === "tackles"
      ? "TACKLES"
      : source.category === "sacks"
        ? "SACKS"
        : "YDS",
  stat: Number(
    player[source.yardsKey] ?? 0
  ),
  type: "individual",
});

        stats.push({
          id: `${playerId}-${source.category}-TD`,
          name: player.Name,
          team: player.Team,
          category: source.category,
          statType: "TD",
          stat: Number(
            player[source.touchdownsKey] ?? 0
          ),
          type: "individual",
        });
      }
    });

    teamResults.forEach((result, index) => {
      const source = teamSources[index];

      for (const team of result.data ?? []) {
        stats.push({
          id: `${source.category}-${team.Team}`,
          name: team.Team,
          team: team.Team,
          category: source.category,
          statType: "TEAM",
          stat: Number(
            team[source.statKey] ?? 0
          ),
          type: "team",
        });
      }
    });

    return NextResponse.json(stats);
  } catch (error) {
    console.error(
      "Season stats error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load NCAA stats.",
      },
      { status: 500 }
    );
  }
}
