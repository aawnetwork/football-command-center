import {nflCareerPublication, nflCareerRecordSets, careerIdentityMap, type NflCareerIdentity} from "./all-time-nfl-careers";
import {nflDiscoveryUrl, parseNflCareerDiscovery, type CareerDiscovery} from "./all-time-nfl-discovery";
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
  playerId?: string;
  sourceUrl?: string;
  verificationUrl?: string;
  isActive?: boolean;
};

export type NflLiveCareerSource = {
  checkedAt: string;
  categories: Record<NflAllTimeCategory, NflLiveCareerRecord[]>;
  identities?: NflCareerIdentity[];
  discovery?: CareerDiscovery;
};

type EspnCategory = {
  name: string;
  names: string[];
  totals?: string[];
  statistics: {
    season?: { year?: number };
    stats: string[];
    displayName?: string;
    teamSlug?: string;
    teamId?: string;
  }[];
};

type RosterPlayer = {
  name: string;
  team: string;
  espnId: string;
  week: number;
  gsisId?: string;
  identity?:NflCareerIdentity;
  position?:string;
  active?:boolean;
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

const verifiedCandidates = new Map(nflCareerPublication.players.map(player => [player.playerId.split(":").at(-1)!, player]));

async function boundedText(response: Response, limit: number, budget?: {bytes:number}) {
  const reader = response.body?.getReader();
  if(!reader) throw new Error("Empty career source response.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for(;;) {
    const {done,value} = await reader.read();
    if(done) break;
    bytes += value.byteLength;
    if(budget) budget.bytes += value.byteLength;
    if(bytes > limit || (budget && budget.bytes > 8_000_000)) {
      await reader.cancel();throw new Error("Career response byte budget exceeded; prior publication retained.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for(const chunk of chunks) {joined.set(chunk,offset);offset += chunk.byteLength;}
  return new TextDecoder().decode(joined);
}

const loadActiveCandidates = async (prior?:NflLiveCareerSource) => {
  const response = await fetch(rosterUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`nflverse roster request failed (${response.status}).`);
  const identities=careerIdentityMap(prior);
  const roster = new Map<string,RosterPlayer>();
  for (const row of parseCsv(await boundedText(response,2_000_000))) {
    const name=row.full_name||row.football_name,espnId=row.espn_id,team=row.team,week=numeric(row.week);
    if(!name||!/^\d+$/.test(espnId??'')||!team||(row.game_type&&row.game_type!=='REG'))continue;
    if(row.season&&Number(row.season)!==currentSeason)throw new Error('Wrong season in career discovery roster.');
    const known=identities.get(`espn:nfl:${espnId}`);
    if(known&&((row.gsis_id&&row.gsis_id!==known.gsisId)||(row.entry_year&&Number(row.entry_year)!==known.firstSeason)))throw new Error('Conflicting GSIS/ESPN identity or first season.');
    const firstSeason=Number(row.entry_year);
    const identity:NflCareerIdentity|undefined=known?{...known,rosterSeason:currentSeason,rosterWeek:week||known.rosterWeek}:
      row.season===String(currentSeason)&&row.game_type==='REG'&&/^00-\d{7}$/.test(row.gsis_id??'')&&Number.isInteger(firstSeason)&&firstSeason>=1920&&firstSeason<=currentSeason&&Number.isInteger(week)&&week>=1&&week<=22
        ?{playerId:`espn:nfl:${espnId}`,gsisId:row.gsis_id,name,firstSeason,rosterSeason:currentSeason,rosterWeek:week}:undefined;
    const previous=roster.get(espnId);
    if(previous&&week===previous.week&&(team!==previous.team||previous.gsisId!==row.gsis_id))throw new Error('Conflicting latest player-team identities.');
    if(!previous||week>=previous.week)roster.set(espnId,{name,espnId,team,week,gsisId:row.gsis_id,identity,position:row.position,active:!['CUT','RET'].includes(row.status)});
  }
  if(!roster.size)throw new Error('Roster response contains no identifiable career candidates; prior publication retained.');
  const leaders=await fetch(nflDiscoveryUrl,{cache:'no-store',signal:AbortSignal.timeout(15_000),redirect:'error'});
  if(!leaders.ok)throw new Error(`NFL career discovery request failed (${leaders.status}).`);
  const sets=nflCareerRecordSets(prior);
  const thresholds=Object.fromEntries(allCategories.map(key=>[key,sets[key].at(-1)!.value])) as Record<NflAllTimeCategory,number>;
  const parsed=parseNflCareerDiscovery(JSON.parse(await boundedText(leaders,1_000_000)),thresholds,new Set(roster.keys()));
  const selected=new Set([...roster.keys()].filter(id=>identities.has(`espn:nfl:${id}`)));
  for(const id of parsed.candidateIds)selected.add(id);
  if(selected.size>64)throw new Error('Career request budget exceeded; prior publication retained.');
  const checked=Object.fromEntries(Object.entries(prior?.discovery?.checked??{}).filter(([id])=>roster.has(id)));
  // Bounded rotating roster fallback for fields missing from the leader source.
  // Position only orders work; it never establishes ranking eligibility.
  const frontier=[...roster.values()].filter(row=>!selected.has(row.espnId)&&row.identity&&row.active&&
    (!checked[row.espnId]||Date.parse(checked[row.espnId])<Date.now()-28*86400000))
    .sort((a,b)=>Number(/^(LB|DB|DL|CB|S|DE|DT|OLB|ILB)$/.test(b.position??''))-Number(/^(LB|DB|DL|CB|S|DE|DT|OLB|ILB)$/.test(a.position??''))||
      (a.identity!.firstSeason-b.identity!.firstSeason)||a.espnId.localeCompare(b.espnId));
  for(const row of frontier.slice(0,Math.min(2,64-selected.size)))selected.add(row.espnId);
  const candidates=[...selected].map(id=>roster.get(id)!);
  for(const row of candidates) {
    if(!row.identity)throw new Error('Discovered candidate lacks exact GSIS/ESPN/season identity evidence.');
  }
  if(Object.values(checked).some(value=>typeof value!=='string'||!Number.isFinite(Date.parse(value))))throw new Error('Invalid retained discovery observation timestamp.');
  if(Object.keys(checked).length>4000)throw new Error('Discovery roster retention limit exceeded.');
  return {candidates,identities,thresholds,requiredCategories:parsed.requiredCategories,discovery:{checkedAt:new Date().toISOString(),sourceUrl:nflDiscoveryUrl,coverage:parsed.coverage,checked} satisfies CareerDiscovery};
};

const fetchCareerCategories = async (espnId: string, budget: {bytes:number;requests:number}) => {
  const url = new URL(`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${espnId}/stats`);
  url.searchParams.set("seasontype", "2");
  url.searchParams.set("region", "us");
  url.searchParams.set("lang", "en");
  url.searchParams.set("contentorigin", "espn");
  if(++budget.requests>64)throw new Error("Career request budget exceeded.");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`ESPN career stat request failed (${response.status}).`);
  const data = JSON.parse(await boundedText(response,500_000,budget));
  const phase = data.filters?.find((filter: {name?: string}) => filter.name === "seasontype");
  if (!Array.isArray(data.categories) || !data.categories.length) throw new Error("ESPN career response has no categories; prior publication retained.");
  if (!phase || String(phase.value) !== "2") throw new Error("ESPN career response is not verified regular season.");
  return data.categories as EspnCategory[];
};

const careerNumber = (value: string | undefined): number => {
  if (typeof value !== "string" || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim())) {
    throw new Error("ESPN career statistic is missing or invalid; not converted to zero.");
  }
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) throw new Error("ESPN career statistic is not finite.");
  return parsed;
};

export const calculateNflCareer = (categories: EspnCategory[], category: NflAllTimeCategory) => {
  const [categoryName, field] = categoryFields[category];
  const sources = categories.filter((item) => item.name === categoryName);
  if (!sources.length) return null;
  if (sources.length !== 1) throw new Error("Ambiguous ESPN career category.");
  const source = sources[0];
  if (!Array.isArray(source.names) || !Array.isArray(source.statistics)) throw new Error("Invalid ESPN career category.");
  const fieldIndex = source.names.indexOf(field);
  if (fieldIndex < 0 || !source.statistics.length) return null;
  const byYear = new Map<number, EspnCategory["statistics"]>();
  for (const row of source.statistics) {
    const year = row.season?.year;
    if (!Number.isInteger(year) || !Array.isArray(row.stats)) throw new Error("Invalid ESPN career season.");
    byYear.set(year!, [...(byYear.get(year!) ?? []), row]);
  }
  let value = 0;
  for (const rows of byYear.values()) {
    const totals = rows.filter((row) => /\btotals\b/i.test(`${row.displayName ?? ""} ${row.teamSlug ?? ""}`));
    const stints = rows.filter((row) => !totals.includes(row));
    if (totals.length > 1) throw new Error("Ambiguous ESPN season totals.");
    const identities = stints.map((row) => row.teamId ?? row.teamSlug ?? "");
    if (new Set(identities).size !== identities.length) throw new Error("Duplicate ESPN team-season rows.");
    const selected = stints.length ? stints : totals;
    const seasonValue = selected.reduce((sum, row) => sum + careerNumber(row.stats[fieldIndex]), 0);
    if (stints.length && totals.length && careerNumber(totals[0].stats[fieldIndex]) !== seasonValue) {
      throw new Error("ESPN season stints disagree with published total.");
    }
    value += seasonValue;
  }
  if (source.totals && careerNumber(source.totals[fieldIndex]) !== value) {
    throw new Error("ESPN career rows disagree with published career total.");
  }
  const years = [...byYear.keys()];
  return { value, years: `${Math.min(...years)}–${Math.max(...years)}` };
};

const formatTeam = (team: string) => nflTeamNameByAbbreviation[team] ?? team;

/**
 * ESPN's public athlete endpoint supplies the complete regular-season career
 * history for every active record-book candidate, including combined tackles.
 * nflverse's roster feed identifies those active players and their current team.
 */
export async function loadNflActiveCareerSource(prior?:NflLiveCareerSource): Promise<NflLiveCareerSource> {
  const {candidates,identities,thresholds,requiredCategories,discovery} = await loadActiveCandidates(prior);
  if (candidates.length > 64) throw new Error("Career request budget exceeded.");
  const results: {candidate:RosterPlayer; careers:Record<NflAllTimeCategory,ReturnType<typeof calculateNflCareer>>;verificationUrl?:string}[] = [];
  // Scheduled only: bounded sequential work, never a per-page fan-out.
  const budget = {bytes:0,requests:0};
  const deadline = Date.now() + 120_000;
  for (const candidate of candidates) {
    if(Date.now() > deadline) throw new Error("Career refresh deadline exceeded; prior publication retained.");
    const categories=await fetchCareerCategories(candidate.espnId,budget);
    if(categories.some(category=>category.statistics.some(row=>!Number.isInteger(row.season?.year)||row.season!.year!<candidate.identity!.firstSeason||row.season!.year!>currentSeason)))throw new Error('Career seasons conflict with verified roster identity.');
    const careers={} as Record<NflAllTimeCategory,ReturnType<typeof calculateNflCareer>>;
    let aggregate: {$ref?:string;athlete?:{$ref?:string};splits?:{id?:string;categories?:{name:string;stats:{name:string;value:number}[]}[]}}|undefined;
    let verificationUrl:string|undefined;
    for(const category of allCategories) {
      try {careers[category]=calculateNflCareer(categories,category);}
      catch(error) {
        const [section,field]=categoryFields[category];
        const source=categories.find(row=>row.name===section)!;
        const years=source.statistics.map(row=>row.season!.year!);
        // Some profiles omit leading career seasons. Never sum that partial
        // history: require a second, exact-ID lifetime aggregate to agree with
        // the advertised regular-season career total. Other conflicts fail.
        if(!(error instanceof Error)||error.message!=="ESPN career rows disagree with published career total."||Math.min(...years)<=candidate.identity!.firstSeason)throw error;
        if(!aggregate) {
          if(++budget.requests>64)throw new Error('Career request budget exceeded.');
          verificationUrl=`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/athletes/${candidate.espnId}/statistics/0?lang=en&region=us`;
          const response=await fetch(verificationUrl,{cache:'no-store',signal:AbortSignal.timeout(15_000),redirect:'error'});
          if(!response.ok)throw new Error('Complete career aggregate verification failed.');
          aggregate=JSON.parse(await boundedText(response,500_000,budget));
          const identity=/^https?:\/\/sports\.core\.api\.espn\.com\/v2\/sports\/football\/leagues\/nfl\/athletes\/(\d+)(?:\?|$)/.exec(aggregate!.athlete?.$ref??'')?.[1];
          const scope=new URL(aggregate!.$ref??'https://invalid.invalid');
          if(identity!==candidate.espnId||scope.hostname!=='sports.core.api.espn.com'||scope.pathname!==`/v2/sports/football/leagues/nfl/athletes/${candidate.espnId}/statistics/0`||aggregate!.splits?.id!=='0')throw new Error('Wrong complete-career aggregate identity/scope.');
        }
        const matchingSections=aggregate!.splits?.categories?.filter(row=>row.name===section)??[];
        const matchingStats=matchingSections.length===1?matchingSections[0].stats.filter(row=>row.name===field):[];
        const total=careerNumber(source.totals?.[source.names.indexOf(field)]);
        if(matchingStats.length!==1||typeof matchingStats[0].value!=='number'||!Number.isFinite(matchingStats[0].value)||matchingStats[0].value!==total)throw new Error('Complete career aggregates disagree; prior publication retained.');
        careers[category]={value:total,years:`${candidate.identity!.firstSeason}–${Math.max(...years)}`};
      }
    }
    for(const category of requiredCategories.get(candidate.espnId)??[])if(!careers[category])throw new Error('Missing discovered career metric; prior publication retained.');
    results.push({candidate,careers,verificationUrl});
    discovery.checked[candidate.espnId]=new Date().toISOString();
  }

  const records = allCategories.reduce<Record<NflAllTimeCategory, NflLiveCareerRecord[]>>((recordSets, category) => {
    recordSets[category] = results
      .map(({ candidate, careers, verificationUrl }) => {
        const career = careers[category];
        const verified = verifiedCandidates.get(candidate.espnId);
        const required = Object.prototype.hasOwnProperty.call(verified?.metrics??{}, category) || prior?.categories[category].some(row=>row.playerId===`espn:nfl:${candidate.espnId}`) ||
          nflAllTimeCareerIndividual[category].some((record) => normaliseName(record.player) === normaliseName(candidate.name) && Number(record.years.split(/[–-]/)[0])===candidate.identity!.firstSeason);
        if (!career && required) throw new Error(`Missing ranked career category for ${candidate.name}; prior publication retained.`);
        if(!career) return null;
        return {
          player: candidate.name,
          team: formatTeam(candidate.team),
          years: career.years,
          value: career.value,
          verificationUrl,
          isActive: candidate.active ?? true,
          playerId: `espn:nfl:${candidate.espnId}`,
          sourceUrl: `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${candidate.espnId}/stats?seasontype=2`,
        };
      })
      .filter((record): record is NonNullable<typeof record> => record !== null)
      .sort((left, right) => right.value - left.value || left.player.localeCompare(right.player));
    return recordSets;
  }, {} as Record<NflAllTimeCategory, NflLiveCareerRecord[]>);

  for(const {candidate} of results) {
    const playerId=`espn:nfl:${candidate.espnId}`;
    const near=allCategories.some(category=>records[category].some(row=>row.playerId===playerId&&row.value>=thresholds[category]*.9));
    if(identities.has(playerId)||near)identities.set(playerId,candidate.identity!);
    else for(const category of allCategories)records[category]=records[category].filter(row=>row.playerId!==playerId);
  }
  return { checkedAt: new Date().toISOString(), categories: records, identities:[...identities.values()], discovery };
}
