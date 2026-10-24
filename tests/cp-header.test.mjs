import test from 'node:test';import assert from 'node:assert/strict';
import {detectBars} from '../public/lib/vision.js';import {locateCPDigits,agreeCP} from '../public/lib/ocr.js';
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
test('bare numbers and a header without the small prefix cannot be interpreted as CP',()=>{
 assert.equal(agreeCP([{text:'582',confidence:99},{text:'582',confidence:99}]).cp,null);
 assert.equal(locateCPDigits(header(undefined,false)),null);assert.equal(locateCPDigits(header(undefined,false),150),null);
});
test('localized numeric CP reads still reject disagreement, low confidence and invalid ranges',()=>{
 const r=(text,confidence=90)=>({text,confidence,digits:true});assert.equal(agreeCP([r('582'),r('582')]).cp,582);
 assert.equal(agreeCP([r('582'),r('587')]).cp,null);assert.equal(agreeCP([r('0'),r('0')]).cp,null);
 assert.equal(agreeCP([r('582',10),r('582',10)]).cp,null);
});
