import { NextResponse } from "next/server";

export const revalidate = 30;

const WEEK_ZERO_2026_CUTOFF = "2026-09-01T00:00:00.000Z";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = searchParams.get("week");
  const requestedWeek = week === null ? null : Number(week);
  const season = searchParams.get("season");
  if ((season !== null && (!/^\d{4}$/.test(season) || Number(season) < 2000 || Number(season) > new Date().getUTCFullYear() + 1)) ||
      (week !== null && (!/^\d+$/.test(week) || Number(week) > 16)) ||
      (requestedWeek === 0 && season !== null && season !== "2026")) {
    return NextResponse.json({ error: "Invalid season/week. Week 0 is supported for 2026 only." }, { status: 400 });
  }
  try {
    const scoreboardUrl = new URL(
      "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
    );
    scoreboardUrl.searchParams.set("seasontype", "2");
    scoreboardUrl.searchParams.set("groups", "80");
    if (season !== null) scoreboardUrl.searchParams.set("year", season);

    if (week !== null && week !== "") {
      // ESPN combines the 2026 Week 0 and Week 1 schedules under Week 1.
      scoreboardUrl.searchParams.set(
        "week",
        requestedWeek === 0 ? "1" : week
      );
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
          homeLogo: home?.team?.logo ?? null,
          awayLogo: away?.team?.logo ?? null,
          statusDetail: competition?.status?.type?.state === "in"
            ? competition?.status?.type?.shortDetail ?? null : null,
          homeTeam:
            home?.team?.displayName ?? "Unknown",
          awayTeam:
            away?.team?.displayName ?? "Unknown",
          homeRecord:
            home?.records?.[0]?.summary ?? null,
          awayRecord:
            away?.records?.[0]?.summary ?? null,
          homeConferenceRecord:
            home?.records?.find(
              (record: any) =>
                record.type === "vsconf"
            )?.summary ?? null,
          awayConferenceRecord:
            away?.records?.find(
              (record: any) =>
                record.type === "vsconf"
            )?.summary ?? null,
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
          live:
            competition?.status?.type
              ?.state === "in",
        };
      }
    );

    const filteredGames =
      requestedWeek === 0 && data.season?.year === 2026
        ? games.filter(
            (game: { startDate: string }) =>
              game.startDate < WEEK_ZERO_2026_CUTOFF
          )
        : requestedWeek === 1 && data.season?.year === 2026
          ? games.filter(
              (game: { startDate: string }) =>
                game.startDate >= WEEK_ZERO_2026_CUTOFF
            )
          : games;

    return NextResponse.json({
      games: filteredGames,
      week: requestedWeek ?? data.week?.number ?? null,
      season: data.season?.year ?? null,
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
