import test from 'node:test';import assert from 'node:assert/strict';
import {readBar,parseCP,matchSpecies,fingerprint,BarConsensus} from '../public/lib/vision.js';
import {agreeCP,recognizeFields,nameTextImage} from '../public/lib/ocr.js';
function image(iv,{pink=false,gaps=false,noise=false,partial=false}={}){
 const width=360,height=200,data=new Uint8ClampedArray(width*height*4).fill(255);
 for(let y=80;y<90;y++)for(let x=35;x<215;x++){
  const i=x-35,empty=[226,216,210,255],color=pink?[246,116,140,255]:[244,151,94,255];
  data.set(gaps&&((i>=59&&i<=61)||(i>=119&&i<=121))?[255,255,255,255]:i<(iv+(partial?.5:0))*12?color:empty,(y*width+x)*4);
 }
 if(noise)for(let y=82;y<=86;y++)data.set([244,151,94,255],(y*width+208)*4);
 return {width,height,data};
}
test('all 16 IV values tolerate segment gaps, pink perfect bars and isolated compression specks',()=>{
 for(let iv=0;iv<=15;iv++)for(const pink of [false,true])assert.equal(readBar(image(iv,{pink,gaps:true,noise:iv<15}),35,84,180).value,iv);
});
test('a half-filled IV cell remains unknown, not rounded into a certain IV',()=>assert.equal(readBar(image(3,{partial:true}),35,84,180).value,null));
test('CP normalization handles spacing and bounded OCR confusions; HP and disagreements stay unknown',()=>{
 assert.equal(parseCP('ＣＰ１，２３４'),1234);assert.equal(parseCP('CP 5 S9'),null);
 assert.equal(parseCP('CP5S9'),559);assert.equal(parseCP('CP599 Bulbasaur'),599);
 assert.equal(parseCP('CP599\nCP600'),null);assert.equal(parseCP('83/83 HP'),null);
 assert.equal(agreeCP([{text:'CP599',confidence:90},{text:'CP598',confidence:80}]).cp,null);
 assert.equal(agreeCP([{text:'CP599',confidence:35}]).cp,null);
 assert.equal(agreeCP([{text:'CP599',confidence:62},{text:'CP599',confidence:61}]).cp,599);
});
const pokemon=[{id:'cyndaquil',dex:155,name:'ヒノアラシ',english:'Cyndaquil'},{id:'r',dex:26,name:'ライチュウ',english:'Raichu'},{id:'ra',dex:26,name:'ライチュウ',english:'Raichu (Alolan)'}];
test('one-character name errors suggest a species without assigning it or guessing its form',()=>{
 const result=matchSpecies('ヒノアラン',pokemon);assert.equal(result.id,null);assert.deepEqual(result.candidates,['cyndaquil']);
 assert.equal(matchSpecies('相棒ちゃん',pokemon).id,null);assert.equal(matchSpecies('ライチュウ',pokemon).id,null);
});
test('model animation alone does not reset text/card stability',()=>{
 const width=360,height=780,data=new Uint8ClampedArray(width*height*4).fill(255),a={width,height,data};const before=fingerprint(a);
 for(let y=150;y<270;y++)for(let x=30;x<300;x++)data.set([30,40,90,255],(y*width+x)*4);
 assert.deepEqual(fingerprint(a),before);
 for(let y=55;y<100;y++)for(let x=70;x<270;x++)data.set([0,0,0,255],(y*width+x)*4);
 assert.notDeepEqual(fingerprint(a),before);
});
test('IV consensus requires three valid frames with matching values and positions',()=>{
 const make=(atk=3,x=.1)=>({ivs:[atk,3,5],confidence:.98,geometry:{x,width:.5,ys:[.6,.65,.7]}}),c=new BarConsensus();
 assert.equal(c.push(make()),false);assert.equal(c.push(make()),false);assert.equal(c.push(make()),true);
 assert.equal(c.push(make(4)),false);assert.equal(c.push(make(4,.3)),false);
 assert.equal(c.push({ivs:[null,3,5],confidence:0,geometry:null}),false);assert.equal(c.push(make()),false);
});
test('field OCR uses separate crops and whitelists and keeps conflicting CP blank',async()=>{
 const previous=globalThis.document,calls=[],outputs=[['CP599',90],['CP598',90],['ヒノアラシ',90],['CP599\nヒノアラシ',90]];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 const worker={async setParameters(p){calls.push(p);},async recognize(){const [text,confidence]=outputs.shift();return {data:{text,confidence}};}};
 try{const result=await recognizeFields(worker,{width:360,height:780,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})},pokemon);
  assert.equal(result.cp,null);assert.equal(result.conflict,true);assert.equal(result.match.id,'cyndaquil');
  assert.ok(calls[0].tessedit_char_whitelist.includes('0123456789'));assert.equal(calls[2].tessedit_char_whitelist,'');assert.equal(outputs.length,0);
 }finally{globalThis.document=previous;}
});
test('a broad name/form fallback cannot erase a CP agreed by dedicated field reads',async()=>{
 const previous=globalThis.document,outputs=[['CP582',90],['CP582',90],['Unknown',90],['Unknown',90],['CP58\nライチュウ',90]];
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){}})})};
 const worker={async setParameters(){},async recognize(){const [text,confidence]=outputs.shift();return {data:{text,confidence}};}};
 try{const r=await recognizeFields(worker,{width:360,height:780,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(400).fill(255)})})},pokemon);assert.equal(r.cp,582);assert.equal(r.conflict,false);assert.equal(r.match.id,null);assert.equal(outputs.length,0);}finally{globalThis.document=previous;}
});
test('name foreground isolation omits a pale pencil and green HP line from the single-line crop',()=>{
 const previous=globalThis.document,width=24,height=16,data=new Uint8ClampedArray(width*height*4).fill(255),draws=[];
 for(let y=3;y<9;y++)for(let x=2;x<15;x++)data.set([105,135,135,255],(y*width+x)*4);
 for(let y=2;y<12;y++)data.set([215,215,215,255],(y*width+21)*4);
 for(let x=0;x<24;x++)data.set([100,215,165,255],(13*width+x)*4);
 globalThis.document={createElement:()=>({getContext:()=>({putImageData(){},fillRect(){},drawImage(...args){draws.push(args);}})})};
 try{const image=nameTextImage({getContext:()=>({getImageData:()=>({data})})},{x:0,y:0,width,height});assert.ok(image);assert.deepEqual(draws[0].slice(1,5),[2,3,13,6]);}finally{globalThis.document=previous;}
});
