// Exercise the actual video-import orchestration with deterministic decoded
// frames. This does not claim to test browser codecs or iPhone MOV playback.
import test from 'node:test';import assert from 'node:assert/strict';
import {detectBars,fingerprint} from '../public/lib/vision.js';
import {importVideo,CPFrameBuffer} from '../public/lib/media.js';
function pixels(dark=false,bars=true,ivs=[3,3,5]){const width=360,height=780,data=new Uint8ClampedArray(width*height*4).fill(dark?35:255);for(let i=3;i<data.length;i+=4)data[i]=255;if(bars)for(let j=0;j<3;j++)for(let y=480+j*37;y<488+j*37;y++)for(let x=35;x<215;x++)data.set(x<35+ivs[j]*12?[244,151,94,255]:[226,216,210,255],(y*width+x)*4);return {width,height,data};}
let scenario='three-scenes',createdVideos=[],ocrCalls=[],cancelDuringRetry=null;
class FakeVideo extends EventTarget{
 constructor(){super();this.videoWidth=360;this.videoHeight=780;this.duration=scenario==='late-change'?2.1:6.5;this.t=0;createdVideos.push(this);}
 set currentTime(t){this.t=t;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}get currentTime(){return this.t;}
 load(){if(this.src)queueMicrotask(()=>this.dispatchEvent(new Event('loadeddata')));}pause(){}removeAttribute(n){delete this[n]}remove(){this.removed=true;}
 get frame(){return {...pixels(['three-scenes','cp-no-cross-page'].includes(scenario)&&this.t>=2.2&&this.t<4.4,scenario!=='no-bars',(scenario==='bar-animation'&&this.t<1)||(scenario==='late-change'&&this.t<2)?[0,0,0]:[3,3,5]),time:this.t};}
}
class FakeCanvas{
 constructor(){this.width=360;this.height=780;this.frame=pixels();}
 getContext(){const c=this;return {fillRect(){},drawImage(source){c.frame=source.frame||pixels();},getImageData(){return c.frame;}};}
 toBlob(fn){fn(new Blob(['synthetic-test-thumbnail'],{type:'image/jpeg'}));}
}
globalThis.document={baseURI:'https://example.test/pogo/',body:{append(){}},createElement:type=>type==='video'?new FakeVideo():new FakeCanvas()};
globalThis.Tesseract={createWorker:async(_langs,_oem,options)=>{let parameters;return {setParameters:async p=>{parameters=p;},recognize:async canvas=>{
 const time=canvas.frame.time??0;ocrCalls.push({time,whitelist:parameters.tessedit_char_whitelist});options.logger({status:'recognizing text',progress:1});
 if(time<6.4&&scenario==='cp-cancel'&&parameters.tessedit_char_whitelist)cancelDuringRetry?.abort();
 const blank=scenario.startsWith('cp-')&&(time>=6.4||(scenario==='cp-no-cross-page'&&time>=4.4)||(scenario==='cp-one-only'&&time<6));
 const cp=scenario==='cp-conflict'&&time<6?598:599;
 return {data:{text:(blank?'':`CP${cp}\n`)+'ヒノアラシ',confidence:99}};
 }};}};
globalThis.Worker=class{postMessage({id,image,calibration}){queueMicrotask(()=>this.onmessage({data:{id,result:{bars:detectBars(image,calibration),hash:fingerprint(image)}}}));}};
const species=[{id:'cyndaquil',dex:155,name:'ヒノアラシ',english:'Cyndaquil'}],file=new Blob(['video']);file.name='synthetic.mov';
test('saved-video loop samples/seeks; stable contiguous screens collapse; same-value separate scenes survive',async()=>{scenario='three-scenes';const rows=[],updates=[];const result=await importVideo(file,species,{signal:new AbortController().signal,onProgress:m=>updates.push(m),onRecord:async r=>rows.push(r)});assert.equal(rows.length,3);assert.equal(result.scenes,3);assert.ok(result.sampled>10);assert.ok(updates.some(m=>m.phase==='ocr'));for(const r of rows){assert.equal(r.status,'review');assert.equal(r.cp,599);assert.deepEqual([r.atk,r.def,r.hp],[3,3,5]);assert.equal(r.speciesId,'cyndaquil');assert.ok(r.thumbnail instanceof Blob);}assert.equal(new Set(rows.map(r=>r.id)).size,3);assert.equal(createdVideos.at(-1).removed,true);});
test('cancel preserves already-extracted results and releases video element',async()=>{scenario='three-scenes';const controller=new AbortController(),rows=[];const result=await importVideo(file,species,{signal:controller.signal,onProgress(){},onRecord:async r=>{rows.push(r);controller.abort();}});assert.equal(rows.length,1);assert.equal(result.cancelled,true);assert.equal(createdVideos.at(-1).removed,true);});
test('no appraisal track is reported as skipped rather than certain zero IVs',async()=>{scenario='no-bars';const rows=[];const result=await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,0);assert.equal(result.skipped,1);assert.equal(createdVideos.at(-1).removed,true);});
test('a settled zero plateau during bar animation is replaced by the later settled values',async()=>{scenario='bar-animation';const rows=[];await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,1);assert.deepEqual([rows[0].atk,rows[0].def,rows[0].hp],[3,3,5]);});
test('a late unsettled change clears stale early IVs and retains an unknown review candidate',async()=>{scenario='late-change';const rows=[];await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});assert.equal(rows.length,1);assert.deepEqual([rows[0].atk,rows[0].def,rows[0].hp],[null,null,null]);assert.equal(rows[0].status,'review');assert.ok(rows[0].notes.some(n=>n.includes('最後の値')));});
test('a missing representative-frame CP is recovered only after two separated frames agree',async()=>{
 scenario='cp-recover';ocrCalls=[];const rows=[];
 await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});
 const r=rows[0];assert.equal(r.cp,599);assert.equal(r.cpEvidence.method,'scene-consensus');assert.equal(r.cpEvidence.times.length,2);
 assert.ok(r.cpEvidence.times[1]-r.cpEvidence.times[0]>=.4);assert.equal(r.status,'review');assert.equal(r.readerVersion,'1.2.5');
 assert.ok(r.ocrText.includes('CP フレーム間一致'));assert.ok(!r.notes.includes('現在CPを読めません'));
 const retries=ocrCalls.filter(c=>c.time<6.4);assert.equal(retries.length,4);assert.ok(retries.every(c=>c.whitelist),'Retries read only CP, not name/model/HP');
});
test('one readable retry or conflicting CP values cannot fill an unknown CP',async()=>{
 for(const mode of ['cp-one-only','cp-conflict']){scenario=mode;const rows=[];
  await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});
  assert.equal(rows[0].cp,null,mode);assert.equal(rows[0].cpEvidence,undefined,mode);assert.ok(rows[0].notes.includes('現在CPを読めません'));
 }
});
test('retry frames never cross a detected page boundary, including same-IV separate individuals',async()=>{
 scenario='cp-no-cross-page';const rows=[];
 await importVideo(file,species,{signal:new AbortController().signal,onProgress(){},onRecord:async r=>rows.push(r)});
 assert.equal(rows.length,3);assert.equal(rows[0].cp,599);assert.equal(rows[1].cp,599);assert.equal(rows[2].cp,null);
});
test('cancellation during a CP retry stops further work and releases the decoder',async()=>{
 scenario='cp-cancel';const rows=[];cancelDuringRetry=new AbortController();ocrCalls=[];
 const result=await importVideo(file,species,{signal:cancelDuringRetry.signal,onProgress(){},onRecord:async r=>rows.push(r)});
 assert.equal(result.cancelled,true);assert.equal(rows.length,0);assert.equal(createdVideos.at(-1).removed,true);
 assert.equal(new Set(ocrCalls.filter(c=>c.time<6.4).map(c=>c.time)).size,1);cancelDuringRetry=null;
});
test('CP retry memory holds only three headers and clears when the settled IV changes',()=>{
 const buffer=new CPFrameBuffer(),canvas=new FakeCanvas(),bars={ivs:[3,3,5]};
 for(let n=0;n<1000;n++)buffer.push(canvas,bars,n*.2);
 assert.equal(buffer.frames.length,3);assert.ok(buffer.frames.every(f=>f.canvas.height===Math.ceil(canvas.height*.24)));
 assert.equal(buffer.earlier(199.8).length,2);
 buffer.push(canvas,{ivs:[4,3,5]},200);assert.equal(buffer.frames.length,1);buffer.clear();assert.equal(buffer.frames.length,0);
});
