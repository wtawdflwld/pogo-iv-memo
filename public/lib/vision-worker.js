import {detectBars,fingerprint} from './vision.js';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:{bars:detectBars(data.image,data.calibration),hash:fingerprint(data.image)}});}catch(e){self.postMessage({id:data.id,error:e.message});}};
