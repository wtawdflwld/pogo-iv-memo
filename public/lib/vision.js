// Pixel-based appraisal-bar detection shared by video and still imports.
// Pure ImageData helpers are also exercised by the synthetic-fixture tests.
function pixel(data,w,x,y){const i=(Math.round(y)*w+Math.round(x))*4;return [data[i],data[i+1],data[i+2]];}
function fill([r,g,b]){return (r>160&&g>65&&g<205&&b<175&&r-g>25&&g-b>8)||(r>175&&g>70&&g<185&&b>65&&b<190&&r-g>40&&Math.abs(g-b)<48);}
function track([r,g,b]){return fill([r,g,b]) || (Math.min(r,g,b)>155&&Math.max(r,g,b)<247&&Math.max(r,g,b)-Math.min(r,g,b)<45);}
function runAt(data,w,y) {
 const runs=[];let start=-1,holes=0;
 for(let x=Math.floor(w*.045);x<w*.8;x++){
  if(track(pixel(data,w,x,y))){if(start<0)start=x;holes=0;}else if(start>=0){holes++;if(holes>Math.max(3,w*.012)){if(x-start-holes>w*.21)runs.push({x:start,width:x-start-holes+1});start=-1;holes=0;}}
 }
 if(start>=0&&w*.8-start-holes>w*.21)runs.push({x:start,width:Math.floor(w*.8)-start-holes});
 return runs.filter(r=>r.width<w*.65);
}
export function readBar(image,x,y,width) {
 const {data,width:w,height:h}=image;if(y<2||y>h-3||x<0||x+width>=w||width<20)return {value:null,confidence:0};
 let coverage=0;
 const flags=[];
 for(let i=0;i<width;i++) {
   let f=0,t=0;for(let dy=-2;dy<=2;dy++){const p=pixel(data,w,x+i,y+dy);if(fill(p))f++;if(track(p))t++;}
   flags.push(f>=3);if(t>=3)coverage++;
 }
 if(coverage/width<.72)return {value:null,confidence:0};
 // Vote inside each IV cell, away from rounded ends and 5/10 separators.
 // A single orange compression pixel at the far end must not raise the IV.
 const cells=Array.from({length:15},(_,i)=>{
  const from=Math.ceil((i+.18)*width/15),to=Math.floor((i+.82)*width/15);let hits=0,total=0;
  for(let x=from;x<=to;x++){hits+=flags[x]?1:0;total++;}return hits/Math.max(1,total);
 });
 if(cells.some(v=>v>.25&&v<.75))return {value:null,confidence:.25};
 let value=0;while(value<15&&cells[value]>=.75)value++;
 if(cells.slice(value).some(v=>v>=.75))return {value:null,confidence:.25};
 return {value,confidence:Math.min(.98,.8+Math.min(...cells.map(v=>Math.abs(v-.5)*2))*.18)};
}
export function detectBars(image,calibration=null) {
 const {data,width:w,height:h}=image;
 if(calibration){const {x,width,ys}=calibration;const bars=ys.map(y=>readBar(image,x*w,y*h,width*w));return {ivs:bars.map(b=>b.value),confidence:Math.min(...bars.map(b=>b.confidence)),geometry:calibration};}
 const rows=[];
 for(let y=Math.floor(h*.43);y<h*.91;y+=2)for(const r of runAt(data,w,y)) rows.push({...r,y});
 const bands=[];
 for(const row of rows){let band=bands.find(b=>Math.abs(b.x-row.x)<w*.02&&Math.abs(b.width-row.width)<w*.025&&row.y-b.bottom<5);
  if(!band){band={...row,top:row.y,bottom:row.y};bands.push(band);}else band.bottom=row.y;
 }
 const candidates=bands.filter(b=>b.bottom-b.top>=2&&b.bottom-b.top<h*.025).map(b=>({...b,y:(b.top+b.bottom)/2}));
 let best=null;
 for(const a of candidates)for(const b of candidates)for(const c of candidates){
  const gap=b.y-a.y;if(gap<h*.023||gap>h*.09||Math.abs(c.y-b.y-gap)>h*.01)continue;
  if(Math.max(Math.abs(a.x-b.x),Math.abs(a.x-c.x),Math.abs(a.width-b.width),Math.abs(a.width-c.width))>w*.025)continue;
  const width=(a.width+b.width+c.width)/3,x=(a.x+b.x+c.x)/3;
  const bars=[a,b,c].map(r=>readBar(image,x,r.y,width));
  const confidence=Math.min(...bars.map(v=>v.confidence));
  if(!best||confidence>best.confidence)best={ivs:bars.map(v=>v.value),confidence,geometry:{x:x/w,width:width/w,ys:[a.y/h,b.y/h,c.y/h]}};
 }
 return best||{ivs:[null,null,null],confidence:0,geometry:null};
}
export function fingerprint(image) {
 const {data,width:w,height:h}=image,out=[];
 // Watch text/card regions; the animated model in the upper middle and the
 // team leader at the bottom must not restart the stability wait every frame.
 for(const [top,bottom,rows] of [[.055,.15,6],[.38,.57,10],[.6,.79,8]])
  for(let yy=0;yy<rows;yy++)for(let xx=0;xx<16;xx++){
   const x=Math.min(w-1,Math.floor((.08+xx/16*.75)*w)),y=Math.min(h-1,Math.floor((top+yy/rows*(bottom-top))*h));
   const [r,g,b]=pixel(data,w,x,y);out.push(Math.round((r+g+b)/3/8));
  }return out;
}
export function frameDistance(a,b){if(!a||!b)return Infinity;return a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;}
// Fine text signature distinguishes neighboring pages with the same type
// background; the broad scene hash alone can miss a changed name or CP.
export function pageFingerprint(image){
 const {data,width:w,height:h}=image,out=[];
 for(const [left,right,top,bottom,light] of [[.30,.66,.055,.095,true],[.15,.74,.40,.44,false]])
  for(let yy=0;yy<16;yy++)for(let xx=0;xx<64;xx++){
   const x=Math.round((left+(xx+.5)/64*(right-left))*w),y=Math.round((top+(yy+.5)/16*(bottom-top))*h),[r,g,b]=pixel(data,w,x,y);
   out.push(light?(Math.min(r,g,b)>180&&Math.max(r,g,b)-Math.min(r,g,b)<85?1:0):(Math.max(r,g,b)<195?1:0));
  }return out;
}
export function parseCP(text){
 const values=[...text.normalize('NFKC').matchAll(/c\s*p\s*[:.・]?\s*([0-9OIlSB]+(?:[ ,]+[0-9]+)*)(?![A-Za-z0-9])/gi)].map(m=>m[1].replace(/[ ,]/g,'').replace(/O/gi,'0').replace(/[Il]/g,'1').replace(/S/gi,'5').replace(/B/gi,'8')).filter(s=>/^\d{2,5}$/.test(s)).map(Number).filter(v=>v>=10&&v<=20000);
 const unique=[...new Set(values)];return unique.length===1?unique[0]:null;
}
// These two symbols are part of distinct species names, not punctuation.
const normalize=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,c=>c==='♀'||c==='♂'?c:'').toLowerCase();
export function matchSpecies(text,pokemon) {
 const lines=text.split(/\n/).map(normalize).filter(Boolean);
 const matches=pokemon.filter(p=>lines.some(l=>l===normalize(p.name)||l===normalize(p.english)));
 const dex=new Set(matches.map(p=>p.dex));
 if(dex.size!==1){
  // The exact shared Nidoran stem is a known two-species family. Do not mix
  // it with fuzzy neighbors such as ヤドラン while waiting for the sex glyph.
  if(!matches.length&&lines.some(line=>line==='ニドラン'||line==='nidoran')){
   const family=pokemon.filter(p=>p.id==='nidoran_female'||p.id==='nidoran_male');
   if(family.length===2)return {id:null,candidates:family.map(p=>p.id),reason:'ニドランの性別記号を確認してください'};
  }
  // Similar spelling is a review suggestion, never an automatic species ID.
  const suggestions=matches.length?matches:pokemon.filter(p=>lines.some(l=>{
   const n=normalize(p.name);return l.length>=4&&Math.abs(l.length-n.length)<=1&&editDistance(l,n)<=1;
  })).slice(0,8);
  return {id:null,candidates:suggestions.map(p=>p.id),reason:suggestions.length?'読み取りに近い名前候補あり。種類・フォルムを選んで確認してください':'種類を特定できません（ニックネームを含む）'};
 }
 const forms=pokemon.filter(p=>p.dex===matches[0].dex);
 if(forms.length!==1)return {id:null,candidates:forms.map(p=>p.id),exact:true,reason:'種類候補あり・フォルムを確認してください'};
 return {id:matches[0].id,candidates:[matches[0].id],exact:true,reason:''};
}
function editDistance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(a[i]===b[j]?0:1)));row=next;}return row[b.length];}
export class BarConsensus{
 constructor(){this.previous=null;this.count=0;}
 push(bars){
  const p=this.previous,g=bars.geometry,valid=!!g&&bars.ivs.every(v=>Number.isInteger(v))&&bars.confidence>=.8;
  const same=valid&&p&&JSON.stringify(p.ivs)===JSON.stringify(bars.ivs)&&Math.abs(p.geometry.x-g.x)<.015&&Math.abs(p.geometry.width-g.width)<.015&&g.ys.every((y,i)=>Math.abs(y-p.geometry.ys[i])<.015);
  this.count=valid?(same?this.count+1:1):0;this.previous=valid?bars:null;return this.count>=3;
 }
}
export class StableScenes {
 constructor(){this.previous=null;this.page=null;this.stableCount=0;this.emitted=false;this.scene=0;this.buffer=null;this.changing=0;}
 push(hash,page=null) {
  const distance=frameDistance(hash,this.previous);this.previous=hash;
  const pageChanged=!!page&&!!this.page&&frameDistance(page,this.page)>.035;if(page&&(!this.page||pageChanged))this.page=page;
  if(distance>1.8||pageChanged){this.stableCount=0;this.changing++;if(this.changing>=1){this.emitted=false;this.scene++;}return {stable:false,newScene:false};}
  this.changing=0;this.stableCount++;
  if(this.stableCount>=2&&!this.emitted){this.emitted=true;return {stable:true,newScene:true,scene:this.scene};}
  return {stable:this.stableCount>=2,newScene:false};
 }
}
