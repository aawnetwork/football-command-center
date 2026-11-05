import {cfpBracket,nflBracket,superBowl,type BracketSlot} from '../../lib/playoff-bracket';
import type {BracketSnapshot,BracketScope} from './bracket-snapshot';
export type BracketFormat='wide'|'portrait'|'story';
export type PositionedMatch={slot:BracketSlot;x:number;y:number;width:number};
export type BracketEdge={from:[number,number];to:[number,number];vertical?:boolean};
export type BracketLayout={cards:PositionedMatch[];edges:BracketEdge[];headings:{name:string;x:number;y:number;width:number}[];width:number;height:number;cardHeight:number};
export function bracketFormatDimensions(format:BracketFormat){return format==='portrait'?{width:1080,height:1350}:format==='story'?{width:1080,height:1920}:null;}
export function bracketOverlayLayout(data:BracketSnapshot,scope:BracketScope,format:BracketFormat='wide'):BracketLayout{
 const cards:PositionedMatch[]=[],edges:BracketEdge[]=[],headings:BracketLayout['headings']=[];
 const portrait=format!=='wide',scale=format==='story'?1.45:1,cardHeight=format==='story'?156:128;
 const add=(slot:BracketSlot,x:number,y:number,width:number)=>cards.push({slot,x,y:y*scale,width});
 const heading=(name:string,x:number,y:number,width:number)=>headings.push({name,x,y:y*scale,width});
 if(portrait){
  if(data.league==='CFB'){
   const path=cfpBracket(data.conferences[0].teams,data.games),centres=[112,272,432,592];
   heading('First Round',0,0,474);heading('Quarterfinals',526,0,474);
   path.columns[0].slots.forEach((slot,i)=>add(slot,0,centres[i],474));
   path.columns[1].slots.forEach((slot,i)=>add(slot,526,centres[i],474));
   centres.forEach(y=>edges.push({from:[474,y*scale],to:[526,y*scale]}));
   path.columns[2].slots.forEach((slot,i)=>{heading(`Semifinal ${i+1}`,i*526,720,474);add(slot,i*526,844,474);});
   heading('National Championship',150,996,700);add(path.columns[3].slots[0],150,1120,700);
   for(const x of [237,763])edges.push({from:[x,844*scale+cardHeight/2],to:[500,1120*scale-cardHeight/2],vertical:true});
  }else{
   const full=scope==='full',conferences=data.conferences.filter(c=>full||c.name===scope),width=full?474:1000;
   conferences.forEach((conference,index)=>{
    const x=full?index*526:0,path=nflBracket(conference.teams,data.games,conference.name);
    heading(`${conference.name} · Wild Card`,x,0,width);
    path.columns[0].slots.forEach((slot,i)=>add(slot,x,[112,256,400][i],width));
    heading('Divisional · Reseeded',x,480,width);
    path.columns[1].slots.forEach((slot,i)=>add(slot,x,[592,736][i],width));
    heading(`${conference.name} Championship`,x,824,width);add(path.columns[2].slots[0],x,940,width);
   });
   if(full){heading('Super Bowl',150,1028,700);add(superBowl(data.conferences,data.games),150,1140,700);}
  }
  return {cards,edges,headings,width:1000,height:format==='story'?1770:1210,cardHeight};
 }
 if(data.league==='CFB'){
  const path=cfpBracket(data.conferences[0].teams,data.games),xs=[0,396,792,1188],centres=[[120,280,440,600],[120,280,440,600],[200,520],[360]],width=332;
  path.columns.forEach((column,c)=>{heading(column.name,xs[c],4,width);column.slots.forEach((slot,i)=>add(slot,xs[c],centres[c][i],width));});
  for(let c=0;c<3;c++)for(let i=0;i<path.columns[c].slots.length;i++)edges.push({from:[xs[c]+width,centres[c][i]],to:[xs[c+1],centres[c+1][c===0?i:Math.floor(i/2)]]});
 }else{
  const full=scope==='full',width=full?200:420,xs=full?[0,220,440]:[0,550,1100],centres=[[120,360,600],[240,480],[360]];
  data.conferences.filter(c=>full||c.name===scope).forEach(conference=>{
   const path=nflBracket(conference.teams,data.games,conference.name),reverse=full&&conference.name==='NFC',columns=xs.map(x=>reverse?1320-x:x);
   path.columns.forEach((column,c)=>{heading(c===0?`${conference.name} · ${column.name}`:column.name,columns[c],4,width);column.slots.forEach((slot,i)=>add(slot,columns[c],centres[c][i],width));});
   for(let i=0;i<3;i++)edges.push({from:[reverse?columns[0]:columns[0]+width,centres[0][i]],to:[reverse?columns[1]+width+10:columns[1]-10,360]});
   for(let i=0;i<2;i++)edges.push({from:[reverse?columns[1]+width+10:columns[1]-10,360],to:[reverse?columns[1]+width:columns[1],centres[1][i]]});
   for(let i=0;i<2;i++)edges.push({from:[reverse?columns[1]:columns[1]+width,centres[1][i]],to:[reverse?columns[2]+width:columns[2],360]});
   if(full)edges.push({from:[reverse?columns[2]:columns[2]+width,360],to:[reverse?860:660,360]});
  });
  if(full){heading('Super Bowl',660,4,200);add(superBowl(data.conferences,data.games),660,360,200);}
 }
 return {cards,edges,headings,width:1520,height:700,cardHeight};
}
