import publication from './all-time-nfl-career-publication.json';
import {nflAllTimeCareerIndividual, type NflAllTimeCategory, type NflAllTimeRecord} from '../nfl/data/nfl-all-time-career';
import {nflTeamNameByAbbreviation} from '../nfl/data/divisions';
import {rankHistoricalRecords} from './all-time-records';

/** Deployment-contained last verified observations, not increments over stale totals. */
export const nflCareerPublication = publication;
export type NflCareerIdentity = {
  playerId:string; gsisId:string; name:string; firstSeason:number;
  rosterSeason:number; rosterWeek:number;
};
export function careerIdentityMap(source?:{identities?:NflCareerIdentity[]}) {
  const identities = new Map<string,NflCareerIdentity>(publication.players.map(player => [player.playerId,
    {playerId:player.playerId,gsisId:player.gsisId,name:player.name,firstSeason:player.firstSeason,rosterSeason:publication.season,rosterWeek:7}]));
  for(const identity of source?.identities??[]) {
    if(!/^espn:nfl:\d+$/.test(identity.playerId)||!/^00-\d{7}$/.test(identity.gsisId)||!identity.name?.trim()||
      !Number.isInteger(identity.firstSeason)||identity.firstSeason<1920||!Number.isInteger(identity.rosterSeason)||identity.rosterSeason<identity.firstSeason||
      !Number.isInteger(identity.rosterWeek)||identity.rosterWeek<1||identity.rosterWeek>22)throw new Error('Invalid discovered career identity evidence.');
    const prior=identities.get(identity.playerId);
    if(prior&&(prior.gsisId!==identity.gsisId||prior.firstSeason!==identity.firstSeason||nameKey(prior.name)!==nameKey(identity.name)))throw new Error('Conflicting discovered career identity.');
    identities.set(identity.playerId,identity);
  }
  if(identities.size>256)throw new Error('Career identity retention limit exceeded.');
  return identities;
}
export type CareerObservation = {
  player: string; team: string; years: string; value: number;
  playerId?: string; sourceUrl?: string; isActive?: boolean;
};
export const nflCareerCategories = Object.keys(nflAllTimeCareerIndividual) as NflAllTimeCategory[];
export function retainedNflCareerSource() {
  return {
    checkedAt: publication.checkedAt,
    categories: Object.fromEntries(nflCareerCategories.map(category => [category, publication.players.flatMap(player => {
      const metric = (player.metrics as Partial<Record<NflAllTimeCategory, {value:number; years:string}>>)[category];
      return metric ? [{player:player.name,team:nflTeamNameByAbbreviation[player.team] ?? player.team,...metric,
        playerId:player.playerId,sourceUrl:player.sourceUrl,isActive:true}] : [];
    })])) as Record<NflAllTimeCategory, CareerObservation[]>,
  };
}
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function nflCareerRecordSets(source:{checkedAt:string;categories:Record<NflAllTimeCategory,CareerObservation[]>;identities?:NflCareerIdentity[]} = retainedNflCareerSource()): Record<NflAllTimeCategory, NflAllTimeRecord[]> {
  const identities=careerIdentityMap(source);
  return Object.fromEntries(nflCareerCategories.map(category => {
    const observed = source.categories[category];
    const ids = observed.map(row => row.playerId).filter(Boolean);
    if(new Set(ids).size !== ids.length) throw new Error('Duplicate career player identity.');
    const names = new Set(observed.map(row => nameKey(row.player)));
    if(names.size !== observed.length) throw new Error('Ambiguous career names require an explicit identity reconciliation.');
    for(const row of observed) {
      const identity = row.playerId ? identities.get(row.playerId) : undefined;
      if(!identity || nameKey(identity.name) !== nameKey(row.player)) throw new Error('Unverified career player identity.');
      const prior = nflAllTimeCareerIndividual[category].find(record => nameKey(record.player) === nameKey(row.player));
      if(prior&&!publication.players.some(player=>player.playerId===row.playerId))throw new Error('Unverified historical identity binding; retained record preserved.');
      // Names alone cannot replace a different historical athlete.
      const firstSeason = identity?.firstSeason ?? Number(row.years.split(/[–-]/)[0]);
      if(prior && Number(prior.years.split(/[–-]/)[0]) !== firstSeason) throw new Error('Conflicting career identity/start season.');
      if(!Number.isFinite(row.value)) throw new Error('Invalid career observation.');
    }
    const merged = [...nflAllTimeCareerIndividual[category].filter(row => !names.has(nameKey(row.player))),
      ...observed.map(row => ({...row,rank:0,isActive:row.isActive ?? true}))];
    return [category,rankHistoricalRecords(merged).slice(0,25)];
  })) as Record<NflAllTimeCategory, NflAllTimeRecord[]>;
}
