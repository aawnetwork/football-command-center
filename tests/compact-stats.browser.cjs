/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser verification. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');const ts=require('typescript');
const root=process.cwd(),compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 const modules={'/capture.js':compile('app/features/exports/capture-card.ts').replace('"html-to-image"','"/vendor/index.js"').replace('"./compact-stats"','"/compact.js"'),'/compact.js':compile('app/features/exports/compact-stats.ts').replace('"../../lib/team-logos"','"/logos.js"'),'/logos.js':compile('app/lib/team-logos.ts')};
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(modules[url.pathname]){res.setHeader('content-type','text/javascript');res.end(modules[url.pathname]);}
  else if(url.pathname.startsWith('/vendor/')){res.setHeader('content-type','text/javascript');const file=url.pathname.slice(8).replace(/\.js$/,'')+'.js';res.end(fs.readFileSync(path.join(root,'node_modules/html-to-image/es',file)));}
  else if(url.pathname==='/api/standings'){res.setHeader('content-type','application/json');res.end(JSON.stringify({sections:[{teams:[{team:'Ohio State Buckeyes',location:'Ohio State',logo:'/logo.png',darkLogo:'/dark-logo.png'},{team:'Indiana Hoosiers',location:'Indiana',logo:'/logo.png'}]}]}));}
  else if(url.pathname==='/logo.png'){res.setHeader('content-type','image/png');res.end(fs.readFileSync(process.env.TEST_LOGO||path.join(root,'tests/fixtures/ohio-state-logo.png')));}
  else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><body style="font-family:Arial;background:#f3f0e7"></body></html>');}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
  for(const league of (process.env.PREVIEW_ONLY?['cfb']:['cfb','nfl']))for(const mode of ['weekly','season'])for(const individual of (process.env.PREVIEW_ONLY?[true]:[true,false])){
   const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/${league}`);
   await page.addStyleTag({content:fs.readFileSync(path.join(root,'app/command-center.css'),'utf8')+fs.readFileSync(path.join(root,`app/${league}/${league}-centre.css`),'utf8')});
   const result=await page.evaluate(async({mode,individual})=>{
    const {compactStats}=await import('/compact.js');const {captureCard}=await import('/capture.js');
    const source=document.createElement('div');source.dataset.deskExport='stats';source.dataset.exportLabel=mode==='weekly'?'Week 7':'2026 season';source.style.cssText='width:900px;background:#fffdf7;color:#0b1f33';
    source.innerHTML=`<h2>${individual?'Passing':'Scoring Defense'}</h2><p>${mode==='weekly'?'Week 7':'2026 season'} leaders</p><table><tbody>${Array.from({length:12},(_,i)=>`<tr class="${i===0?'weekly-leader--playing':''}"><td>${i+1}</td><td>${individual?(i===0?'Torrance Burgess Jr.':i===1?'TJ Engleman Jr.':'Player '+i):'Ohio State Buckeyes'}${i===0?'<span data-export-playing>PLAYING NOW</span>':''}</td>${individual?'<td>Ohio State Buckeyes</td>':''}<td>${individual?2100-i*50+' yards':'17.3 PPG'}</td></tr>`).join('')}</tbody></table>`;document.body.append(source);
    const before=source.outerHTML,clone=source.cloneNode(true);await compactStats(source,clone);document.body.append(clone);
    const text=clone.innerText,colour=getComputedStyle(clone).backgroundColor,badges=(text.match(/PLAYING NOW/g)||[]).length;
    const exportedRows=Array.from(clone.children).slice(1);
    const rowHeights=exportedRows.map(n=>n.getBoundingClientRect().height-parseFloat(getComputedStyle(n).borderBottomWidth));
    const nameLine=exportedRows[0].children[2].firstElementChild;
    const playerBounds=nameLine.children[0].getBoundingClientRect(),badgeBounds=nameLine.children[1].getBoundingClientRect();
    const badgeBesideName=badgeBounds.left>=playerBounds.right&&Math.abs((badgeBounds.top+badgeBounds.height/2)-(playerBounds.top+playerBounds.height/2))<1;
    const nameUnclipped=nameLine.children[0].scrollWidth<=nameLine.children[0].clientWidth+1;
    const noYellowLine=!Array.from(clone.querySelectorAll("*")).some(n=>getComputedStyle(n).borderBottomColor==='rgb(255, 199, 32)');
    const capture=await captureCard(source);const img=new Image();img.src=capture.dataUrl;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let yellow=0,cream=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]===255&&pixels[i+1]===245&&pixels[i+2]===217)yellow++;if(pixels[i]===255&&pixels[i+1]===253&&pixels[i+2]===247)cream++;}
    return {...capture,text,badges,colour,yellow,cream,rowHeights,badgeBesideName,nameUnclipped,noYellowLine,unchanged:before===source.outerHTML};
   },{mode,individual});
   assert.equal(result.badges,1);assert.ok(!result.text.includes('The HUB'));assert.ok(!result.text.includes('hub.aawnetwork.co.uk'));assert.ok(result.noYellowLine);assert.ok(result.badgeBesideName);assert.ok(result.nameUnclipped);assert.equal(result.rowHeights.length,10);assert.ok(result.rowHeights.every(height=>Math.abs(height-result.rowHeights[0])<1),'live badge must not increase row height');assert.equal(result.colour,'rgb(255, 253, 247)');assert.ok(result.unchanged);assert.ok(result.yellow>20,'live badge missing from encoded PNG');assert.ok(result.cream>10000);assert.ok(!result.text.includes('Player 10'),'top 10 bound');
   if(league==='cfb'&&individual){const out=process.env.VERIFICATION_DIR||'verification';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(`${out}/${mode}-stats-hub.png`,Buffer.from(result.dataUrl.split(',')[1],'base64'));}
   console.log(JSON.stringify({league,mode,individual,width:result.width,height:result.height,badges:result.badges,rowHeights:result.rowHeights,badgeBesideName:result.badgeBesideName,liveBadgePixels:result.yellow}));await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
