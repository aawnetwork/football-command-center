import type { BracketTeam } from '../../lib/postseason-model';
import type { PostGame } from '../../lib/postseason-service';
export type BracketSnapshot={league:'NFL'|'CFB';season:number;state:'confirmed'|'projected'|'unavailable';conferences:{name:string;teams:BracketTeam[]}[];games:PostGame[];assumptions:string[];issues:string[];checkedAt:string;rankingDate?:string;championOptions?:{id:string;name:string;selected:string;confirmed?:boolean;teams:{id:string;name:string}[]}[]};
export type BracketScope='full'|'AFC'|'NFC';
export function bracketSnapshotIssue(data:BracketSnapshot,league:'NFL'|'CFB') {
  if(data.league!==league||!Number.isInteger(data.season)||!Number.isFinite(Date.parse(data.checkedAt)))return 'The snapshot does not match the selected league or season.';
  if(!['confirmed','projected'].includes(data.state))return 'No bracket is available for this selection yet.';
  if(!Array.isArray(data.conferences)||!Array.isArray(data.games))return 'The bracket response is incomplete.';
  if(league==='NFL'&&(data.conferences.length!==2||!['AFC','NFC'].every(name=>data.conferences.some(c=>c.name===name))))return 'Both NFL conference fields are needed to export a bracket.';
  if(league==='CFB'&&data.conferences.length!==1)return 'The CFP field is unavailable.';
  const all=data.conferences.flatMap(c=>c.teams);
  if(new Set(all.map(t=>t.id)).size!==all.length)return 'The bracket contains conflicting team identities.';
  for(const conference of data.conferences){
    const count=league==='NFL'?7:12;
    if(conference.teams.length!==count||conference.teams.some(t=>!t.name||!/^\d+$/.test(t.id)))return 'The bracket field is incomplete.';
    const seeds=conference.teams.filter(t=>t.seed>0).map(t=>t.seed);
    if(new Set(seeds).size!==seeds.length||seeds.some(s=>!Number.isInteger(s)||s>count))return 'The bracket seeds are inconsistent.';
    if(conference.teams.some(t=>t.seed===0&&!(league==='CFB'&&t.possibleSeeds?.length)))return 'A team’s seed is unavailable.';
  }
  return null;
}
export function bracketSnapshotLabel(data:BracketSnapshot) {
  if(data.state==='confirmed')return 'CONFIRMED BRACKET';
  return data.championOptions?.some(c=>!c.confirmed&&c.selected)?'PROJECTED FIELD · CONFERENCE ASSUMPTIONS':'AS IT STANDS';
}
export function bracketSnapshotFilename(data:BracketSnapshot,scope:BracketScope,treatment:string) {
  const stamp=data.checkedAt.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
  return `aaw-${data.league.toLowerCase()}-${data.season}-playoff-bracket-${scope.toLowerCase()}-${data.state}-${treatment}-${stamp}.png`;
}

export function bracketLogoUrl(value:string):string {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='a.espncdn.com')throw Error('A team logo has an unsupported source.');
  return `/api/football/logo?path=${encodeURIComponent(url.pathname)}`;
}
