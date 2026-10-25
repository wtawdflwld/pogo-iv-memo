import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {decideCP,recognizeFields} from '../public/lib/ocr.js';import {matchSpecies} from '../public/lib/vision.js';import {eligibility} from '../public/lib/ranking.js';
const db=JSON.parse(readFileSync(new URL('../public/data/pokemon.json',import.meta.url),'utf8'));
test('localized CP needs two different preprocessing modes, matching glyph count and sufficient confidence',()=>{
 const raw={text:'CP587',confidence:90},n=(text,local,extra={})=>({text,confidence:90,digits:true,expectedDigits:3,local,...extra});
 assert.equal(decideCP([raw,raw,n('582','mask'),n('582','outline')]).cp,582);
 assert.equal(decideCP([raw,raw,n('582','mask'),n('587','outline')]).cp,null);
 assert.equal(decideCP([raw,raw,n('582','mask'),n('582','mask')]).cp,null);
 assert.equal(decideCP([raw,raw,n('7582','mask'),n('7582','outline')]).cp,587);
 assert.equal(decideCP([raw,raw,n('582','mask',{confidence:1}),n('582','outline',{confidence:1})]).cp,587);
});
test('Ditto is recognized and storable, but its battle exclusion is preserved',async()=>{
 const ditto=db.pokemon.find(p=>p.id==='ditto');assert.ok(ditto);assert.equal(matchSpecies('メタモン',db.pokemon).id,'ditto');assert.equal(ditto.pvpExcluded,true);
 assert.equal(eligibility({cp:10,atk:0,def:0,hp:0},ditto,ditto,1500,db.cpms).state,'unusable');
 const previous=globalThis.self,replies=[];globalThis.self={postMessage:r=>replies.push(r)};
 try{await import('../public/lib/rank-worker.js');self.onmessage({data:{type:'init',db,id:1}});self.onmessage({data:{id:2,record:{speciesId:'ditto',status:'confirmed',atk:0,def:0,hp:0,cp:10}}});assert.deepEqual(replies.at(-1),{id:2,result:[]});}finally{globalThis.self=previous;}
});
test('Zamazenta forms have Japanese names and remain distinct records',()=>{
 assert.equal(db.pokemon.find(p=>p.id==='zamazenta_hero').form,'れきせんのゆうしゃ');assert.equal(db.pokemon.find(p=>p.id==='zamazenta_crowned_shield').form,'たてのおう');
});
test('a unique fuzzy name is re-read with preserved strokes, never assigned just from similarity',async()=>{
 const previous=globalThis.document,pokemon=[{id:'cyndaquil',dex:155,name:'ヒノアラシ',english:'Cyndaquil'}];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})})};
 const canvas={width:360,height:780,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})};
 try{for(const exactAt of [1,3,0]){
  const retries=Array.from({length:exactAt||5},(_,i)=>[exactAt&&i===exactAt-1?'ヒノアラシ':'ヒノアラン',90]);
  const outputs=[['CP582',90],['CP582',90],['ヒノアラン',90],['ヒノアラン',90],...retries];
  const worker={setParameters:async()=>{},recognize:async()=>{const [text,confidence]=outputs.shift();return{data:{text,confidence}}}};
  const result=await recognizeFields(worker,canvas,pokemon);assert.equal(result.match.id,exactAt?'cyndaquil':null);assert.equal(outputs.length,0);
 }}finally{globalThis.document=previous;}
});
