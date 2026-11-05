import test from 'node:test';
import assert from 'node:assert/strict';
import {compileLocalModule} from './helpers/compile-local-module.mjs';
const {bracketSnapshotIssue,bracketSnapshotFilename,bracketSnapshotLabel}=await import(await compileLocalModule(new URL('../app/features/exports/bracket-snapshot.ts',import.meta.url)));
const team=(seed,offset=0)=>({id:String(seed+offset),name:`Team ${seed+offset}`,logo:null,seed});
const nfl={league:'NFL',season:2026,state:'projected',checkedAt:'2026-11-05T16:00:00.000Z',games:[],issues:[],assumptions:[],conferences:[{name:'AFC',teams:Array.from({length:7},(_,i)=>team(i+1))},{name:'NFC',teams:Array.from({length:7},(_,i)=>team(i+1,100))}]};
test('only full, identified and consistently seeded source fields are exportable',()=>{
 assert.equal(bracketSnapshotIssue(nfl,'NFL'),null);
 assert.match(bracketSnapshotIssue(nfl,'CFB'),/match/);
 const missing=structuredClone(nfl);missing.conferences.pop();assert.match(bracketSnapshotIssue(missing,'NFL'),/Both/);
 const duplicate=structuredClone(nfl);duplicate.conferences[0].teams[1].seed=1;assert.match(bracketSnapshotIssue(duplicate,'NFL'),/seeds/);
 assert.match(bracketSnapshotIssue({...nfl,state:'unavailable'},'NFL'),/No bracket/);
});
test('CFP snapshots accept explicit unresolved seed ranges but do not silently accept a missing seed',()=>{
 const cfp={...nfl,league:'CFB',conferences:[{name:'CFP',teams:Array.from({length:12},(_,i)=>team(i+1))}]};
 cfp.conferences[0].teams[10]={...team(11),seed:0,possibleSeeds:[11,12]};cfp.conferences[0].teams[11]={...team(12),seed:0,possibleSeeds:[11,12]};
 assert.equal(bracketSnapshotIssue(cfp,'CFB'),null);
 delete cfp.conferences[0].teams[11].possibleSeeds;assert.match(bracketSnapshotIssue(cfp,'CFB'),/seed/);
});
test('snapshot filenames and labels preserve league, season, state, scope, treatment and checked timestamp',()=>{
 assert.equal(bracketSnapshotFilename(nfl,'AFC','dark-transparent'),'aaw-nfl-2026-playoff-bracket-afc-projected-dark-transparent-20261105T160000Z.png');
 assert.equal(bracketSnapshotLabel(nfl),'AS IT STANDS');
 assert.equal(bracketSnapshotLabel({...nfl,state:'confirmed'}),'CONFIRMED BRACKET');
});
