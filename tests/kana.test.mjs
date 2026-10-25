import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {nameRings,resolveSemiVoicedName} from '../public/lib/kana.js';
const pokemon=JSON.parse(readFileSync(new URL('../public/data/pokemon.json',import.meta.url),'utf8')).pokemon;
// Generated strokes and hollow circles only; these are not rendered species names.
function line(length,positions,scale=1,filled=false){const width=360*scale,height=780*scale,data=new Uint8ClampedArray(width*height*4).fill(255),ink=(x,y)=>data.set([75,100,100,255],(y*width+x)*4);
 for(let c=0;c<length;c++){const left=(120+c*22)*scale;for(let y=320*scale;y<340*scale;y++)for(let x=left;x<left+14*scale;x++)if(x<left+2*scale||y>=338*scale)ink(x,y);}
 for(const c of positions){const cx=(135+c*22)*scale,cy=319*scale;for(let y=cy-4*scale;y<=cy+4*scale;y++)for(let x=cx-4*scale;x<=cx+4*scale;x++){const d=Math.hypot(x-cx,y-cy)/scale;if(d<3.6&&(filled||d>1.6))ink(x,y);}}
 return{width,height,data};}
const readings=text=>[{text,confidence:90},{text,confidence:90}],unknown={id:null,candidates:[],reason:'unknown'};
test('closed small rings at the corresponding positions support semi-voiced names at two resolutions',()=>{
 for(const scale of [1,3])for(const [text,length,positions,id]of[['ヒッヒ',3,[0,2],'clefairy'],['ビカチュウ',5,[0],'pikachu']]){const image=line(length,positions,scale);assert.equal(nameRings(image).rings.length,positions.length);const r=resolveSemiVoicedName(unknown,pokemon,readings(text),image);assert.equal(r.id,id);assert.equal(r.nameEvidence.kind,'handakuten');}
});
test('filled dots, missing rings, wrong positions, weak or single OCR readings cannot repair a name',()=>{
 for(const image of [line(5,[]),line(5,[4]),line(5,[0],1,true)])assert.equal(resolveSemiVoicedName(unknown,pokemon,readings('ヒカチュウ'),image).id,null);
 for(const rs of [[{text:'ヒカチュウ',confidence:90}],[{text:'ヒカチュウ',confidence:90},{text:'ヒカチュウ',confidence:74}],readings('ヒカツュウ')])assert.equal(resolveSemiVoicedName(unknown,pokemon,rs,line(5,[0])).id,null);
 assert.equal(resolveSemiVoicedName(unknown,pokemon,readings('ホリコン2'),line(5,[0])).id,null,'Other voiced kana must still agree exactly');
});
test('existing species decisions, malformed images and names from multiple species are preserved',()=>{
 const existing={id:'raichu',exact:true};assert.equal(resolveSemiVoicedName(existing,pokemon,readings('ヒカチュウ'),line(5,[0])),existing);assert.equal(nameRings({width:1,height:1,data:[]}),null);
 const ambiguous=[{id:'one',dex:1,name:'ピカチュウ'},{id:'two',dex:2,name:'ピカチュウ'}];assert.equal(resolveSemiVoicedName(unknown,ambiguous,readings('ヒカチュウ'),line(5,[0])),unknown);
});
