import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {findCfbRivalry} from '../app/lib/cfb-rivalries.ts';
import {rivalries} from '../app/cfb/data/rivalries.ts';
const find=(homeTeam,awayTeam)=>findCfbRivalry({homeTeam,awayTeam},rivalries);
test('Michigan State–Northwestern never inherits Michigan’s George Jewett Trophy',()=>{
 for(const [a,b] of [['Michigan State Spartans','Northwestern Wildcats'],['Michigan State','Northwestern']]){
  assert.equal(find(a,b),undefined);assert.equal(find(b,a),undefined);
 }
 for(const [a,b] of [['Michigan Wolverines','Northwestern Wildcats'],['Michigan','Northwestern']]){
  assert.equal(find(a,b)?.trophy,'George Jewett Trophy');assert.equal(find(b,a)?.trophy,'George Jewett Trophy');
 }
 assert.equal(find('Michigan State Spartans','Michigan Wolverines')?.trophy,'Paul Bunyan Trophy');
});
test('Every catalogue pairing resolves in either home/away order',()=>{
 for(const rivalry of rivalries){const [a,b]=rivalry.teams;assert.equal(find(a,b),rivalry,`${a} / ${b}`);assert.equal(find(b,a),rivalry);}
});
test('School qualifiers cannot be consumed as mascots or partial matches',()=>{
 for(const [home,away] of [['Michigan State Spartans','Ohio State Buckeyes'],['Iowa State Cyclones','Wisconsin Badgers'],['Kansas State Wildcats','Missouri Tigers'],['Miami (OH) RedHawks','Florida Gators'],['Texas State Bobcats','Oklahoma Sooners'],['Western Michigan Broncos','Northwestern Wildcats']]){
  assert.equal(find(home,away),undefined,`${home} / ${away}`);
 }
 assert.equal(find('Arkansas Razorbacks','Texas A&M Aggies')?.teams[1],'Texas A&M');
 assert.equal(find('Arkansas Razorbacks','Texas Longhorns')?.teams[1],'Texas');
 assert.ok(find('San José State Spartans','Stanford Cardinal'));
 assert.ok(find("Hawai’i Rainbow Warriors",'Wyoming Cowboys'));
 assert.equal(find('','Northwestern'),undefined);assert.equal(find('Michigan','Michigan'),undefined);
});
test('All three rivalry consumers call the shared matcher',async()=>{
 for(const file of ['app/cfb/page.tsx','app/features/football/FootballSnapshot.tsx','app/features/content/ContentPanel.tsx']){
  const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');assert.match(source,/findCfbRivalry\(game, rivalries\)/,file);assert.doesNotMatch(source,/home\.includes\(a\)|mostSpecificMatch|rivalries\.find\(/,file);
 }
});

test("Received 2026 Notre Dame–Navy scoreboard names match in both orientations",()=>{
 const game={"id": 401859185, "context": {"league": "CFB", "season": 2026, "eventId": "401859185", "identity": "CFB:2026:401859185", "seasonType": "regular", "regularWeek": 9, "postseasonRound": null, "competitionKind": "regular", "competitionLabel": null, "kickoffAt": "2026-10-31T16:00:00.000Z", "homeTeamId": "2426", "awayTeamId": "87", "status": "scheduled", "sourceCheckedAt": "2026-10-30T13:54:18.667Z", "sourceUpdatedAt": null, "verified": true, "issues": []}, "possession": null, "playingTeamIds": [], "startDate": "2026-10-31T16:00Z", "homeTeamId": "2426", "awayTeamId": "87", "homeLogo": "https://a.espncdn.com/i/teamlogos/ncaa/500/2426.png", "awayLogo": "https://a.espncdn.com/i/teamlogos/ncaa/500/87.png", "statusDetail": null, "homeTeam": "Navy Midshipmen", "awayTeam": "Notre Dame Fighting Irish", "homeRecord": "2-5", "awayRecord": "6-1", "homeConferenceRecord": "1-4", "awayConferenceRecord": "0-0", "homePoints": 0, "awayPoints": 0, "homeRank": null, "awayRank": 5, "completed": false, "live": false};
 assert.equal(findCfbRivalry(game,rivalries)?.name,"Notre Dame–Navy Rivalry");
 assert.equal(find(game.awayTeam,game.homeTeam)?.name,"Notre Dame–Navy Rivalry");
 assert.equal(find("Notre Dame","Navy")?.name,"Notre Dame–Navy Rivalry");
 assert.equal(find("Navy Midshipmen","Ohio State Buckeyes"),undefined);
 assert.equal(findCfbRivalry({...game,neutralSite:true},rivalries)?.name,"Notre Dame–Navy Rivalry");
});
