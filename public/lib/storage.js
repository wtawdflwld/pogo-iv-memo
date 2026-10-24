let connection;
function open() {return connection ||= new Promise((resolve,reject)=>{
 const r=indexedDB.open('pogo-iv-local:'+new URL('../',import.meta.url).pathname,1);
 r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});
 r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};
 r.onerror=()=>{connection=null;reject(r.error);};r.onblocked=()=>reject(Error('別のタブを閉じてから再試行してください'));
});}
export async function allRecords(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
// A single transaction makes batch saving atomic, including all thumbnails.
export async function saveRecords(records){const db=await open();return new Promise((resolve,reject)=>{
 const tx=db.transaction('records','readwrite');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('保存が中断されました'));
 const s=tx.objectStore('records');for(const record of records)s.put(record);
});}
export async function deleteRecord(id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
