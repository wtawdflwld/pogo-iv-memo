import test from 'node:test';import assert from 'node:assert/strict';
import {detectBars} from '../public/lib/vision.js';import {locateCPDigits,agreeCP,recognizeCP} from '../public/lib/ocr.js';
// Generated shapes and colors only. No pixels from private screenshots.
function header(color=[255,255,255,255],prefix=true){
 const width=360,height=780,data=new Uint8ClampedArray(width*height*4);for(let i=3;i<data.length;i+=4)data[i]=255;
 const rect=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set(color,(yy*width+xx)*4);};
 if(prefix){rect(130,56,9,14);rect(143,56,9,14);}for(const x of [156,174,192])rect(x,46,12,24);
 return {width,height,data};
}
test('synthetic blue-gray tracks remain readable when their blue channel exceeds red',()=>{
 const width=360,height=780,data=new Uint8ClampedArray(width*height*4).fill(255),ivs=[6,10,1];
 for(let j=0;j<3;j++)for(let y=480+j*37;y<488+j*37;y++)for(let x=35;x<215;x++)data.set(x<35+ivs[j]*12?[244,151,94,255]:[224,227,234,255],(y*width+x)*4);
 assert.deepEqual(detectBars({width,height,data}).ivs,ivs);
});
test('CP header localization separates small prefix shapes from taller digits, including tinted antialiasing',()=>{
 for(const color of [[255,255,255,255],[170,205,220,255]]){const f=header(color),r=locateCPDigits(f)||locateCPDigits(f,150);assert.ok(r);assert.ok(r.x>152&&r.x<156);assert.ok(r.y<46&&r.y>40);assert.ok(r.width>=50&&r.width<=58);}
});
test('a retained top-only header uses the original frame height to locate CP digits',()=>{
 const full=header(),height=Math.ceil(full.height*.24),cropped={width:full.width,height,data:full.data.slice(0,full.width*height*4)};
 assert.deepEqual(locateCPDigits(cropped,185,full.height),locateCPDigits(full));
 assert.equal(locateCPDigits(cropped),null);
});
test('bare numbers and a header without the small prefix cannot be interpreted as CP',()=>{
 assert.equal(agreeCP([{text:'582',confidence:99},{text:'582',confidence:99}]).cp,null);
 assert.equal(locateCPDigits(header(undefined,false)),null);assert.equal(locateCPDigits(header(undefined,false),150),null);
});
test('localized numeric CP reads still reject disagreement, low confidence and invalid ranges',()=>{
 const r=(text,confidence=90)=>({text,confidence,digits:true});assert.equal(agreeCP([r('582'),r('582')]).cp,582);
 assert.equal(agreeCP([r('582'),r('587')]).cp,null);assert.equal(agreeCP([r('0'),r('0')]).cp,null);
 assert.equal(agreeCP([r('582',10),r('582',10)]).cp,null);
});
async function retryCase(outputs,image=header()){
 const previous=globalThis.document,parameters=[],draws=[];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(...args){draws.push(args)},putImageData(){}})})};
 const worker={setParameters:async p=>{parameters.push(p)},recognize:async()=>{const [text,confidence]=outputs.shift();return {data:{text,confidence}}}};
 try{return {result:await recognizeCP(worker,{width:image.width,height:image.height,getContext:()=>({getImageData:()=>({...image,data:image.data.slice()})})}),parameters,draws};}finally{globalThis.document=previous;}
}
test('a prefix-verified raw digit line can recover when both masked reads are empty',async()=>{
 const {result,parameters,draws}=await retryCase([['',0],['',0],['',0],['',0],['582',90],['582',90]]);
 assert.equal(result.cp,582);assert.equal(result.conflict,false);assert.equal(parameters.length,6);
 assert.deepEqual(parameters.slice(-2).map(p=>p.tessedit_pageseg_mode),['7','13']);assert.ok(parameters.slice(-2).every(p=>p.tessedit_char_whitelist==='0123456789'));
 const region=locateCPDigits(header());assert.ok(draws.slice(-2).every(args=>args[1]===region.x+3&&args[3]===region.width-6));
});
test('additional digit segmentation cannot conceal conflicting dedicated CP readings',async()=>{
 const {result}=await retryCase([['CP582',90],['CP587',90],['582',90],['582',90],['582',90],['582',90],['582',90],['582',90]]);
 assert.equal(result.cp,null);assert.equal(result.conflict,true);
});
test('a bright background is separated with a stricter white mask without accepting low-confidence broad text',async()=>{
 const image=header();for(let i=0;i<image.data.length;i+=4)if(!image.data[i])image.data.set([210,215,225,255],i);
 assert.equal(locateCPDigits(image,185),null);assert.equal(locateCPDigits(image,220).digitCount,3);
 const {result}=await retryCase([['CP582',4],['CP582',4],['582',90],['582',90]],image);
 assert.equal(result.cp,582);assert.match(result.text,/CP 数字分離 220/);
});
test('numeric OCR length must match the independently located digit count; same-length conflicts still stay unknown',()=>{
 const r=(text,confidence=90)=>({text,confidence,digits:true,expectedDigits:3});
 assert.equal(agreeCP([r('582'),r('7582')]).cp,582);
 assert.equal(agreeCP([r('582'),r('58')]).cp,582);
 assert.equal(agreeCP([r('582'),r('587')]).cp,null);
 assert.equal(agreeCP([r('7582'),r('7582')]).cp,null);
 assert.equal(agreeCP([r('582',4),r('7582')]).cp,null);
});
test('digit-count validation is carried through the actual CP reader and explains a discarded extra digit',async()=>{
 const {result}=await retryCase([['',0],['',0],['582',89],['7582',90]]);
 assert.equal(result.cp,582);assert.equal(result.conflict,false);assert.match(result.text,/3桁の画像に4桁の読取/);assert.match(result.text,/採用 582/);
});
test('one medium-confidence alternative cannot veto repeated strong agreement, but supported conflicts remain unknown',()=>{
 const r=(text,confidence)=>({text,confidence,digits:true,expectedDigits:3});
 assert.equal(agreeCP([r('758',63),r('582',90),r('582',92)]).cp,582);
 assert.equal(agreeCP([r('758',76),r('582',90),r('582',92)]).cp,null);
 assert.equal(agreeCP([r('758',63),r('758',62),r('582',90),r('582',92)]).cp,null);
 assert.equal(agreeCP([r('758',63)]).cp,null);
});
test('low-confidence large glyphs can be retried at a bounded height without lowering the acceptance threshold',async()=>{
 const {result,draws}=await retryCase([['CP582',0],['CP582',0],['582',0],['582',0],['582',0],['582',0],['582',90],['582',90]]);
 assert.equal(result.cp,582);assert.match(result.text,/CP 数字サイズ統一/);
 assert.ok(draws.slice(-2).every(args=>args[8]===48),'Both normalized OCR images use a 48px content height');
});
test('agreement of broad CP reads never skips visible digit-count and numeric-crop verification',async()=>{
 const {result,parameters}=await retryCase([['CP7582',46],['CP7582',46],['582',90],['582',90]]);
 assert.equal(result.cp,582);assert.equal(parameters.length,4);assert.match(result.text,/3桁の画像に4桁のCP読取/);
});
test('same-length strong disagreement between broad CP and digit-only reads remains unknown',async()=>{
 const {result}=await retryCase([['CP587',90],['CP587',90],['582',90],['582',90],['582',90],['582',90],['582',90],['582',90]]);
 assert.equal(result.cp,null);assert.equal(result.conflict,true);
});
test('two matching medium-confidence broad reads cannot establish CP without a located header',async()=>{
 const image=header();image.data.fill(255);
 assert.equal((await retryCase([['CP7582',46],['CP7582',46]],image)).result.cp,null);
 assert.equal((await retryCase([['CP582',90],['CP582',90]],image)).result.cp,582);
});
