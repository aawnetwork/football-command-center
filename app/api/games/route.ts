import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.CFBD_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "CFBD_API_KEY is not configured." },
      { status: 500 }
    );
  }

  const response = await fetch(
    "https://api.collegefootballdata.com/games?year=2026&seasonType=regular&classification=fbs",
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      {
        error: "CFBD request failed.",
        status: response.status,
      },
      { status: response.status }
    );
  }

  const games = await response.json();

  return NextResponse.json(games);
}