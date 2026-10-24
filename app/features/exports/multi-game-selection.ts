import type {OverlayGame} from './game-overlay';
export type MultiMode='pregame'|'final';
export type SelectedGame={game:OverlayGame;week:string;availability:'verified'|'missing'|'refresh-failed'};
export const MULTI_GAME_LIMIT=4;
export function addSelected(rows:SelectedGame[],game:OverlayGame,week:string):SelectedGame[]{
 if(rows.length>=MULTI_GAME_LIMIT||rows.some(row=>row.game.id===game.id&&row.game.league===game.league))return rows;
 return [...rows,{game,week,availability:'verified'}];
}
export function moveSelected(rows:SelectedGame[],index:number,direction:-1|1):SelectedGame[]{
 const destination=index+direction;if(index<0||index>=rows.length||destination<0||destination>=rows.length)return rows;
 const result=[...rows];[result[index],result[destination]]=[result[destination],result[index]];return result;
}
/** A disappearing or failed observation stays in its editorial position, but cannot publish. */
export function reconcileSelected(rows:SelectedGame[],pages:Map<string,OverlayGame[]|null>):SelectedGame[]{
 return rows.map(row=>{
  if(!pages.has(row.week))return row;
  const page=pages.get(row.week);if(page===null)return {...row,availability:'refresh-failed'};
  const matches=page!.filter(game=>game.id===row.game.id&&game.league===row.game.league);
  if(matches.length===1)return {...row,game:matches[0],availability:'verified'};
  // Browsing a fixed week can recover a selection originally made under Current Week.
  const elsewhere=[...pages.entries()].filter(([week,games])=>week!==row.week&&games!==null).flatMap(([week,games])=>games!.filter(game=>game.id===row.game.id&&game.league===row.game.league).map(game=>({week,game})));
  return elsewhere.length===1?{...row,...elsewhere[0],availability:'verified'}:{...row,availability:'missing'};
 });
}
export function selectionIssue(row:SelectedGame,mode:MultiMode):string|null{
 if(row.availability==='missing')return 'Not returned by the refreshed schedule — refresh or remove.';
 if(row.availability==='refresh-failed')return 'Refresh failed — retry before exporting.';
 if(row.game.stage!==mode)return `${row.game.stage==='live'?'Live':row.game.stage==='final'?'Final':'Scheduled'} — ${mode==='pregame'?'scheduled games':'confirmed finals'} only in this output.`;
 if(mode==='final'&&(row.game.away.score===null||row.game.home.score===null))return 'Final scores unavailable.';
 return null;
}
export function collectionIssue(rows:SelectedGame[],mode:MultiMode):string|null{
 if(rows.length<2||rows.length>MULTI_GAME_LIMIT)return 'Select two to four games.';
 if(new Set(rows.map(row=>`${row.game.league}:${row.game.id}`)).size!==rows.length)return 'Remove duplicate games.';
 if(new Set(rows.map(row=>row.game.league)).size!==1)return 'Choose games from one league.';
 return rows.some(row=>selectionIssue(row,mode))?'Resolve the marked games before exporting. The collection will not be exported partially.':null;
}
