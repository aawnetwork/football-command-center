import {getNflInternationalIndicator,getNflPrimeTimeIndicator} from '../../lib/nfl-helpers';
import { findCfbRivalry } from '../../lib/cfb-rivalries';
import { rivalries } from '../../cfb/data/rivalries';
import retainedLogoVariants from './cfb-overlay-logo-variants.json';
import nflLogoVariants from './nfl-overlay-logo-variants.json';
/** Export-only projection. Never infer a final result from the presence of scores. */
export type OverlayTeam = {id:string;name:string;logo:string|null;color?:string|null;secondaryColor?:string|null;darkLogo?:string|null;primarySurfaceLogo?:string|null;rank:number|null;record:string|null;score:number|null};
export type OverlayGame = {id:string;league:'CFB'|'NFL';stage:'pregame'|'live'|'final';liveLabel?:string;kickoff:string;neutral:boolean;away:OverlayTeam;home:OverlayTeam;finalLabel:string;context:string|null;observedAt:string;platforms?:string[]};
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
const list=(value:unknown):unknown[]=>Array.isArray(value)?value:[];
const score=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):null;
export function projectOverlayGames(feed:unknown,league:'CFB'|'NFL',observedAt:string):OverlayGame[]{
 const result:OverlayGame[]=[];const events=list(object(feed).events);const counts=new Map<string,number>();
 for(const event of events){const id=text(object(event).id);if(id)counts.set(id,(counts.get(id)??0)+1);}
 for(const value of events){
  const event=object(value),competition=object(list(event.competitions)[0]),status=object(object(competition.status).type),eventStatus=object(object(event.status).type);
  if(Object.keys(eventStatus).length&&['name','state','completed'].some(key=>eventStatus[key]!==status[key]))continue;
  const id=text(event.id),kickoff=text(event.date),participants=list(competition.competitors).map(object);
  const stage=status.state==='pre'&&status.name==='STATUS_SCHEDULED'&&status.completed===false?'pregame':status.state==='in'&&['STATUS_IN_PROGRESS','STATUS_HALFTIME','STATUS_END_PERIOD'].includes(String(status.name))&&status.completed===false?'live':status.state==='post'&&/^STATUS_FINAL/.test(String(status.name))&&status.completed===true?'final':null;
  if(!id||counts.get(id)!==1||!kickoff||!Number.isFinite(Date.parse(kickoff))||!stage||stage==='live'&&Date.parse(kickoff)>Date.parse(observedAt)||participants.length!==2||stage==='pregame'&&Date.parse(kickoff)<=Date.parse(observedAt))continue;
  const team=(side:string):OverlayTeam|null=>{
   const entry=participants.find(row=>row.homeAway===side);if(!entry)return null;
   const t=object(entry.team),teamId=text(t.id),name=text(t.displayName);if(!teamId||!name)return null;
   const rank=score(object(entry.curatedRank).current??entry.rank);
   const totalRecords=[...list(entry.records),...list(entry.record)].map(object).filter(row=>row.type==='total');
   const reportedRecords=[...new Set(totalRecords.map(row=>text(row.summary)??text(row.displayValue)).filter((value):value is string=>value!==null))];
   const record=reportedRecords.length===1?reportedRecords[0]:null;
   const color=overlayColour(t.color),secondaryColor=overlayColour(t.alternateColor);
   const darkLogo=text(object(list(t.logos).find(value=>list(object(value).rel).includes('dark'))).href);
   const variants=league==='CFB'?retainedLogoVariants:stage==='pregame'?nflLogoVariants:null;
   const retained=variants?(variants.teams as Record<string,{color:string;logo:string}>)[teamId]:undefined;
   const primarySurfaceLogo=text(object(list(t.logos).find(value=>list(object(value).rel).includes('primary_logo_on_primary_color'))).href)??(retained&&overlayColour(retained.color)===color?retained.logo:null);
   return {id:teamId,name,color,secondaryColor,darkLogo,primarySurfaceLogo,logo:text(t.logo)??text(object(list(t.logos)[0]).href),rank:league==='CFB'&&rank!==null&&rank>=1&&rank<=25?rank:null,record,score:score(entry.score)};
  };
  const away=team('away'),home=team('home');if(!away||!home||away.id===home.id||stage!=='pregame'&&(away.score===null||home.score===null))continue;
  const period=score(object(competition.status).period)??score(object(event.status).period);
  const otDetail=/^Final\/(\d*)OT$/i.exec(String(status.shortDetail??status.detail??''));
  const overtime=stage==='final'?(period!==null&&period>4?period-4:otDetail?Number(otDetail[1]||1):0):0;
  const ranked=away.rank!==null&&home.rank!==null;
  const upset=stage==='final'&&away.rank!==null&&home.rank!==null&&away.score!==home.score&&((away.score!>home.score!&&(home.rank!==null&&(away.rank===null||away.rank>home.rank)))||(home.score!>away.score!&&(away.rank!==null&&(home.rank===null||home.rank>away.rank))));
  const liveLabel=status.name==='STATUS_HALFTIME'?'LIVE | HALF':period!==null&&period>0?`LIVE | ${period>4?(period===5?'OT':`${period-4}OT`):['1st','2nd','3rd','4th'][period-1]}`:'LIVE';
  const clock=text(object(competition.status).displayClock)??text(object(event.status).displayClock);
  const statusLabel=stage==='live'&&status.name==='STATUS_IN_PROGRESS'&&(period!==null&&period<=4||league==='NFL')&&clock&&/^\d{1,2}:\d{2}$/.test(clock)?`${liveLabel} · ${clock}`:liveLabel;
  const rivalry=league==='CFB'?findCfbRivalry({awayTeam:away.name,homeTeam:home.name},rivalries):undefined;
  const cfbContext=[rivalry?`RIVALRY — ${rivalry.name}`:null,upset?'RANKED UPSET':ranked?'RANKED MATCHUP':null].filter(Boolean).join(' · ')||null;
  const venue=object(competition.venue),address=object(venue.address);
  const broadcasts=list(competition.broadcasts).flatMap(value=>list(object(value).names)).filter((name):name is string=>typeof name==='string');
  const nflIndicator=league==='NFL'?(getNflInternationalIndicator({venueCountry:text(address.country),venueCity:text(address.city)})??getNflPrimeTimeIndicator({startDate:kickoff,broadcasts})):null;
  const context=league==='CFB'?cfbContext:nflIndicator?.label.replace(/^[^A-Z]+/u,'')??null;
  result.push({id,league,stage,liveLabel:statusLabel,kickoff,neutral:competition.neutralSite===true,away,home,finalLabel:overtime?`FINAL / ${overtime===1?'OT':`${overtime}OT`}`:'FINAL',context,observedAt});
 }
 return result;
}
export function ukKickoff(value:string){
 const date=new Date(value);if(!Number.isFinite(date.valueOf()))return null;
 return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(date);
}

// Presentation only: choose a contrasting full wing, never recolour the source logo.
export const overlayColour=(value:unknown):string|null=>typeof value==='string'&&/^#?[0-9a-f]{6}$/i.test(value)?'#'+value.replace(/^#/,''):null;
const lightSurface='#fffaf0',darkSurface='#0b1f33';
const luminance=(colour:string)=>{
 const rgb=colour.slice(1).match(/../g)!.map(value=>{const c=parseInt(value,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
export const overlaySurfaceInk=(surface:string)=>contrast(surface,lightSurface)>contrast(surface,darkSurface)?lightSurface:darkSurface;
export function pregameTeamAppearance(team:OverlayTeam){
 const suppliedPrimary=overlayColour(team.color),primary=suppliedPrimary??darkSurface,secondary=overlayColour(team.secondaryColor);
 // A provider-designated primary-background asset is paired with its actual primary colour.
 if(suppliedPrimary&&team.primarySurfaceLogo)return {primary,surface:primary,ink:overlaySurfaceInk(primary),logo:team.primarySurfaceLogo};
 let surface=contrast(primary,lightSurface)>=contrast(primary,darkSurface)?lightSurface:darkSurface;
 // Bright secondary colours work for dark marks; dark secondaries work for bright marks.
 // Mid-tone secondaries often repeat colours inside multicolour marks, so use an AAW surface.
 if(secondary&&contrast(primary,secondary)>=3&&(luminance(secondary)>=.55||(luminance(primary)>=.25&&luminance(secondary)<=.06))){surface=luminance(secondary)>.92?lightSurface:secondary;}
 const ink=overlaySurfaceInk(surface),logo=ink===lightSurface&&team.darkLogo?team.darkLogo:team.logo;
 return {primary,surface,ink,logo};
}
export function pregameJoinColour(away:string,home:string){
 const parts=(colour:string)=>colour.slice(1).match(/../g)!.map(value=>parseInt(value,16));
 const a=parts(away),b=parts(home),middle='#'+a.map((v,i)=>Math.round((v+b[i])/2).toString(16).padStart(2,'0')).join('');
 return middle;
}
export const pregameJoinInk=(away:string,home:string)=>overlaySurfaceInk(pregameJoinColour(away,home));
