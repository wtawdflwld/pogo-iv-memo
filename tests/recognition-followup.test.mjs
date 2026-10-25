import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {matchSpecies} from '../public/lib/vision.js';import {recognizeFields,recognizeCP} from '../public/lib/ocr.js';import {analyzeCanvas,releaseOCR} from '../public/lib/media.js';import {detectTypeBadges,detectBadgeTypes,resolveForm} from '../public/lib/forms.js';
const db=JSON.parse(readFileSync(new URL('../public/data/pokemon.json',import.meta.url),'utf8'));
function fakeDocument(){return {baseURI:'http://localhost/',createElement:()=>({getContext:()=>({fillRect(){},drawImage(){},putImageData(){},getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})})};}
function blankCanvas(){return {width:360,height:780,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})}),toBlob:cb=>cb(new Blob())};}
test('Pikachu costume names collapse to one species while regional and mechanical forms stay distinct',()=>{
 for(const text of ['ピカチュウ','Pikachu (Rock Star)','Pikachu (Libre)']){const r=matchSpecies(text,db.pokemon);assert.equal(r.id,'pikachu');assert.deepEqual(r.candidates,['pikachu']);assert.equal(r.cosmeticMerged,true);}
 assert.equal(matchSpecies('ゴローン',db.pokemon).id,null);assert.equal(matchSpecies('イワンコ',db.pokemon).id,null);
 const altered=db.pokemon.map(p=>p.id==='pikachu_rock_star'?{...p,stats:{...p.stats,atk:p.stats.atk+1}}:p);assert.equal(matchSpecies('ピカチュウ',altered).id,null);
});
test('a kana name with no initial candidates is re-read but requires an exact name',async()=>{
 const previous=globalThis.document;globalThis.document=fakeDocument();const pokemon=[db.pokemon.find(p=>p.id==='tentacool')];
 try{for(const exact of [true,false]){
  const outputs=[['CP582',90],['CP582',90],['メメノククラゲ',90],['メメノククラゲ',90],...(exact?[['メノクラゲ',90]]:Array.from({length:5},()=>['メメノククラゲ',90]))];
  const worker={setParameters:async()=>{},recognize:async()=>{const [text,confidence]=outputs.shift();return {data:{text,confidence}}}};
  assert.equal((await recognizeFields(worker,blankCanvas(),pokemon)).match.id,exact?'tentacool':null);assert.equal(outputs.length,0);
 }}finally{globalThis.document=previous;}
});
test('the common import result marks merged costumes as current-form-only by default',async()=>{
 const previous={document:globalThis.document,Tesseract:globalThis.Tesseract};globalThis.document=fakeDocument();const outputs=[['CP582',90],['CP582',90],['ピカチュウ',90]];
 globalThis.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate(){},recognize:async()=>{const [text,confidence]=outputs.shift();return {data:{text,confidence}}}})};
 try{const record=await analyzeCanvas(blankCanvas(),db.pokemon,{kind:'image'},()=>{},null,{ivs:[3,6,9],confidence:1,geometry:null});assert.equal(record.speciesId,'pikachu');assert.equal(record.noEvolve,true);assert.equal(record.status,'review');assert.equal(record.cp,582);assert.ok(record.notes.some(n=>n.includes('衣装違い')));assert.equal(outputs.length,0);}finally{await releaseOCR();Object.assign(globalThis,previous);}
});
function syntheticHeader(){const width=360,height=780,data=new Uint8ClampedArray(width*height*4);const rect=(x,y,w,h)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set([255,255,255,255],(yy*width+xx)*4);};rect(130,56,9,14);rect(143,56,9,14);for(const x of [156,174,192])rect(x,46,12,24);return{width,height,data};}
test('a binary crop and both strong raw-line settings can recover CP when the normalized outline fails',async()=>{
 const previous=globalThis.document;globalThis.document=fakeDocument();const image=syntheticHeader();
 try{for(const confidence of [90,74]){
  const outputs=[['CP587',90],['CP587',90],['582',90],['582',90],['582',90],['582',confidence],['582',90],['0',93]];
  const worker={setParameters:async()=>{},recognize:async()=>{const [text,confidence]=outputs.shift();return {data:{text,confidence}}}};
  const r=await recognizeCP(worker,{width:image.width,height:image.height,getContext:()=>({getImageData:()=>({...image,data:image.data.slice()})})});assert.equal(r.cp,confidence===90?582:null);assert.equal(outputs.length,0);if(confidence===90)assert.equal(r.method,'localized-line');
 }}finally{globalThis.document=previous;}
});
function icons(types,scale=1,partial=false,symbols=true){
 const width=360*scale,height=780*scale,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([245,205,200,255],i);
 const colors={poison:[160,65,150],fairy:[210,105,165],ground:[205,90,45]};
 for(let k=0;k<types.length;k++){const type=types[k],cx=(types.length===1?180:160+k*38)*scale,cy=421*scale,r=11*scale;
  for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++){const dx=(x-cx)/r,dy=(y-cy)/r,d=Math.hypot(dx,dy);if(d>1)continue;const glyph=type==='poison'?d>.22&&d<.5:type==='fairy'?Math.abs(dx)+Math.abs(dy)<.65&&Math.abs(dx)+Math.abs(dy)>.2:dy>=-.5&&dy<=.4&&Math.abs(dx)<.1+(dy+.5)*.65;data.set(symbols&&glyph?[245,230,225,255]:[...(partial&&k===1?[225,160,190]:colors[type]),255],(y*width+x)*4);}
  if(partial&&k===1)for(let y=Math.round(cy+r*.3);y<cy+r*2;y++)for(let x=Math.round(cx+r*.3);x<cx+r*2;x++)data.set([50,30,30,255],(y*width+x)*4);
 }return{width,height,data};
}
test('generated poison, ground and fairy glyphs require a colored disc and distinct geometry',()=>{
 for(const scale of [1,3])for(const type of ['poison','ground','fairy']){const image=icons([type],scale);assert.ok(detectBadgeTypes(image,detectTypeBadges(image)).includes(type),type+' '+scale);}
 for(const type of ['poison','ground','fairy']){const image=icons([type],2,false,false);assert.deepEqual(detectBadgeTypes(image,detectTypeBadges(image)),[],type);}
});
test('a partial neighboring fairy badge can supply symbol evidence without claiming two complete badges',()=>{
 const image=icons(['poison','fairy'],3,true),observation=detectTypeBadges(image),types=detectBadgeTypes(image,observation);assert.equal(observation.count,null);assert.ok(observation.partialBadges.length);assert.ok(types.includes('fairy'));assert.equal(resolveForm(matchSpecies('マタドガス',db.pokemon),db.pokemon,{count:observation.count,types}).id,'weezing_galarian');
 const ordinary=icons(['poison'],3);assert.equal(resolveForm(matchSpecies('マタドガス',db.pokemon),db.pokemon,{count:1,types:detectBadgeTypes(ordinary,detectTypeBadges(ordinary))}).id,'weezing');
});
