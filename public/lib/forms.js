// Read the on-screen type badges, not a nickname or capture location.
// A one-badge observation can be an occluded pair, so only a complete pair is
// used as independent evidence for the number of types.
function luma(image,x,y){const i=(Math.round(y)*image.width+Math.round(x))*4,d=image.data;return (d[i]+d[i+1]+d[i+2])/3;}
export function detectTypeBadges(image){
 const {width:w,height:h,data}=image;if(!w||!h||data.length!==w*h*4)return {count:null,badges:[]};
 const hits=[],step=Math.max(2,Math.round(w/240));
 for(let y=Math.round(h*.516);y<h*.564;y+=step)for(let x=Math.round(w*.35);x<w*.65;x+=step)for(const radius of [w*.026,w*.030,w*.034]){
  let edges=0,contrast=0,inside=0,outside=0;
  for(let a=0;a<24;a++){const angle=a*Math.PI/12,c=Math.cos(angle),s=Math.sin(angle),i=luma(image,x+c*radius*.80,y+s*radius*.80),o=luma(image,x+c*radius*1.18,y+s*radius*1.18);inside+=i;outside+=o;contrast+=o-i;if(o-i>14)edges++;}
  contrast/=24;inside/=24;outside/=24;
  if(edges>=19&&contrast>=26&&inside<185&&outside>155)hits.push({x:x/w,y:y/h,radius:radius/w,score:edges/24+contrast/150});
 }
 const badges=[];for(const hit of hits.sort((a,b)=>b.score-a.score))if(!badges.some(b=>Math.hypot((b.x-hit.x)*w,(b.y-hit.y)*h)<w*.04))badges.push(hit);
 for(const a of badges)for(const b of badges){const gap=b.x-a.x;if(gap>.075&&gap<.145&&Math.abs(a.y-b.y)<.009&&Math.abs(a.radius-b.radius)<.009)return {count:2,badges:[a,b]};}
 return {count:null,badges:badges.slice(0,2)};
}
const typeNames={normal:'ノーマル',fire:'ほのお',water:'みず',electric:'でんき',grass:'くさ',ice:'こおり',fighting:'かくとう',poison:'どく',ground:'じめん',flying:'ひこう',psychic:'エスパー',bug:'むし',rock:'いわ',ghost:'ゴースト',dragon:'ドラゴン',dark:'あく',steel:'はがね',fairy:'フェアリー'};
const normalize=s=>s.normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
export function parseTypes(text){const tokens=text.split(/[\s/／・、|]+/).map(normalize);return Object.entries(typeNames).filter(([id,name])=>tokens.includes(id)||tokens.includes(normalize(name))).map(([id])=>id);}
export function resolveForm(match,pokemon,{count=null,types=[]}={}){
 if(match.id||!match.exact||!match.candidates?.length)return match;
 const candidates=pokemon.filter(p=>match.candidates.includes(p.id));
 if(new Set(candidates.map(p=>p.dex)).size!==1||candidates.length<2||candidates.some(p=>!p.types?.length))return match;
 // A count alone must narrow the original complete set to exactly one form.
 const filtered=candidates.filter(p=>(count==null||p.types.length===count)&&types.every(t=>p.types.includes(t)));
 if(filtered.length!==1||(!types.length&&count!==2))return match;
 return {id:filtered[0].id,candidates:[filtered[0].id],exact:true,visual:true,reason:'画像のタイプ表示から姿を判定しました。見た目とフォルムを確認してください',evidence:{typeCount:count,types}};
}
