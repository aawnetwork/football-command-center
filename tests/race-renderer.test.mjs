import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function module(file) {
  const source = await readFile(new URL(`../app/features/exports/${file}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const { buildRaceSeries, loadRaceSeries } = await module('race-data');
const { raceFrame, raceDuration, drawRaceFrame } = await module('race-renderer');
const week = (number, values, extra = {}) => ({ period: { season: 2026, week: number }, columns: ['passing_yards'],
  lines: values.map(([id, name, value]) => ({ id, name, teams: ['A'], values: [value], playingNow: false })),
  logos: { A: '/logo.png' }, complete: true, confidence: { passing_yards: { status: 'verified' } }, ...extra });
const sources = [week(1, [['1','Player A',200],['2','Player B',100]]), week(2, [['1','Player A',100],['2','Player B',400]]), week(3, [['1','Player A',350],['2','Player B',200],['3','Player C',250]])];
const series = buildRaceSeries(sources, 'NFL', 'passing_yards', 1, 3);
test('builds season totals before trimming playback range; source identities, not names, are joined', () => {
  const result = buildRaceSeries(sources, 'NFL', 'passing_yards', 2, 3);
  assert.deepEqual(result.checkpoints.map(c => c.week), [2,3]);
  assert.deepEqual(result.checkpoints[0].entries.map(e => e.value), [300,500]);
  assert.equal(result.checkpoints[1].entries.find(e => e.id === '1').value, 650);
  assert.deepEqual(sources[0].lines[0].values, [200]);
  assert.equal(result.reportedOnly, false);
});
test('missing data is qualified rather than silently treated as verified zero; explicit zero is accepted', () => {
  const result = buildRaceSeries([week(0, [['1','Player A',null],['2','Player B',0]], {complete:false,confidence:{passing_yards:{status:'reported-values'}}})], 'CFB', 'passing_yards', 0, 0);
  assert.equal(result.reportedOnly, true);
  assert.equal(result.checkpoints[0].entries.length, 1);
  assert.equal(result.checkpoints[0].entries[0].value, 0);
});
test('rejects missing weeks, mismatched periods, unapproved metrics, duplicates and unfinished observations', () => {
  assert.throws(() => buildRaceSeries(sources.slice(1), 'NFL','passing_yards',1,3));
  assert.throws(() => buildRaceSeries([week(2,[['1','A',1]])], 'NFL','passing_yards',1,1), /wrong season or week/);
  assert.throws(() => buildRaceSeries([week(1,[['1','A',1]],{confidence:{}})], 'NFL','passing_yards',1,1), /statistical checks/);
  assert.throws(() => buildRaceSeries([week(1,[['1','A',1],['1','B',1]])], 'NFL','passing_yards',1,1), /duplicate/);
  const playing = week(1,[['1','A',1]]); playing.lines[0].playingNow = true;
  assert.throws(() => buildRaceSeries([playing], 'NFL','passing_yards',1,1), /in progress/);
});
test('holds the opening and closing standings; animates totals and positions across weeks', () => {
  assert.equal(raceDuration(series), 8.5);
  assert.equal(raceFrame(series,0,5).entries.find(e => e.id === '1').value, 200);
  const middle = raceFrame(series,2.5,5);
  assert.equal(middle.entries.find(e => e.id === '1').value, 250);
  assert.equal(middle.entries.find(e => e.id === '1').rank, .5);
  assert.equal(middle.entries.find(e => e.id === '2').value, 300);
  assert.equal(raceFrame(series,8.5,5).entries.find(e => e.id === '2').value,700);
  assert.equal(raceFrame(series,8.5,5).entries.find(e => e.id === '3').value,250);
});
test('draws the race with stable identity text, current week and coverage qualification', () => {
  const text = [];
  const ctx = {canvas:{width:1080,height:1920}, save(){},restore(){},scale(){},fillRect(){},beginPath(){},rect(){},clip(){},drawImage(){},measureText:s=>({width:s.length*12}),fillText:s=>text.push(s)};
  drawRaceFrame(ctx,{...series,reportedOnly:true},8.5,{theme:'light',limit:5});
  assert.ok(text.includes('Player A'));
  assert.ok(text.includes('WEEK 3'));
  assert.ok(text.includes('700'));
  assert.ok(text.includes('TOP 10 · SEASON TOTALS'));
  assert.ok(!text.some(s=>/reported|incomplete/i.test(s)));
});
test('loader verifies a completed slate before accepting a weekly checkpoint', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => {
    const query = new URL(url,'https://local.test').searchParams; calls.push(query);
    return { ok:true, json: async () => query.get('view') === 'status' ? {period:{season:2026,week:1},games:[{completed:false}]} : sources[0] };
  };
  try {
    await assert.rejects(loadRaceSeries('NFL','passing_yards',1,1,new AbortController().signal,()=>{}), /unfinished/);
    assert.ok(calls.every(q=>q.get('live')!=='0'), 'retain the Hub verification path for historical records');
  } finally { globalThis.fetch = original; }
});

test('never renders more than ten leaders when membership changes', () => {
  const series = {league:'NFL',season:2026,metric:'Yards',reportedOnly:false,checkpoints:[
    {week:1,entries:Array.from({length:20},(_,i)=>({id:String(i),name:`Player ${i}`,team:'Team',value:100-i}))},
    {week:2,entries:Array.from({length:20},(_,i)=>({id:String(i),name:`Player ${i}`,team:'Team',value:200+i*10}))}
  ]};
  for (let time=0;time<=6.5;time+=.1) assert.equal(raceFrame(series,time,10).entries.length,10);
});

async function brandingModule() {
  const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const url = source => `data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`;
  const directory = url(await readFile(new URL('../app/lib/team-logos.ts',import.meta.url),'utf8'));
  const names = url(await readFile(new URL('../app/nfl/data/divisions.ts',import.meta.url),'utf8'));
  let source = await readFile(new URL('../app/features/exports/race-branding.ts',import.meta.url),'utf8');
  for (const league of ['cfb','nfl']) {
    const json = await readFile(new URL(`../app/features/exports/${league}-overlay-logo-variants.json`,import.meta.url),'utf8');
    source = source.replace(new RegExp(`import ${league}Colours[^;]+;`),`const ${league}Colours = ${json};`);
  }
  source = source.replace(/import \{ resolveTeam, type LogoTeam \}[^;]+;/,`import {resolveTeam} from '${directory}';`)
    .replace(/import \{ nflTeamNameByAbbreviation \}[^;]+;/,`import {nflTeamNameByAbbreviation} from '${names}';`);
  return import(url(source));
}
const {brandRaceSeries} = await brandingModule();
const ten = {league:'NFL',season:2026,metric:'Passing yards',reportedOnly:false,checkpoints:[{week:1,entries:Array.from({length:10},(_,i)=>({id:String(i),name:`Player ${i}`,team:'ATL',teamId:'ATL',value:200-i}))}]};
test('Top 10 bars receive official team colours, directory logos and full team names',()=>{
  const result=brandRaceSeries(ten,[{id:'1',team:'Atlanta Falcons',abbreviation:'ATL',logo:'/falcons.png'}]);
  assert.equal(result.checkpoints[0].entries.length,10);
  assert.ok(result.checkpoints[0].entries.every(e=>e.color==='#a71930'&&e.logo==='/falcons.png'&&e.team==='Atlanta Falcons'));
  assert.equal(ten.checkpoints[0].entries[0].color,undefined);
});
test('missing team branding and fewer than ten leaders block export instead of orange fallback',()=>{
  assert.throws(()=>brandRaceSeries(ten,[]),/colour or logo unavailable/);
  assert.throws(()=>brandRaceSeries({...ten,checkpoints:[{week:1,entries:ten.checkpoints[0].entries.slice(0,9)}]},[]),/fewer than ten/);
});

test('cream artwork always draws ten team-coloured bars with their logos inside',()=>{
  const entries=Array.from({length:10},(_,i)=>({id:String(i),name:`Player ${i}`,team:'Team',value:500-i*20,color:i%2?'#00338d':'#a71930',logo:`logo-${i}`}));
  const series={league:'NFL',season:2026,metric:'Passing yards',reportedOnly:false,checkpoints:[{week:1,entries}]};
  const rectangles=[],images=[];
  const ctx={canvas:{width:1080,height:1920},save(){},restore(){},scale(){},beginPath(){},rect(){},clip(){},arc(){},fill(){},measureText:s=>({width:s.length*12}),fillText(){},drawImage:image=>images.push(image.id),fillRect(x,y,w,h){rectangles.push({x,y,w,h,color:this.fillStyle})}};
  const logos=new Map(entries.map(entry=>[entry.logo,{id:entry.id,width:64,height:64}]));
  drawRaceFrame(ctx,series,0,{logos});
  assert.equal(rectangles[0].color,'#fffdf7');
  const bars=rectangles.filter(rect=>rect.h===68);
  assert.equal(bars.length,10);
  assert.deepEqual([...new Set(bars.map(bar=>bar.color))].sort(),['#00338d','#a71930']);
  assert.equal(images.length,10);
});

test('CFB accumulates Week 0 once, including when playback starts later; NFL starts at 1', () => {
  const cfb = [week(0, [['1','Jayden',300]]), week(1, [['1','Jayden',335]])];
  const result = buildRaceSeries(cfb,'CFB','passing_yards',0,1);
  assert.deepEqual(result.checkpoints.map(c=>c.week),[0,1]);
  assert.deepEqual(result.checkpoints.map(c=>c.entries[0].value),[300,635]);
  assert.equal(buildRaceSeries(cfb,'CFB','passing_yards',1,1).checkpoints[0].entries[0].value,635);
  assert.throws(()=>buildRaceSeries(cfb,'NFL','passing_yards',0,1));
});
