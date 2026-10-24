import test from 'node:test';import assert from 'node:assert/strict';
import {LiveCapture,captureSupport,recorderOptions} from '../public/lib/capture.js';
import {assembleCapture} from '../public/lib/capture-store.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Track extends EventTarget{
 constructor(kind='video'){super();this.kind=kind;this.readyState='live';this.stopped=0;}
 stop(){this.stopped++;this.readyState='ended';}
 end(){this.readyState='ended';this.dispatchEvent(new Event('ended'));}
}
class Stream{
 constructor(){this.video=new Track();this.audio=new Track('audio');this.tracks=[this.video,this.audio];}
 getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}getTracks(){return this.tracks;}removeTrack(t){this.tracks=this.tracks.filter(x=>x!==t);}
}
class Recorder{
 static isTypeSupported(t){return t==='video/mp4';}
 constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';this.stops=0;}
 start(slice){this.slice=slice;this.state='recording';}
 data(text){this.ondataavailable?.({data:new Blob([text],{type:this.mimeType})});}
 stop(){this.stops++;this.state='inactive';queueMicrotask(()=>{this.data('tail');this.onstop?.();});}
}
function setup(options={}){
 const stream=new Stream(),calls=[],chunks=[],metas=[];
 const env={isSecureContext:true,crypto:globalThis.crypto,MediaRecorder:Recorder,navigator:{mediaDevices:{getDisplayMedia:constraints=>{calls.push(['permission',constraints]);return options.denied?Promise.reject(Object.assign(Error('denied'),{name:'NotAllowedError'})):Promise.resolve(stream);}}}};
 const journal={async create(meta){calls.push(['create']);if(options.createError)throw Error('storage unavailable');metas.push(meta);},async append(id,index,blob){if(options.beforeAppend)await options.beforeAppend();if(options.appendError)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});await tick();chunks.push({sessionId:id,index,blob});metas[0].bytes+=blob.size;metas[0].chunks=index+1;calls.push(['append',index]);},async finish(id,patch){calls.push(['finish']);Object.assign(metas[0],patch);}};
 const states=[],session=new LiveCapture({env,journal,onState:s=>states.push(s)});return {session,env,stream,calls,chunks,metas,states};
}
test('capture capability detection and recorder format fallback do not request permissions',()=>{assert.equal(captureSupport({isSecureContext:false}).supported,false);assert.equal(captureSupport({isSecureContext:true,navigator:{mediaDevices:{}}}).supported,false);assert.equal(captureSupport(setup().env).supported,true);assert.equal(recorderOptions(Recorder).mimeType,'video/mp4');assert.equal(recorderOptions(class {}).mimeType,undefined);});
test('system picker requested synchronously before storage; audio never requested or retained',async()=>{const x=setup();const pending=x.session.start();assert.equal(x.calls[0][0],'permission');assert.deepEqual(x.calls[0][1],{video:true,audio:false});await pending;assert.equal(x.stream.audio.stopped,1);assert.equal(x.stream.getAudioTracks().length,0);assert.equal(x.session.recorder.slice,1000);await x.session.stop();});
test('finish waits for the last dataavailable and ordered durable writes, not just stop()',async()=>{let release;const gate=new Promise(r=>release=r);const x=setup({beforeAppend:()=>gate});await x.session.start();x.session.recorder.data('first');let completed=false;const stopped=x.session.stop().then(r=>{completed=true;return r;});await tick();assert.equal(completed,false);release();const result=await stopped;assert.equal(result.error,undefined);assert.equal((await assembleCapture(x.metas[0],x.chunks).blob.text()),'firsttail');assert.equal(x.calls.at(-1)[0],'finish');assert.equal(x.metas[0].status,'ready');assert.equal(x.stream.video.readyState,'ended');});
test('OS-side share ending finalizes once and retains the recorded clip',async()=>{const x=setup();await x.session.start();x.session.recorder.data('game');x.stream.video.end();const result=await x.session.done;assert.equal(result.reason,'system');assert.equal(x.session.recorder.stops,1);await x.session.stop();await x.session.finalize();assert.equal(x.calls.filter(c=>c[0]==='finish').length,1);assert.equal(x.metas[0].status,'ready');});
test('permission denial creates no recording or journal',async()=>{const x=setup({denied:true});await assert.rejects(x.session.start(),{name:'NotAllowedError'});assert.equal(x.metas.length,0);assert.equal(x.session.state,'failed');});
test('journal setup failure releases acquired share tracks',async()=>{const x=setup({createError:true});await assert.rejects(x.session.start(),/storage unavailable/);assert.equal(x.stream.video.readyState,'ended');assert.equal(x.stream.audio.readyState,'ended');});
test('quota failure stops capture and never reports a successful ready recording',async()=>{const x=setup({appendError:true});await x.session.start();x.session.recorder.data('game');const result=await x.session.done;assert.equal(result.error.name,'QuotaExceededError');assert.equal(x.metas[0].status,'incomplete');assert.equal(x.stream.video.readyState,'ended');assert.equal(x.chunks.length,0);});
test('recorder failure preserves already captured bytes but marks the recording incomplete',async()=>{const x=setup();await x.session.start();x.session.recorder.data('game');await x.session.pending;x.session.recorder.onerror({error:Error('encoder failed')});const result=await x.session.done;assert.match(result.error.message,/encoder/);assert.equal(x.metas[0].status,'incomplete');assert.equal(await assembleCapture(x.metas[0],x.chunks).blob.text(),'gametail');});
test('muted/unmuted capture is noted and cannot silently become confirmed data',async()=>{const x=setup();await x.session.start();x.stream.video.dispatchEvent(new Event('mute'));x.stream.video.dispatchEvent(new Event('unmute'));const r=await x.session.stop();assert.deepEqual(r.interruptions.map(i=>i.kind),['mute','unmute']);assert.ok(x.states.includes('muted'));assert.equal(x.metas[0].interruptions.length,2);});
test('chunk recovery orders by index and rejects missing, mixed-session or corrupt bytes',async()=>{const meta={id:'one',mimeType:'video/mp4',chunks:2,bytes:2},a={sessionId:'one',index:0,blob:new Blob(['a'])},b={sessionId:'one',index:1,blob:new Blob(['b'])};assert.equal(await assembleCapture(meta,[b,a]).blob.text(),'ab');assert.throws(()=>assembleCapture(meta,[]),/データがありません/);assert.throws(()=>assembleCapture(meta,[a]),/欠けて/);assert.throws(()=>assembleCapture(meta,[a,{...b,sessionId:'two'}]),/欠けて/);assert.throws(()=>assembleCapture({...meta,bytes:3},[a,b]),/サイズが一致/);});
