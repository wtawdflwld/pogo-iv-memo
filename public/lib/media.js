import {StableScenes,BarConsensus} from './vision.js';
import {recognizeFields,recognizeCP} from './ocr.js';
const READER_VERSION='1.2.6';
let ocrPromise,currentOCRProgress=()=>{},visionWorker,jobId=0;const visionJobs=new Map();
export function inspectCanvas(canvas,calibration=null){
 if(!visionWorker){visionWorker=new Worker(new URL('./vision-worker.js',import.meta.url),{type:'module'});visionWorker.onmessage=({data})=>{const j=visionJobs.get(data.id);if(j){visionJobs.delete(data.id);data.error?j.reject(Error(data.error)):j.resolve(data.result);}};visionWorker.onerror=e=>{for(const j of visionJobs.values())j.reject(Error(e.message||'画像解析Workerに失敗'));visionJobs.clear();visionWorker.terminate();visionWorker=null;};}
 const pixels=imageData(canvas),id=++jobId;return new Promise((resolve,reject)=>{visionJobs.set(id,{resolve,reject});visionWorker.postMessage({id,image:pixels,calibration},[pixels.data.buffer]);});
}
export async function getOCR(onProgress=()=>{}) {
 currentOCRProgress=onProgress;
 if(!ocrPromise)ocrPromise=(async()=>{
  if(!globalThis.Tesseract)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(Error('OCR本体を読み込めません。オフライン準備を確認してください'));document.head.append(s);});
  const base=new URL('./vendor/',document.baseURI).href;
  const worker=await Tesseract.createWorker(['jpn','eng'],1,{workerPath:base+'worker.min.js',corePath:base+'core/',langPath:base+'lang/',workerBlobURL:false,cacheMethod:'none',logger:m=>currentOCRProgress(m),errorHandler:e=>console.warn('OCR worker:',e)});
  await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});return worker;
 })().catch(e=>{ocrPromise=null;throw e;});return ocrPromise;
}
export async function releaseOCR(){if(ocrPromise){try{(await ocrPromise).terminate();}catch{}ocrPromise=null;}}
export function canvasFrom(source,maxWidth=1080) {
 const width=source.videoWidth||source.naturalWidth||source.width, height=source.videoHeight||source.naturalHeight||source.height;
 if(!width||!height)throw Error('画像の幅・高さを取得できません');
 const c=document.createElement('canvas'), scale=Math.min(1,maxWidth/width);c.width=Math.round(width*scale);c.height=Math.round(height*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0,c.width,c.height);return c;
}
export function imageData(canvas){return canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,canvas.width,canvas.height);}
function blob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('静止画を作成できません')),'image/jpeg',.82));}
export async function loadImage(file) {
 const url=URL.createObjectURL(file);try{const im=new Image();im.src=url;await im.decode();return canvasFrom(im);}finally{URL.revokeObjectURL(url);}
}
export function emptyRecord(source,extra={}) {return {id:crypto.randomUUID(),createdAt:new Date().toISOString(),speciesId:null,atk:null,def:null,hp:null,cp:null,status:'review',ranks:[],source,notes:[],...extra};}
export async function analyzeCanvas(canvas,pokemon,source,onProgress,calibration,detection=null) {
 const bars=detection||(await inspectCanvas(canvas,calibration)).bars, thumbnail=await blob(canvas);
 let text='',confidence=0,ocrError=null,cp=null,conflict=false,match={id:null,candidates:[],reason:'種類を特定できません'};
 try {
  const worker=await getOCR(onProgress);
  ({text,confidence,cp,conflict,match}=await recognizeFields(worker,canvas,pokemon));
 }catch(e){ocrError=e.message;}
 const notes=[];
 if(match.reason)notes.push(match.reason);
 if(bars.ivs.some(v=>v==null))notes.push('個体値バーを特定できません。画像を見て入力、またはバー位置を指定してください');
 if(cp==null)notes.push('現在CPを読めません');
 if(conflict)notes.push('CPの複数回の読み取りが一致しないため、値を空欄にしました');
 if(ocrError)notes.push('OCRに失敗: '+ocrError);
 notes.push('自動読取は候補です。種類・フォルム・IVを確認して確定してください');
 return emptyRecord(source,{speciesId:match.id,atk:bars.ivs[0],def:bars.ivs[1],hp:bars.ivs[2],cp,...(match.cosmeticMerged?{noEvolve:true}:{}),gender:match.gender||null,genderEvidence:match.genderEvidence||null,thumbnail,readerVersion:READER_VERSION,ocrText:`[読取 v${READER_VERSION} / ${canvas.width}×${canvas.height}]\n${text}`,candidates:match.candidates,formEvidence:match.evidence||null,geometry:bars.geometry,confidence:{bars:bars.confidence,ocr:confidence},notes});
}
function cpHeader(canvas){
 const header=document.createElement('canvas');header.width=canvas.width;header.height=Math.ceil(canvas.height*.24);
 header.getContext('2d').drawImage(canvas,0,0,header.width,header.height,0,0,header.width,header.height);return header;
}
// This buffer belongs to one detected page and one settled IV triple only.
// Bound memory independently of video duration; preserve separated moments
// rather than three adjacent frames with the same compression damage.
export class CPFrameBuffer{
 constructor(){this.frames=[];}
 clear(){this.frames=[];}
 push(canvas,bars,time){
  const last=this.frames.at(-1),same=last&&JSON.stringify(last.ivs)===JSON.stringify(bars.ivs);
  if(!same)this.clear();
  const previous=this.frames.at(-1),replace=previous&&time-previous.since<.55;
  const frame={canvas:cpHeader(canvas),frameHeight:canvas.height,ivs:[...bars.ivs],time,since:replace?previous.since:time};
  if(replace)this.frames[this.frames.length-1]=frame;else this.frames.push(frame);
  if(this.frames.length>3)this.frames.shift();
 }
 earlier(time){return this.frames.filter(f=>time-f.time>=.15).slice(-2);}
}
async function recoverVideoCP(record,frames,signal,onProgress){
 if(record.cp!=null||signal.aborted)return;
 if(frames.length<2){record.ocrText+='\n[CP フレーム間一致]\n再読取用の別フレームが2枚未満。空欄を維持';return;}
 const readings=[];
 for(const frame of frames){
  if(signal.aborted)return;
  try{
   onProgress({status:'同じ場面の別フレームからCPを再読取'});
   const result=await recognizeCP(await getOCR(onProgress),frame.canvas,frame.frameHeight);
   record.ocrText+=`\n[CP 別フレーム ${frame.time.toFixed(2)}秒]\n${result.text}`;readings.push({...result,time:frame.time});
  }catch(e){record.ocrText+=`\n[CP 別フレーム ${frame.time.toFixed(2)}秒]\n失敗: ${e.message}`;}
 }
 if(signal.aborted)return;
 const valid=readings.filter(r=>r.cp!=null),values=new Set(valid.map(r=>r.cp));
 if(valid.length>=2&&values.size===1){
  record.cp=valid[0].cp;record.cpEvidence={method:'scene-consensus',times:valid.map(r=>r.time)};
  record.notes=record.notes.filter(n=>n!=='現在CPを読めません'&&!n.startsWith('CPの複数回の読み取り'));
  record.notes.push('代表フレームのCP読取が不安定だったため、同じ場面の別2フレームで一致したCPを採用しました。画像と照合してください');
  record.ocrText+=`\n[CP フレーム間一致]\n${record.cp} / ${valid.length}フレーム`;
 }else{
  record.ocrText+='\n[CP フレーム間一致]\n'+(values.size>1?'異なる値を検出。空欄を維持':'一致を確認できる2フレームが不足。空欄を維持');
 }
}
function eventOnce(el,event,timeout=20000,trigger=null){return new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>finish(Error(`${event}を待機中に時間切れ。動画形式・長さをご確認ください`)),timeout);
 const ok=()=>finish(),error=()=>finish(Error('動画をデコードできません。このブラウザーで再生できる形式を選んでください'));
 function finish(e){clearTimeout(timer);el.removeEventListener(event,ok);el.removeEventListener('error',error);e?reject(e):resolve();}
 el.addEventListener(event,ok,{once:true});el.addEventListener('error',error,{once:true});
 try{trigger?.();}catch(e){finish(e);}
});}
export async function videoDuration(video,hint=null){
 if(Number.isFinite(video.duration)&&video.duration>0)return {duration:video.duration,estimated:false};
 const seekable=video.seekable?.length?video.seekable.end(video.seekable.length-1):0;
 if(Number.isFinite(seekable)&&seekable>0)return {duration:seekable,estimated:false};
 // Some recorder containers omit duration. The capture's wall-clock is a
 // bounded upper limit, never infer a multi-year video from the probe target.
 if(Number.isFinite(hint)&&hint>0&&hint<=28800)return {duration:hint,estimated:true};
 const target=1e7;await eventOnce(video,'seeked',20000,()=>{video.currentTime=target;});
 const actual=Number.isFinite(video.duration)&&video.duration>0?video.duration:video.currentTime;
 if(!Number.isFinite(actual)||actual<=0||actual>=target)throw Error('動画の長さを取得できません。画面収録を保存し直すか、ライブキャプチャを再実行してください');
 await eventOnce(video,'seeked',20000,()=>{video.currentTime=0;});return {duration:actual,estimated:false};
}
export async function importVideo(file,pokemon,{onProgress,onRecord,signal,interval=.2,source={},durationHint=null}) {
 const video=document.createElement('video'),url=URL.createObjectURL(file);video.muted=true;video.playsInline=true;video.preload='auto';video.className='decode-video';document.body.append(video);
 let sampled=0,scenes=0,skipped=0;
 try{
  const ready=eventOnce(video,'loadeddata');video.src=url;video.load();await ready;
  const {duration,estimated}=await videoDuration(video,durationHint);
  const detector=new StableScenes(),cpFrames=new CPFrameBuffer();let consensus=new BarConsensus(),group=0,pending=null,fallback=null,groupSamples=0,previousTarget=-1;
  async function flush(){
   const selected=pending||(groupSamples>=3?fallback:null);
   if(selected){
    const {canvas,time}=selected,bars=pending?selected.bars:{...selected.bars,ivs:[null,null,null],confidence:0};
    const ocrProgress=m=>onProgress({phase:'ocr',message:m.status,fraction:time/duration,time,duration,sampled,scenes,skipped});
    const r=await analyzeCanvas(canvas,pokemon,{kind:'video',...source,file:file.name,time},ocrProgress,null,bars);
    if(pending)await recoverVideoCP(r,cpFrames.earlier(time),signal,ocrProgress);
    if(!signal.aborted){r.notes.push(pending?'同じ場面の3フレーム以上で一致したバーを採用。短い表示場面は取りこぼす場合があります':'バーは見つかりましたが、最後の値が3フレーム以上で一致しません。画像と照らし合わせてIVを入力してください');await onRecord(r);scenes++;}
   }else if(groupSamples)skipped++;
   pending=null;fallback=null;groupSamples=0;cpFrames.clear();
  }
  for(let step=0;step<=Math.ceil(duration/interval);step++){
   if(signal.aborted)break;
   const target=Math.min(step*interval,Math.max(0,duration-.001));
   if(target<=previousTarget+.015)continue;previousTarget=target;
   if(Math.abs(video.currentTime-target)>.015)await eventOnce(video,'seeked',20000,()=>{video.currentTime=target;});
   if(estimated&&video.currentTime<target-.25)break;
   if(signal.aborted)break;
   const canvas=canvasFrom(video),inspection=await inspectCanvas(canvas),scene=detector.push(inspection.hash,inspection.page),bars=inspection.bars;sampled++;
   if(detector.scene!==group){await flush();group=detector.scene;consensus=new BarConsensus();if(signal.aborted)break;}
   groupSamples++;
   onProgress({phase:'video',fraction:target/duration,time:target,duration,sampled,scenes,skipped});
   if(bars.geometry&&scene.stable){
    fallback={canvas,bars,time:target};
    if(pending&&JSON.stringify(pending.bars.ivs)!==JSON.stringify(bars.ivs)){pending=null;cpFrames.clear();}
   }
   // Keep the latest settled result until the page changes: an early plateau
   // in the appraisal animation must not freeze an intermediate IV forever.
   if(consensus.push(bars)&&scene.stable){pending={canvas,bars,time:target};cpFrames.push(canvas,bars,target);}
   // Yield on every frame; decoding/OCR also run asynchronously.
   await new Promise(r=>setTimeout(r,0));
  }
  if(!signal.aborted)await flush();
  return {sampled,scenes,skipped,cancelled:signal.aborted,duration,durationEstimated:estimated};
 }finally{video.pause();video.removeAttribute('src');video.load();video.remove();URL.revokeObjectURL(url);}
}
