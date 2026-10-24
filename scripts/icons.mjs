import {writeFile,mkdir} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
const crc=b=>{let c=0xffffffff;for(const byte of b){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
function chunk(type,data){const t=Buffer.from(type),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([len,t,data,sum]);}
function rounded(x,y,left,top,w,h,r){return x>=left&&x<left+w&&y>=top&&y<top+h&&Math.hypot(Math.max(left+r-x,0,x-(left+w-r)),Math.max(top+r-y,0,y-(top+h-r)))<=r;}
await mkdir('public/icons',{recursive:true});
for(const size of [192,512]){const raw=Buffer.alloc((size*4+1)*size);for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;for(let x=0;x<size;x++){
 const xx=x*512/size,yy=y*512/size;let color=[23,59,61,255];
 for(let i=0;i<3;i++){if(rounded(xx,yy,112,134+i*100,288,45,22))color=[69,98,91,255];if(rounded(xx,yy,112,134+i*100,[170,250,214][i],45,22))color=[215,245,130,255];}
 raw.set(color,y*(size*4+1)+1+x*4);
}}const head=Buffer.alloc(13);head.writeUInt32BE(size,0);head.writeUInt32BE(size,4);head[8]=8;head[9]=6;await writeFile(`public/icons/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));}
