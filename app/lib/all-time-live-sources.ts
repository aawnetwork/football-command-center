import {
  nflAllTimeCareerIndividual,
  type NflAllTimeCategory,
} from "../nfl/data/nfl-all-time-career";
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

type EspnCategory = {
  name: string;
  names: string[];
  statistics: { season?: { year?: number }; stats: string[] }[];
};

type RosterPlayer = {
  name: string;
  team: string;
  espnId: string;
  week: number;
};

const currentSeason = new Date().getUTCFullYear();
const rosterUrl = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${currentSeason}.csv`;

const categoryFields: Record<NflAllTimeCategory, [string, string]> = {
  "passing-yards": ["passing", "passingYards"],
  "passing-td": ["passing", "passingTouchdowns"],
  "rushing-yards": ["rushing", "rushingYards"],
  "rushing-td": ["rushing", "rushingTouchdowns"],
  "receiving-yards": ["receiving", "receivingYards"],
  "receiving-td": ["receiving", "receivingTouchdowns"],
  tackles: ["defensive", "totalTackles"],
  sacks: ["defensive", "sacks"],
  interceptions: ["defensive", "interceptions"],
};

const allCategories = Object.keys(categoryFields) as NflAllTimeCategory[];

const normaliseName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const numeric = (value: string | undefined) => {
  const parsed = Number((value ?? "").replace(/,/g, ""));
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

const activeRecordBookNames = new Set(
  Object.values(nflAllTimeCareerIndividual)
    .flat()
    .map((record) => normaliseName(record.player)),
);

const loadActiveCandidates = async () => {
  const response = await fetch(rosterUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`nflverse roster request failed (${response.status}).`);

  const candidates = new Map<string, RosterPlayer>();
  for (const row of parseCsv(await response.text())) {
    const name = row.full_name || row.football_name;
    const espnId = row.espn_id;
    const team = row.team;
    const week = numeric(row.week);
    if (!name || !espnId || !team || !activeRecordBookNames.has(normaliseName(name))) continue;

    const prior = candidates.get(normaliseName(name));
    if (!prior || week >= prior.week) candidates.set(normaliseName(name), { name, espnId, team, week });
  }
  return [...candidates.values()];
};

const fetchCareerCategories = async (espnId: string) => {
  const url = new URL(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/stats`);
  url.searchParams.set("region", "us");
  url.searchParams.set("lang", "en");
  url.searchParams.set("contentorigin", "espn");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`ESPN career stat request failed (${response.status}).`);
  const data = await response.json();
  return (data.categories ?? []) as EspnCategory[];
};

const calculateCareer = (categories: EspnCategory[], category: NflAllTimeCategory) => {
  const [categoryName, field] = categoryFields[category];
  const source = categories.find((item) => item.name === categoryName);
  const fieldIndex = source?.names.indexOf(field) ?? -1;
  if (!source || fieldIndex < 0) return { value: 0, years: "" };

  const seasons = source.statistics
    .map((season) => season.season?.year)
    .filter((year): year is number => Boolean(year));
  return {
    value: source.statistics.reduce((total, season) => total + numeric(season.stats[fieldIndex]), 0),
    years: seasons.length ? `${Math.min(...seasons)}–${Math.max(...seasons)}` : "",
  };
};

const formatTeam = (team: string) => nflTeamNameByAbbreviation[team] ?? team;

/**
 * ESPN's public athlete endpoint supplies the complete regular-season career
 * history for every active record-book candidate, including combined tackles.
 * nflverse's roster feed identifies those active players and their current team.
 */
export async function loadNflActiveCareerSource(): Promise<NflLiveCareerSource> {
  const candidates = await loadActiveCandidates();
  const results = await Promise.all(
    candidates.map(async (candidate) => ({ candidate, categories: await fetchCareerCategories(candidate.espnId) })),
  );

  const records = allCategories.reduce<Record<NflAllTimeCategory, NflLiveCareerRecord[]>>((recordSets, category) => {
    recordSets[category] = results
      .map(({ candidate, categories }) => {
        const career = calculateCareer(categories, category);
        return {
          player: candidate.name,
          team: formatTeam(candidate.team),
          years: career.years,
          value: career.value,
        };
      })
      .filter((record) => record.value > 0)
      .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player));
    return recordSets;
  }, {} as Record<NflAllTimeCategory, NflLiveCareerRecord[]>);

  return { checkedAt: new Date().toISOString(), categories: records };
}
