import {parseCP,matchSpecies} from './vision.js';
import {detectTypeBadges,parseTypes,resolveForm} from './forms.js';

export function fieldRects(width,height){return {
 cp:{x:Math.round(width*.18),y:Math.round(height*.035),width:Math.round(width*.64),height:Math.round(height*.2)},
 name:{x:Math.round(width*.08),y:Math.round(height*.37),width:Math.round(width*.84),height:Math.round(height*.09)},
 top:{x:0,y:0,width,height:Math.round(height*.58)}
};}
// Find the CP header from pixels, without depending on the island's dimensions.
// GO renders the two CP letters smaller than the adjacent decimal digits.
export function locateCPDigits(image,minBrightness=185){
 const {width:w,height:h,data}=image;if(data.length!==w*h*4)return null;
 const left=Math.floor(w*.23),top=Math.floor(h*.035),right=Math.ceil(w*.70),bottom=Math.ceil(h*.16),rw=right-left,rh=bottom-top;
 const mask=new Uint8Array(rw*rh),seen=new Uint8Array(mask.length),parts=[];
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const i=((y+top)*w+x+left)*4,r=data[i],g=data[i+1],b=data[i+2];mask[y*rw+x]=Math.min(r,g,b)>minBrightness&&Math.max(r,g,b)-Math.min(r,g,b)<(minBrightness<185?85:42)?1:0;}
 for(let i=0;i<mask.length;i++){
  if(!mask[i]||seen[i])continue;const queue=[i];seen[i]=1;let minX=rw,minY=rh,maxX=0,maxY=0;
  for(let k=0;k<queue.length;k++){const p=queue[k],x=p%rw,y=Math.floor(p/rw);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,n=ny*rw+nx;if(nx>=0&&nx<rw&&ny>=0&&ny<rh&&mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}
  }
  const width=maxX-minX+1,height=maxY-minY+1;
  if(minX>0&&minY>0&&maxX<rw-1&&maxY<rh-1&&height>=h*.009&&height<=h*.06&&width>=w*.004&&width<=w*.12&&queue.length/(width*height)>.1)parts.push({x:minX+left,y:minY+top,width,height,bottom:maxY+top});
 }
 const groups=[];for(const p of parts.sort((a,b)=>a.x-b.x)){let g=groups.find(g=>Math.abs(g[0].bottom-p.bottom)<h*.009);if(!g){g=[];groups.push(g);}g.push(p);}
 for(const group of groups.sort((a,b)=>b.reduce((s,p)=>s+p.height,0)-a.reduce((s,p)=>s+p.height,0))){
  const maxHeight=Math.max(...group.map(p=>p.height)),digits=group.filter(p=>p.height>=maxHeight*.82),prefix=group.filter(p=>p.x<digits[0].x&&p.height<maxHeight*.82);
  if(digits.length<2||digits.length>5||prefix.length!==2)continue;
  if(digits.some((p,i)=>i>0&&p.x-(digits[i-1].x+digits[i-1].width)>w*.045))continue;
  const x=Math.min(...digits.map(p=>p.x)),y=Math.min(...digits.map(p=>p.y)),r=Math.max(...digits.map(p=>p.x+p.width)),b=Math.max(...digits.map(p=>p.y+p.height));
  if(x<w*.32||r>w*.69||r-x<w*.055)continue;
  return {x:x-3,y:y-3,width:r-x+6,height:b-y+6,threshold:minBrightness};
 }return null;
}
export function cropText(canvas,rect,enhance=false){
 const out=document.createElement('canvas'),scale=Math.max(1,Math.min(3,1200/rect.width)),padding=16;
 out.width=Math.round(rect.width*scale)+padding*2;out.height=Math.round(rect.height*scale)+padding*2;
 const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);
 if(enhance){
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(rect.x,rect.y,rect.width,rect.height).data;let total=0,n=0;
  for(let i=0;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/1024/4)*4)){total+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;n++;}
  ctx.filter=`grayscale(1) ${total/Math.max(1,n)<125?'invert(1) ':''}contrast(1.6)`;
 }
 ctx.drawImage(canvas,rect.x,rect.y,rect.width,rect.height,padding,padding,out.width-padding*2,out.height-padding*2);return out;
}
export function cpDigitImage(canvas,rect,threshold=195){
 const input=canvas.getContext('2d',{willReadFrequently:true}).getImageData(rect.x,rect.y,rect.width,rect.height),mono=document.createElement('canvas');mono.width=rect.width;mono.height=rect.height;
 for(let i=0;i<input.data.length;i+=4){const r=input.data[i],g=input.data[i+1],b=input.data[i+2],v=Math.min(r,g,b)>threshold&&Math.max(r,g,b)-Math.min(r,g,b)<(threshold<185?85:45)?0:255;input.data[i]=input.data[i+1]=input.data[i+2]=v;input.data[i+3]=255;}
 mono.getContext('2d').putImageData(input,0,0);return cropText(mono,{x:0,y:0,width:rect.width,height:rect.height});
}
export function nameTextImage(canvas,rect){
 const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(rect.x,rect.y,rect.width,rect.height);
 if(pixels.data.length!==rect.width*rect.height*4)return null;
 let left=rect.width,top=rect.height,right=-1,bottom=-1;
 for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){
  const i=(y*rect.width+x)*4,d=pixels.data,ink=Math.max(d[i],d[i+1],d[i+2])<185;
  if(ink){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}d[i]=d[i+1]=d[i+2]=ink?0:255;d[i+3]=255;
 }
 if(right-left<10||bottom-top<4)return null;
 const mono=document.createElement('canvas');mono.width=rect.width;mono.height=rect.height;mono.getContext('2d').putImageData(pixels,0,0);
 const width=right-left+1,height=bottom-top+1,scale=Math.min(3,48/height),out=document.createElement('canvas');out.width=Math.round(width*scale)+24;out.height=Math.round(height*scale)+24;
 const ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(mono,left,top,width,height,12,12,out.width-24,out.height-24);return out;
}
export function agreeCP(readings){
 const valid=readings.map(r=>({value:r.digits&&/^\d{2,5}$/.test(r.text.trim())?Number(r.text.trim()):parseCP(r.text),confidence:r.confidence||0})).filter(r=>r.value>=10&&r.value<=20000&&r.confidence>=40);
 const values=[...new Set(valid.map(r=>r.value))];
 return {cp:values.length===1&&(valid.length>=2||valid[0].confidence>=75)?values[0]:null,conflict:values.length>1};
}
// Each field has its own segmentation and alphabet. Never OCR the model and
// dialogue as one uniform paragraph, or reinterpret HP digits as CP.
export async function recognizeFields(worker,canvas,pokemon){
 const rects=fieldRects(canvas.width,canvas.height),trace=[],cpReadings=[];
 async function read(label,rect,enhance,whitelist='',psm='11',threshold=null,prepared=null){
  await worker.setParameters({tessedit_pageseg_mode:psm,tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const {data}=await worker.recognize(prepared||(threshold==null?cropText(canvas,rect,enhance):cpDigitImage(canvas,rect,threshold)));
  const result={text:data.text||'',confidence:data.confidence||0};trace.push(`[${label} / 信頼度 ${Math.round(result.confidence)}]\n${result.text}`);return result;
 }
 const whitelist='CPcp0123456789OIlSB,.';
 cpReadings.push(await read('CP 原画像',rects.cp,false,whitelist));
 cpReadings.push(await read('CP コントラスト補正',rects.cp,true,whitelist));
 if(agreeCP(cpReadings).cp==null){
  const pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height),region=locateCPDigits(pixels)||locateCPDigits(pixels,150);
  if(region){for(const threshold of [region.threshold,region.threshold+20])cpReadings.push({...await read(`CP 数字分離 ${threshold}`,region,false,'0123456789','7',threshold),digits:true});}
 }
 const name=await read('名前',rects.name,true);let match=matchSpecies(name.text,pokemon),confidence=name.confidence;
 if(!match.exact){
  const retry=await read('名前 文字のみ',rects.name,false,'','7',null,nameTextImage(canvas,rects.name)),alternative=matchSpecies(retry.text,pokemon);
  if(alternative.exact){match=alternative;confidence=retry.confidence;}
  else match={...match,candidates:[...new Set([...match.candidates,...alternative.candidates])].slice(0,8)};
 }
 // Keep the broad sparse-text pass only as a fallback for different layouts.
 if(!match.id||agreeCP(cpReadings).cp==null){
  const fallback=await read('配置違いの補助読取',rects.top,false);
  // This pass is also used for ambiguous names/forms. Its unrelated digits
  // must never invalidate an already agreed dedicated CP-field reading.
  if(agreeCP(cpReadings).cp==null)cpReadings.push(fallback);
  const alternative=matchSpecies(fallback.text,pokemon);
  if(match.id&&alternative.id&&match.id!==alternative.id){match={id:null,candidates:[match.id,alternative.id],reason:'名前の読み取りが一致しません。種類を確認してください'};}
  else if(!match.id&&alternative.id){match=alternative;confidence=fallback.confidence;}
  else if(!match.id&&!match.exact&&alternative.exact){match=alternative;confidence=fallback.confidence;}
  else if(!match.id)match={...match,candidates:[...new Set([...match.candidates,...alternative.candidates])].slice(0,8)};
 }
 if(!match.id&&match.exact&&match.candidates.every(id=>pokemon.find(p=>p.id===id)?.types?.length)){
  const badges=detectTypeBadges(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height));
  let evidence={count:badges.count,types:[]},resolved=resolveForm(match,pokemon,evidence);
  if(!resolved.id){
   const rect={x:Math.round(canvas.width*.36),y:Math.round(canvas.height*.555),width:Math.round(canvas.width*.28),height:Math.round(canvas.height*.035)},labels=[];
   for(const enhance of [false,true])labels.push(await read(enhance?'タイプ表示 補正':'タイプ表示',rect,enhance));
   const valid=labels.filter(r=>r.confidence>=45&&parseTypes(r.text).length),common=valid.length>1?parseTypes(valid[0].text).filter(t=>parseTypes(valid[1].text).includes(t)):valid[0]?.confidence>=75?parseTypes(valid[0].text):[];
   evidence={count:badges.count,types:common};resolved=resolveForm(match,pokemon,evidence);
  }
  match=resolved;trace.push(`[姿の画像判定]\nタイプアイコン ${badges.count??'不明'}個 / タイプ ${evidence.types.join(',')||'未読取'} / ${match.visual?match.id:'一意に判定できません'}`);
 }
 const cp=agreeCP(cpReadings);return {...cp,match,confidence,text:trace.join('\n')};
}
