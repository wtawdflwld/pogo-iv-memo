// Optional Node-side smoke check of the actual bundled WASM and traineddata.
// It does not exercise a browser, Safari or real Pokemon GO images.
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import path from 'node:path';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),filename=path.join(root,'public/vendor/core/tesseract-core-lstm.wasm.js'),module={exports:{}};
const source=await readFile(filename,'utf8');
// Evaluate the unchanged UMD distribution in its supported Node CommonJS mode.
new Function('module','exports','require','__dirname','__filename',source)(module,module.exports,createRequire(import.meta.url),path.dirname(filename),filename);
const core=await module.exports({locateFile:name=>path.join(root,'public/vendor/core',name),TesseractProgress:()=>{}});
for(const lang of ['jpn','eng'])core.FS.writeFile(`${lang}.traineddata`,gunzipSync(await readFile(path.join(root,`public/vendor/lang/${lang}.traineddata.gz`))));
const api=new core.TessBaseAPI();assert.equal(api.Init(null,'jpn+eng',1),0);api.SetVariable('tessedit_pageseg_mode','6');
core.FS.writeFile('/input',await readFile(path.join(root,'test-output/synthetic-ocr-crop.png')));assert.equal(api.SetImageFile(1,0),0);api.Recognize(null);const text=api.GetUTF8Text();console.log(text);assert.match(text,/599/);assert.match(text,/ヒノアラシ/);api.End();core.destroy(api);console.log('Bundled Japanese/English models and WASM OCR passed (synthetic fixture, Node only).');
