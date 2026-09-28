import { NextResponse } from "next/server";

export const revalidate = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");
  try {
    const scoreboardUrl = new URL(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
    );
    scoreboardUrl.searchParams.set("seasontype", "2");
    scoreboardUrl.searchParams.set("groups", "80");

    if (week !== null && week !== "") {
      scoreboardUrl.searchParams.set("week", week);
    }

    const response = await fetch(
      scoreboardUrl.toString(),
      {
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "ESPN request failed.",
          status: response.status,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const games = (data.events ?? []).map(
      (event: any) => {
        const competition =
          event.competitions?.[0];

        const home =
          competition?.competitors?.find(
            (team: any) =>
              team.homeAway === "home"
          );

        const away =
          competition?.competitors?.find(
            (team: any) =>
              team.homeAway === "away"
          );

        return {
          id: Number(event.id),
          startDate: event.date,
          homeTeam:
            home?.team?.displayName ?? "Unknown",
          awayTeam:
            away?.team?.displayName ?? "Unknown",
          homePoints:
            home?.score !== undefined
              ? Number(home.score)
              : null,
          awayPoints:
            away?.score !== undefined
              ? Number(away.score)
              : null,
          homeRank:
            home?.curatedRank?.current &&
            home.curatedRank.current < 99
              ? home.curatedRank.current
              : null,
          awayRank:
            away?.curatedRank?.current &&
            away.curatedRank.current < 99
              ? away.curatedRank.current
              : null,
          completed:
            competition?.status?.type
              ?.completed ?? false,
        };
      }
    );

    return NextResponse.json({
      games,
      week: data.week?.number ?? null,
    });
  } catch (error) {
    console.error(
      "Scoreboard error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load scoreboard.",
      },
      { status: 500 }
    );
  }
}