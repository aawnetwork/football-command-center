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

function parseUkDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function dateToEspnFormats(value: string) {
  const date = parseUkDate(value);
  if (!date) return null;
  return [-1, 0, 1].map((offset) => {
    const candidate = new Date(date);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    return `${candidate.getUTCFullYear()}${String(candidate.getUTCMonth() + 1).padStart(2, "0")}${String(candidate.getUTCDate()).padStart(2, "0")}`;
  });
}

const ukDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", day: "2-digit", month: "2-digit", year: "numeric",
});

function gameUkDate(value: string) {
  // Require an explicit offset: server-local parsing must not decide the date.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? ukDate.format(instant) : null;
}

function teamKey(value: string) {
  return value.toLowerCase().replace(/^\s*#\d+\s*/, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Exact, explicit school/display-name aliases only. Never infer identity from
// a prefix or a generic mascot removal. Bare Miami is deliberately unresolved.
const teamAliasGroups = [
  ["Miami Florida", "Miami FL", "Miami Hurricanes"],
  ["Miami Ohio", "Miami OH", "Miami OH RedHawks", "Miami Ohio RedHawks", "Miami RedHawks"],
  ["Michigan", "Michigan Wolverines"],
  ["Michigan State", "Michigan State Spartans"],
  ["Oregon", "Oregon Ducks"],
  ["NC State", "North Carolina State", "NC State Wolfpack", "North Carolina State Wolfpack"],
  ["UCF", "Central Florida", "UCF Knights", "Central Florida Knights"],
  ["UTSA", "Texas San Antonio", "UTSA Roadrunners", "Texas San Antonio Roadrunners"],
  ["UL Monroe", "Louisiana Monroe", "UL Monroe Warhawks", "Louisiana Monroe Warhawks"],
  ["UNC", "North Carolina", "North Carolina Tar Heels"],
  ["Pitt", "Pittsburgh", "Pittsburgh Panthers"],
  ["Alabama", "Alabama Crimson Tide"],
  ["Ohio State", "Ohio State Buckeyes"],
  ["Notre Dame", "Notre Dame Fighting Irish"],
  ["Southern Miss", "Southern Miss Golden Eagles"],
  ["Troy", "Troy Trojans"],
];
const teamAliases = new Map<string, string>();
for (const group of teamAliasGroups) {
  const canonical = teamKey(group[0]);
  for (const alias of group) {
    const key = teamKey(alias);
    const existing = teamAliases.get(key);
    if (existing && existing !== canonical) throw new Error(`Conflicting broadcast team alias: ${alias}`);
    teamAliases.set(key, canonical);
  }
}

function normaliseTeam(value: string) {
  const key = teamKey(value);
  return key === "miami" ? "" : teamAliases.get(key) ?? key;
}

function matchupTeams(matchup: string) {
  const parts = matchup.split(/\s+(?:@|vs\.?|v\.)\s+/i);
  if (parts.length !== 2) return null;
  return parts.map((team) => normaliseTeam(team)) as [string, string];
}

function sameTeam(left: string, right: string) {
  return Boolean(left && right && left === right);
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

    const candidates = games.filter((candidate) => {
      // CSV dates are UK calendar dates, including the next day for overnight
      // kickoffs. Neighbouring dates fetched from ESPN are not matching windows.
      if (!parseUkDate(row.date) || gameUkDate(candidate.startDate) !== row.date) return false;
      const home = normaliseTeam(candidate.homeTeam);
      const away = normaliseTeam(candidate.awayTeam);
      return (
        (sameTeam(teams[0], away) && sameTeam(teams[1], home)) ||
        (sameTeam(teams[0], home) && sameTeam(teams[1], away))
      );
    });

    // The row time is a listing time, not a reliable tie-breaker. In particular,
    // the repeated hour at the autumn clock change must not pick a game for us.
    if (candidates.length === 1) matched.push({ row, game: candidates[0] });
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
