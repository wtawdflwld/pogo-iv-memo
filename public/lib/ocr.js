import {parseCP,matchSpecies} from './vision.js';

export function fieldRects(width,height){return {
 cp:{x:Math.round(width*.18),y:Math.round(height*.035),width:Math.round(width*.64),height:Math.round(height*.2)},
 name:{x:Math.round(width*.08),y:Math.round(height*.30),width:Math.round(width*.84),height:Math.round(height*.28)},
 top:{x:0,y:0,width,height:Math.round(height*.58)}
};}
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
export function agreeCP(readings){
 const valid=readings.map(r=>({value:parseCP(r.text),confidence:r.confidence||0})).filter(r=>r.value!=null&&r.confidence>=40);
 const values=[...new Set(valid.map(r=>r.value))];
 return {cp:values.length===1&&(valid.length>=2||valid[0].confidence>=75)?values[0]:null,conflict:values.length>1};
}
// Each field has its own segmentation and alphabet. Never OCR the model and
// dialogue as one uniform paragraph, or reinterpret HP digits as CP.
export async function recognizeFields(worker,canvas,pokemon){
 const rects=fieldRects(canvas.width,canvas.height),trace=[],cpReadings=[];
 async function read(label,rect,enhance,whitelist=''){
  await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:whitelist,preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const {data}=await worker.recognize(cropText(canvas,rect,enhance));
  const result={text:data.text||'',confidence:data.confidence||0};trace.push(`[${label}]\n${result.text}`);return result;
 }
 const whitelist='CPcp0123456789OIlSB,.';
 cpReadings.push(await read('CP 原画像',rects.cp,false,whitelist));
 cpReadings.push(await read('CP コントラスト補正',rects.cp,true,whitelist));
 const name=await read('名前',rects.name,true);let match=matchSpecies(name.text,pokemon),confidence=name.confidence;
 // Keep the broad sparse-text pass only as a fallback for different layouts.
 if(!match.id||agreeCP(cpReadings).cp==null){
  const fallback=await read('配置違いの補助読取',rects.top,false);
  cpReadings.push(fallback);
  const alternative=matchSpecies(fallback.text,pokemon);
  if(match.id&&alternative.id&&match.id!==alternative.id){match={id:null,candidates:[match.id,alternative.id],reason:'名前の読み取りが一致しません。種類を確認してください'};}
  else if(!match.id&&alternative.id){match=alternative;confidence=fallback.confidence;}
  else if(!match.id)match={...match,candidates:[...new Set([...match.candidates,...alternative.candidates])].slice(0,8)};
 }
 const cp=agreeCP(cpReadings);return {...cp,match,confidence,text:trace.join('\n')};
}
