import { NextResponse } from "next/server";

export const revalidate = 60;

const NFLVERSE_PLAYER_URL =
  "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv";

const NFLVERSE_SCHEDULE_URL =
  "https://github.com/nflverse/nfldata/raw/master/data/games.csv";

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (
        insideQuotes &&
        line[i + 1] === '"'
      ) {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (
      char === "," &&
      !insideQuotes
    ) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);

  return values;
}

function parseCSV(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim().length > 0
    );

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCSVLine(
    lines[0]
  ).map((header) =>
    header
      .trim()
      .replace(/^"|"$/g, "")
  );

  return lines
    .slice(1)
    .map((line) => {
      const values =
        parseCSVLine(line);

      const row: Record<
        string,
        string
      > = {};

      headers.forEach(
        (header, index) => {
          row[header] =
            values[index]
              ?.trim()
              .replace(
                /^"|"$/g,
                ""
              ) ?? "";
        }
      );

      return row;
    });
}

function toNumber(value: unknown) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeTeam(
  team: string
) {
  const normalized =
    team
      .trim()
      .toUpperCase();

  const aliases: Record<
    string,
    string
  > = {
    JAC: "JAX",
    JAX: "JAX",

    LA: "LAR",
    LAR: "LAR",

    ARZ: "ARI",
    ARI: "ARI",

    BLT: "BAL",
    BAL: "BAL",

    CLV: "CLE",
    CLE: "CLE",

    HST: "HOU",
    HOU: "HOU",

    OAK: "LV",
    LV: "LV",

    SD: "LAC",
    LAC: "LAC",

    STL: "LAR",
  };

  return (
    aliases[normalized] ??
    normalized
  );
}

function formatRecord(
  wins: number,
  losses: number,
  ties: number
) {
  if (ties > 0) {
    return `${wins}-${losses}-${ties}`;
  }

  return `${wins}-${losses}`;
}

export async function GET() {
  try {
    const [
      playerResponse,
      scheduleResponse,
    ] = await Promise.all([
      fetch(
        NFLVERSE_PLAYER_URL,
        {
          cache: "no-store",
        }
      ),
      fetch(
        NFLVERSE_SCHEDULE_URL,
        {
          cache: "no-store",
        }
      ),
    ]);

    if (!playerResponse.ok) {
      return NextResponse.json(
        {
          error:
            "NFL 2026 performance data request failed.",
          status:
            playerResponse.status,
        },
        {
          status:
            playerResponse.status,
        }
      );
    }

    if (!scheduleResponse.ok) {
      return NextResponse.json(
        {
          error:
            "NFL schedule request failed.",
          status:
            scheduleResponse.status,
        },
        {
          status:
            scheduleResponse.status,
        }
      );
    }

    const [
      playerCSV,
      scheduleCSV,
    ] = await Promise.all([
      playerResponse.text(),
      scheduleResponse.text(),
    ]);

    const weeklyStats =
      parseCSV(playerCSV);

    const schedule =
      parseCSV(scheduleCSV);

    const currentSeasonStats =
      weeklyStats.filter(
        (stat) =>
          toNumber(stat.season) ===
            2026 &&
          stat.season_type === "REG"
      );

    const currentSeasonSchedule =
      schedule
        .filter(
          (game) =>
            toNumber(game.season) ===
              2026 &&
            game.game_type === "REG"
        )
        .sort(
          (a, b) =>
            toNumber(a.week) -
            toNumber(b.week)
        );

    const scheduleByGameId =
      new Map<
        string,
        Record<string, string>
      >();

    for (
      const game of currentSeasonSchedule
    ) {
      if (game.game_id) {
        scheduleByGameId.set(
          game.game_id,
          game
        );
      }

      if (game.alt_game_id) {
        scheduleByGameId.set(
          game.alt_game_id,
          game
        );
      }
    }

    /*
     * Build each team's record BEFORE every game.
     *
     * This lets us answer:
     * "Did this player beat a team that had a better
     * record coming into the game?"
     */
    const recordsBeforeGame =
      new Map<
        string,
        Map<
          string,
          {
            wins: number;
            losses: number;
            ties: number;
          }
        >
      >();

    const runningRecords =
      new Map<
        string,
        {
          wins: number;
          losses: number;
          ties: number;
        }
      >();

    for (
      const game of currentSeasonSchedule
    ) {
      const gameId =
        game.game_id ||
        game.alt_game_id;

      if (!gameId) {
        continue;
      }

      const homeTeam =
        normalizeTeam(
          game.home_team ?? ""
        );

      const awayTeam =
        normalizeTeam(
          game.away_team ?? ""
        );

      if (
        !homeTeam ||
        !awayTeam
      ) {
        continue;
      }

      if (
        !runningRecords.has(
          homeTeam
        )
      ) {
        runningRecords.set(
          homeTeam,
          {
            wins: 0,
            losses: 0,
            ties: 0,
          }
        );
      }

      if (
        !runningRecords.has(
          awayTeam
        )
      ) {
        runningRecords.set(
          awayTeam,
          {
            wins: 0,
            losses: 0,
            ties: 0,
          }
        );
      }

      const homeRecord =
        runningRecords.get(
          homeTeam
        )!;

      const awayRecord =
        runningRecords.get(
          awayTeam
        )!;

      const snapshot =
        new Map<
          string,
          {
            wins: number;
            losses: number;
            ties: number;
          }
        >();

      snapshot.set(
        homeTeam,
        { ...homeRecord }
      );

      snapshot.set(
        awayTeam,
        { ...awayRecord }
      );

      recordsBeforeGame.set(
        gameId,
        snapshot
      );

      const homeScore =
        game.home_score !==
          undefined &&
        game.home_score !== ""
          ? toNumber(
              game.home_score
            )
          : null;

      const awayScore =
        game.away_score !==
          undefined &&
        game.away_score !== ""
          ? toNumber(
              game.away_score
            )
          : null;

      if (
        homeScore === null ||
        awayScore === null
      ) {
        continue;
      }

      if (
        homeScore >
        awayScore
      ) {
        homeRecord.wins++;
        awayRecord.losses++;
      } else if (
        homeScore <
        awayScore
      ) {
        homeRecord.losses++;
        awayRecord.wins++;
      } else {
        homeRecord.ties++;
        awayRecord.ties++;
      }
    }

    const performances =
      currentSeasonStats
        .filter(
          (stat) =>
            stat.player_id &&
            stat.week
        )
        .map((stat) => {
          const gameId =
            stat.game_id || "";

          const game =
            scheduleByGameId.get(
              gameId
            );

          /*
           * THIS was the bug:
           *
           * nflverse uses `team` and
           * `opponent_team`.
           *
           * We were incorrectly looking for
           * `recent_team`, which doesn't exist
           * in this dataset.
           */
          const team =
            stat.team || "";

          const opponentTeam =
            stat.opponent_team || "";

          const normalizedTeam =
            normalizeTeam(team);

          const normalizedOpponent =
            normalizeTeam(
              opponentTeam
            );

          const homeTeam =
            normalizeTeam(
              game?.home_team ?? ""
            );

          const awayTeam =
            normalizeTeam(
              game?.away_team ?? ""
            );

          let result = "";
          let gameScore = "";

          let teamScore:
            | number
            | null = null;

          let opponentScore:
            | number
            | null = null;

          const homeScore =
            game?.home_score !==
              undefined &&
            game?.home_score !== ""
              ? toNumber(
                  game.home_score
                )
              : null;

          const awayScore =
            game?.away_score !==
              undefined &&
            game?.away_score !== ""
              ? toNumber(
                  game.away_score
                )
              : null;

          if (
            normalizedTeam ===
            homeTeam
          ) {
            teamScore =
              homeScore;
            opponentScore =
              awayScore;
          } else if (
            normalizedTeam ===
            awayTeam
          ) {
            teamScore =
              awayScore;
            opponentScore =
              homeScore;
          }

          if (
            teamScore !== null &&
            opponentScore !== null
          ) {
            if (
              teamScore >
              opponentScore
            ) {
              result = "W";
            } else if (
              teamScore <
              opponentScore
            ) {
              result = "L";
            } else {
              result = "T";
            }

            gameScore =
              `${result} ${teamScore}-${opponentScore}`;
          }

          /*
           * Get the records entering this game.
           */
          let teamRecord:
            | string
            | null = null;

          let opponentRecord:
            | string
            | null = null;

          const gameRecords =
            recordsBeforeGame.get(
              gameId
            );

          if (gameRecords) {
            const teamRecordData =
              gameRecords.get(
                normalizedTeam
              );

            const opponentRecordData =
              gameRecords.get(
                normalizedOpponent
              );

            if (
              teamRecordData
            ) {
              teamRecord =
                formatRecord(
                  teamRecordData.wins,
                  teamRecordData.losses,
                  teamRecordData.ties
                );
            }

            if (
              opponentRecordData
            ) {
              opponentRecord =
                formatRecord(
                  opponentRecordData.wins,
                  opponentRecordData.losses,
                  opponentRecordData.ties
                );
            }
          }

          return {
            player_id:
              stat.player_id,

            player_display_name:
              stat.player_display_name ||
              stat.player_name ||
              "",

            recent_team:
              team,

            opponent_team:
              opponentTeam,

            game_id:
              gameId,

            result,

            game_score:
              gameScore,

            week:
              toNumber(
                stat.week
              ),

            team_record:
              teamRecord,

            opponent_record:
              opponentRecord,

            passing_yards:
              toNumber(
                stat.passing_yards
              ),

            passing_tds:
              toNumber(
                stat.passing_tds
              ),

            rushing_yards:
              toNumber(
                stat.rushing_yards
              ),

            rushing_tds:
              toNumber(
                stat.rushing_tds
              ),

            receiving_yards:
              toNumber(
                stat.receiving_yards
              ),

            receiving_tds:
              toNumber(
                stat.receiving_tds
              ),

            tackles:
              toNumber(
                stat.def_tackles_solo
              ) +
              toNumber(
                stat.def_tackle_assists
              ),

            sacks:
              toNumber(
                stat.def_sacks
              ),
          };
        });

    return NextResponse.json({
      season: 2026,
      performances,
    });
  } catch (error) {
    console.error(
      "NFL performance data error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load NFL performance data.",
      },
      {
        status: 500,
      }
    );
  }
}