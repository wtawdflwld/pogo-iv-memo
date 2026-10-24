import test from 'node:test';import assert from 'node:assert/strict';
// IndexedDB contract double: the transaction commits only at oncomplete.
let disk=new Map(),fail=false,openedName;
const fakeDB={createObjectStore(){},transaction(_store,mode){
 const staged=new Map(disk);
 const tx={error:null,objectStore(){
  return {
   put(r){staged.set(r.id,r);},
   delete(id){staged.delete(id);},
   getAll(){const req={};queueMicrotask(()=>{req.result=[...disk.values()];req.onsuccess?.();});return req;}
  };
 }};
 if(mode==='readwrite')queueMicrotask(()=>{if(fail){tx.error=Error('QuotaExceededError');tx.onabort?.();}else{disk=staged;tx.oncomplete?.();}});return tx;
},close(){}};
globalThis.indexedDB={open(name){openedName=name;const req={};queueMicrotask(()=>{req.result=fakeDB;req.onupgradeneeded?.();req.onsuccess?.();});return req;}};
const {saveRecords,allRecords,deleteRecord}=await import('../public/lib/storage.js');
test('batch persists all records including review and equal-value separate individuals',async()=>{const common={speciesId:'cyndaquil',atk:3,def:3,hp:5,cp:599};await saveRecords([{...common,id:'one',status:'confirmed'},{...common,id:'two',status:'review'}]);assert.equal((await allRecords()).length,2);assert.match(openedName,/pogo-iv-local:/);});
test('failed batch rejects and leaves previous database contents intact',async()=>{fail=true;await assert.rejects(saveRecords([{id:'three'}]),/QuotaExceededError/);assert.equal((await allRecords()).length,2);fail=false;});
test('delete affects only the chosen ID',async()=>{await deleteRecord('one');assert.deepEqual((await allRecords()).map(r=>r.id),['two']);});
