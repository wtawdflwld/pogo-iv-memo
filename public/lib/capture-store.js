// Separate database: adding capture recovery never upgrades or clears records.
let connection;
function open(){return connection ||= new Promise((resolve,reject)=>{
 const r=indexedDB.open('pogo-iv-capture:'+new URL('../',import.meta.url).pathname,1);
 r.onupgradeneeded=()=>{
  r.result.createObjectStore('sessions',{keyPath:'id'});
  r.result.createObjectStore('chunks',{keyPath:['sessionId','index']}).createIndex('sessionId','sessionId');
 };
 r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};
 r.onerror=()=>{connection=null;reject(r.error);};r.onblocked=()=>{connection=null;reject(Error('別のIVメモのタブを閉じて再試行してください'));};
});}
function transaction(db,stores,work){return new Promise((resolve,reject)=>{
 const tx=db.transaction(stores,'readwrite');let value;
 tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||Error('一時記録の保存に失敗'));tx.onabort=()=>reject(tx.error||Error('一時記録の保存が中断されました'));
 try{value=work(tx);}catch(e){tx.abort();reject(e);}
});}
function request(db,store,method,...args){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store)[method](...args);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function createCapture(meta){const db=await open();await transaction(db,['sessions'],tx=>tx.objectStore('sessions').add(meta));return meta;}
export async function appendCaptureChunk(id,index,blob){const db=await open();return transaction(db,['sessions','chunks'],tx=>{
 const sessions=tx.objectStore('sessions'),r=sessions.get(id);
 r.onsuccess=()=>{const meta=r.result;if(!meta){tx.abort();return;}tx.objectStore('chunks').add({sessionId:id,index,blob});sessions.put({...meta,bytes:(meta.bytes||0)+blob.size,chunks:index+1});};
});}
export async function finishCapture(id,patch){const db=await open();return transaction(db,['sessions'],tx=>{const s=tx.objectStore('sessions'),r=s.get(id);r.onsuccess=()=>{if(r.result)s.put({...r.result,...patch});else tx.abort();};});}
export async function listCaptures(){return (await request(await open(),'sessions','getAll')).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));}
export function assembleCapture(meta,parts){
 const chunks=[...parts].sort((a,b)=>a.index-b.index);
 if(!chunks.length)throw Error('共有映像のデータがありません。共有対象とブラウザーの対応を確認してください');
 if(chunks.some((c,i)=>c.index!==i||c.sessionId!==meta.id)||chunks.length!==meta.chunks)throw Error('記録の一部が欠けています。もう一度キャプチャしてください');
 const blob=new Blob(chunks.map(c=>c.blob),{type:meta.mimeType||chunks[0].blob.type||'video/mp4'});
 if(blob.size!==meta.bytes)throw Error('一時記録のサイズが一致しません');return {meta,blob};
}
export async function readCapture(id){
 const db=await open(),meta=await request(db,'sessions','get',id);if(!meta)throw Error('一時記録が見つかりません');
 const chunks=await new Promise((resolve,reject)=>{const r=db.transaction('chunks').objectStore('chunks').index('sessionId').getAll(IDBKeyRange.only(id));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return assembleCapture(meta,chunks);
}
export async function removeCapture(id){const db=await open();return transaction(db,['sessions','chunks'],tx=>{
 tx.objectStore('sessions').delete(id);const chunks=tx.objectStore('chunks'),r=chunks.index('sessionId').openKeyCursor(IDBKeyRange.only(id));
 r.onsuccess=()=>{const cursor=r.result;if(cursor){chunks.delete(cursor.primaryKey);cursor.continue();}};
});}
export const captureJournal={create:createCapture,append:appendCaptureChunk,finish:finishCapture};
