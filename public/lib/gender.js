// Inspect the standard gender symbol beside the HP line. No species artwork
// or private image templates are stored: only a closed ring and its stem.
export function detectGenderSymbol(image){
 const {width:w,height:h,data}=image;if(data.length!==w*h*4)return {gender:null};
 const left=Math.floor(w*.84),top=Math.floor(h*.425),rw=Math.ceil(w*.10),rh=Math.ceil(h*.055),mask=new Uint8Array(rw*rh),seen=new Uint8Array(mask.length),candidates=[];
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const i=((top+y)*w+left+x)*4,r=data[i],g=data[i+1],b=data[i+2];mask[y*rw+x]=Math.min(r,g,b)>85&&Math.max(r,g,b)<235&&Math.max(r,g,b)-Math.min(r,g,b)<55?1:0;
 }
 for(let start=0;start<mask.length;start++){
  if(!mask[start]||seen[start])continue;const points=[start];seen[start]=1;let x0=rw,y0=rh,x1=0,y1=0;
  for(let k=0;k<points.length;k++){
   const p=points[k],x=p%rw,y=Math.floor(p/rw);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*rw+nx;if(nx>=0&&nx<rw&&ny>=0&&ny<rh&&mask[n]&&!seen[n]){seen[n]=1;points.push(n);}}
  }
  const bw=x1-x0+1,bh=y1-y0+1;
  if(x0===0||y0===0||x1===rw-1||y1===rh-1||bw<w*.018||bw>w*.075||bh<h*.012||bh>h*.045||points.length<8)continue;
  const ink=new Uint8Array(bw*bh),visited=new Uint8Array(ink.length),holes=[];for(const p of points)ink[(Math.floor(p/rw)-y0)*bw+p%rw-x0]=1;
  for(let s=0;s<ink.length;s++){
   if(ink[s]||visited[s])continue;const queue=[s];visited[s]=1;let edge=false,sx=0,sy=0;
   for(let k=0;k<queue.length;k++){
    const p=queue[k],x=p%bw,y=Math.floor(p/bw);sx+=x;sy+=y;if(x===0||y===0||x===bw-1||y===bh-1)edge=true;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy,n=ny*bw+nx;if(nx>=0&&nx<bw&&ny>=0&&ny<bh&&!ink[n]&&!visited[n]){visited[n]=1;queue.push(n);}}
   }
   if(!edge&&queue.length>=Math.max(2,w*w*.000006))holes.push({area:queue.length,x:sx/queue.length/bw,y:sy/queue.length/bh});
  }
  const ring=holes.sort((a,b)=>b.area-a.area)[0];if(!ring)continue;
  let cross=0;for(let y=Math.ceil(bh*.60);y<bh*.90;y++){let count=0;for(let x=0;x<bw;x++)count+=ink[y*bw+x];cross=Math.max(cross,count);}
  const gender=bh>bw*1.1&&cross>=bw*.4&&ring.x>=.30&&ring.x<=.70&&ring.y>=.18&&ring.y<=.43?'female':ring.x>=.15&&ring.x<=.46&&ring.y>=.55&&ring.y<=.83?'male':null;
  if(gender)candidates.push(gender);
 }
 return {gender:candidates.length===1?candidates[0]:null};
}
const ids={female:'nidoran_female',male:'nidoran_male'},sexFor=id=>id===ids.female?'female':id===ids.male?'male':null;
export function resolveNidoran(match,pokemon,symbol,texts=[]){
 const lines=texts.map(text=>text.normalize('NFKC').split(/\n/).map(line=>line.replace(/[\s\p{P}]/gu,'').toLowerCase()));
 const named=sexFor(match.id),bare=lines.some(lines=>lines.some(line=>['ニドラン','nidoran'].includes(line)));
 // OCR can render the final sex glyph as a kana. The four-character species
 // stem must be exact in two separate reads, and the separate image symbol
 // must be readable. Never repair a misspelling inside the species stem.
 const damagedSuffix=!!symbol&&lines.filter(lines=>lines.some(line=>/^ニドラン[^♀♂]$/u.test(line))).length>=2;
 if(match.id&&!named)return match;
 if(!named&&match.candidates?.some(id=>!Object.values(ids).includes(id)))return match;
 if(!named&&!bare&&!damagedSuffix)return match;
 if(!pokemon.some(p=>p.id===ids.female)||!pokemon.some(p=>p.id===ids.male))return match;
 const explicit=new Set(lines.flat().filter(line=>/^ニドラン[♀♂]$/u.test(line)).map(line=>line.endsWith('♀')?'female':'male'));
 if(explicit.size>1||(symbol&&[...explicit].some(sex=>sex!==symbol))||(named&&symbol&&named!==symbol))return {id:null,candidates:Object.values(ids),reason:'ニドランの名前と性別記号が一致しません。種類を確認してください'};
 const gender=named||symbol;if(!gender||!ids[gender])return match;
 return {...match,id:ids[gender],candidates:[ids[gender]],exact:true,gender,genderEvidence:symbol?'symbol':'name',reason:symbol?'画面の性別記号と名前からニドランの種類を判定しました。画像と照合してください':match.reason};
}
