import test from 'node:test';import assert from 'node:assert/strict';
import {detectGenderSymbol,resolveNidoran} from '../public/lib/gender.js';import {matchSpecies} from '../public/lib/vision.js';import {recognizeFields} from '../public/lib/ocr.js';
const pokemon=[{id:'nidoran_female',dex:29,name:'ニドラン♀',english:'Nidoran Female'},{id:'nidoran_male',dex:32,name:'ニドラン♂',english:'Nidoran Male'},{id:'other',dex:155,name:'ヒノアラシ',english:'Cyndaquil'}];
// Synthetic ring/cross/arrow only; no private screen pixels or templates.
function symbol(sex,scale=1){
 const width=360*scale,height=780*scale,data=new Uint8ClampedArray(width*height*4).fill(255),cx=316,cy=sex==='male'?352:344;
 const line=(x0,y0,x1,y1)=>{for(let y=330;y<367;y++)for(let x=299;x<336;x++){
  const dx=x1-x0,dy=y1-y0,t=Math.max(0,Math.min(1,((x-x0)*dx+(y-y0)*dy)/(dx*dx+dy*dy||1)));
  if(Math.hypot(x-x0-t*dx,y-y0-t*dy)<=1)for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)data.set([180,190,195,255],((y*scale+sy)*width+x*scale+sx)*4);
 }};
 for(let a=0;a<Math.PI*2;a+=.03)line(Math.round(cx+6*Math.cos(a)),Math.round(cy+6*Math.sin(a)),Math.round(cx+6*Math.cos(a)),Math.round(cy+6*Math.sin(a)));
 if(sex==='female'){line(cx,cy+6,cx,cy+16);line(cx-4,cy+11,cx+4,cy+11);}
 if(sex==='male'){line(cx+4,cy-4,cx+13,cy-13);line(cx+6,cy-13,cx+13,cy-13);line(cx+13,cy-13,cx+13,cy-6);}
 return {width,height,data};
}
test('species-name normalization preserves female and male symbols as distinct species',()=>{
 assert.equal(matchSpecies('ニドラン ♀',pokemon).id,'nidoran_female');assert.equal(matchSpecies('ニドラン♂',pokemon).id,'nidoran_male');
 assert.equal(matchSpecies('Nidoran Female',pokemon).id,'nidoran_female');assert.equal(matchSpecies('Nidoran Male',pokemon).id,'nidoran_male');
 const family=matchSpecies('ニドラン',[...pokemon,{id:'slowbro',dex:80,name:'ヤドラン',english:'Slowbro'}]);assert.equal(family.id,null);assert.deepEqual(family.candidates,['nidoran_female','nidoran_male']);assert.equal(matchSpecies('ニドラン♀\nニドラン♂',pokemon).id,null);
});
test('synthetic female cross and male arrow are distinguished at two resolutions',()=>{
 for(const scale of [1,2])for(const sex of ['female','male'])assert.equal(detectGenderSymbol(symbol(sex,scale)).gender,sex);
});
test('a plain ring, missing symbol and malformed image do not supply gender evidence',()=>{
 assert.equal(detectGenderSymbol(symbol('ring')).gender,null);const blank=symbol('ring');blank.data.fill(255);assert.equal(detectGenderSymbol(blank).gender,null);
 assert.equal(detectGenderSymbol({width:360,height:780,data:[]}).gender,null);
});
test('an exact bare Nidoran name may be resolved by a visible symbol; fuzzy names cannot',()=>{
 const bare=matchSpecies('ニドラン',pokemon);for(const sex of ['female','male']){const r=resolveNidoran(bare,pokemon,sex,['ニドラン']);assert.equal(r.id,'nidoran_'+sex);assert.equal(r.gender,sex);}
 assert.equal(resolveNidoran(bare,pokemon,null,['ニドラン']).id,null);assert.equal(resolveNidoran(bare,pokemon,'female',['ニドラソ']).id,null);
});
test('conflicting names or unrelated species cannot be overridden by a gender symbol',()=>{
 const named=matchSpecies('ニドラン♀',pokemon);assert.equal(resolveNidoran(named,pokemon,'male',['ニドラン♀']).id,null);
 assert.equal(resolveNidoran(named,pokemon,null,['ニドラン♀']).gender,'female');
 const other=matchSpecies('ヒノアラシ',pokemon);assert.equal(resolveNidoran(other,pokemon,'male',['ニドラン']).id,'other');
 const mixed={id:null,candidates:['nidoran_female','other']};assert.equal(resolveNidoran(mixed,pokemon,'female',['ニドラン']).id,null);
});
test('a damaged final sex glyph needs two exact species stems and independent image evidence',()=>{
 const candidate=matchSpecies('ニドランキ',pokemon);
 assert.equal(resolveNidoran(candidate,pokemon,'female',['ニドランキ','ニドランャ']).id,'nidoran_female');
 assert.equal(resolveNidoran(candidate,pokemon,null,['ニドランキ','ニドランャ']).id,null);
 assert.equal(resolveNidoran(candidate,pokemon,'female',['ニドランキ']).id,null);
 assert.equal(resolveNidoran(candidate,pokemon,'female',['ニドラソキ','ニドラソャ']).id,null);
 assert.equal(resolveNidoran(candidate,pokemon,'female',['ニドラン♂','ニドラン']).id,null);
});
test('field OCR combines a bare name and the generated symbol without turning it into a regional form',async()=>{
 const previous=globalThis.document,image=symbol('female'),outputs=[['CP582',90],['CP582',90],['ニドラン',90],['ニドラン',90],['ニドラン',90]];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 const worker={setParameters:async()=>{},recognize:async()=>{const [text,confidence]=outputs.shift();return {data:{text,confidence}}}};
 try{const r=await recognizeFields(worker,{width:image.width,height:image.height,getContext:()=>({getImageData:()=>image})},pokemon);assert.equal(r.match.id,'nidoran_female');assert.equal(r.match.gender,'female');assert.equal(r.match.evidence,undefined);assert.equal(r.cp,582);assert.equal(outputs.length,0);}finally{globalThis.document=previous;}
});
