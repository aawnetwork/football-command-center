/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node browser verification runner. */
// Run with PLAYWRIGHT_MODULE pointing to playwright if it is not locally installed.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const {GET}=await import(`data:text/javascript;base64,${Buffer.from(compile('app/api/team-logo/route.ts')).toString('base64')}`);
 let mode='normal';const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/team-logo')){
   if(mode==='slow')await new Promise(r=>setTimeout(r,5500));
   const response=mode==='proxy-failure'?new Response('unavailable',{status:502}):await GET(new Request(`http://localhost${req.url}`));
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><body>Export test</body>')}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
  const teams=[['349','Army Black Knights'],['2390','Miami Hurricanes'],['193','Miami (OH) RedHawks'],['30','USC Trojans'],['62',"Hawai'i Rainbow Warriors"],['23','San José State Spartans']];
  const games=teams.reduce((games,team,index)=>{if(index%2===0)games.push({id:index,awayTeam:team[1],awayTeamId:team[0],awayLogo:`https://a.espncdn.com/i/teamlogos/ncaa/500/${team[0]}.png`});else Object.assign(games.at(-1),{homeTeam:team[1],homeTeamId:team[0],homeLogo:`https://a.espncdn.com/i/teamlogos/ncaa/500/${team[0]}.png`});return games},[]);
  const js=compile('app/features/games/deck-png.ts');
  for(const scenario of ['proxy-only','missing-source','slow','proxy-failure','all-fail']){
   const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
   mode=scenario==='slow'?'slow':scenario==='proxy-failure'||scenario==='all-fail'?'proxy-failure':'normal';
   await page.unrouteAll();if(scenario!=='proxy-failure')await page.route('https://a.espncdn.com/**',route=>route.abort());
   const result=await page.evaluate(async({js,games,scenario})=>{
    const {createDeckPng}=await import(URL.createObjectURL(new Blob([js],{type:'text/javascript'})));
    const draws=[],texts=[];const oldDraw=CanvasRenderingContext2D.prototype.drawImage,oldText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.drawImage=function(img,...args){draws.push({src:img.src,args});return oldDraw.call(this,img,...args)};
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){texts.push(text);return oldText.call(this,text,...args)};
    let missing;try{
     if(scenario==='missing-source')games.forEach(g=>{delete g.awayLogo;delete g.homeLogo});
     const blob=await createDeckPng(2026,7,[{tier:'S',games}],teams=>{missing=teams});
     CanvasRenderingContext2D.prototype.drawImage=oldDraw;CanvasRenderingContext2D.prototype.fillText=oldText;
     const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
     const colours=draws.map(({args:[x,y,w,h]})=>{const pixels=ctx.getImageData(Math.floor(x*2),Math.floor(y*2),Math.ceil(w*2),Math.ceil(h*2)).data;const distinct=new Set();for(let i=0;i<pixels.length;i+=4)distinct.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return distinct.size});
     return {draws,texts,missing,colours,width:bitmap.width,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
    }finally{CanvasRenderingContext2D.prototype.drawImage=oldDraw;CanvasRenderingContext2D.prototype.fillText=oldText}
   },{js,games,scenario});
   assert.equal(result.width,2160);assert.ok(result.texts.includes('The HUB'));assert.ok(result.texts.includes('hub.aawnetwork.co.uk'));
   assert.equal(result.draws.length,scenario==='all-fail'?0:6);
   if(scenario==='proxy-failure')assert.ok(result.draws.every(d=>d.src.startsWith('https://a.espncdn.com/')));
   if(scenario==='all-fail')assert.equal(result.missing.length,6);else{assert.deepEqual(result.missing,[]);for(const count of result.colours)assert.ok(count>30,`logo PNG pixels missing: ${count}`)}
   if(scenario==='proxy-only'){
    const out=path.join(root,'verification');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'miami-army-deck.png'),Buffer.from(result.bytes));
   }
   console.log(JSON.stringify({scenario,drawn:result.draws.map(d=>d.src),logoPixelColours:result.colours,missing:result.missing,bytes:result.bytes.length}));
   await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
