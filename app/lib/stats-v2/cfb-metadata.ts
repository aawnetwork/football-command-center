import type { CfbMembership, CfbPosition } from './cfb-statlines';
type Roster = { season?: { year?: number }; team?: { id?: string }; athletes?: { items?: { id?: string; position?: { abbreviation?: string } }[] }[] };
type Group = { id?: string; name?: string; isConference?: boolean; season?: { year?: number }; children?: Group[]; standings?: { season?: number; seasonType?: number; entries?: { team?: { id?: string } }[] } };
export function cfbRosterPositions(input: unknown, teamId: string, season: number): CfbPosition[] {
  const data=input as Roster;
  if(data?.season?.year!==season||data.team?.id!==teamId||!Array.isArray(data.athletes))throw Error('Roster season/team unverified');
  return data.athletes.flatMap(group=>(group.items??[]).flatMap(athlete=>/^[1-9]\d*$/.test(athlete.id??'')&&/^[A-Z]{1,4}$/.test(athlete.position?.abbreviation??'')?[{season,teamId,athleteId:athlete.id!,position:athlete.position!.abbreviation!}]:[]));
}
export function cfbConferenceMemberships(input: unknown, season: number): CfbMembership[] {
  const data=input as Group;
  if(data?.season?.year!==season)throw Error('Conference season unverified');
  const result:CfbMembership[]=[];
  function visit(group:Group) {
    if(group.isConference&&group.id&&group.name&&group.standings?.season===season&&group.standings.seasonType===2)for(const entry of group.standings.entries??[])if(/^[1-9]\d*$/.test(entry.team?.id??''))result.push({season,teamId:entry.team!.id!,conferenceId:group.id,conferenceName:group.name});
    for(const child of group.children??[])visit(child);
  }visit(data);return result;
}

export function cfbAthletePosition(input: unknown, athleteId:string, teamId:string, season:number): CfbPosition[] {
 const data=input as {season?:{year?:number};athlete?:{id?:string;team?:{id?:string};position?:{abbreviation?:string}}};
 const athlete=data?.athlete;
 if(data?.season?.year!==season||athlete?.id!==athleteId||athlete.team?.id!==teamId||!/^[A-Z]{1,4}$/.test(athlete.position?.abbreviation??''))throw Error('Athlete season/team/position unverified');
 return [{season,teamId,athleteId,position:athlete.position!.abbreviation!}];
}
