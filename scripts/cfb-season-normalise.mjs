// Pure source validator copied from Utility Room player-stats/cfb-player-games.mjs.
// No database, operational imports, network access or position inference.
const groups=['passing','rushing','receiving','defensive','interceptions'];
const id=value=>typeof value==='string'&&/^[1-9]\d*$/.test(value);
const qualified=(kind,value)=>`espn:cfb:${kind}:${value}`;
const time=value=>typeof value==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));
const specifications={
 passing:{'C/ATT':['completions','attempts'],'YDS':'passing_yards','TD':'passing_tds','INT':'passing_interceptions','AVG':'passing_average','QBR':'passing_qbr','SACKS':'sacks_suffered'},
 rushing:{'CAR':'carries','YDS':'rushing_yards','AVG':'rushing_yards_per_carry','TD':'rushing_tds','LONG':'rushing_long'},
 receiving:{'REC':'receptions','TGT':'targets','YDS':'receiving_yards','AVG':'receiving_yards_per_reception','TD':'receiving_tds','LONG':'receiving_long'},
 defensive:{'TOT':'tackles','SOLO':'solo_tackles','AST':'tackle_assists','SACKS':'defensive_sacks','TFL':'tackles_for_loss','PD':'passes_defended','QB HUR':'qb_hurries','TD':'defensive_touchdowns','FF':'forced_fumbles'},
 interceptions:{'INT':'defensive_interceptions','YDS':'interception_return_yards','TD':'interception_return_touchdowns'},
};
const fields=[...new Set(Object.values(specifications).flatMap(spec=>Object.values(spec).flat()))];
function number(raw){
 if(raw===null||raw===undefined||raw===''||['--','—','N/A'].includes(raw))return null;
 if(typeof raw!=='string'&&typeof raw!=='number')throw Error('Malformed statistical value');
 if(!/^-?\d+(?:\.\d+)?$/.test(String(raw))||!Number.isFinite(Number(raw)))throw Error('Invalid statistical value');
 return Number(raw);
}
function statistic(key,raw){
 const value=number(raw);
 if(value===null)return null;
 const fractional=/(?:average|qbr|per_carry|per_reception|sacks|for_loss)$/.test(key);
 if(!fractional&&!Number.isSafeInteger(value))throw Error('Non-integer count');
 if(!/(?:yards|long|average|per_carry|per_reception)$/.test(key)&&value<0)throw Error('Negative count');
 if(/(?:sacks|for_loss)$/.test(key)&&!Number.isSafeInteger(value*2))throw Error('Invalid half count');
 return value;
}
/** One source-game snapshot, not a league/season completeness assertion. No network access. */
export function normaliseCapture({event,summary,observed_at,evidence_kind='captured-provider-response',observation_basis='caller-provided-observation'}){
 if(!['captured-provider-response','synthetic-fixture'].includes(evidence_kind)||!time(observed_at)||typeof observation_basis!=='string'||!observation_basis||observation_basis.length>200)throw Error('Explicit evidence kind and timezone-qualified observation required');
 const competition=event?.competitions?.[0],header=summary?.header,actual=header?.competitions?.[0],season=event?.season?.year,phase=event?.season?.type,week=event?.week?.number;
 if(!id(event?.id)||event.competitions.length!==1||competition?.id!==event.id||!Number.isInteger(season)||season<2000||season>2100||![2,3].includes(phase)||!Number.isInteger(week)||week<1||week>30||!time(event.date))throw Error('Invalid game period or identity');
 if(header?.id!==event.id||header.season?.year!==season||header.season?.type!==phase||(typeof header.week==='number'?header.week:header.week?.number)!==week||header.competitions?.length!==1||actual?.id!==event.id)throw Error('Summary game/period mismatch');
 const participants=competition.competitors,observed=actual.competitors;
 const validTeams=teams=>Array.isArray(teams)&&teams.length===2&&teams.every(t=>id(t.team?.id)&&['home','away'].includes(t.homeAway))&&new Set(teams.map(t=>t.team.id)).size===2&&new Set(teams.map(t=>t.homeAway)).size===2;
 if(!validTeams(participants)||!validTeams(observed)||participants.some(t=>!observed.some(a=>a.team.id===t.team.id&&a.homeAway===t.homeAway)))throw Error('Game/team identity mismatch');
 const state=competition.status?.type,checked=actual.status?.type;
 if(!['in','post'].includes(state?.state)||state.state!==checked?.state||typeof state.completed!=='boolean'||state.completed!==checked.completed||state.completed!==(state.state==='post'))throw Error('Game state unavailable or inconsistent');
 if(!Array.isArray(summary.boxscore?.players)||summary.boxscore.players.length!==2||new Set(summary.boxscore.players.map(b=>b.team?.id)).size!==2||summary.boxscore.players.some(b=>!participants.some(t=>t.team.id===b.team?.id)))throw Error('Both participant boxscores required');
 const records=new Map(),owners=new Map(),issues=[],context=[],coverage=[];
 for(const box of summary.boxscore.players){
  const team=box.team.id,opponent=participants.find(t=>t.team.id!==team).team.id,seen=new Set();
  if(!Array.isArray(box.statistics))throw Error('Malformed team statistics');
  for(const group of box.statistics.filter(g=>groups.includes(g.name))){
   if(seen.has(group.name))throw Error('Duplicate source category');seen.add(group.name);
   if(!Array.isArray(group.labels)||!group.labels.length||group.labels.some(label=>typeof label!=='string'||!label)||new Set(group.labels).size!==group.labels.length||!Array.isArray(group.athletes))throw Error('Malformed category labels or athletes');
   const athletes=new Set();
   for(const row of group.athletes){
    const player=row.athlete?.id,name=row.athlete?.displayName?.trim();
    if(typeof player==='string'&&/^-\d+$/.test(player)&&name==='Team'){context.push({team_id:qualified('team',team),category:group.name,source_row:row});continue;}
    if(!id(player)||!name||athletes.has(player)||!Array.isArray(row.stats)||row.stats.length!==group.labels.length){issues.push('Invalid or duplicate athlete/category observation');continue;}athletes.add(player);
    if(owners.has(player)&&owners.get(player)!==team){issues.push('Player observed for both teams in one game');continue;}owners.set(player,team);
    const key=JSON.stringify(['ESPN',season,phase,event.id,team,player]);
    let record=records.get(key);
    if(!record){record={_key:key,player_id:qualified('athlete',player),player_name:name,team_id:qualified('team',team),opponent_id:qualified('team',opponent),game_id:qualified('game',event.id),season,season_type:phase===2?'regular':'postseason',week,game_start:event.date,game_state:state.state,completed:state.completed,position:row.athlete.position?.abbreviation??null,observation_basis,source:'ESPN',source_url:`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${event.id}`,observed_at,source_published_at:null,evidence_kind,statistics:Object.fromEntries(fields.map(field=>[field,null])),source_statistics:{}};records.set(key,record);}
    if(record.player_name!==name||(record.position&&row.athlete.position?.abbreviation&&record.position!==row.athlete.position.abbreviation)){issues.push('Conflicting explicit athlete metadata');continue;}
    record.position??=row.athlete.position?.abbreviation??null;
    record.source_statistics[group.name]=Object.fromEntries(group.labels.map((label,i)=>[label,row.stats[i]??null]));
    for(let i=0;i<group.labels.length;i++){
     const spec=specifications[group.name][group.labels[i]],raw=row.stats[i];if(!spec)continue;
     try{if(Array.isArray(spec)){
       if(raw===null||raw===''||['--','—','N/A'].includes(raw))continue;
       if(typeof raw!=='string'||!/^\d+\/\d+$/.test(raw))throw Error('Invalid completions/attempts');
       const pair=raw.split('/').map(Number);if(pair.some(n=>!Number.isSafeInteger(n))||pair[0]>pair[1])throw Error('Invalid completions/attempts');
       spec.forEach((field,index)=>record.statistics[field]=pair[index]);
      }else record.statistics[spec]=statistic(spec,raw);
     }catch(error){issues.push(`${group.name}/${group.labels[i]}: ${error.message}`);}
    }
   }
  }
  coverage.push({team_id:qualified('team',team),supplied_categories:[...seen],missing_core_categories:['passing','rushing','receiving','defensive'].filter(g=>!seen.has(g))});
 }
 return {valid:[...records.values()],issues:[...new Set(issues)],received:records.size,fields:['player_id','team_id','game_id','season','season_type','week','statistics'],scope:{source:'ESPN',season,season_type:phase===2?'regular':'postseason',week,game_id:qualified('game',event.id),participant_ids:participants.map(t=>qualified('team',t.team.id)).sort()},coverage:{scope:'one-supplied-game',complete_fbs:false,game_completed:state.completed,teams:coverage},team_context:context,observed_at,evidence_kind};
}
