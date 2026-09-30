export type BroadcastPlatform = "DAZN" | "Disney+" | "Sky Sports" | "Channel 5";
export type BroadcastLeague = "CFB" | "NFL";

export type BroadcastAvailability = {
  gameId: number;
  platforms: BroadcastPlatform[];
};

type CsvRow = {
  date: string;
  time: string;
  matchup: string;
  platforms: BroadcastPlatform[];
};

type ScheduledGame = {
  id: number;
  startDate: string;
  homeTeam: string;
  awayTeam: string;
};

export type BroadcastImportMatch = {
  row: CsvRow;
  game: ScheduledGame;
};

export type BroadcastImportResult = {
  matched: BroadcastImportMatch[];
  unmatched: CsvRow[];
  skipped: CsvRow[];
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function platformList(value: string): BroadcastPlatform[] {
  const platforms: BroadcastPlatform[] = [];
  if (value.toLowerCase().includes("dazn")) platforms.push("DAZN");
  if (value.toLowerCase().includes("disney")) platforms.push("Disney+");
  if (value.toLowerCase().includes("sky")) platforms.push("Sky Sports");
  if (value.toLowerCase().includes("channel 5")) platforms.push("Channel 5");
  return platforms;
}

export function parseBroadcastCsv(input: string): CsvRow[] {
  const lines = input.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("The CSV is empty.");

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const dateIndex = headers.indexOf("date");
  const timeIndex = headers.indexOf("time");
  const matchupIndex = headers.indexOf("matchup");
  const platformIndex = headers.indexOf("platform");

  if ([dateIndex, timeIndex, matchupIndex, platformIndex].some((index) => index < 0)) {
    throw new Error("Use the columns Date, Time, Matchup and Platform.");
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return {
      date: values[dateIndex] ?? "",
      time: values[timeIndex] ?? "",
      matchup: values[matchupIndex] ?? "",
      platforms: platformList(values[platformIndex] ?? ""),
    };
  });
}

function dateToEspnFormats(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12));
  return [-1, 0, 1].map((offset) => {
    const candidate = new Date(date);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    return `${candidate.getUTCFullYear()}${String(candidate.getUTCMonth() + 1).padStart(2, "0")}${String(candidate.getUTCDate()).padStart(2, "0")}`;
  });
}

function normaliseTeam(value: string) {
  return value
    .toLowerCase()
    .replace(/#\d+\s*/g, "")
    .replace(/\b(university|college)\b/g, "")
    .replace(/\b(crimson tide|golden hurricane|mean green|hilltoppers|hokies|wildcats|buckeyes|wolverines|spartans|fighting irish|trojans|bruins|ducks|huskies|tigers|bulldogs|gators|longhorns|sooners|cowboys|aggies|volunteers|seminoles|hurricanes|tar heels|blue devils|panthers|orange|eagles|cardinals|knights|owls|pirates|mountaineers|wolfpack|cavaliers|razorbacks|rebels|commodores|gamecocks|golden bears|beavers|buffaloes|utes|cougars|broncos|red raiders|jayhawks|cyclones|cornhuskers|hawkeyes|badgers|gophers|boilermakers|hoosiers|terrapins|nittany lions|mustangs|bears|bearcats|falcons|rams|lions|warriors|roadrunners|green wave|thundering herd|bobcats|zips|chippewas|demon deacons)\b/g, "")
    .replace(/\bmiami\s*\(oh\)/g, "miami ohio")
    .replace(/\bnc\s+state\b/g, "north carolina state")
    .replace(/\bucf\b/g, "central florida")
    .replace(/\butsa\b/g, "texas san antonio")
    .replace(/\bul\s+monroe\b/g, "louisiana monroe")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function matchupTeams(matchup: string) {
  const parts = matchup.split(/\s+(?:@|vs\.?|v\.)\s+/i);
  if (parts.length !== 2) return null;
  return parts.map((team) => normaliseTeam(team)) as [string, string];
}

function sameTeam(left: string, right: string) {
  return Boolean(left && right && (left === right || left.startsWith(right) || right.startsWith(left)));
}

export function matchBroadcastRows(rows: CsvRow[], games: ScheduledGame[]): BroadcastImportResult {
  const matched: BroadcastImportMatch[] = [];
  const unmatched: CsvRow[] = [];
  const skipped: CsvRow[] = [];

  for (const row of rows) {
    const teams = matchupTeams(row.matchup);
    if (!teams || !row.platforms.length) {
      skipped.push(row);
      continue;
    }

    const game = games.find((candidate) => {
      const home = normaliseTeam(candidate.homeTeam);
      const away = normaliseTeam(candidate.awayTeam);
      return (
        (sameTeam(teams[0], away) && sameTeam(teams[1], home)) ||
        (sameTeam(teams[0], home) && sameTeam(teams[1], away))
      );
    });

    if (game) matched.push({ row, game });
    else unmatched.push(row);
  }

  return { matched, unmatched, skipped };
}

export async function loadGamesForBroadcastDates(league: BroadcastLeague, dates: string[]) {
  const requestedDates = [...new Set(dates.flatMap((date) => dateToEspnFormats(date) ?? []))];
  const sportPath = league === "NFL" ? "nfl" : "college-football";
  const responses = await Promise.all(requestedDates.map(async (date) => {
    const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/football/${sportPath}/scoreboard`);
    if (league === "CFB") url.searchParams.set("groups", "80");
    url.searchParams.set("limit", "500");
    url.searchParams.set("dates", date);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`ESPN schedule request failed (${response.status}).`);
    return response.json();
  }));

  const gameMap = new Map<number, ScheduledGame>();
  for (const data of responses) {
    for (const event of data.events ?? []) {
      const competition = event.competitions?.[0];
      const home = competition?.competitors?.find((team: any) => team.homeAway === "home");
      const away = competition?.competitors?.find((team: any) => team.homeAway === "away");
      if (!home?.team?.displayName || !away?.team?.displayName) continue;
      gameMap.set(Number(event.id), {
        id: Number(event.id),
        startDate: event.date,
        homeTeam: home.team.displayName,
        awayTeam: away.team.displayName,
      });
    }
  }

  return [...gameMap.values()];
}
