import { NextResponse } from "next/server";

export const revalidate = 30;

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");

  try {
    const scoreboardUrl = new URL(ESPN_SCOREBOARD_URL);
    scoreboardUrl.searchParams.set("seasontype", "2");

    if (week) {
      scoreboardUrl.searchParams.set("week", week);
    }

    const response = await fetch(scoreboardUrl, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "ESPN NFL scoreboard request failed.",
          status: response.status,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const games = (data.events ?? []).map((event: any) => {
      const competition = event.competitions?.[0];

      const home = competition?.competitors?.find(
        (team: any) => team.homeAway === "home"
      );

      const away = competition?.competitors?.find(
        (team: any) => team.homeAway === "away"
      );

      return {
        id: Number(event.id),
        startDate: event.date,
        homeTeam: home?.team?.displayName ?? "",
        awayTeam: away?.team?.displayName ?? "",
        homePoints: home?.score
          ? Number(home.score)
          : null,
        awayPoints: away?.score
          ? Number(away.score)
          : null,
        homeRecord:
          home?.records?.[0]?.summary ?? null,
        awayRecord:
          away?.records?.[0]?.summary ?? null,
        broadcasts:
          competition?.broadcasts?.flatMap(
            (broadcast: any) => broadcast.names ?? []
          ) ?? [],
        venue: competition?.venue?.fullName ?? null,
        venueCity: competition?.venue?.address?.city ?? null,
        venueCountry: competition?.venue?.address?.country ?? null,
        completed:
          competition?.status?.type?.completed ?? false,
        live:
          competition?.status?.type?.state === "in",
        status:
          competition?.status?.type?.description ?? "",
      };
    });

    return NextResponse.json({
      games,
      week: data.week?.number ?? (week ? Number(week) : null),
    });
  } catch (error) {
    console.error("ESPN NFL scoreboard error:", error);

    return NextResponse.json(
      {
        error: "Unable to load NFL scoreboard.",
      },
      { status: 500 }
    );
  }
}
