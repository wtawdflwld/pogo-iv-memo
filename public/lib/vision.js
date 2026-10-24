// Pixel-based appraisal-bar detection shared by video and still imports.
// Pure ImageData helpers are also exercised by the synthetic-fixture tests.
function pixel(data,w,x,y){const i=(Math.round(y)*w+Math.round(x))*4;return [data[i],data[i+1],data[i+2]];}
function fill([r,g,b]){return (r>160&&g>65&&g<205&&b<175&&r-g>25&&g-b>8)||(r>175&&g>70&&g<185&&b>65&&b<190&&r-g>40&&Math.abs(g-b)<48);}
function track([r,g,b]){return fill([r,g,b]) || (r>175&&r<247&&g>160&&b>150&&r>=g&&g>=b-4&&r-b<65);}
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
 let hit=0,last=-1,coverage=0;
 const flags=[];
 for(let i=0;i<width;i++) {
   let f=0,t=0;for(let dy=-2;dy<=2;dy++){const p=pixel(data,w,x+i,y+dy);if(fill(p))f++;if(track(p))t++;}
   flags.push(f>=3);if(f>=3){hit++;last=i;}if(t>=3)coverage++;
 }
 if(coverage/width<.72)return {value:null,confidence:0};
 const fraction=last<0?0:(last+1)/width;
 const value=Math.round(fraction*15), distance=Math.abs(fraction-value/15);
 // Avoid interpreting disconnected artwork or a partial transition as a bar.
 const solid=last<0?1:hit/(last+1);
 if(distance>.025 || solid<.77)return {value:null,confidence:.25};
 return {value,confidence:Math.min(.98,.8+(1-distance/.025)*.18)};
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
 // Ignore bottom dialogue/leader animation. Keep CP, name, Pokemon and bars.
 for(let yy=0;yy<24;yy++)for(let xx=0;xx<16;xx++){
  const x=Math.min(w-1,Math.floor((.08+xx/16*.75)*w)), y=Math.min(h-1,Math.floor((.07+yy/24*.72)*h));
  const [r,g,b]=pixel(data,w,x,y);out.push(Math.round((r+g+b)/3/8));
 }return out;
}
export function frameDistance(a,b){if(!a||!b)return Infinity;return a.reduce((sum,v,i)=>sum+Math.abs(v-b[i]),0)/a.length;}
export function parseCP(text){const m=text.normalize('NFKC').replace(/[ＯO]/g,'0').match(/c\s*p\s*[:：.・]?\s*(\d{2,5})/i);return m&&+m[1]>=10&&+m[1]<=20000?+m[1]:null;}
const normalize=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
export function matchSpecies(text,pokemon) {
 const lines=text.split(/\n/).map(normalize).filter(Boolean);
 const matches=pokemon.filter(p=>lines.some(l=>l===normalize(p.name)||l===normalize(p.english)));
 const dex=new Set(matches.map(p=>p.dex));
 if(dex.size!==1)return {id:null,candidates:matches.map(p=>p.id),reason:'種類を特定できません（ニックネームを含む）'};
 const forms=pokemon.filter(p=>p.dex===matches[0].dex);
 if(forms.length!==1)return {id:null,candidates:forms.map(p=>p.id),reason:'種類候補あり・フォルムを確認してください'};
 return {id:matches[0].id,candidates:[matches[0].id],reason:''};
}
export class StableScenes {
 constructor(){this.previous=null;this.stableCount=0;this.emitted=false;this.scene=0;this.buffer=null;this.changing=0;}
 push(hash) {
  const distance=frameDistance(hash,this.previous);this.previous=hash;
  if(distance>1.8){this.stableCount=0;this.changing++;if(this.changing>=1){this.emitted=false;this.scene++;}return {stable:false,newScene:false};}
  this.changing=0;this.stableCount++;
  if(this.stableCount>=2&&!this.emitted){this.emitted=true;return {stable:true,newScene:true,scene:this.scene};}
  return {stable:this.stableCount>=2,newScene:false};
 }
}
