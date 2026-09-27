import { NextResponse } from "next/server";

export const revalidate = 300;

const statSources = [
  {
    category: "rushing",
    endpoint: "469",
    statKey: "Rush Yds",
  },
  {
    category: "rushing",
    endpoint: "750",
    statKey: "Rush TD",
  },
  {
    category: "passing",
    endpoint: "453",
    statKey: "Pass Yds",
  },
  {
    category: "passing",
    endpoint: "751",
    statKey: "Pass TD",
  },
  {
    category: "receiving",
    endpoint: "455",
    statKey: "Rec Yds",
  },
  {
    category: "receiving",
    endpoint: "752",
    statKey: "Rec TD",
  },
];

export async function GET() {
  try {
    const responses = await Promise.all(
      statSources.map((source) =>
        fetch(
          `https://ncaa-api.henrygd.me/stats/football/fbs/current/individual/${source.endpoint}`,
          {
            next: {
              revalidate: 300,
            },
          }
        )
      )
    );

    if (responses.some((response) => !response.ok)) {
      return NextResponse.json(
        {
          error: "NCAA all-time stats request failed.",
        },
        { status: 502 }
      );
    }

    const results = await Promise.all(
      responses.map((response) => response.json())
    );

    const allTimeStats: any[] = [];

    results.forEach((result, index) => {
      const source = statSources[index];

      for (const player of result.data ?? []) {
        allTimeStats.push({
          id: `${player.Name}-${player.Team}`,
          name: player.Name,
          team: player.Team,
          category: source.category,
          statType: source.statKey.includes("TD")
            ? "TD"
            : "YDS",
          stat: Number(player[source.statKey] ?? 0),
        });
      }
    });

    return NextResponse.json(allTimeStats);
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load NCAA all-time stats.",
      },
      { status: 500 }
    );
  }
}