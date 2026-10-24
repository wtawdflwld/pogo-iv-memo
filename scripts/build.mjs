import {cp,mkdir,readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
async function files(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())result.push(...await files(p));else result.push(p);}return result;}
const entries=await files('public');
for(const required of ['public/data/pokemon.json','public/vendor/tesseract.min.js','public/vendor/worker.min.js','public/vendor/lang/jpn.traineddata.gz','public/vendor/lang/eng.traineddata.gz','public/icons/icon-192.png','public/icons/icon-512.png']){if(!(await stat(required).catch(()=>null))?.size)throw Error(`${required} is missing. Run node scripts/prepare-assets.mjs`);}
for(const f of entries.filter(f=>f.endsWith('.js')&&!f.includes('vendor')))execFileSync(process.execPath,['--check',f]);
const data=JSON.parse(await readFile('public/data/pokemon.json','utf8'));if(data.cpms.length!==99||data.pokemon.length<1000)throw Error('Incomplete data');
const hash=createHash('sha256');for(const file of entries.sort()){hash.update(file);hash.update(await readFile(file));}
const version=hash.digest('hex').slice(0,16),assets=entries.map(f=>'./'+path.relative('public',f).replaceAll('\\','/'));
const template=await readFile('scripts/sw-template.js','utf8');
await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
await writeFile('dist/sw.js',template.replace('__VERSION__',JSON.stringify(version)).replace('__ASSETS__',JSON.stringify(assets)));
await writeFile('dist/.nojekyll','');
console.log(`Built dist: ${assets.length} precached files, ${(await Promise.all(entries.map(f=>stat(f)))).reduce((s,x)=>s+x.size,0)/1024/1024|0} MiB, version ${version}`);
