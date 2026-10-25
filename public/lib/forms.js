// Read the on-screen type badges, not a nickname or capture location.
// A lone off-center badge can be an occluded pair. A single type requires a
// complete centered circle and visible, empty badge positions on both sides.
function luma(image,x,y){const i=(Math.round(y)*image.width+Math.round(x))*4,d=image.data;return (d[i]+d[i+1]+d[i+2])/3;}
export function detectTypeBadges(image){
 const {width:w,height:h,data}=image;if(!w||!h||data.length!==w*h*4)return {count:null,badges:[]};
 const hits=[],weak=[],step=Math.max(2,Math.round(w/240));
 for(let y=Math.round(h*.516);y<h*.564;y+=step)for(let x=Math.round(w*.35);x<w*.65;x+=step)for(const radius of [w*.026,w*.030,w*.034]){
  let edges=0,contrast=0,inside=0,outside=0,positiveContrast=0,brightOutside=0;
  for(let a=0;a<24;a++){const angle=a*Math.PI/12,c=Math.cos(angle),s=Math.sin(angle),i=luma(image,x+c*radius*.80,y+s*radius*.80),o=luma(image,x+c*radius*1.18,y+s*radius*1.18);inside+=i;outside+=o;contrast+=o-i;positiveContrast+=Math.max(0,o-i);if(o>155)brightOutside++;if(o-i>14)edges++;}
  contrast/=24;inside/=24;outside/=24;
  if(edges>=19&&contrast>=26&&inside<185&&outside>155)hits.push({x:x/w,y:y/h,radius:radius/w,score:edges/24+contrast/150});
  else if(edges>=15&&positiveContrast/24>=18&&inside<215&&brightOutside>=15)weak.push({x:x/w,y:y/h,radius:radius/w,score:edges/24+positiveContrast/24/150,partial:true});
 }
 const badges=[];for(const hit of hits.sort((a,b)=>b.score-a.score))if(!badges.some(b=>Math.hypot((b.x-hit.x)*w,(b.y-hit.y)*h)<w*.04))badges.push(hit);
 for(const a of badges)for(const b of badges){const gap=b.x-a.x;if(gap>.075&&gap<.145&&Math.abs(a.y-b.y)<.009&&Math.abs(a.radius-b.radius)<.009)return {count:2,badges:[a,b]};}
 // A complete centered disc and clear flanks establish the single-type
 // layout. A remaining off-center disc from an occluded pair does not.
 for(const badge of badges.filter(b=>Math.abs(b.x-.505)<.035)){
  const clear=[-.105,-.055,.055,.105].every(offset=>{const cx=badge.x+offset;
   const samples=[],ys=Math.abs(offset)>.08?[-.012,-.009,-.006]:[-.007,0,.007];
   for(const dy of ys)for(const dx of [-.012,0,.012])samples.push(luma(image,(cx+dx)*w,(badge.y+dy)*h));
   return Math.min(...samples)>165&&Math.max(...samples)-Math.min(...samples)<24;
  });
  if(clear&&badges.every(b=>b===badge||Math.abs(b.x-badge.x)<.04))return {count:1,badges:[badge]};
 }
 const partialBadges=[];
 for(const hit of weak.sort((a,b)=>b.score-a.score))if(badges.some(b=>Math.abs(b.x-hit.x)>.075&&Math.abs(b.x-hit.x)<.145&&Math.abs(b.y-hit.y)<.009&&Math.abs(b.radius-hit.radius)<.009)&&![...badges,...partialBadges].some(b=>Math.hypot((b.x-hit.x)*w,(b.y-hit.y)*h)<w*.04))partialBadges.push(hit);
 return {count:null,badges:badges.slice(0,2),partialBadges:partialBadges.slice(0,2)};
}
// Positive evidence from type symbols. Color alone cannot identify a type.
// Work on a normalized grid; never retain source pixels or match templates.
export function detectBadgeTypes(image,observation){
 const {width:w,height:h,data}=image;if(!w||!h||data.length!==w*h*4||!observation?.badges?.length)return [];
 const rgb=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return null;const i=(y*w+x)*4;return [data[i],data[i+1],data[i+2]];};
 const types=[];
 for(const badge of [...observation.badges,...(observation.partialBadges||[])]){
  const cx=badge.x*w,cy=badge.y*h,r=badge.radius*w;
  if(!Number.isFinite(cx+cy+r)||r<5)continue;
  const ring=Array.from({length:36},(_,a)=>rgb(cx+Math.cos(a*Math.PI/18)*r*.77,cy+Math.sin(a*Math.PI/18)*r*.77));if(ring.some(p=>!p))continue;
  const bg=[0,1,2].map(c=>ring.map(p=>p[c]).sort((a,b)=>a-b)[18]);
  const blue=bg[2]-bg[0]>=12&&bg[2]-bg[1]>=15,magenta=bg[0]-bg[1]>=20&&bg[2]-bg[1]>=20&&Math.abs(bg[0]-bg[2])<65,orange=bg[0]-bg[1]>35&&bg[1]-bg[2]>10&&bg[0]-bg[2]>65;
  if(!blue&&!magenta&&!orange)continue;
  const size=21,mask=new Uint8Array(size*size),seen=new Uint8Array(mask.length),parts=[];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const nx=(x-10)*.07,ny=(y-10)*.07;if(Math.hypot(nx,ny)>.7)continue;const p=rgb(cx+nx*r,cy+ny*r);
   if(p&&(magenta?p[0]>=bg[0]-5&&p[1]>bg[1]+18&&p[2]>=bg[2]-10&&p.reduce((s,v)=>s+v,0)>bg.reduce((s,v)=>s+v,0)+35:p[0]>bg[0]+20&&p[1]>bg[1]+12&&p.reduce((s,v)=>s+v,0)>bg.reduce((s,v)=>s+v,0)+45))mask[y*size+x]=1;
  }
  for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
   const part=[i];seen[i]=1;for(let k=0;k<part.length;k++){const p=part[k],x=p%size,y=Math.floor(p/size);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*size+xx;if(xx>=0&&xx<size&&yy>=0&&yy<size&&mask[n]&&!seen[n]){seen[n]=1;part.push(n);}}
   }parts.push(part);
  }
  const part=parts.sort((a,b)=>b.length-a.length)[0];if(!part||part.length<12||part.length>240)continue;
  const xs=part.map(p=>p%size),ys=part.map(p=>Math.floor(p/size)),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),width=right-left+1,height=bottom-top+1;
  if(Math.abs((left+right)/2-10)>3||Math.abs((top+bottom)/2-10)>4)continue;
  const rows=Array.from({length:height},(_,i)=>xs.filter((_,j)=>ys[j]===top+i).length),third=Math.max(2,Math.floor(height/3));
  const upper=rows.slice(0,third).reduce((s,n)=>s+n,0)/third,middle=rows.slice(third,third*2).reduce((s,n)=>s+n,0)/third,lower=rows.slice(-third).reduce((s,n)=>s+n,0)/third;
  if(!badge.partial&&blue&&part.length>=35&&part.length<=200&&height>=9&&height<=19&&width>=5&&width<=15&&height>=width&&top<=7&&bottom>=13&&part.length/(width*height)>=.45&&upper<middle*.75&&upper<lower*.8&&xs.reduce((s,x)=>s+x,0)/part.length>=8&&xs.reduce((s,x)=>s+x,0)/part.length<=12)types.push('water');
  if(!badge.partial&&orange&&height>=7&&width>=height&&width<=18&&part.length/(width*height)>.5&&upper<middle*.85&&lower>upper*1.4&&lower>=Math.max(...rows)*.6)types.push('ground');
  if(magenta){
   const gx=(left+right)/2,gy=(top+bottom)/2,at=(x,y)=>mask[Math.round(gy+y/.07)*size+Math.round(gx+x/.07)]||0;
   const center=at(0,0);
   const rays=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;let far=0;for(let v=.14;v<=.64;v+=.07)if(at(Math.cos(a)*v,Math.sin(a)*v))far=v;return far;});
   const axes=rays.filter((_,i)=>i%2===0).reduce((s,v)=>s+v,0)/4,diagonals=rays.filter((_,i)=>i%2===1).reduce((s,v)=>s+v,0)/4;
   if(!center&&axes>=.35&&diagonals>=.175){
    if(axes>diagonals*1.25&&rays.filter((_,i)=>i%2===0).every(v=>v>=.35))types.push('fairy');
    else if(!badge.partial&&axes/diagonals>=.8&&axes/diagonals<=1.2&&rays.every(v=>v>=.28))types.push('poison');
   }
  }
 }
 return [...new Set(types)];
}
const typeNames={normal:'ノーマル',fire:'ほのお',water:'みず',electric:'でんき',grass:'くさ',ice:'こおり',fighting:'かくとう',poison:'どく',ground:'じめん',flying:'ひこう',psychic:'エスパー',bug:'むし',rock:'いわ',ghost:'ゴースト',dragon:'ドラゴン',dark:'あく',steel:'はがね',fairy:'フェアリー'};
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export function parseTypes(text){const tokens=text.split(/[\s/／・、|]+/).map(normalize);return Object.entries(typeNames).filter(([id,name])=>tokens.includes(id)||tokens.includes(normalize(name))).map(([id])=>id);}
export function resolveForm(match,pokemon,{count=null,types=[]}={}){
 if(match.id||!match.exact||!match.candidates?.length)return match;
 const candidates=pokemon.filter(p=>match.candidates.includes(p.id));
 if(new Set(candidates.map(p=>p.dex)).size!==1||candidates.length<2||candidates.some(p=>!p.types?.length))return match;
 // A count alone must narrow the original complete set to exactly one form.
 const filtered=candidates.filter(p=>(count==null||p.types.length===count)&&types.every(t=>p.types.includes(t)));
 if(filtered.length!==1||(!types.length&&count!==2&&count!==1))return match;
 return {id:filtered[0].id,candidates:[filtered[0].id],exact:true,visual:true,reason:'画像のタイプ表示から姿を判定しました。見た目とフォルムを確認してください',evidence:{typeCount:count,types}};
}
