import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const base=path.resolve(import.meta.dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.gz':'application/gzip','.txt':'text/plain; charset=utf-8'};
const port=Number(process.env.PORT||4173);
http.createServer(async(req,res)=>{try{
 let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 // Also exercise project-subdirectory hosting with /pogo/.
 if(p.startsWith('/pogo/'))p=p.slice(5);
 let file=path.resolve(base,'.'+p);if(file!==base&&!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
 if((await stat(file)).isDirectory())file=path.join(file,'index.html');
 res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Service-Worker-Allowed':'./'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}/pogo/`));
