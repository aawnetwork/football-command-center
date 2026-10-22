import { statsV2Access } from "../../lib/stats-v2/release-access";
import { projectNcaaSeasonTeam } from "../../lib/cfb-season-team-stats";
import { NextResponse } from "next/server";

export const revalidate = 300;

const allIndividualSources = [
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

const allTeamSources = [
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
    statKey: "YPG",
  },
  {
    category: "passing-defense",
    endpoint: "695",
    statKey: "YPG",
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

    const view = searchParams.get("view");
    const category = searchParams.get("category")?.replace(/-td$/, "");
    const individualSources = view === "team" ? [] : allIndividualSources.filter((source) => !category || source.category === category);
    const teamSources = view === "individual" ? [] : allTeamSources.filter((source) => !category || source.category === category);
    if ((view && view !== "team" && view !== "individual") || (category && !individualSources.length && !teamSources.length)) {
      return NextResponse.json({ error: "Unknown season category" }, { status: 400 });
    }
    // The approved Stats 2.0 view uses the retained NCAA snapshots in preview
    // and release mode alike, preserving their explicit source cutoffs.
    if(view==='team' && category && statsV2Access()) {
      const {default:retained}=await import('../../lib/cfb-team-ncaa-retained.json');
      const table=retained.tables[category as keyof typeof retained.tables];
      if(table)return NextResponse.json(table.rows,{headers:{'X-AAW-Source':'retained-ncaa-snapshot'}});
    }
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
            signal: AbortSignal.timeout(12_000),
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

    // Both catalogues are paginated (currently 50 rows per page). A live
    // contribution must not lose a player or school at the first-page boundary.
    for (const catalogue of [
      { results: individualResults, sources: individualSources, base: individualBase },
      { results: teamResults, sources: teamSources, base: teamBase },
    ]) {
      for (let index = 0; index < catalogue.results.length; index++) {
        const result = catalogue.results[index];
        for (let page = 2; page <= (result.pages ?? 1); page++) {
          const response = await fetch(`${catalogue.base}/${catalogue.sources[index].endpoint}?page=${page}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000) });
          if (!response.ok) throw new Error("Incomplete NCAA season leaderboard");
          const extra = await response.json();
          if (extra.updated !== result.updated) throw new Error("NCAA season snapshot changed during pagination");
          result.data.push(...(extra.data ?? []));
        }
      }
    }
    const stats: unknown[] = [];

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
  sourceUpdated: result.updated,
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
          sourceUpdated: result.updated,
        });
      }
    });

    teamResults.forEach((result, index) => {
      const source = teamSources[index];

      for (const team of result.data ?? []) {
        stats.push(projectNcaaSeasonTeam(team,source.category,result.updated));
      }
    });

    return NextResponse.json(stats, { headers: { "Cache-Control": "no-store" } });
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
