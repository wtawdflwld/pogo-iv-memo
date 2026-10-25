import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {detectTypeBadges,detectBadgeTypes,parseTypes,resolveForm} from '../public/lib/forms.js';import {matchSpecies} from '../public/lib/vision.js';
import {recognizeFields} from '../public/lib/ocr.js';
const pokemon=JSON.parse(readFileSync(new URL('../public/data/pokemon.json',import.meta.url),'utf8')).pokemon;
function badges(count=2,scale=1,offset=0){
 const width=360*scale,height=780*scale,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([242,197,194,255],i);
 for(const x of count===1?[180+offset]:[160,198])for(let yy=400*scale;yy<445*scale;yy++)for(let xx=(x-15)*scale;xx<(x+15)*scale;xx++){
  const d=Math.hypot(xx-x*scale,yy-421*scale);if(d<=11*scale)data.set(d<3*scale?[240,230,230,255]:[120,90,104,255],(yy*width+xx)*4);
 }return {width,height,data};
}
function waterBadge(scale=1,shape='drop',blue=true){
 const image=badges(2,scale),{width:w,height:h,data}=image,cx=160*scale,cy=421*scale,r=11*scale;
 for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){
  const dx=(x-cx)/r,dy=(y-cy)/r;if(Math.hypot(dx,dy)>1)continue;
  const drop=dy>=-.55&&dy<=.48&&Math.abs(dx)<(dy<.12?(dy+.55)*.56:.375*Math.sqrt(Math.max(0,1-((dy-.12)/.36)**2)));
  const ink=shape==='drop'?drop:shape==='circle'?Math.hypot(dx,dy)<.45:shape==='rectangle'?Math.abs(dx)<.3&&Math.abs(dy)<.5:shape==='inverted'?dy>-.5&&dy<.5&&Math.abs(dx)<(.5-dy)*.65:false;
  data.set(ink?[235,225,230,255]:blue?[65,100,185,255]:[175,80,150,255],(y*w+x)*4);
 }return image;
}
test('a complete blue disc with a centered water drop identifies water at two resolutions',()=>{
 for(const scale of [1,3]){const image=waterBadge(scale),observation=detectTypeBadges(image);assert.equal(observation.count,2);assert.deepEqual(detectBadgeTypes(image,observation),['water']);assert.equal(resolveForm(matchSpecies('ヤドラン',pokemon),pokemon,{count:2,types:['water']}).id,'slowbro');}
});
test('color alone, circles, bars, inverted shapes and missing geometry are not water evidence',()=>{
 for(const shape of ['none','circle','rectangle','inverted']){const image=waterBadge(2,shape);assert.deepEqual(detectBadgeTypes(image,detectTypeBadges(image)),[],shape);}
 const purple=waterBadge(2,'drop',false);assert.deepEqual(detectBadgeTypes(purple,detectTypeBadges(purple)),[]);
 const image=waterBadge();assert.deepEqual(detectBadgeTypes(image,{count:null,badges:[]}),[]);assert.deepEqual(detectBadgeTypes({...image,data:[]},detectTypeBadges(image)),[]);
 const match=matchSpecies('ヤドラン',pokemon);assert.equal(resolveForm(match,pokemon,{count:2,types:['water','poison']}).id,null);assert.equal(resolveForm({...match,exact:false},pokemon,{count:2,types:['water']}).id,null);
});
test('the real field reader combines water-drop evidence and refuses a contradictory type label',async()=>{
 const previous=globalThis.document,image=waterBadge(3);
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 try{for(const label of ['', 'どく']){
  const outputs=[['CP582',90],['CP582',90],['ヤドラン',90],[label,90],[label,90]],worker={async setParameters(){},async recognize(){const [text,confidence]=outputs.shift();return {data:{text,confidence}};}};
  const r=await recognizeFields(worker,{width:image.width,height:image.height,getContext:()=>({getImageData:()=>image})},pokemon);assert.equal(r.match.id,label?null:'slowbro');if(!label)assert.deepEqual(r.match.evidence.types,['water']);assert.equal(r.cp,582);assert.match(r.text,/水滴形/);assert.equal(outputs.length,0);
 }}finally{globalThis.document=previous;}
});
test('complete pairs and centered single badges with clear flanks are detected; off-center remnants stay unknown',()=>{
 for(const scale of [1,2])assert.equal(detectTypeBadges(badges(2,scale)).count,2);
 for(const scale of [1,2])assert.equal(detectTypeBadges(badges(1,scale)).count,1);
 assert.equal(detectTypeBadges(badges(1,1,-20)).count,null);assert.equal(detectTypeBadges(badges(1,1,18)).count,null);
 const blank=badges(0);blank.data.fill(255);assert.equal(detectTypeBadges(blank).count,null);
});
test('an obscured flank cannot establish a single-type layout',()=>{
 const im=badges(1);for(let y=417;y<=425;y++)for(let x=196;x<=204;x++)im.data.set([100,100,100,255],(y*im.width+x)*4);
 assert.equal(detectTypeBadges(im).count,null);
 const far=badges(1);for(let y=411;y<=419;y++)for(let x=214;x<=222;x++)far.data.set([100,100,100,255],(y*far.width+x)*4);assert.equal(detectTypeBadges(far).count,null);
});
test('verified single-type layouts resolve normal Yamask and Hero Zamazenta',()=>{
 assert.equal(resolveForm(matchSpecies('デスマス',pokemon),pokemon,{count:1}).id,'yamask');
 assert.equal(resolveForm(matchSpecies('ザマゼンタ',pokemon),pokemon,{count:1}).id,'zamazenta_hero');
});
test('public type metadata resolves unique normal/regional differences after an exact species name',()=>{
 for(const [name,id] of [['コラッタ','rattata_alolan'],['ジグザグマ','zigzagoon_galarian']]){
  const match=matchSpecies(name,pokemon);assert.equal(match.id,null);const resolved=resolveForm(match,pokemon,{count:2});assert.equal(resolved.id,id);assert.equal(resolved.visual,true);
 }
 const match=matchSpecies('ニャース',pokemon);assert.equal(resolveForm(match,pokemon,{types:['dark']}).id,'meowth_alolan');assert.equal(resolveForm(match,pokemon,{types:['steel']}).id,'meowth_galarian');
});
test('same types, missing badges, conflicting evidence, fuzzy names and incomplete metadata stay unresolved',()=>{
 const match=matchSpecies('コラッタ',pokemon);assert.equal(resolveForm(match,pokemon).id,null);assert.equal(resolveForm(match,pokemon,{count:2,types:['water']}).id,null);
 assert.equal(resolveForm({...match,exact:false},pokemon,{count:2}).id,null);
 assert.equal(resolveForm(match,pokemon.map(p=>({...p,types:undefined})),{count:2}).id,null);
 const rockruff=matchSpecies('イワンコ',pokemon);assert.equal(resolveForm(rockruff,pokemon,{types:['rock']}).id,null);
 assert.equal(resolveForm({...match,candidates:['rattata','zigzagoon_galarian']},pokemon,{count:2}).id,null);
});
test('type label parsing accepts explicit Japanese or English tokens but not unrelated substrings',()=>{
 assert.deepEqual(parseTypes('あく / ノーマル'),['normal','dark']);assert.deepEqual(parseTypes('はがね'),['steel']);
 assert.deepEqual(parseTypes('エスパー／フェアリー'),['psychic','fairy']);assert.deepEqual(parseTypes('Dark / NORMAL'),['normal','dark']);assert.deepEqual(parseTypes('あくび'),[]);
});
test('every bundled species/form has a valid nonempty public type list',()=>{
 const allowed=new Set(['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy']);
 for(const p of pokemon)assert.ok(p.types?.length>=1&&p.types.length<=2&&p.types.every(t=>allowed.has(t)),p.id);
});
test('OCR and image evidence resolve a form together without the broad fallback overriding dedicated CP',async()=>{
 const previous=globalThis.document,image=badges(),outputs=[['CP582',90],['CP582',90],['コラッタ',90]];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 const worker={async setParameters(){},async recognize(){const [text,confidence]=outputs.shift();return {data:{text,confidence}};}};
 try{const r=await recognizeFields(worker,{width:image.width,height:image.height,getContext:()=>({getImageData:()=>image})},pokemon);assert.equal(r.cp,582);assert.equal(r.match.id,'rattata_alolan');assert.equal(r.match.evidence.typeCount,2);assert.equal(outputs.length,0);}finally{globalThis.document=previous;}
});
