import {matchSpecies} from './vision.js';
const plain={バ:'ハ',パ:'ハ',ビ:'ヒ',ピ:'ヒ',ブ:'フ',プ:'フ',ベ:'ヘ',ペ:'ヘ',ボ:'ホ',ポ:'ホ'};
const fold=text=>text.normalize('NFKC').replace(/[バパビピブプベペボポ]/g,c=>plain[c]).replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase();
function components(mask,w,h){
 const seen=new Uint8Array(mask.length),out=[];
 for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
  const points=[i];seen[i]=1;let left=w,right=0,top=h,bottom=0;
  for(let k=0;k<points.length;k++){const p=points[k],x=p%w,y=Math.floor(p/w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,n=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[n]&&!seen[n]){seen[n]=1;points.push(n);}}
  }out.push({left,right,top,bottom,width:right-left+1,height:bottom-top+1,points});
 }return out;
}
// A handakuten is a small closed ring above the kana's main strokes.
// Read its topology and position rather than rewriting similar names.
export function nameRings(image){
 const {width:w,height:h,data}=image;if(!w||!h||data.length!==w*h*4)return null;
 const x0=Math.round(w*.08),y0=Math.round(h*.37),rw=Math.round(w*.84),rh=Math.round(h*.09),maskAt=threshold=>{
  const mask=new Uint8Array(rw*rh);for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const i=((y+y0)*w+x+x0)*4;mask[y*rw+x]=Math.max(data[i],data[i+1],data[i+2])<threshold?1:0;}return mask;
 };
 const bodyParts=components(maskAt(185),rw,rh).filter(p=>p.height>=h*.009&&p.height<=h*.045&&p.width>=w*.008&&p.width<=w*.13);
 if(!bodyParts.length)return null;
 const left=Math.min(...bodyParts.map(p=>p.left)),right=Math.max(...bodyParts.map(p=>p.right)),top=Math.min(...bodyParts.map(p=>p.top)),bottom=Math.max(...bodyParts.map(p=>p.bottom)),height=bottom-top+1,rings=[];
 for(const threshold of [150,175,195,215])for(const p of components(maskAt(threshold),rw,rh)){
  if(p.width<3||p.height<3||p.height>height*1.4||p.width>height*1.5||p.points.length>=p.width*p.height*.95)continue;
  const small=new Uint8Array((p.width+2)*(p.height+2)),sw=p.width+2,sh=p.height+2;for(const point of p.points){const x=point%rw-p.left+1,y=Math.floor(point/rw)-p.top+1;small[y*sw+x]=1;}
  const seen=new Uint8Array(small.length),queue=[0];seen[0]=1;
  for(let k=0;k<queue.length;k++){const i=queue[k],x=i%sw,y=Math.floor(i/sw);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,n=yy*sw+xx;if(xx>=0&&xx<sw&&yy>=0&&yy<sh&&!small[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
  const holes=new Uint8Array(small.length);for(let i=0;i<small.length;i++)holes[i]=!small[i]&&!seen[i]?1:0;
  for(const hole of components(holes,sw,sh)){
   if(hole.width/hole.height<.5||hole.width/hole.height>2||hole.width+2>height*.6||hole.height+2>height*.6)continue;
   const cx=p.left+(hole.left+hole.right)/2-1,cy=p.top+(hole.top+hole.bottom)/2-1;
   if(cx<left||cx>right+height*.3||cy<top-height*.4||cy>top+height*.4)continue;
   if(!rings.some(r=>Math.hypot(r.x-cx,r.y-cy)<height*.3))rings.push({x:cx,y:cy});
  }
 }
 return {left,right,top,bottom,rings};
}
export function resolveSemiVoicedName(match,pokemon,readings,image){
 if(match.id||match.exact)return match;
 const texts=readings.filter(r=>r.confidence>=75).flatMap(r=>r.text.split(/\n/).map(fold)),candidates=pokemon.filter(p=>/[パピプペポ]/.test(p.name)&&texts.filter(t=>t===fold(p.name)).length>=2);
 if(new Set(candidates.map(p=>p.dex)).size!==1)return match;
 const name=candidates[0].name,proof=nameRings(image);if(!proof)return match;
 const expected=[...name].flatMap((c,i)=>/[パピプペポ]/.test(c)?[i]:[]),advance=(proof.right-proof.left+1)/[...name].length;
 if(proof.rings.length!==expected.length||!expected.every(i=>proof.rings.filter(r=>r.x>=proof.left+(i+.5)*advance&&r.x<=proof.left+(i+1.25)*advance).length===1))return match;
 const resolved=matchSpecies(name,pokemon);return {...resolved,nameEvidence:{kind:'handakuten',count:expected.length},reason:[resolved.reason,'名前本体の複数回一致と画像内の半濁点（゜）を確認しました。名前を確認してください'].filter(Boolean).join('。')};
}
