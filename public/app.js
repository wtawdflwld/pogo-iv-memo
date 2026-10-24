import {allRecords,saveRecords,deleteRecord} from './lib/storage.js';
import {complete,sortScore} from './lib/ranking.js';
import {analyzeCanvas,importVideo,loadImage,emptyRecord,imageData} from './lib/media.js';
import {detectBars} from './lib/vision.js';
import {LiveCapture,captureSupport,captureError} from './lib/capture.js';
import {listCaptures,readCapture,removeCapture,finishCapture} from './lib/capture-store.js';
const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,byId,stored=[],drafts=[],busy=false,cancelController,editing=null,editURL=null,thumbURLs=[],deleteTarget=null,calibrationPoints=null,registration,updateRequested=false;
let capturing=null,pendingCaptures=[],captureDeleteTarget=null,saving=false;
const rankWorker=new Worker(new URL('./lib/rank-worker.js',import.meta.url),{type:'module'}),jobs=new Map();let sequence=0;
rankWorker.onmessage=({data})=>{const p=jobs.get(data.id);if(!p)return;jobs.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);};
rankWorker.onerror=e=>{for(const p of jobs.values())p.reject(Error(e.message||'順位計算Workerに失敗'));jobs.clear();};
function rankRequest(data){return new Promise((resolve,reject)=>{const id=++sequence;jobs.set(id,{resolve,reject});rankWorker.postMessage({id,...data});});}
async function calculate(r){return await rankRequest({record:r});}
let noticeTimer;
function notice(message,error=false){clearTimeout(noticeTimer);$('#notice').textContent=message;$('#notice').classList.toggle('error',error);$('#notice').hidden=false;noticeTimer=setTimeout(()=>$('#notice').hidden=true,error?18000:7000);}
const display=p=>p?`${p.name}${p.form?'（'+p.form+'）':''}`:'種類を確認してください';
function badge(r){return `<span class="badge ${r.status==='confirmed'?'confirmed':''}">${r.status==='confirmed'?'確定':'要確認'}</span>`;}
function rankCell(r){
 if(!r||r.rank==null)return '計算不能';
 const unusable=r.eligibility.state==='unusable', unknown=r.eligibility.state==='unknown';
 return `<div class="${unusable?'unusable':unknown?'unknown':r.rank<=100?'best':''}"><strong>${unusable?'参加不可':r.rank.toLocaleString()+'位'}</strong>${unusable?`<small>理論 ${r.rank.toLocaleString()}位</small>`:unknown?'<small>理論順位・参加可否未確認</small>':'<small>/ 4,096通り</small>'}</div><small>CP ${r.cp} · Lv.${r.level}<br>積 ${r.percent.toFixed(2)}%（同種1位比）<br>${esc(r.eligibility.text)}</small>`;
}
function rankHTML(r){
 if(r.status!=='confirmed')return '<p class="record-note">要確認として保存できます。種類・フォルム・個体値を確認して確定すると順位を表示します。</p>';
 if(!r.ranks?.length)return '<p class="record-note">計算結果を取得できません。編集画面からもう一度反映してください。</p>';
 const speciesIds=[...new Set(r.ranks.map(v=>v.speciesId))];
 return `<table class="rank-table"><thead><tr><th>評価対象</th><th>スーパー / 1,500</th><th>ハイパー / 2,500</th></tr></thead><tbody>${speciesIds.map(id=>{
  const row=r.ranks.find(x=>x.speciesId===id);return `<tr><td>${esc(display(byId.get(id)))}${row.conditions.length?`<small>${row.conditions.map(esc).join('<br>')}</small>`:'<small>現在の姿</small>'}</td><td>${rankCell(r.ranks.find(x=>x.speciesId===id&&x.cap===1500))}</td><td>${rankCell(r.ranks.find(x=>x.speciesId===id&&x.cap===2500))}</td></tr>`;
 }).join('')}</tbody></table>`;
}
function card(r,draft){
 let thumbnail='<div class="thumb blank" aria-hidden="true">?</div>';
 if(r.thumbnail){const url=URL.createObjectURL(r.thumbnail);thumbURLs.push(url);thumbnail=`<button class="image-button" data-action="edit" data-id="${r.id}" aria-label="${esc(display(byId.get(r.speciesId)))}の画像を確認" style="padding:0;border:0;background:none"><img class="thumb" src="${url}" alt="評価画面"></button>`;}
 const v=x=>x==null?'?':x;
 return `<article class="record" data-record="${r.id}"><div class="record-top">${thumbnail}<div class="record-heading"><h3>${esc(display(byId.get(r.speciesId)))} ${badge(r)}</h3><p class="iv-line">攻撃 ${v(r.atk)} / 防御 ${v(r.def)} / HP ${v(r.hp)} <span> · CP ${v(r.cp)}</span></p></div><div class="record-actions"><button class="text-button" data-action="edit" data-id="${r.id}">確認・修正</button><button class="icon-button" data-action="${draft?'discard':'delete'}" data-id="${r.id}" aria-label="${draft?'結果から除外':'個体を削除'}">×</button></div></div>${rankHTML(r)}<p class="source">${esc(r.source?.file||'手動入力')}${r.source?.time!=null?' · '+formatTime(r.source.time):''} · ${new Date(r.createdAt).toLocaleString('ja-JP')}</p></article>`;
}
function formatTime(s){return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;}
function render(){
 thumbURLs.forEach(URL.revokeObjectURL);thumbURLs=[];
 $('#drafts').innerHTML=drafts.map(r=>card(r,true)).join('');$('#draft-count').textContent=drafts.length;$('#draft-empty').hidden=!!drafts.length;$('#save-all').disabled=!drafts.length||busy||!!capturing||saving;
 $('#saved-count').textContent=stored.length;
 let rows=stored.filter(r=>!$('#review-only').checked||r.status!=='confirmed');
 const q=$('#search').value.trim().toLowerCase();if(q)rows=rows.filter(r=>display(byId.get(r.speciesId)).toLowerCase().includes(q)||byId.get(r.speciesId)?.english.toLowerCase().includes(q));
 const sort=$('#sort').value;rows.sort((a,b)=>sort==='new'?b.createdAt.localeCompare(a.createdAt):(sortScore(a,sort==='great'?1500:2500)-sortScore(b,sort==='great'?1500:2500)||b.createdAt.localeCompare(a.createdAt)));
 $('#collection').innerHTML=rows.map(r=>card(r,false)).join('');$('#collection-empty').hidden=!!rows.length;
 $('#collection-empty').textContent=stored.length?'条件に一致する個体がありません。':'まだ保存した個体がありません。';
 renderCaptures();syncControls();updateAvailable();
}
function syncControls(){for(const id of ['video-input','image-input','manual'])$('#'+id).disabled=!db||busy||!!capturing||saving;$('#capture-start').disabled=!db||busy||!!capturing||saving||!captureSupport().supported;}
function setBusy(value){busy=value;$('#cancel').disabled=false;$('#processing').hidden=!value;render();}
function switchTab(name){for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===name);b.dataset.tab===name?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');}for(const t of ['import','collection','help'])$('#'+t+'-panel').hidden=t!==name;}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
for(const id of ['sort','search','review-only'])$('#'+id).addEventListener(id==='search'?'input':'change',render);
function progress(m){$('#progress').value=m.fraction||0;$('#progress-label').textContent=m.phase==='ocr'?`文字を読んでいます… ${m.message||''} · ${m.scenes||0}件抽出済み`:`${formatTime(m.time||0)} / ${formatTime(m.duration||0)} · ${m.sampled||0}フレーム · ${m.scenes||0}件抽出 · ${m.skipped||0}場面スキップ`;}
async function importFiles(files,kind,options={}){
 if(!db||(busy&&!options.locked)||capturing||saving||!files.length)return;setBusy(true);cancelController=new AbortController();let count=0,failures=0;const summaries=[];
 try {
  for(let i=0;i<files.length;i++){
   if(cancelController.signal.aborted)break;const file=files[i];
   try{
    if(kind==='video'||kind==='capture'){
     const s=await importVideo(file,db.pokemon,{onProgress:progress,signal:cancelController.signal,source:options.source,durationHint:options.meta?.elapsed,onRecord:async r=>{if(options.meta?.interruptions?.length)r.notes.push('共有中に映像の一時停止・再開を検知しました。取りこぼしがないか確認してください');drafts.push(r);count++;render();}});
     summaries.push(`${file.name}: ${s.scenes}件・バー未検出${s.skipped}場面`);
     if(s.durationEstimated)summaries.push('記録に長さの情報がないため共有時間を上限に解析しました。取りこぼしがないか確認してください');
     if(options.meta?.elapsed>=10&&s.duration<options.meta.elapsed*.5)summaries.push('共有時間に比べて記録が短いため、アプリ切り替え中に映像が止まった可能性があります');
    }else{
     $('#progress').value=i/files.length;$('#progress-label').textContent=`画像 ${i+1}/${files.length} を読み取り中 · ${file.name}`;
     const canvas=await loadImage(file),r=await analyzeCanvas(canvas,db.pokemon,{kind:'image',file:file.name},m=>{$('#progress-label').textContent=`画像 ${i+1}/${files.length} · ${m.status}`;});
     if(cancelController.signal.aborted)break;drafts.push(r);count++;render();
    }
   }catch(e){failures++;drafts.push(emptyRecord({kind,...options.source,file:file.name},{notes:[`取り込み失敗: ${e.message}。数値を入力するか、対応形式に変換して再度取り込んでください。`]}));render();}
  }
  $('#import-summary')?.remove();const summary=document.createElement('p');summary.id='import-summary';summary.className='record-note';summary.textContent=`${cancelController.signal.aborted?'中止しました。':''}${count}件を抽出、${failures}ファイルで失敗。${summaries.join(' / ')}${kind!=='image'?' 未検出の場面や短い表示は、必要に応じてスクショで追加してください。':''} まだ保存していません。`;
  $('.draft-section').insertBefore(summary,$('#drafts'));
  notice(`${count}件の読み取り候補を作成しました。確認後にすべて保存してください。`,failures>0);
 }finally{setBusy(false);$('#video-input').value='';$('#image-input').value='';}
}
function renderCaptures(){
 const pending=pendingCaptures.filter(c=>c.id!==capturing?.id);$('#capture-recovery').hidden=!pending.length;
 $('#capture-list').innerHTML=pending.map(c=>{
  const hasDrafts=drafts.some(r=>r.source?.captureId===c.id),locked=busy||!!capturing||saving||hasDrafts;
  return `<article class="capture-entry"><div><strong>${esc(new Date(c.startedAt).toLocaleString('ja-JP'))}</strong><small>${((c.bytes||0)/1024/1024).toFixed(1)} MB · ${hasDrafts?'確認・保存待ち':c.status==='recording'||c.status==='incomplete'?'未完了の記録（再解析できない場合があります）':'未保存の一時記録'}</small></div><div><button class="button secondary" data-action="capture-analyze" data-id="${c.id}" ${locked?'disabled':''}>再解析</button><button class="text-button" data-action="capture-remove" data-id="${c.id}" ${locked?'disabled':''}>一時記録を削除</button></div></article>`;
 }).join('');
}
async function refreshCaptures(){try{pendingCaptures=await listCaptures();renderCaptures();}catch(e){notice('ライブキャプチャの一時保存領域を開けません: '+e.message,true);}}
function whenVisible(){return document.visibilityState!=='hidden'?Promise.resolve():new Promise(resolve=>{const visible=()=>{if(document.visibilityState!=='hidden'){document.removeEventListener('visibilitychange',visible);resolve();}};document.addEventListener('visibilitychange',visible);});}
function captureState(state){
 $('#capture-panel').hidden=false;$('#capture-stop').disabled=state!=='recording'&&state!=='muted';
 const labels={requesting:'iPhoneの共有画面で共有を開始してください',recording:'共有中 — ポケモンGOへ切り替えてください',muted:'共有映像の一時停止を検知しました',stopping:'共有を終了し、一時記録を保存しています',ready:'共有を終了しました。解析を開始します',failed:'ライブキャプチャを終了しました'};
 $('#capture-status').textContent=labels[state]||state;syncControls();updateAvailable();
}
async function analyzeCapture(id){
 if(busy||capturing||saving)return;setBusy(true);
 try{
  const {meta,blob}=await readCapture(id),ext=blob.type.includes('webm')?'webm':'mp4';
  const file=new File([blob],`ライブキャプチャ ${new Date(meta.startedAt).toLocaleString('ja-JP').replaceAll('/','-').replaceAll(':','-')}.${ext}`,{type:blob.type});
  switchTab('import');await importFiles([file],'capture',{locked:true,meta,source:{kind:'capture',captureId:id}});
  await finishCapture(id,{status:'analyzed'});
 }catch(e){notice('一時記録を解析できませんでした: '+e.message,true);}finally{setBusy(false);await refreshCaptures();}
}
async function startLiveCapture(){
 if(!db||busy||capturing||saving)return;let timer;
 const session=new LiveCapture({onState:captureState,onProgress:p=>{$('#capture-detail').textContent=`${formatTime(p.elapsed)} · 記録済み ${(p.bytes/1024/1024).toFixed(1)} MB`;}});capturing=session;
 try{
  // Preserve the button's user activation for the system sharing prompt.
  const started=session.start();$('#capture-detail').textContent='画面の映像だけを端末内に一時記録します。共有終了後に解析します。';render();await started;
  timer=setInterval(()=>{if(session.state==='recording')$('#capture-detail').textContent=`共有開始から ${formatTime((Date.now()-session.startedAt)/1000)} · 記録済み ${(session.bytes/1024/1024).toFixed(1)} MB`;},1000);
  const result=await session.done;clearInterval(timer);await refreshCaptures();
  if(result.error){notice(captureError(result.error)+' 保存できた一時記録があれば再解析できます。',true);return;}
  await whenVisible();capturing=null;$('#capture-panel').hidden=true;await analyzeCapture(result.id);
 }catch(e){notice(captureError(e),true);}finally{clearInterval(timer);if(!capturing||capturing===session){capturing=null;$('#capture-panel').hidden=true;}render();await refreshCaptures();}
}
$('#capture-start').onclick=startLiveCapture;
$('#capture-stop').onclick=()=>capturing?.stop();
$('#video-input').addEventListener('change',e=>importFiles([...e.target.files],'video'));
$('#image-input').addEventListener('change',e=>importFiles([...e.target.files],'image'));
$('#cancel').addEventListener('click',()=>{cancelController?.abort();$('#cancel').disabled=true;$('#progress-label').textContent='中止しています。現在のデコード／OCR処理が終わるまでお待ちください。';});
$('#manual').addEventListener('click',()=>{const r=emptyRecord({kind:'manual',file:'手動入力'});drafts.push(r);render();openEditor(r.id);});
$('#save-all').addEventListener('click',async()=>{
 if(busy||capturing||saving||!drafts.length)return;const batch=[...drafts];saving=true;render();
 try{
  await saveRecords(batch);stored.push(...batch);drafts=[];render();
  const cleanup=await Promise.allSettled([...new Set(batch.map(r=>r.source?.captureId).filter(Boolean))].map(removeCapture));await refreshCaptures();
  notice(`${batch.length}件を保存しました（要確認も含みます）${cleanup.some(r=>r.status==='rejected')?'。一時記録の削除に失敗したため、一覧から削除してください。':''}`,cleanup.some(r=>r.status==='rejected'));
 }catch(e){notice('保存できませんでした。未保存の結果を残しています: '+e.message,true);}finally{saving=false;render();}
});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||saving||b.disabled)return;const id=b.dataset.id;
 if(b.dataset.action==='edit')openEditor(id);
 if(b.dataset.action==='discard'){drafts=drafts.filter(r=>r.id!==id);render();}
 if(b.dataset.action==='delete'){deleteTarget=id;$('#delete-dialog').showModal();}
 if(b.dataset.action==='capture-analyze'&&!busy&&!capturing)analyzeCapture(id);
 if(b.dataset.action==='capture-remove'&&!busy&&!capturing){captureDeleteTarget=id;$('#capture-delete-dialog').showModal();}
});
$('#capture-delete-cancel').onclick=()=>$('#capture-delete-dialog').close();
$('#capture-delete-confirm').onclick=async()=>{const button=$('#capture-delete-confirm');button.disabled=true;try{await removeCapture(captureDeleteTarget);await refreshCaptures();$('#capture-delete-dialog').close();notice('一時記録を削除しました');}catch(e){notice('一時記録を削除できません: '+e.message,true);}finally{button.disabled=false;}};
$('#delete-cancel').onclick=()=>$('#delete-dialog').close();
$('#delete-confirm').onclick=async()=>{const b=$('#delete-confirm');b.disabled=true;try{await deleteRecord(deleteTarget);stored=stored.filter(r=>r.id!==deleteTarget);render();$('#delete-dialog').close();notice('個体を削除しました');}catch(e){notice('削除できませんでした: '+e.message,true);}finally{b.disabled=false;}};
function options(query='',selected=''){
 const q=query.toLowerCase().trim();let values=db.pokemon.filter(p=>!q||`${p.name} ${p.form} ${p.english} ${p.dex}`.toLowerCase().includes(q));
 if(selected&&!values.some(p=>p.id===selected)&&byId.has(selected))values.unshift(byId.get(selected));
 values.sort((a,b)=>a.dex-b.dex||a.id.localeCompare(b.id));
 $('#species-select').innerHTML='<option value="">未認識・要確認</option>'+values.map(p=>`<option value="${esc(p.id)}">${p.dex.toString().padStart(4,'0')} ${esc(display(p))}</option>`).join('');$('#species-select').value=selected;
}
function openEditor(id){
 const record=drafts.find(r=>r.id===id)||stored.find(r=>r.id===id);if(!record)return;
 editing={...record};calibrationPoints=null;$('#edit-error').textContent='';$('#species-query').value='';options('',record.speciesId||'');
 for(const k of ['atk','def','hp','cp'])$('#edit-'+k).value=record[k]??'';
 $('#edit-gender').value=record.gender||'';$('#edit-no-evolve').checked=!!record.noEvolve;
 $('#edit-notes').textContent=(record.notes||[]).join('\n');$('#ocr-text').textContent=record.ocrText||'文字認識の結果はありません';
 if(editURL)URL.revokeObjectURL(editURL);editURL=record.thumbnail?URL.createObjectURL(record.thumbnail):null;
 $('#edit-image').hidden=!editURL;$('#calibrate').hidden=!editURL;$('#calibration-help').hidden=true;$('#edit-image').classList.remove('calibrating');
 if(editURL)$('#edit-image').src=editURL;$('#editor').showModal();updateAvailable();
}
$('#species-query').addEventListener('input',e=>options(e.target.value,$('#species-select').value));
function closeEditor(){$('#editor').close();editing=null;if(editURL)URL.revokeObjectURL(editURL);editURL=null;calibrationPoints=null;updateAvailable();}
$('#close-editor').onclick=closeEditor;$('#editor').addEventListener('cancel',e=>{e.preventDefault();closeEditor();});
async function reflect(confirmed){
 $('#edit-error').textContent='';const r={...editing,speciesId:$('#species-select').value||null,gender:$('#edit-gender').value||null,noEvolve:$('#edit-no-evolve').checked};
 for(const k of ['atk','def','hp','cp']){const el=$('#edit-'+k);if(!el.validity.valid){$('#edit-error').textContent='IVは0〜15の整数、CPは10〜20,000の整数で入力してください。';return;}r[k]=el.value.trim()===''?null:Number(el.value);}
 if(confirmed&&!complete(r)){$('#edit-error').textContent='種類・フォルムと、攻撃／防御／HPのIVをすべて入力してください。未認識の値は0で補いません。';return;}
 r.status=confirmed?'confirmed':'review';r.updatedAt=new Date().toISOString();r.dataVersion=db.version;
 const buttons=$('#edit-form').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{
  r.ranks=await calculate(r);
  const i=drafts.findIndex(v=>v.id===r.id);
  if(i>=0)drafts[i]=r;else{await saveRecords([r]);stored=stored.map(v=>v.id===r.id?r:v);}
  closeEditor();render();notice(i>=0?'結果に反映しました。「すべて保存」で端末へ保存できます。':'修正を保存し、順位を再計算しました');
 }catch(e){$('#edit-error').textContent='反映できませんでした: '+e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
$('#edit-form').addEventListener('submit',e=>{e.preventDefault();reflect(true);});
$('#save-review').onclick=()=>reflect(false);
$('#calibrate').onclick=()=>{calibrationPoints=[];$('#calibration-help').hidden=false;$('#calibration-help').textContent='1/4: 攻撃バーの左端・中央をタップ';$('#edit-image').classList.add('calibrating');};
$('#edit-image').onclick=async e=>{
 if(!calibrationPoints)return;
 const bounds=e.target.getBoundingClientRect();calibrationPoints.push({x:(e.clientX-bounds.left)/bounds.width,y:(e.clientY-bounds.top)/bounds.height});
 const prompts=['','2/4: 攻撃バーの右端（未充填部分も含む）・中央をタップ','3/4: 防御バーの左端・中央をタップ','4/4: HPバーの左端・中央をタップ'];
 if(calibrationPoints.length<4){$('#calibration-help').textContent=prompts[calibrationPoints.length];return;}
 const [a,b,c,d]=calibrationPoints;calibrationPoints=null;$('#edit-image').classList.remove('calibrating');
 if(b.x<=a.x||c.y<=a.y||d.y<=c.y){$('#calibration-help').textContent='指定した順序・位置が不正です。もう一度指定してください。';return;}
 try{const canvas=await loadImage(editing.thumbnail),geometry={x:a.x,width:b.x-a.x,ys:[a.y,c.y,d.y]},bars=detectBars(imageData(canvas),geometry);editing.geometry=geometry;
  ['atk','def','hp'].forEach((k,i)=>$('#edit-'+k).value=bars.ivs[i]??'');$('#calibration-help').textContent='バーを再読取しました。必ず画像と照らし合わせて確認してください。';
 }catch(err){$('#calibration-help').textContent='再読取に失敗: '+err.message;}
};
window.addEventListener('beforeunload',e=>{if(drafts.length||busy||capturing||saving){e.preventDefault();e.returnValue='';}});
function updateAvailable(){if(!registration?.waiting)return;$('#update-banner').hidden=false;$('#update').disabled=busy||!!capturing||saving||drafts.length>0||!!editing;}
$('#update').onclick=()=>{if(busy||capturing||saving||drafts.length||editing)return;updateRequested=true;registration?.waiting?.postMessage({type:'ACTIVATE'});};
let reloading=false;navigator.serviceWorker?.addEventListener('controllerchange',()=>{if(updateRequested&&!reloading&&!busy&&!capturing&&!saving&&!drafts.length&&!editing){reloading=true;location.reload();}});
function setOffline(title,detail,ready=false){$('#offline-title').textContent=title;$('#offline-detail').textContent=detail;$('#offline-dot').classList.toggle('ready',ready);}
navigator.serviceWorker?.addEventListener('message',e=>{
 const m=e.data;if(m.type==='CACHE_PROGRESS')setOffline('オフライン資材を保存中',`${m.done} / ${m.total}ファイル。初回は通信が必要です。`);
 if(m.type==='CACHE_FAILED')setOffline('オフライン準備に失敗','通信と空き容量を確認し、「準備・再確認」を押してください。');
 if(m.type==='CACHE_STATUS')setOffline(m.ready?'オフライン利用の準備完了':'オフライン資材が不足しています',m.ready?'OCR・認識モデル・種族データを端末に保存済み':'オンラインで「準備・再確認」を押してください。',m.ready);
});
async function prepare(){
 $('#prepare').disabled=true;
 try{
  if(!('serviceWorker'in navigator)||!isSecureContext)throw Error('HTTPSまたはlocalhostで開いてください');
  setOffline('オフライン準備中','OCR・モデル・計算データを保存します。');
  const existing=await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href);
  registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(e=>{if(existing)return existing;throw e;});
  registration.addEventListener('updatefound',()=>{const installing=registration.installing;installing?.addEventListener('statechange',()=>{if(installing.state==='installed')updateAvailable();if(installing.state==='redundant')setOffline('オフライン準備に失敗','通信と端末の空き容量を確認して再試行してください。');});});
  // Repairs missing cache entries in the active version; a waiting update stays idle.
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('準備が完了していません。通信・容量を確認して再試行してください')),180000));
  const ready=await Promise.race([navigator.serviceWorker.ready,timeout]);ready.active?.postMessage({type:'PREPARE'});updateAvailable();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
 }catch(e){setOffline('オフライン準備を完了できません',e.message);}finally{$('#prepare').disabled=false;}
}
$('#prepare').onclick=prepare;
async function init(){
 for(const id of ['capture-start','video-input','image-input','manual'])$('#'+id).disabled=true;
 try{
  const response=await fetch('./data/pokemon.json');if(!response.ok)throw Error('種族データを取得できません');db=await response.json();byId=new Map(db.pokemon.map(p=>[p.id,p]));
  await rankRequest({type:'init',db});stored=await allRecords();
  for(const r of stored)r.ranks=await calculate(r);
  $('#data-version').textContent=`同梱データ: ${db.version}取得 / ${db.pokemon.length}種類・フォルム。PvPoke更新日時: ${db.upstreamTimestamp}。未実装・未配信の種類は対象外です。`;
  $('#capture-support').textContent=captureSupport().message;render();await refreshCaptures();syncControls();
 }catch(e){notice('初期化できませんでした: '+e.message,true);setOffline('起動に失敗','通信・サイトデータの設定を確認して再読み込みしてください。');return;}
 prepare();
}
init();
