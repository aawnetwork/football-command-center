import { gunzipSync } from "node:zlib";

import type { NflAllTimeCategory } from "../nfl/data/nfl-all-time-career";
import { nflTeamNameByAbbreviation } from "../nfl/data/divisions";

type CsvRow = Record<string, string>;

export type NflLiveCareerRecord = {
  player: string;
  team: string;
  years: string;
  value: number;
};

export type NflLiveCareerSource = {
  checkedAt: string;
  categories: Record<NflAllTimeCategory, NflLiveCareerRecord[]>;
};

const currentSeason = new Date().getUTCFullYear();
const historicalOffenseUrl =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv.gz";
const historicalDefenseUrl =
  "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_def.csv.gz";
const currentSeasonUrl = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${currentSeason}.csv`;

const allCategories: NflAllTimeCategory[] = [
  "passing-yards",
  "passing-td",
  "rushing-yards",
  "rushing-td",
  "receiving-yards",
  "receiving-td",
  "tackles",
  "sacks",
  "interceptions",
];

const categoryFields: Record<NflAllTimeCategory, string> = {
  "passing-yards": "passing_yards",
  "passing-td": "passing_tds",
  "rushing-yards": "rushing_yards",
  "rushing-td": "rushing_tds",
  "receiving-yards": "receiving_yards",
  "receiving-td": "receiving_tds",
  tackles: "def_tackles",
  sacks: "def_sacks",
  interceptions: "def_interceptions",
};

type PlayerCareer = {
  player: string;
  team: string;
  firstSeason: number;
  lastSeason: number;
  activeThisSeason: boolean;
  values: Record<NflAllTimeCategory, number>;
};

const number = (value: string | undefined) => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && next === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
};

const parseCsv = (csv: string): CsvRow[] => {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "");

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
};

const fetchGzipCsv = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`nflverse archive request failed (${response.status}).`);
  }

  return parseCsv(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
};

const fetchCsv = async (url: string) => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`nflverse current-season request failed (${response.status}).`);
  }

  return parseCsv(await response.text());
};

const emptyValues = () =>
  allCategories.reduce<Record<NflAllTimeCategory, number>>((values, category) => {
    values[category] = 0;
    return values;
  }, {} as Record<NflAllTimeCategory, number>);

const playerName = (row: CsvRow) =>
  row.player_display_name || row.player_name || row.player || "";

const playerTeam = (row: CsvRow) => row.recent_team || row.team || "";

const addRows = (
  players: Map<string, PlayerCareer>,
  rows: CsvRow[],
  { currentOnly = false }: { currentOnly?: boolean } = {},
) => {
  for (const row of rows) {
    const season = number(row.season);
    if (row.season_type !== "REG" || !season || (currentOnly ? season !== currentSeason : season >= currentSeason)) {
      continue;
    }

    const id = row.player_id;
    const name = playerName(row);
    if (!id || !name) continue;

    const existing = players.get(id) ?? {
      player: name,
      team: playerTeam(row),
      firstSeason: season,
      lastSeason: season,
      activeThisSeason: false,
      values: emptyValues(),
    };

    existing.player = name || existing.player;
    existing.firstSeason = Math.min(existing.firstSeason, season);
    existing.lastSeason = Math.max(existing.lastSeason, season);
    if (season === currentSeason) {
      existing.activeThisSeason = true;
      existing.team = playerTeam(row) || existing.team;
    } else if (!existing.team) {
      existing.team = playerTeam(row);
    }

    for (const category of allCategories) {
      existing.values[category] += number(row[categoryFields[category]]);
    }

    players.set(id, existing);
  }
};

const formatTeam = (team: string) =>
  (nflTeamNameByAbbreviation[team] ?? team) || "Current NFL team";

/**
 * Creates a live career-data overlay for active NFL players. Historical record
 * holders continue to come from the project record book; nflverse provides the
 * machine-readable player totals needed to identify active players crossing it.
 */
export async function loadNflActiveCareerSource(): Promise<NflLiveCareerSource> {
  const [historicalOffense, historicalDefense, currentSeasonRows] = await Promise.all([
    fetchGzipCsv(historicalOffenseUrl),
    fetchGzipCsv(historicalDefenseUrl),
    fetchCsv(currentSeasonUrl),
  ]);

  const players = new Map<string, PlayerCareer>();
  addRows(players, historicalOffense);
  addRows(players, historicalDefense);
  addRows(players, currentSeasonRows, { currentOnly: true });

  const activePlayers = [...players.values()].filter((player) => player.activeThisSeason);
  const categories = allCategories.reduce<Record<NflAllTimeCategory, NflLiveCareerRecord[]>>(
    (records, category) => {
      records[category] = activePlayers
        .filter((player) => player.values[category] > 0)
        .map((player) => ({
          player: player.player,
          team: formatTeam(player.team),
          years: `${player.firstSeason}–${player.lastSeason}`,
          value: player.values[category],
        }))
        .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player));
      return records;
    },
    {} as Record<NflAllTimeCategory, NflLiveCareerRecord[]>,
  );

  return { checkedAt: new Date().toISOString(), categories };
}
