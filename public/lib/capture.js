import {captureJournal} from './capture-store.js';
export function captureSupport(env=globalThis){
 if(!env.isSecureContext)return {supported:false,message:'ライブキャプチャはHTTPSで開いてください。'};
 if(typeof env.navigator?.mediaDevices?.getDisplayMedia!=='function')return {supported:false,message:'このブラウザーでは画面共有を開始できません。iPhoneはiOS 27以降のSafariで開いてください。ホーム画面で利用できない場合はSafariからお試しください。'};
 if(typeof env.MediaRecorder!=='function')return {supported:false,message:'このブラウザーは共有映像の記録に対応していません。Safariで開いてください。'};
 return {supported:true,message:'画面共有を許可したらポケモンGOへ。戻って「共有を終了して解析」を押します。'};
}
export function recorderOptions(Recorder){
 const type=['video/mp4','video/webm;codecs=vp8','video/webm'].find(t=>Recorder.isTypeSupported?.(t));
 return {...(type?{mimeType:type}:{}),videoBitsPerSecond:3000000};
}
export function captureError(error){
 const messages={NotAllowedError:'画面共有が許可されませんでした。共有先とブラウザーの設定を確認し、ボタンからもう一度開始してください。',InvalidStateError:'画面を前面に表示し、ライブキャプチャボタンを押して開始してください。',NotFoundError:'共有できる画面が見つかりません。Safariで開いてください。',NotReadableError:'画面共有を開始できませんでした。他の録画・共有が動作していないか確認してください。',NotSupportedError:'この環境では画面共有または録画を開始できません。Safariで開いてください。',QuotaExceededError:'端末の空き容量が不足し、共有映像を記録できませんでした。'};
 return messages[error?.name]||error?.message||'ライブキャプチャに失敗しました。';
}
// Native MediaRecorder records the stream; no background JS frame timer or OCR.
export class LiveCapture {
 constructor({env=globalThis,journal=captureJournal,onState=()=>{},onProgress=()=>{}}={}){
  this.env=env;this.journal=journal;this.onState=onState;this.onProgress=onProgress;this.state='idle';this.pending=Promise.resolve();this.index=0;this.bytes=0;this.interruptions=[];
  this.done=new Promise(resolve=>{this.resolveDone=resolve;});
 }
 start(){
  const support=captureSupport(this.env);if(!support.supported)return Promise.reject(Error(support.message));
  if(this.state!=='idle')return Promise.reject(Error('共有はすでに開始しています'));
  // Call directly in the click's transient user activation, before any await.
  let permission;try{permission=this.env.navigator.mediaDevices.getDisplayMedia({video:true,audio:false});}catch(e){return Promise.reject(e);}
  this.state='requesting';this.onState(this.state);
  return Promise.resolve(permission).then(async stream=>{
   this.stream=stream;const track=stream.getVideoTracks()[0];
   if(!track||track.readyState==='ended')throw Error('共有映像を取得できませんでした');
   for(const audio of stream.getAudioTracks()){audio.stop();stream.removeTrack(audio);}
   this.recorder=new this.env.MediaRecorder(stream,recorderOptions(this.env.MediaRecorder));
   this.id=this.env.crypto.randomUUID();this.startedAt=Date.now();
   await this.journal.create({id:this.id,startedAt:new Date(this.startedAt).toISOString(),status:'recording',mimeType:this.recorder.mimeType,bytes:0,chunks:0});this.created=true;
   this.recorder.ondataavailable=event=>{
    if(!event.data?.size)return;const index=this.index++;
    this.pending=this.pending.then(async()=>{
     if(this.writeError)return;await this.journal.append(this.id,index,event.data);this.bytes+=event.data.size;this.onProgress({bytes:this.bytes,chunks:index+1,elapsed:(Date.now()-this.startedAt)/1000});
    }).catch(e=>{this.writeError=e;this.error=e;this.stop('storage-error');});
   };
   this.recorder.onstop=()=>this.finalize();
   this.recorder.onerror=event=>{this.error=event.error||Error('共有映像の記録中にエラーが発生しました');this.stop('recorder-error');};
   track.addEventListener('ended',()=>this.stop('system'));
   track.addEventListener('mute',()=>{if(this.state!=='recording')return;this.interruptions.push({kind:'mute',at:Date.now()});this.onState('muted');});
   track.addEventListener('unmute',()=>{this.interruptions.push({kind:'unmute',at:Date.now()});if(this.state==='recording')this.onState('recording');});
   if(track.readyState==='ended')throw Error('共有を開始する前に終了しました');
   this.recorder.start(1000);this.state='recording';this.onState(this.state);return this;
  }).catch(async e=>{
   this.state='failed';this.releaseTracks();
   if(this.created)await this.journal.finish(this.id,{status:'incomplete',error:captureError(e),endedAt:new Date().toISOString()}).catch(()=>{});
   this.onState(this.state);this.resolveDone({id:this.id,error:e});throw e;
  });
 }
 stop(reason='user'){
  if(this.state==='recording'){
   this.state='stopping';this.reason=reason;this.onState(this.state);
   if(this.recorder.state!=='inactive'){try{this.recorder.stop();}catch(e){this.error=e;this.finalize();}}
   // When inactive, wait for the queued final dataavailable then stop event.
  }
  return this.done;
 }
 releaseTracks(){for(const t of this.stream?.getTracks()||[])t.stop();}
 finalize(){
  if(this.finalizing)return this.finalizing;
  this.state='stopping';this.onState(this.state);this.releaseTracks();
  this.finalizing=(async()=>{
   await this.pending;const elapsed=(Date.now()-this.startedAt)/1000;
   let error=this.error;if(!error&&!this.bytes)error=Error('共有映像が記録されませんでした。共有対象とSafariの対応を確認してください');
   try{await this.journal.finish(this.id,{status:error?'incomplete':'ready',endedAt:new Date().toISOString(),elapsed,interruptions:this.interruptions,...(error?{error:captureError(error)}:{})});}catch(e){error ||= e;}
   this.state=error?'failed':'ready';this.onState(this.state);const result={id:this.id,elapsed,bytes:this.bytes,reason:this.reason||'system',interruptions:this.interruptions,error};this.resolveDone(result);return result;
  })();return this.finalizing;
 }
}
