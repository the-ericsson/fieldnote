import {mkdir,cp,copyFile,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist'),nm=path.join(root,'node_modules');
await mkdir(dist,{recursive:true});
for(const f of await readdir(path.join(root,'src')))if(f!=='sw.js')await cp(path.join(root,'src',f),path.join(dist,f),{recursive:true});
const vendor=path.join(dist,'vendor');await mkdir(vendor,{recursive:true});
for(const [source,target] of [['fflate/esm/browser.js','fflate.mjs'],['pdf-lib/dist/pdf-lib.min.js','pdf-lib.min.js'],['pdfjs-dist/build/pdf.mjs','pdf.mjs'],['pdfjs-dist/build/pdf.worker.mjs','pdf.worker.mjs'],['tesseract.js/dist/tesseract.min.js','tesseract.min.js'],['tesseract.js/dist/worker.min.js','ocr/worker.min.js']]){
  await mkdir(path.dirname(path.join(vendor,target)),{recursive:true});await copyFile(path.join(nm,source),path.join(vendor,target));
}
for(const dir of ['cmaps','standard_fonts'])await cp(path.join(nm,'pdfjs-dist',dir),path.join(vendor,dir),{recursive:true});
for(const name of ['tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm','tesseract-core-simd-lstm.wasm.js','tesseract-core-simd-lstm.wasm'])await copyFile(path.join(nm,'tesseract.js-core',name),path.join(vendor,'ocr',name));
await mkdir(path.join(vendor,'ocr','lang'),{recursive:true});await copyFile(path.join(nm,'@tesseract.js-data/eng/4.0.0/eng.traineddata.gz'),path.join(vendor,'ocr/lang/eng.traineddata.gz'));
let notices='# Third-party notices\n\n';
for(const name of ['fflate','pdf-lib','pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/eng']){
  const p=JSON.parse(await readFile(path.join(nm,name,'package.json'),'utf8'));notices+=`## ${name} ${p.version}\n\nLicense: ${p.license||'see upstream'}\n\n`;
  for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','NOTICE']){try{notices+=await readFile(path.join(nm,name,file),'utf8')+'\n\n';}catch{}}
}
notices+='\nEnglish trained data: Apache-2.0, https://github.com/tesseract-ocr/tessdata. PDF standard fonts include their own notices in vendor/standard_fonts/.\n';
await writeFile(path.join(dist,'THIRD-PARTY-NOTICES.txt'),notices);await writeFile(path.join(root,'docs/THIRD-PARTY-NOTICES.txt'),notices);
async function files(dir){const out=[];for(const name of await readdir(dir)){const full=path.join(dir,name);if((await stat(full)).isDirectory())out.push(...await files(full));else out.push(path.relative(dist,full).replaceAll('\\','/'));}return out;}
const assets=(await files(dist)).filter(f=>!['sw.js'].includes(f)).sort(),hash=createHash('sha256');let size=0;
for(const file of assets){const bytes=await readFile(path.join(dist,file));hash.update(file).update(bytes);size+=bytes.length;}
const version=hash.digest('hex').slice(0,16);let sw=await readFile(path.join(root,'src/sw.js'),'utf8');sw=sw.replace('__CACHE__',`fieldnote-${version}`).replace('__ASSETS__',JSON.stringify(assets.map(p=>'./'+p)));await writeFile(path.join(dist,'sw.js'),sw);
console.log(JSON.stringify({version,assets:assets.length,offlineMB:Number((size/1048576).toFixed(2)),dist}));
