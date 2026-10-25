import test from 'node:test';import assert from 'node:assert/strict';
import {readBar,detectBars,parseCP,matchSpecies,StableScenes} from '../public/lib/vision.js';
function fixture(ivs){const width=360,height=780,data=new Uint8ClampedArray(width*height*4).fill(255);for(let j=0;j<3;j++)for(let y=480+j*37;y<488+j*37;y++)for(let x=35;x<215;x++){const color=x<35+ivs[j]*12?[244,151,94,255]:[226,216,210,255];data.set(color,(y*width+x)*4);}return {width,height,data};}
test('bars read reference IV 3/3/5 on synthetic track (not a real screenshot)',()=>{assert.deepEqual(detectBars(fixture([3,3,5])).ivs,[3,3,5]);});
test('empty/full bars and missing image pixels remain distinct',()=>{assert.deepEqual(detectBars(fixture([0,15,0])).ivs,[0,15,0]);assert.equal(readBar({width:360,height:780,data:new Uint8ClampedArray(360*780*4).fill(255)},35,484,180).value,null);});
test('CP and species parsing do not infer a nickname or form',()=>{assert.equal(parseCP('CP599\n83/83 HP'),599);assert.equal(parseCP('83/83 HP'),null);const pokemon=[{id:'a',dex:155,name:'ヒノアラシ',english:'Cyndaquil'},{id:'b',dex:26,name:'ライチュウ',english:'Raichu'},{id:'c',dex:26,name:'ライチュウ',english:'Raichu (Alolan)'}];assert.equal(matchSpecies('ヒノアラシ\nCP599',pokemon).id,'a');assert.equal(matchSpecies('相棒ちゃん\nCP599',pokemon).id,null);assert.equal(matchSpecies('ライチュウ\nCP599',pokemon).id,null);});
test('same screen emits once; changes permit a visually separate identical-value individual',()=>{const s=new StableScenes(),a=new Array(384).fill(10),b=new Array(384).fill(22);const emitted=[a,a,a,a,a,b,b,b,a,a,a].map(h=>s.push(h)).filter(x=>x.newScene);assert.equal(emitted.length,3);});
test('a changed text signature starts a new page even when the broad background hash is identical',()=>{
 const s=new StableScenes(),hash=new Array(384).fill(10),a=new Array(2048).fill(0),b=a.map((v,i)=>i<100?1:v);
 const emitted=[a,a,a,a,b,b,b,b].map(page=>s.push(hash,page)).filter(x=>x.newScene);assert.equal(emitted.length,2);
});

// Generated upper-card rules must not outrank the real lower appraisal bars.
test('upper name and background rules cannot become appraisal IVs',()=>{
 const image=fixture([6,9,2]),{width,height,data}=image;
 for(let j=0;j<3;j++)for(let y=365+j*40;y<373+j*40;y++)for(let x=35;x<215;x++)data.set(j===0?[226,216,210,255]:[246,116,140,255],(y*width+x)*4);
 assert.deepEqual(detectBars(image).ivs,[6,9,2]);
 const onlyRules={width,height,data:data.slice()};for(let y=470;y<570;y++)for(let x=0;x<width;x++)onlyRules.data.set([255,255,255,255],(y*width+x)*4);
 assert.deepEqual(detectBars(onlyRules).ivs,[null,null,null]);
});
