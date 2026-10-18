/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser verification. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const css=fs.readFileSync('app/command-center.css','utf8'),routes=['cfb','nfl'].map(l=>fs.readFileSync(`app/${l}/${l}-centre.css`,'utf8'));
const source=fs.readFileSync('app/features/all-time/AllTimeRecordGrid.tsx','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObject={};new Function('exports','React',compiled)(exportsObject,React);
const grid=renderToStaticMarkup(React.createElement(exportsObject.AllTimeRecordGrid,{categories:[{title:'Passing',unit:'yards',records:[{rank:1,player:'Active Player',team:'Example Team',years:'2026',value:1234,isActive:true},{rank:2,player:'Retired Player',team:'Other Team',years:'2001',value:1000,isActive:false}]}]}));
const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(l[0]+.05)/(l[1]+.05)};
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});try{
const page=await browser.newPage({viewport:{width:1280,height:1000}});let expected;
// Both CSS load orders matter because Next retains route styles during navigation.
for(const order of [routes,[...routes].reverse()])for(const league of ['cfb','nfl']){
await page.setContent(`<style>:root { --font-montserrat: Arial; }${css}\n${order.join('\n')}</style><main class="command-center command-center--${league}"><nav class="command-center__nav"><button aria-pressed="true">Games</button><button>Statistics</button></nav><article class="game-card"><div class="game-card__indicator">Rivalry</div><span class="game-card__live">LIVE</span></article><article class="${league}-performance-card">Top performer</article><section class="stats-leaderboard"><table><tbody><tr class="weekly-leader--playing"><td>1</td><td>Player <span class="all-time-record-row__active">PLAYING NOW</span></td><td>150 yards</td></tr></tbody></table></section><section class="standings-panel"><div class="standings-panel__table-wrap"><table><tbody><tr><td>Team</td><td>8–0</td></tr></tbody></table></div></section>${grid}</main><section class="football-snapshot"><a class="football-snapshot__centre">CFB</a><a class="football-snapshot__centre football-snapshot__centre--nfl">NFL</a><article class="football-snapshot__league"></article><article class="football-snapshot__league football-snapshot__league--nfl"></article></section>`);
const result=await page.evaluate(league=>{
 const style=(selector,props)=>{const s=getComputedStyle(document.querySelector(selector));return props.map(p=>s[p]);};
 const active=document.querySelector('.all-time-record-row--active');
 const rgb=s=>s.match(/[\d.]+/g).map(Number);
 const bg=rgb(getComputedStyle(active).backgroundColor),base=rgb(getComputedStyle(active.parentElement).backgroundColor);
 const blended=bg.slice(0,3).map((v,i)=>v*(bg[3]??1)+base[i]*(1-(bg[3]??1)));
 return {styles:{nav:style('.command-center__nav button',['color','backgroundColor','borderBottomColor']),game:style('.game-card',['backgroundColor','borderLeftColor']),indicator:style('.game-card__indicator',['color']),performance:style(`.${league}-performance-card`,['backgroundColor','borderLeftColor']),stats:style('.weekly-leader--playing td',['color','backgroundColor']),standings:style('.standings-panel__table-wrap',['backgroundColor']),active:style('.all-time-record-row--active',['color','backgroundColor']),badge:style('.all-time-record-row--active .all-time-record-row__active',['color','backgroundColor'])},activeText:['.all-time-record-row__rank','.all-time-record-row__player > div','strong','.all-time-record-row__player small'].map(s=>rgb(getComputedStyle(active.querySelector(s)).color)),blended,badgeText:rgb(getComputedStyle(active.querySelector('.all-time-record-row__active')).color),badgeBg:rgb(getComputedStyle(active.querySelector('.all-time-record-row__active')).backgroundColor),home:Array.from(document.querySelectorAll('.football-snapshot__centre')).map(e=>getComputedStyle(e).backgroundColor),borders:Array.from(document.querySelectorAll('.football-snapshot__league')).map(e=>getComputedStyle(e).borderTopColor),rows:document.querySelectorAll('.all-time-record-row').length,badges:document.querySelectorAll('.all-time-record-row--active .all-time-record-row__active').length};
},league);
if(expected)assert.deepEqual(result.styles,expected);else expected=result.styles;
assert.equal(result.home[0],result.home[1]);assert.equal(result.borders[0],result.borders[1]);
for(const color of result.activeText)assert.ok(contrast(color,result.blended)>=4.5,`active contrast ${contrast(color,result.blended)}`);
assert.equal(result.styles.nav[2],'rgb(255, 199, 32)');
assert.equal(result.styles.performance[1],'rgb(255, 199, 32)');
assert.ok(contrast(result.badgeText,result.badgeBg)>=4.5);assert.equal(result.rows,2);assert.equal(result.badges,1);
await page.screenshot({path:`/tmp/hub-colour-${league}.png`,fullPage:true});
console.log(`${league}: games, performances, statistics, standings, actual All-Time rows, homepage; league parity and active contrast ≥4.5:1 passed`);
}
await page.setContent(`<style>${css}</style><main class="command-center">${grid}</main>`);
const dark=await page.evaluate(()=>{const row=document.querySelector('.all-time-record-row--active'),s=getComputedStyle(row);return {text:getComputedStyle(row.querySelector('strong')).color,background:s.backgroundColor};});
const darkRgb=value=>value.match(/[\d.]+/g).map(Number);
const darkBg=darkRgb(dark.background),darkBase=[15,23,42];
const darkBlend=darkBg.slice(0,3).map((v,i)=>v*darkBg[3]+darkBase[i]*(1-darkBg[3]));
assert.ok(contrast(darkRgb(dark.text),darkBlend)>=4.5);console.log('Dark active-row contrast ≥4.5:1 passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
