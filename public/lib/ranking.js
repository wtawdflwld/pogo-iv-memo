export const validIV = x => Number.isInteger(x) && x >= 0 && x <= 15;
export const complete = r => !!r.speciesId && [r.atk,r.def,r.hp].every(validIV);
export function statsAt(species, iv, index, cpms) {
  const m=cpms[index], a=(species.stats.atk+iv.atk)*m, d=(species.stats.def+iv.def)*m;
  const h=Math.max(10,Math.floor((species.stats.hp+iv.hp)*m));
  const cp=Math.max(10,Math.floor((species.stats.atk+iv.atk)*Math.sqrt(species.stats.def+iv.def)*Math.sqrt(species.stats.hp+iv.hp)*m*m/10));
  return {cp,level:1+index/2,attack:a,defense:d,hp:h,product:a*d*h};
}
export function maximize(species, iv, cap, cpms) {
  let lo=0,hi=Math.min(98,cpms.length-1),best=-1;
  while(lo<=hi) {const mid=(lo+hi)>>1;if(statsAt(species,iv,mid,cpms).cp<=cap){best=mid;lo=mid+1;}else hi=mid-1;}
  return best<0?null:statsAt(species,iv,best,cpms);
}
// Competition ranks: equal products share a rank, next rank skips the tied places.
export function buildRankTable(species,cap,cpms) {
  const rows=[];
  for(let a=0;a<16;a++) for(let d=0;d<16;d++) for(let h=0;h<16;h++) {
    const stats=maximize(species,{atk:a,def:d,hp:h},cap,cpms);
    rows.push({index:a*256+d*16+h,...stats,product:stats?.product??-1});
  }
  rows.sort((a,b)=>b.product-a.product||a.index-b.index);
  const table=new Array(4096); let rank=0,last=null;
  for(let i=0;i<rows.length;i++) {const row=rows[i];if(last===null || Math.abs(row.product-last)>1e-7) rank=i+1; last=row.product;table[row.index]={...row,rank:row.product<0?null:rank,percent:row.product<0?null:row.product/rows[0].product*100};}
  return table;
}
export function possibleLevels(species,iv,cp,cpms) {
  if(!Number.isInteger(cp)||cp<10) return [];
  return cpms.slice(0,99).map((_,i)=>i).filter(i=>statsAt(species,iv,i,cpms).cp===cp);
}
export function evolutionPaths(id,byId,record=null) {
  const out=[], seen=new Set();
  function walk(current,conditions=[],unverifiedGender=false) {if(seen.has(current)||!byId.has(current))return; seen.add(current);
    out.push({species:byId.get(current),conditions,unverifiedGender});
    if(record?.noEvolve)return;
    for(const edge of byId.get(current).evolutions){
      if(record&&edge.maxIV&&record[edge.maxIV]<Math.max(record.atk,record.def,record.hp))continue;
      if(record?.gender&&edge.gender&&record.gender!==edge.gender)continue;
      walk(edge.id,[...conditions,edge.condition],unverifiedGender||!!(edge.gender&&!record?.gender));
    }
  } walk(id);return out;
}
export function eligibility(record,current,target,cap,cpms) {
  if(Number.isInteger(record.cp)&&record.cp>cap)return {state:'unusable',text:'現在CPが上限超過'};
  const levels=possibleLevels(current,record,record.cp,cpms);
  if(!levels.length)return {state:'unknown',text:record.cp==null?'現在CP不明・参加可否は未確認':'CPと種族・IVが整合しません。レベル／参加可否は未確認'};
  const cps=levels.map(i=>statsAt(target,record,i,cpms).cp);
  if(cps.every(cp=>cp>cap))return {state:'unusable',text:'現在の推定レベルでは進化後CPが上限超過'};
  if(cps.some(cp=>cp>cap))return {state:'unknown',text:'推定レベルに幅があり、参加可否を確定できません'};
  return {state:'possible',text:`CPから推定 Lv.${1+levels[0]/2}${levels.length>1?'〜'+(1+levels.at(-1)/2):''} → 強化可能（相棒ブーストなしの仮定）`};
}
export function sortScore(record,cap) {
  if(record.status!=='confirmed')return Infinity;
  const values=(record.ranks||[]).filter(r=>r.cap===cap && r.eligibility.state==='possible' && r.rank!=null).map(r=>r.rank);
  return values.length?Math.min(...values):Infinity;
}
