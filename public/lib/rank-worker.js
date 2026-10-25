import {buildRankTable,evolutionPaths,eligibility,complete} from './ranking.js';
let db,byId; const cache=new Map();
self.onmessage=({data})=>{
 try {
  if(data.type==='init'){db=data.db;byId=new Map(db.pokemon.map(p=>[p.id,p]));self.postMessage({id:data.id,result:true});return;}
  const r=data.record;
  if(r.status!=='confirmed'||!complete(r)||!byId.has(r.speciesId)){self.postMessage({id:data.id,result:[]});return;}
  if(byId.get(r.speciesId).pvpExcluded){self.postMessage({id:data.id,result:[]});return;}
  const results=[];
  for(const {species,conditions,unverifiedGender} of evolutionPaths(r.speciesId,byId,r))for(const cap of [1500,2500]){
    const key=species.id+':'+cap;
    if(!cache.has(key)){if(cache.size>100)cache.delete(cache.keys().next().value);cache.set(key,buildRankTable(species,cap,db.cpms));}
    const row=cache.get(key)[r.atk*256+r.def*16+r.hp];
    const usable=eligibility(r,byId.get(r.speciesId),species,cap,db.cpms);
    if(unverifiedGender&&usable.state==='possible'){usable.state='unknown';usable.text='進化に必要な性別が未確認です。編集画面で性別を指定してください';}
    results.push({...row,speciesId:species.id,cap,conditions,eligibility:usable});
  }
  self.postMessage({id:data.id,result:results});
 }catch(e){self.postMessage({id:data.id,error:e.message});}
};
