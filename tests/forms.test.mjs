import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {detectTypeBadges,parseTypes,resolveForm} from '../public/lib/forms.js';import {matchSpecies} from '../public/lib/vision.js';
import {recognizeFields} from '../public/lib/ocr.js';
const pokemon=JSON.parse(readFileSync(new URL('../public/data/pokemon.json',import.meta.url),'utf8')).pokemon;
function badges(count=2,scale=1){
 const width=360*scale,height=780*scale,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([242,197,194,255],i);
 for(const x of count===1?[180]:[160,198])for(let yy=400*scale;yy<445*scale;yy++)for(let xx=(x-15)*scale;xx<(x+15)*scale;xx++){
  const d=Math.hypot(xx-x*scale,yy-421*scale);if(d<=11*scale)data.set(d<3*scale?[240,230,230,255]:[120,90,104,255],(yy*width+xx)*4);
 }return {width,height,data};
}
test('synthetic complete type-badge pairs detected at multiple resolutions; a lone badge is not proof of single type',()=>{
 for(const scale of [1,2])assert.equal(detectTypeBadges(badges(2,scale)).count,2);
 assert.equal(detectTypeBadges(badges(1)).count,null);
 const blank=badges(0);blank.data.fill(255);assert.equal(detectTypeBadges(blank).count,null);
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
