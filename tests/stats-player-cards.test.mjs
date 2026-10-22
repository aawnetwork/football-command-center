import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../app/preview/nfl-stats/player-card-metrics.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { playerCardMetrics } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const value = n => ({ state: 'value', value: n });
const missing = { state: 'missing', value: null };

test('QB cards preserve passing zeros, omit unavailable cells and irrelevant categories', () => {
  assert.deepEqual(playerCardMetrics('QB', { completions: value(0), passing_yards: value(0), attempts: missing,
    completion_pct: { state: 'not-applicable', value: null }, def_sacks: value(2), receptions: value(1), carries: value(0), rushing_yards: value(0) }), ['completions', 'passing_yards']);
});
test('QB cards include meaningful rushing activity, including negative yards, with genuine zeros', () => {
  assert.deepEqual(playerCardMetrics('QB', { passing_yards: value(100), carries: value(2), rushing_yards: value(-3), rushing_tds: value(0), rushing_yards_per_carry: missing }), ['passing_yards', 'carries', 'rushing_yards', 'rushing_tds']);
});
test('Rush, Rec and Def cards expose only their available category fields', () => {
  const metrics = { passing_yards: value(100), carries: value(0), rushing_yards: value(0), receptions: value(4), receiving_yards: value(20), receiving_tds: value(0), def_sacks: value(0), def_interceptions: value(1), def_tackles_solo: missing, tackles: value(3) };
  assert.deepEqual(playerCardMetrics('Rush', metrics), ['carries', 'rushing_yards']);
  assert.deepEqual(playerCardMetrics('Rec', metrics), ['receptions', 'receiving_yards', 'receiving_tds']);
  assert.deepEqual(playerCardMetrics('Def', metrics), ['tackles', 'def_sacks', 'def_interceptions']);
  assert.deepEqual(playerCardMetrics('Def', { def_sacks: value(NaN), tackles: missing }), []);
});
test('shared NFL/CFB UI has no export action or export error state and retains live/details wiring', async () => {
  const ui = await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /captureRanking|exportSelected|Export selected stat|[Ee]xport unavailable|setExporting/);
  assert.match(ui, /params\.set\('view', 'details'\)/);
  assert.match(ui, /setInterval\(refresh, 30_000\)/);
  assert.match(ui, /PLAYING NOW/);
  assert.match(ui, /playerCardMetrics\(category, details\[row.id\]\.metrics, league\)/);
  assert.match(ui, /<RecentGames games=\{details\[row.id\].games\}/);
});

// Render the actual presentation component locally; no browser, server or provider calls.
const { createRequire } = await import('node:module');
const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const componentFile = new URL('../app/preview/nfl-stats/RecentGames.tsx', import.meta.url);
const componentJs = ts.transpileModule(await readFile(componentFile, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} }).outputText;
const componentModule = { exports: {} };
new Function('require', 'module', 'exports', componentJs)(createRequire(componentFile), componentModule, componentModule.exports);
const { RecentGames } = componentModule.exports;
const logGame = (week, metrics = {}) => ({ week, gameId: String(week), opponent: 'OPP-' + week, metrics });
const renderLog = (category, games) => renderToStaticMarkup(createElement(RecentGames, { category, games, teamName: id => id, className: 'gameLog' }));

test('Recent Games renders one table with five newest verified weeks and leaves source order intact', () => {
  const games = [1, 6, 3, 5, 4, 2].map(week => logGame(week, { passing_yards: value(week * 10) }));
  const html = renderLog('QB', games);
  assert.equal((html.match(/<table /g) ?? []).length, 1);
  assert.equal((html.match(/<th scope="row">/g) ?? []).length, 5);
  assert.deepEqual([...html.matchAll(/<th scope="row">(\d+)<\/th>/g)].map(match => Number(match[1])), [6, 5, 4, 3, 2]);
  assert.deepEqual(games.map(game => game.week), [1, 6, 3, 5, 4, 2]);
  assert.match(html, /WEEK/); assert.match(html, /OPPONENT/); assert.doesNotMatch(html, /OPP-1/);
});
test('QB logs keep zero completions, partial C/ATT and missing interceptions distinct', () => {
  const html = renderLog('QB', [logGame(2, { completions: value(0), attempts: value(2), passing_yards: value(0), passing_interceptions: value(0) }),
    logGame(1, { completions: missing, attempts: value(3), passing_yards: value(-2), passing_interceptions: missing })]);
  assert.match(html, /C\/ATT/); assert.match(html, /<td>0\/2<\/td>/); assert.match(html, /<td>—\/3<\/td>/);
  assert.match(html, /<td>0<\/td>/); assert.match(html, /<td>—<\/td>/); assert.doesNotMatch(html, />TD</);
});
test('Rush, Rec and Def logs select compact category fields and omit wholly unsupported columns', () => {
  const metrics = { carries: value(3), rushing_yards: value(-2), rushing_yards_per_carry: value(-2 / 3), rushing_tds: value(0),
    receptions: value(0), targets: missing, receiving_yards: value(0), receiving_tds: value(0), tackles: value(2), def_sacks: value(0.5), def_tackles_for_loss: missing, def_interceptions: value(0) };
  const rush = renderLog('Rush', [logGame(1, metrics)]), rec = renderLog('Rec', [logGame(1, metrics)]), def = renderLog('Def', [logGame(1, metrics)]);
  assert.match(rush, />CAR</); assert.match(rush, />Y\/C</); assert.match(rush, /<td>-0.7<\/td>/); assert.doesNotMatch(rush, />REC</);
  assert.match(rec, />REC</); assert.doesNotMatch(rec, />TGT</);
  assert.match(def, />TKL</); assert.match(def, />SACK</); assert.doesNotMatch(def, />TFL</); assert.match(def, /<td>0.5<\/td>/);
  const targets = renderLog('Rec', [logGame(1, { targets: value(0) })]); assert.match(targets, />TGT</); assert.match(targets, /<td>0<\/td>/);
});
test('Recent Games keeps fewer supplied entries and handles empty logs without invented rows', () => {
  assert.equal((renderLog('Def', [logGame(1, { tackles: value(0) })]).match(/<th scope="row">/g) ?? []).length, 1);
  assert.equal(renderLog('QB', []), '<p>Recent games are unavailable.</p>');
});

test('live badges share the fixed-height name line in both leagues without changing live eligibility', async () => {
  const ui = await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/preview/nfl-stats/stats-preview.module.css', import.meta.url), 'utf8');
  assert.match(ui, /className=\{styles.nameLine\}><strong>\{row.name\}<\/strong>\{row.playingNow && !error && <span className=\{styles.playing\}>● PLAYING NOW<\/span>\}<\/span><small>/);
  assert.match(css, /\.nameLine \{[^}]*height: 20px;[^}]*white-space: nowrap;/);
  assert.match(css, /\.nameLine > strong \{ flex: none; white-space: nowrap; \}/);
  assert.match(css, /\.playing \{[^}]*flex: none;[^}]*white-space: nowrap;[^}]*color: #fff;/);
  assert.doesNotMatch(css.match(/\.playing \{[^}]*\}/)[0], /margin-top/);
  assert.match(css, /\.tableWrap \{ overflow-x: auto;/);
});

test('CFB selected tabs and live badges use readable white lettering on darker orange', async () => {
  const css = await readFile(new URL('../app/preview/nfl-stats/stats-preview.module.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-league='CFB'\] \.tabs button\[aria-pressed='true'\] \{ background:#B94700 !important;[^}]*color:#fff !important;/);
  assert.match(css, /\[data-league='CFB'\] \.playing \{ background:#B94700;[^}]*color:#fff;/);
  assert.match(css, /\[aria-pressed='true'\] small \{ color:inherit;/);
  const luminance = hex => {
    const channels = hex.match(/../g).map(part => parseInt(part, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const background of ['B94700', '973A00', '67717C', '0b1f33']) {
    assert.ok(1.05 / (luminance(background) + 0.05) >= 4.5, `${background} has sufficient white-text contrast`);
  }
});

test('CFB cards add only the four supported category fields; NFL output and existing QB rushing tiles are unchanged',()=>{
 const metrics={passing_yards:value(100),carries:value(2),rushing_yards:value(-3),rushing_tds:value(0),rushing_long:value(0),receiving_long:value(37),def_qb_hurries:value(0),def_tds:value(0),def_qb_hits:missing};
 assert.deepEqual(playerCardMetrics('Rush',metrics,'CFB'),['carries','rushing_yards','rushing_tds','rushing_long']);
 assert.deepEqual(playerCardMetrics('Rec',metrics,'CFB'),['receiving_long']);
 assert.deepEqual(playerCardMetrics('Def',metrics,'CFB'),['def_tds','def_qb_hurries']);
 assert.deepEqual(playerCardMetrics('QB',metrics,'CFB'),['passing_yards','carries','rushing_yards','rushing_tds','rushing_long']);
 for(const category of ['QB','Rush','Rec','Def'])assert.deepEqual(playerCardMetrics(category,metrics,'NFL'),playerCardMetrics(category,metrics));
 assert.ok(!playerCardMetrics('Def',metrics,'NFL').includes('def_qb_hurries'));
 assert.deepEqual(playerCardMetrics('Rush',{rushing_long:missing},'CFB'),[]);
});


test('changing Stats selection clears prior rows in both leagues without resetting filters during refresh',async()=>{
 const ui=await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx',import.meta.url),'utf8');
 const source=ui.slice(ui.indexOf('    queueMicrotask(() => { if (active)'),ui.indexOf('    async function refresh()'));
 for(const league of ['NFL','CFB']){
  const changed={};const setters=Object.fromEntries(['Data','NflGate','NflStatusChecked','NflHistorical','CfbGate','StatusChecked','LastChecked','DetailChecked','Error','Details','Expanded','Order'].map(key=>['set'+key,value=>changed[key]=value]));
  new Function('active','queueMicrotask','league',...Object.keys(setters),source)(true,run=>run(),league,...Object.values(setters));
  assert.equal(changed.Data,null);assert.deepEqual(changed.Expanded,[]);assert.deepEqual(changed.Details,{});
 }
 const refresh=ui.slice(ui.indexOf('    async function refresh()'),ui.indexOf("    if (league === 'CFB' && !fixture)"));
 assert.doesNotMatch(refresh,/setExpanded|setOrder|setMetric|setSearch|setConference|setWeek/);
});
test('unsupported selection reports the server coverage explanation rather than showing stale statistics',async()=>{
 const ui=await readFile(new URL('../app/preview/nfl-stats/stats-preview.tsx',import.meta.url),'utf8');
 const refresh=ui.slice(ui.indexOf('    async function refresh()'),ui.indexOf("    if (league === 'CFB' && !fixture)"));
 const compiledRefresh=ts.transpileModule(refresh,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const run=new Function('context',`let running=false;const {setRefreshing,query,category,fetch,endpoint,active,setData,setLastChecked,setError,loadDetails,expandedRef,generation}=context;${compiledRefresh};return refresh();`);
 const changed={},context={setRefreshing:value=>changed.refreshing=value,query:()=>new URLSearchParams('mode=season'),category:'QB',endpoint:'/fixture',active:true,setData:value=>changed.data=value,setLastChecked:()=>{throw Error('failed selection cannot advance checked time');},setError:value=>changed.error=value,loadDetails:()=>{throw Error('no details from rejected selection');},expandedRef:{current:[]},generation:1,fetch:async()=>Response.json({error:'CFB season coverage is not verified. Use the existing Season Stats.'},{status:409})};
 assert.equal(await run(context),false);assert.equal(changed.data,null);assert.match(changed.error,/CFB season coverage/);assert.equal(changed.refreshing,false);
 changed.error='';context.active=false;assert.equal(await run(context),false);assert.equal(changed.error,'','stale requests cannot replace selection errors');
});
