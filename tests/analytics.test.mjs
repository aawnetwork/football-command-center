import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=s=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const contractUrl=compile((await readFile(new URL('../app/lib/analytics-consent.ts',import.meta.url),'utf8')).replace("'./hub-sections'",JSON.stringify(new URL('../app/lib/hub-sections.ts',import.meta.url).href)));
const {analyticsConsentKey,analyticsConsentVersion,analyticsConfig,parseAnalyticsConsent,readAnalyticsConsent,writeAnalyticsConsent,analyticsRoute}=await import(contractUrl);
const {HubAnalytics}=await import(compile((await readFile(new URL('../app/lib/analytics-runtime.ts',import.meta.url),'utf8')).replace("'./analytics-consent'",JSON.stringify(contractUrl))));
const config={enabled:true,measurementId:'G-TEST12345',invite:true}; // Mock only; never sent to Google.
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),get length(){return map.size},key:i=>[...map.keys()][i]??null};}
function fixture(cfg=config){
 const scripts=[],cookies=new Map(),deleted=[];
 const win={localStorage:storage(),sessionStorage:storage(),document:{head:{appendChild:s=>scripts.push(s)},createElement:()=>({dataset:{},remove(){this.removed=true;}})}};
 Object.defineProperty(win.document,'cookie',{get:()=>[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),set:value=>{const name=value.split('=')[0];if(value.includes('Max-Age=0')){cookies.delete(name);deleted.push(name);}else cookies.set(name,value.split('=')[1]);}});
 const changes=[],engine=new HubAnalytics(cfg,win,(choice,available)=>changes.push({choice,available}));
 const events=()=>win.dataLayer?.filter(row=>row[0]==='event')??[];
 return {win,engine,scripts,cookies,deleted,changes,events};
}
test('Configuration fails closed unless both approval gates and valid public ID are present',()=>{
 for(const env of [{},{AAW_ANALYTICS_ENABLED:'true'},{AAW_ANALYTICS_ENABLED:'true',GA4_MEASUREMENT_ID:'G-TEST12345'},{AAW_ANALYTICS_ENABLED:'true',AAW_GA4_STREAM_APPROVED:'true',GA4_MEASUREMENT_ID:'invalid'}])assert.equal(analyticsConfig(env).enabled,false);
 assert.equal(analyticsConfig({AAW_ANALYTICS_ENABLED:'true',AAW_GA4_STREAM_APPROVED:'true',GA4_MEASUREMENT_ID:'G-TEST12345'}).enabled,true);
 assert.equal(analyticsConfig({}).invite,false);
});
test('Versioned minimal consent is explicit; corrupt, obsolete, extra and blocked storage fail closed',()=>{
 const s=storage();assert.equal(readAnalyticsConsent(s).choice,'unknown');assert.equal(s.length,0);
 for(const raw of ['bad','{"version":"old","choice":"granted"}',JSON.stringify({version:analyticsConsentVersion,choice:'granted',token:'private'})])assert.equal(parseAnalyticsConsent(raw),'unknown');
 for(const choice of ['granted','denied','dismissed']){assert.equal(writeAnalyticsConsent(s,choice),true);assert.equal(readAnalyticsConsent(s).choice,choice);}
 const blocked={getItem:()=>JSON.stringify({version:analyticsConsentVersion,choice:'granted'}),setItem:()=>{throw Error();}};assert.equal(readAnalyticsConsent(blocked).available,false);
});
test('No tag, cookies or events before consent; decline/dismissal/gate off do not load Google',()=>{
 for(const choice of [null,'denied','dismissed']){
  const f=fixture();if(choice)f.engine.choose(choice);f.engine.navigate('https://hub.test/cfb?section=stats');f.engine.action('tier_interaction');assert.equal(f.scripts.length,0);assert.equal(f.events().length,0);assert.equal(f.cookies.size,0);
 }
 const f=fixture({...config,enabled:false});f.engine.navigate('https://hub.test/nfl');f.engine.choose('granted');assert.equal(f.scripts.length,0);
});
test('Acceptance loads one tag; no loading-time action replay; navigation is sanitised and deduplicated including back/forward',()=>{
 const f=fixture();f.engine.navigate('https://hub.test/cfb?section=stats&token=PRIVATE&deck=secret#private');f.engine.action('tier_interaction');f.engine.choose('granted');assert.equal(f.scripts.length,1);assert.equal(f.events().length,0);
 f.engine.action('tier_interaction');f.scripts[0].onload();assert.equal(f.events().length,1);assert.equal(f.events()[0][1],'page_view');assert.equal(f.events()[0][2].page_location,'https://hub.test/cfb?section=stats');
 f.engine.navigate('https://hub.test/cfb?section=stats&other=PRIVATE');assert.equal(f.events().length,1);
 f.engine.navigate('https://hub.test/cfb?section=games');f.engine.navigate('https://hub.test/cfb?section=stats');f.engine.navigate('https://hub.test/cfb?section=games');f.engine.navigate('https://hub.test/nfl?section=standings');assert.equal(f.events().length,5);
 f.engine.action('tier_interaction');f.engine.action('favourite_interaction');f.engine.action('preferences_open');f.engine.action('feature_navigation');assert.equal(f.events().length,9);
 assert.doesNotMatch(JSON.stringify(f.win.dataLayer),/PRIVATE|secret|participant|team_id|tier_value|consent_receipt/);
 const params=f.win.dataLayer.find(row=>row[0]==='config')[2];assert.equal(params.send_page_view,false);assert.equal(params.allow_google_signals,false);assert.equal(params.cookie_domain,'none');assert.equal(params.page_referrer,'');
});
test('Withdrawal immediately disables transmission, clears only owned cookies/storage and preserves participation/tiers/favourites',()=>{
 const f=fixture();f.engine.navigate('https://hub.test/nfl');f.engine.choose('granted');f.scripts[0].onload();
 for(const key of ['nfl-game-tiers','aaw-hub-favourite-NFL','aaw-hub-participation'])f.win.localStorage.setItem(key,'UNCHANGED');
 f.win.localStorage.setItem('aaw_hub_ga_cache','delete');f.cookies.set('aaw_hub_ga','123');f.cookies.set('aaw_hub_ga_TEST','456');f.cookies.set('participation-cookie','KEEP');f.cookies.set('_ga','OTHER-SITE');
 f.engine.choose('denied');assert.equal(f.win['ga-disable-G-TEST12345'],true);assert.deepEqual(f.deleted.sort(),['aaw_hub_ga','aaw_hub_ga_TEST']);assert.equal(f.win.localStorage.getItem('aaw_hub_ga_cache'),null);
 for(const key of ['nfl-game-tiers','aaw-hub-favourite-NFL','aaw-hub-participation'])assert.equal(f.win.localStorage.getItem(key),'UNCHANGED');
 assert.equal(f.cookies.get('participation-cookie'),'KEEP');assert.equal(f.cookies.get('_ga'),'OTHER-SITE');f.engine.action('tier_interaction');assert.equal(f.events().length,0);
 const next=new HubAnalytics(config,f.win,()=>{});next.navigate('https://hub.test/nfl');assert.equal(f.scripts.length,1);
});
test('Storage failure, cross-tab changes and late tag callbacks cannot revive revoked tracking',()=>{
 const f=fixture();f.engine.navigate('https://hub.test/cfb');f.engine.choose('granted');const old=f.scripts[0];f.engine.choose('dismissed');old.onload();assert.equal(f.events().length,0);assert.equal(f.win['ga-disable-G-TEST12345'],true);
 f.engine.choose('granted');const current=f.scripts[1];old.onload();current.onload();assert.equal(f.events().length,1);
 writeAnalyticsConsent(f.win.localStorage,'denied');f.engine.sync();assert.equal(f.win['ga-disable-G-TEST12345'],true);
 f.win.localStorage.getItem=()=>{throw Error('blocked');};f.engine.choose('granted');assert.equal(f.scripts.length,2);assert.equal(f.changes.at(-1).available,false);
});
test('Admin, unknown, protected, iframe and export contexts are excluded even after consent',()=>{
 for(const href of ['https://hub.test/admin','https://hub.test/admin/user-stats','https://hub.test/api/admin/audience/report','https://hub.test/unknown','https://hub.test/cfb?embed=1','https://hub.test/nfl?preview=1'])assert.equal(analyticsRoute(href),null);
 assert.equal(analyticsRoute('https://hub.test/cfb',true),null);
 const f=fixture();f.engine.choose('granted');f.engine.navigate('https://hub.test/admin');assert.equal(f.scripts.length,0);f.engine.navigate('https://hub.test/cfb',true);assert.equal(f.scripts.length,0);
 f.engine.navigate('https://hub.test/nfl');f.scripts[0].onload();f.engine.navigate('https://hub.test/admin/exports');assert.equal(f.win['ga-disable-G-TEST12345'],true);assert.equal(f.events().length,0);
});
test('SDK opt-out flag reacts immediately to protected navigation and inaccessible storage before React synchronisation',()=>{
 const f=fixture();f.win.location={href:'https://hub.test/nfl'};f.win.self=f.win;f.win.top=f.win;
 f.engine.navigate(f.win.location.href);f.engine.choose('granted');f.scripts[0].onload();assert.equal(f.win['ga-disable-G-TEST12345'],false);
 f.win.location.href='https://hub.test/admin/exports';assert.equal(f.win['ga-disable-G-TEST12345'],true);
 f.win.location.href='https://hub.test/nfl';f.win.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(f.win['ga-disable-G-TEST12345'],true);
});
test('Instrumentation is action-only and independent; no audience activation or analytics in server APIs',async()=>{
 const panel=await readFile(new URL('../app/features/preferences/HubPreferences.tsx',import.meta.url),'utf8');assert.match(panel,/analytics\.choose\('dismissed'\)/);assert.match(panel,/analytics\.action\('favourite_interaction'\)/);assert.match(panel,/analytics\.action\('preferences_open'\)/);
 const audience=await readFile(new URL('../app/features/preferences/useParticipation.ts',import.meta.url),'utf8');assert.doesNotMatch(audience,/analyticsConsentKey|HubAnalytics|analytics\.choose/);
 for(const league of ['cfb','nfl']){const source=await readFile(new URL(`../app/${league}/page.tsx`,import.meta.url),'utf8');assert.match(source,/function setGameTier[\s\S]*?analytics\.action\('tier_interaction'\)/);}
});
