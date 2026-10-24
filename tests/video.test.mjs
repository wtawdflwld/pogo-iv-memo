// Exercise the actual video-import orchestration with deterministic decoded
// frames. This does not claim to test browser codecs or iPhone MOV playback.
import test from 'node:test';import assert from 'node:assert/strict';
import {detectBars,fingerprint} from '../public/lib/vision.js';
import {importVideo} from '../public/lib/media.js';
function pixels(dark=false,bars=true,ivs=[3,3,5]){const width=360,height=780,data=new Uint8ClampedArray(width*height*4).fill(dark?35:255);for(let i=3;i<data.length;i+=4)data[i]=255;if(bars)for(let j=0;j<3;j++)for(let y=480+j*37;y<488+j*37;y++)for(let x=35;x<215;x++)data.set(x<35+ivs[j]*12?[244,151,94,255]:[226,216,210,255],(y*width+x)*4);return {width,height,data};}
let scenario='three-scenes',createdVideos=[];
class FakeVideo extends EventTarget{
 constructor(){super();this.videoWidth=360;this.videoHeight=780;this.duration=scenario==='late-change'?2.1:6.5;this.t=0;createdVideos.push(this);}
 set currentTime(t){this.t=t;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}get currentTime(){return this.t;}
 load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}pause(){}removeAttribute(n){delete this[n]}remove(){this.removed=true;}
 get frame(){return pixels(scenario==='three-scenes'&&this.t>=2.2&&this.t<4.4,scenario!=='no-bars',(scenario==='bar-animation'&&this.t<1)||(scenario==='late-change'&&this.t<2)?[0,0,0]:[3,3,5]);}
}
class FakeCanvas{
 constructor(){this.width=360;this.height=780;this.frame=pixels();}
 getContext(){const c=this;return {fillRect(){},drawImage(source){c.frame=source.frame||pixels();},getImageData(){return c.frame;}};}
 toBlob(fn){fn(new Blob(['synthetic-test-thumbnail'],{type:'image/jpeg'}));}
}
globalThis.document={baseURI:'https://example.test/pogo/',body:{append(){}},createElement:type=>type==='video'?new FakeVideo():new FakeCanvas()};
globalThis.Tesseract={createWorker:async(_langs,_oem,options)=>({setParameters:async()=>{},recognize:async()=>{options.logger({status:'recognizing text',progress:1});return {data:{text:'CP599\nヒノアラシ',confidence:99}};}})};
globalThis.Worker=class{postMessage({id,image,calibration}){queueMicrotask(()=>this.onmessage({data:{id,result:{bars:detectBars(image,calibration),hash:fingerprint(image)}}}));}};
const species=[{id:'cyndaquil',dex:155,name:'ヒノアラシ',english:'Cyndaquil'}],file=new Blob(['video']);file.name='synthetic.mov';
test('saved-video loop samples/seeks; stable contiguous screens collapse; same-value separate scenes survive',async()=>{scenario='three-scenes';const rows=[],updates=[];const result=await importVideo(file,species,{signal:new AbortController().signal,onProgress:m=>updates.push(m),onRecord:async r=>rows.push(r)});assert.equal(rows.length,3);assert.equal(result.scenes,3);assert.ok(result.sampled>10);assert.ok(updates.some(m=>m.phase==='ocr'));for(const r of rows){assert.equal(r.status,'review');assert.equal(r.cp,599);assert.deepEqual([r.atk,r.def,r.hp],[3,3,5]);assert.equal(r.speciesId,'cyndaquil');assert.ok(r.thumbnail instanceof Blob);}assert.equal(new Set(rows.map(r=>r.id)).size,3);assert.equal(createdVideos.at(-1).removed,true);});
test('cancel preserves already-extracted results and releases video element',async()=>{scenario='three-scenes';const controller=new AbortController(),rows=[];const result=await importVideo(file,species,{signal:controller.signal,onProgress(){},onRecord:async r=>{rows.push(r);controller.abort();}});assert.equal(rows.length,1);assert.equal(result.cancelled,true);assert.equal(createdVideos.at(-1).removed,true);});
test('no appraisal track is reported as skipped rather than certain zero IVs',async()=>{scenario='no-bars';const rows=[];const result=await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,0);assert.equal(result.skipped,1);assert.equal(createdVideos.at(-1).removed,true);});
test('a settled zero plateau during bar animation is replaced by the later settled values',async()=>{scenario='bar-animation';const rows=[];await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,1);assert.deepEqual([rows[0].atk,rows[0].def,rows[0].hp],[3,3,5]);});
test('a late unsettled change clears stale early IVs and retains an unknown review candidate',async()=>{scenario='late-change';const rows=[];await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,1);assert.deepEqual([rows[0].atk,rows[0].def,rows[0].hp],[null,null,null]);assert.equal(rows[0].status,'review');assert.ok(rows[0].notes.some(n=>n.includes('最後の値')));});
