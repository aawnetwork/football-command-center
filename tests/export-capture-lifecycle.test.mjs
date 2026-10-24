import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../app/features/exports/capture-card.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
 .replace(/import \{ toCanvas, getFontEmbedCSS \} from "html-to-image";/,'const toCanvas = (...args) => globalThis.captureHarness.toCanvas(...args); const getFontEmbedCSS = (...args) => globalThis.captureHarness.getFontEmbedCSS(...args);')
 .replace(/import \{ compactStats \} from "\.\/compact-stats";/,'const compactStats = async () => {};');
const {captureCard}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
function harness(){
 const style=()=>({setProperty(){}});
 const element=()=>({style:style(),querySelectorAll(){return [];},appendChild(){},remove(){this.removed=true;},getBoundingClientRect(){return {width:984,height:254,left:0,top:0};}});
 const clone={...element(),tagName:'ARTICLE'};
 const document={fonts:{ready:Promise.resolve()},importNode:()=>clone,createElement:element,body:{appendChild(){}}};
 const source={...element(),tagName:'ARTICLE',classList:{contains:()=>false},isConnected:true,ownerDocument:{fonts:{ready:Promise.resolve()},defaultView:{getComputedStyle:()=>[]}}};
 let calls=0;
 const toCanvas=async(_,options)=>{calls++;assert.equal(options.width,984);assert.equal(clone.style.minWidth,'984px');return {getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,verified'};};
 return {source,document,toCanvas,get calls(){return calls;}};
}
test('repeated capture keeps the same mounted artwork and full dimensions',async()=>{
 const h=harness();globalThis.document=h.document;globalThis.captureHarness=h;
 try{for(let i=0;i<3;i++){const result=await captureCard(h.source);assert.equal(result.width,1968);assert.equal(result.height,508);assert.equal(h.source.isConnected,true);}assert.equal(h.calls,3);}
 finally{delete globalThis.document;delete globalThis.captureHarness;}
});
test('source replaced while fonts load fails safely instead of exporting a thin strip',async()=>{
 const h=harness();let ready;h.source.ownerDocument.fonts.ready=new Promise(resolve=>{ready=resolve;});globalThis.document=h.document;globalThis.captureHarness=h;
 try{const result=captureCard(h.source);h.source.isConnected=false;ready();await assert.rejects(result,/card changed/);assert.equal(h.calls,0);}
 finally{delete globalThis.document;delete globalThis.captureHarness;}
});
test('zero-width source cannot be exported as a successful PNG',async()=>{
 const h=harness();h.source.getBoundingClientRect=()=>({width:0,height:200});globalThis.document=h.document;globalThis.captureHarness=h;
 try{await assert.rejects(captureCard(h.source),/card changed/);assert.equal(h.calls,0);}
 finally{delete globalThis.document;delete globalThis.captureHarness;}
});

test('multi-game fonts are embedded from the live source; legacy captures do not change font handling',async()=>{
 const h=harness();h.source.classList.contains=()=>true;let calls=0;
 h.getFontEmbedCSS=async(node)=>{assert.equal(node,h.source);calls++;return '@font-face{font-family:verified-source-font}';};
 const render=h.toCanvas;h.toCanvas=(node,options)=>{assert.match(options.fontEmbedCSS,/verified-source-font/);return render(node,options);};
 globalThis.document=h.document;globalThis.captureHarness=h;
 try{await captureCard(h.source);assert.equal(calls,1);}finally{delete globalThis.document;delete globalThis.captureHarness;}
});
