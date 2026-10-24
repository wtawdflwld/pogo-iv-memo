import {mkdir, writeFile, readFile, readdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
for (const p of ['.downloads', 'public/vendor/core', 'public/vendor/lang', 'public/data', 'public/licenses']) await mkdir(p, {recursive:true});
const provenance=[];
async function get(url, dest) {
  let bytes;
  try { bytes = await readFile(dest); }
  catch { const r=await fetch(url); if(!r.ok) throw Error(`${r.status}: ${url}`); bytes=Buffer.from(await r.arrayBuffer()); await writeFile(dest,bytes); }
  provenance.push({url, file:dest, sha256:createHash('sha256').update(bytes).digest('hex')});
  return bytes;
}
async function pin(repo) {
  const f=`.downloads/${repo.replace('/','-')}-commit.json`;
  const j=JSON.parse(await get(`https://api.github.com/repos/${repo}/commits/HEAD`,f)); return j.sha;
}
const pv=await pin('pvpoke/pvpoke'), pa=await pin('PokeAPI/pokeapi');
const gm=JSON.parse(await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${pv}/src/data/gamemaster.json`,'.downloads/gamemaster.json'));
const source=(await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${pv}/src/js/pokemon/Pokemon.js`,'.downloads/Pokemon.js')).toString();
const cpms=JSON.parse(source.match(/var cpms = (\[[^;]+\])/)[1]).slice(0,99);
const csv=(await get(`https://raw.githubusercontent.com/PokeAPI/pokeapi/${pa}/data/v2/csv/pokemon_species_names.csv`,'.downloads/names.csv')).toString();
const names=new Map(csv.split(/\r?\n/).slice(1).map(l=>l.split(',')).filter(a=>a[1]==='1').map(a=>[+a[0],a[2]]));
const translations={Alolan:'アローラ',Galarian:'ガラル',Hisuian:'ヒスイ',Paldean:'パルデア',Attack:'アタック',Defense:'ディフェンス',Speed:'スピード',Normal:'ノーマル',Origin:'オリジン',Altered:'アナザー',Therian:'れいじゅう',Incarnate:'けしん',Plant:'くさき',Sandy:'すなち',Trash:'ゴミ',Sunny:'たいよう',Rainy:'あまみず',Snowy:'ゆきぐも',Sunshine:'ポジ',Overcast:'ネガ',Confined:'いましめ',Unbound:'ときはなたれし',Average:'ふつう',Small:'ちいさい',Large:'おおきい',Super:'とくだい',Male:'オス',Female:'メス',Aria:'ボイス',Pirouette:'ステップ',Land:'ランド',Sky:'スカイ',West:'にし',East:'ひがし',Zen:'ダルマ',Standard:'ノーマル',Complete:'パーフェクト',Midday:'まひる',Midnight:'まよなか',Dusk:'たそがれ'};
const condition={
 'eevee>espeon':'相棒で10km歩き、相棒のまま昼に進化（初回の名前指定例外あり）',
 'eevee>umbreon':'相棒で10km歩き、相棒のまま夜に進化（初回の名前指定例外あり）',
 'eevee>leafeon':'ハーブルアーの範囲内（初回の名前指定例外あり）',
 'eevee>glaceon':'アイスルアーの範囲内（初回の名前指定例外あり）',
 'eevee>sylveon':'相棒にしてハート70個（初回の名前指定例外あり）',
 'kirlia>gallade':'オス限定・シンオウのいし', 'snorunt>froslass':'メス限定・シンオウのいし',
 'combee>vespiquen':'メス限定', 'salandit>salazzle':'メス限定',
 'tyrogue>hitmonlee':'攻撃IVが最大（同値ではランダム）', 'tyrogue>hitmonchan':'防御IVが最大（同値ではランダム）', 'tyrogue>hitmontop':'HP IVが最大（同値ではランダム）',
 'wurmple>silcoon':'ランダム分岐（任意に選べません）','wurmple>cascoon':'ランダム分岐（任意に選べません）',
 'eevee>vaporeon':'ランダム分岐（初回の名前指定例外あり）','eevee>jolteon':'ランダム分岐（初回の名前指定例外あり）','eevee>flareon':'ランダム分岐（初回の名前指定例外あり）',
 'slowpoke>slowking':'おうじゃのしるし','poliwhirl>politoed':'おうじゃのしるし','onix>steelix':'メタルコート','scyther>scizor':'メタルコート',
 'seadra>kingdra':'りゅうのウロコ','porygon>porygon2':'アップグレード','porygon2>porygon_z':'シンオウのいし',
 'sneasel>weavile':'シンオウのいし','murkrow>honchkrow':'シンオウのいし','misdreavus>mismagius':'シンオウのいし','gligar>gliscor':'シンオウのいし',
 'rhydon>rhyperior':'シンオウのいし','tangela>tangrowth':'シンオウのいし','electabuzz>electivire':'シンオウのいし','magmar>magmortar':'シンオウのいし',
 'togetic>togekiss':'シンオウのいし','aipom>ambipom':'シンオウのいし','yanma>yanmega':'シンオウのいし','lickitung>lickilicky':'シンオウのいし','dusclops>dusknoir':'シンオウのいし',
 'petilil>lilligant':'たいようのいし','cottonee>whimsicott':'たいようのいし','gloom>bellossom':'たいようのいし','sunkern>sunflora':'たいようのいし',
 'helioptile>heliolisk':'たいようのいし','lampent>chandelure':'イッシュのいし','munna>musharna':'イッシュのいし','minccino>cinccino':'イッシュのいし',
 'pansear>simisear':'イッシュのいし','pansage>simisage':'イッシュのいし','panpour>simipour':'イッシュのいし','eelektrik>eelektross':'イッシュのいし',
 'magneton>magnezone':'マグネットルアーの範囲内','nosepass>probopass':'マグネットルアーの範囲内','charjabug>vikavolt':'マグネットルアーの範囲内',
 'sliggoo>goodra':'雨天またはレイニールアーの範囲内','spritzee>aromatisse':'相棒にしておこうを使用','swirlix>slurpuff':'相棒にしておやつ25個',
 'pancham>pangoro':'相棒にしてあくタイプ32匹捕獲','inkay>malamar':'端末を逆さまにして進化',
 'farfetchd_galarian>sirfetchd':'相棒にしてエクセレントスロー10回','yamask_galarian>runerigus':'相棒にしてレイド10回勝利',
 'qwilfish_hisuian>overqwil':'相棒にしてレイド10回勝利','sneasel_hisuian>sneasler':'相棒で7km歩き、昼に進化',
 'slowpoke_galarian>slowbro_galarian':'相棒にしてどくタイプ30匹捕獲','slowpoke_galarian>slowking_galarian':'相棒にしてエスパータイプ30匹捕獲',
 'ursaring>ursaluna':'満月の指定期間','bisharp>kingambit':'相棒にしてあくタイプまたははがねタイプのレイドボス15回撃破',
 'primeape>annihilape':'相棒にしてゴーストまたはエスパータイプ30匹撃破','pawmo>pawmot':'相棒で25km歩く',
 'rellor>rabsca':'アメ50個','greavard>houndstone':'アメ50個',
 'rockruff>lycanroc_midday':'昼・通常のイワンコから','rockruff>lycanroc_midnight':'夜・通常のイワンコから',
 'rockruff_dusk>lycanroc_dusk':'たそがれに進化できる特定のイワンコ・指定時間帯',
 'amaura>aurorus':'夜に進化','tyrunt>tyrantrum':'昼に進化','yungoos>gumshoos':'昼に進化',
 'happiny>chansey':'相棒で15km歩く','bonsly>sudowoodo':'相棒で15km歩く','mime_jr>mr_mime':'相棒で15km歩く','feebas>milotic':'相棒で20km歩く',
 'floette>florges':'相棒にしてハート20個','poipole>naganadel':'相棒にしてドラゴンタイプ20匹捕獲'
};
const valid=gm.pokemon.filter(p=>p.released && !p.speciesId.includes('_shadow') && !p.tags?.includes('mega') && !/(_mega|_primal|_xs)/.test(p.speciesId) && !p.aliasId && p.baseStats?.atk>0);
const ids=new Set(valid.map(p=>p.speciesId));
const pokemon=valid.map(p=>{
 const form=p.speciesName.match(/\((.+)\)/)?.[1]||'';
 return {id:p.speciesId,dex:p.dex,name:names.get(p.dex)||p.speciesName,english:p.speciesName,form:form.split(', ').map(f=>translations[f]||f).join('・'),stats:p.baseStats,
  evolutions:(p.family?.evolutions||[]).filter(id=>ids.has(id)).map(id=>({id,condition:condition[`${p.speciesId}>${id}`]||'アメとゲーム内の進化条件が必要。性別・相棒・時間帯・地域・イベントなどの制限はゲーム内の進化ボタンで確認してください。'}))};
});
// Audit evolution routes against the GO Game Master, rather than inheriting
// main-series-only evolution links. Only factual parameters are extracted.
const minersPin=await pin('PokeMiners/game_masters');
const minersBytes=await get(`https://raw.githubusercontent.com/PokeMiners/game_masters/${minersPin}/latest/latest.json`,'.downloads/miners-pinned.json');
const miners=JSON.parse(minersBytes).filter(t=>t.data?.pokemonSettings);
const gmByTemplate=new Map(miners.map(t=>[t.templateId,t.data.pokemonSettings]));
const itemNames={ITEM_METAL_COAT:'メタルコート',ITEM_SUN_STONE:'たいようのいし',ITEM_KINGS_ROCK:'おうじゃのしるし',ITEM_DRAGON_SCALE:'りゅうのウロコ',ITEM_UP_GRADE:'アップグレード',ITEM_GEN4_EVOLUTION_STONE:'シンオウのいし',ITEM_GEN5_EVOLUTION_STONE:'イッシュのいし',ITEM_OTHER_EVOLUTION_STONE_MAPLE_A:'あまーいりんご',ITEM_OTHER_EVOLUTION_STONE_MAPLE_B:'すっぱいりんご',ITEM_OTHER_EVOLUTION_STONE_MAPLE_C:'みついりりんご'};
const sourceSettings=p=>{
 const prefix=`V${String(p.dex).padStart(4,'0')}_POKEMON_`,key=p.id.toUpperCase();
 return gmByTemplate.get(prefix+key+'_NORMAL')||gmByTemplate.get(prefix+key);
};
const rockruff=pokemon.find(p=>p.id==='rockruff');
if(rockruff){pokemon.push({...rockruff,id:'rockruff_dusk',english:'Rockruff (Dusk eligible)',form:'たそがれ進化可能個体',evolutions:[{id:'lycanroc_dusk',condition:'たそがれに進化できる特定の個体・指定時間帯'}]});}
const available=new Map(pokemon.map(p=>[p.id,p]));
const evoIds=b=>[b.form?.toLowerCase(),b.form?.toLowerCase().replace(/_(normal|male)$/,''),b.evolution?.toLowerCase()].filter(Boolean);
for(const p of pokemon){
 const settings=sourceSettings(p);if(!settings)continue;
 const edges=[];
 for(const b of settings.evolutionBranch||[]){
  if(!b.evolution||b.temporaryEvolution)continue;
  let id=evoIds(b).find(id=>available.has(id));if(!id)continue;
  // Do not map an unknown alternate form to the default form accidentally.
  if(b.form&&!/_NORMAL$|_MALE$/.test(b.form)&&!available.has(b.form.toLowerCase())&&id===b.evolution.toLowerCase()){
   const old=p.evolutions.find(e=>e.id===id);if(!old)continue;
  }
  const key=p.id+'>'+id, clauses=[];
  if(b.candyCost)clauses.push(`アメ${b.candyCost}個`);
  if(b.evolutionItemRequirement)clauses.push((itemNames[b.evolutionItemRequirement]||'専用進化アイテム')+(b.evolutionItemRequirementCost?`${b.evolutionItemRequirementCost}個`:''));
  if(b.kmBuddyDistanceRequirement)clauses.push(`相棒で${b.kmBuddyDistanceRequirement}km歩く`);
  if(b.onlyDaytime)clauses.push('昼');if(b.onlyNighttime)clauses.push('夜');if(b.onlyDuskPeriod)clauses.push('たそがれの指定時間帯');
  const gender=/FEMALE/.test(b.genderRequirement||'')?'female':/MALE/.test(b.genderRequirement||'')?'male':null;
  if(gender)clauses.push(gender==='female'?'メス限定':'オス限定');
  if(b.questDisplay?.length&&!condition[key])clauses.push('相棒などの進化チャレンジ達成が必要。詳細はゲーム内で確認');
  if(b.evolutionLikelihoodWeight)clauses.push('ランダム分岐（任意に選べません）');
  if(condition[key])clauses.push(condition[key]);
  if(!clauses.length)clauses.push('ゲーム内の進化条件を確認してください');
  const maxIV=p.id==='tyrogue'?({hitmonlee:'atk',hitmonchan:'def',hitmontop:'hp'}[id]):undefined;
  if(!edges.some(e=>e.id===id))edges.push({id,condition:[...new Set(clauses)].join('・'),...(gender?{gender}:{}),...(maxIV?{maxIV}:{}),special:!!(gender||b.questDisplay?.length||b.evolutionItemRequirement||b.kmBuddyDistanceRequirement||b.onlyDaytime||b.onlyNighttime||b.onlyDuskPeriod||b.evolutionLikelihoodWeight||condition[key])});
 }
 p.evolutions=edges;
}
// Known model-name aliases for sex-specific evolutions in the source.
for(const [id,gender] of [['oinkologne','male'],['oinkologne_female','female'],['meowstic','male'],['meowstic_female','female']]){const p=available.get(id);if(p&&!p.form)p.form=gender==='male'?'オス':'メス';}
await writeFile('public/data/evolution-audit.json',JSON.stringify({retrieved:'2026-10-24',commit:minersPin,source:`https://github.com/PokeMiners/game_masters/blob/${minersPin}/latest/latest.json`,sha256:createHash('sha256').update(minersBytes).digest('hex'),note:'進化先・性別・アイテム・相棒・時間帯の事実パラメータのみ抽出。全文やゲーム素材は同梱しない。通常進化ルートのないバサギリ／アヤシシ等へは遷移しない。期間限定の別地方進化は常設候補に含めない。'}));
await writeFile('public/data/pokemon.json',JSON.stringify({version:'2026-10-24',upstreamTimestamp:gm.timestamp,pvpokeCommit:pv,pokeapiCommit:pa,cpms,pokemon}));
await get(`https://raw.githubusercontent.com/pvpoke/pvpoke/${pv}/LICENSE`,'public/licenses/PvPoke.txt');
await get(`https://raw.githubusercontent.com/PokeAPI/pokeapi/${pa}/LICENSE.md`,'public/licenses/PokeAPI.txt');
for(const [name,version] of [['tesseract.js','6.0.1'],['tesseract.js-core','6.0.0']]) {
 const file=`.downloads/${name}.tgz`, dest=`.downloads/${name}`;
 await get(`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,file);
 await mkdir(dest,{recursive:true}); execFileSync('tar',['-xf',file,'-C',dest]);
 if(name==='tesseract.js') for(const f of ['tesseract.min.js','worker.min.js']) await copyFile(`${dest}/package/dist/${f}`,`public/vendor/${f}`);
 else for(const f of await readdir(`${dest}/package`)) if(/\.wasm(\.js)?$/.test(f)) await copyFile(`${dest}/package/${f}`,`public/vendor/core/${f}`);
 const license=(await readdir(`${dest}/package`)).find(f=>/^license/i.test(f));
 if(license) await copyFile(`${dest}/package/${license}`,`public/licenses/${name}.txt`);
}
// Small LSTM models: no CDN requests are used at runtime.
for(const lang of ['jpn','eng']) await get(`https://tessdata.projectnaptha.com/4.0.0_fast/${lang}.traineddata.gz`,`public/vendor/lang/${lang}.traineddata.gz`);
await get('https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/LICENSE','public/licenses/tessdata.txt');
await writeFile('public/data/sources.json',JSON.stringify({retrieved:'2026-10-24',pvpoke:pv,pokeapi:pa,pokemon: pokemon.length,files:provenance},null,2));
console.log(`Prepared ${pokemon.length} species/forms, ${cpms.length} CP multipliers, local OCR assets.`);
