import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PDFDocument,StandardFonts} from 'pdf-lib';
const {chromium}=await import(process.env.FIELDNOTE_PLAYWRIGHT?pathToFileURL(process.env.FIELDNOTE_PLAYWRIGHT).href:'playwright');
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'test-results');await mkdir(out,{recursive:true});await mkdir(path.join(root,'screenshots'),{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const context=await browser.newContext({viewport:{width:1180,height:820},acceptDownloads:true,permissions:['microphone']});
const page=await context.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
const check=async(name,fn)=>{const start=Date.now();try{await fn();results.push({name,passed:true,ms:Date.now()-start});console.log('PASS '+name);}catch(e){results.push({name,passed:false,error:e.stack});throw e;}};
const ready=()=>page.waitForFunction(()=>document.getElementById('save-status').textContent==='Saved locally');
const body=()=>page.locator('#dialog-body');
const savedBook=()=>page.evaluate(async()=>{const {allBooks}=await import('./storage.mjs');return (await allBooks()).find(b=>b.title==='QA field journal');});
let backupPath;
try{
  await page.goto('http://127.0.0.1:4173/');await page.getByText('A place to begin',{exact:true}).first().waitFor();
  await check('cold start and complete offline cache',async()=>{await page.getByText('✓ Ready offline · back up regularly',{exact:true}).waitFor({timeout:60000});assert.equal(errors.length,0,errors.join('\n'));});
  await check('create notebook, metadata, and save ink',async()=>{
    await page.locator('#new-book').click();await body().locator('[name=title]').fill('QA field journal');await body().locator('[name=folder]').fill('QA');await page.locator('#dialog-ok').click();await page.locator('#paper').waitFor();
    const b=await page.locator('#paper').boundingBox();await page.mouse.move(b.x+100,b.y+100);await page.mouse.down();await page.mouse.move(b.x+250,b.y+150,{steps:18});await page.mouse.up();await ready();
    const book=await savedBook();assert.equal(book.folder,'QA');assert.equal(book.pages[0].objects.length,1);assert.ok(book.pages[0].objects[0].points.length>=2);
  });
  await check('undo, redo, text, selection copy and resize',async()=>{
    await page.locator('#undo').click();await ready();assert.equal((await savedBook()).pages[0].objects.length,0);await page.locator('#redo').click();await ready();
    await page.locator('[data-tool=text]').click();const b=await page.locator('#paper').boundingBox();await page.mouse.click(b.x+100,b.y+210);await body().locator('[name=text]').fill('FIELDNOTE ROUNDTRIP\nA note worth keeping.');await page.locator('#dialog-ok').click();await ready();
    await page.locator('#objects').click();await page.locator('[data-object="1"]').click();await page.locator('#copy').click();await page.locator('#paste').click();await ready();await page.locator('#grow').click();await ready();
    const book=await savedBook();assert.equal(book.pages[0].objects.length,3);assert.ok(book.pages[0].objects[2].size>24);
  });
  await check('page duplicate, reorder, and templates',async()=>{
    await page.getByRole('button',{name:'Duplicate page 1',exact:true}).click();await ready();await page.locator('#template').selectOption('grid');await ready();
    await page.getByRole('button',{name:'Move page 2 up',exact:true}).click();await ready();const book=await savedBook();assert.equal(book.pages.length,2);assert.equal(book.pages[0].template,'grid');assert.equal(book.pages[1].template,'ruled');
  });
  await check('PDF import, searchable source text, render, and flattened export',async()=>{
    const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);const p=doc.addPage([612,792]);p.drawText('PDF ROUNDTRIP SAMPLE',{x:70,y:700,size:24,font});const pdf=await doc.save(),file=path.join(out,'fixture.pdf');await writeFile(file,pdf);
    await page.locator('#file-pdf').setInputFiles(file);await page.waitForFunction(()=>document.getElementById('book-title').textContent==='fixture');await page.waitForFunction(()=>document.getElementById('page-status').textContent.includes('PDF'));
    const books=await page.evaluate(async()=>(await (await import('./storage.mjs')).allBooks()));assert.ok(books.find(b=>b.title==='fixture').pages[0].recognized.includes('PDF ROUNDTRIP SAMPLE'));
    await page.locator('#export').click();await page.locator('#dialog-ok').click();await page.locator('#save-export').waitFor();const downloaded=page.waitForEvent('download');await page.locator('#save-export').click();const dl=await downloaded;const bytes=await (await import('node:fs/promises')).readFile(await dl.path());const parsed=await PDFDocument.load(bytes);assert.equal(parsed.getPageCount(),1);assert.ok(bytes.length>1000);await page.locator('#dialog-ok').click();
  });
  await check('image import and PNG export',async()=>{
    await page.locator('#file-image').setInputFiles(path.join(root,'src/icon-192.png'));await page.waitForFunction(()=>document.querySelector('#editor').inert===false);await ready();
    const imported=await page.evaluate(async()=>(await (await import('./storage.mjs')).allBooks()).find(b=>b.title==='fixture'));assert.equal(imported.pages[0].objects.length,1);await page.locator('#pages .page-select img').waitFor();
    await page.locator('#export').click();await body().locator('[name=format]').selectOption('png');await page.locator('#dialog-ok').click();await page.locator('#save-export').waitFor();const downloaded=page.waitForEvent('download');await page.locator('#save-export').click();const dl=await downloaded;const bytes=await (await import('node:fs/promises')).readFile(await dl.path());assert.equal(bytes.subarray(1,4).toString(),'PNG');await page.locator('#dialog-ok').click();
  });
  await check('English OCR worker and bundled language data',async()=>{
    await page.locator('#recognize').click();await page.getByRole('heading',{name:'Recognized text',exact:true}).waitFor({timeout:120000});const value=await body().locator('textarea').inputValue();assert.match(value,/ROUNDTRIP|SAMPLE|PDF/i);await page.locator('#dialog-ok').click();
  });
  await check('fake microphone recording chunks and playback',async()=>{
    await page.locator('#record').click();await page.waitForFunction(()=>document.getElementById('record').classList.contains('recording'));await page.waitForTimeout(3200);await page.locator('#record').click();await page.waitForFunction(()=>document.getElementById('record').textContent==='● Record audio');
    const records=await page.evaluate(async()=>{const b=(await (await import('./storage.mjs')).allBooks()).find(b=>b.title==='fixture');return b.recordings;});assert.equal(records.length,1);assert.ok(records[0].assets.length>0);assert.ok(records[0].duration>=1000);
    await page.locator('#audio-list').click();await page.locator('[data-recording="0"]').click();await page.waitForFunction(()=>document.getElementById('player').readyState>=2);assert.ok(await page.locator('#audio-bar').isVisible());await page.locator('#close-audio').click();
  });
  await check('editable backup round trip and malformed backup rejection before writes',async()=>{
    const check=await page.evaluate(async()=>{
      const s=await import('./storage.mjs'),z=await import('./vendor/fflate.mjs');const before=(await s.allBooks()).length,bytes=await s.backupBytes(),data=await s.readBackup(bytes);const imported=await s.restoreBackup(data);const after=await s.allBooks();
      if(after.length!==before+data.books.length)throw new Error('Restore count mismatch');
      const source=data.books.find(b=>b.title==='fixture'),restored=imported.find(b=>b.title==='fixture (restored)');if(!restored||restored.id===source.id||restored.pages[0].background.asset===source.pages[0].background.asset)throw new Error('Restore did not remap identifiers');
      const broken=z.zipSync({'manifest.json':z.strToU8(JSON.stringify({version:1,books:[source],assets:[]}))});let rejected=false;try{await s.readBackup(broken);}catch{rejected=true;}if(!rejected)throw new Error('Missing assets accepted');if((await s.allBooks()).length!==after.length)throw new Error('Malformed backup changed the library');return {notebooks:data.books.length,assets:data.assets.length,bytes:bytes.length};
    });assert.ok(check.assets>=3);
    await page.locator('#backup').click();await page.locator('#save-export').waitFor();const downloaded=page.waitForEvent('download');await page.locator('#save-export').click();const dl=await downloaded;backupPath=path.join(out,'roundtrip.zip');await dl.saveAs(backupPath);await page.locator('#dialog-ok').click();
  });
  await check('offline cold reload retains notes, PDF, and workers',async()=>{
    await context.setOffline(true);await page.reload();await page.getByText('QA field journal',{exact:true}).first().waitFor();await page.locator('.book-open').filter({has:page.locator('.book-name',{hasText:/^fixture$/})}).first().click();await page.waitForFunction(()=>document.getElementById('page-status').textContent.includes('PDF'));assert.ok(await page.locator('#paper').evaluate(c=>c.width>0));
    const info=await page.evaluate(async()=>{const r=await fetch('./vendor/ocr/lang/eng.traineddata.gz');return {model:r.ok,books:(await (await import('./storage.mjs')).allBooks()).length};});assert.ok(info.model);assert.ok(info.books>=6);await context.setOffline(false);
  });
  await check('aborted storage transaction preserves prior library',async()=>{
    const result=await page.evaluate(async()=>{const s=await import('./storage.mjs'),m=await import('./model.mjs'),before=(await s.allBooks()).length;let caught=false;try{await s.transaction(['books'],'readwrite',tx=>{tx.objectStore('books').put(m.newBook('Must roll back'));throw new Error('Simulated failure');});}catch{caught=true;}return {caught,before,after:(await s.allBooks()).length};});assert.ok(result.caught);assert.equal(result.before,result.after);
  });
  await check('second window cannot overwrite the library',async()=>{const second=await context.newPage();await second.goto('http://127.0.0.1:4173/');await second.getByText('Another Fieldnote window is open.',{exact:false}).waitFor();assert.equal(await second.locator('#library').evaluate(el=>el.inert),true);await second.close();});
  await check('tablet and narrow layout, accessible control names, console',async()=>{
    for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:820});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false,`Horizontal body overflow at ${width}`);}
    assert.equal(errors.length,0,errors.join('\n'));await page.setViewportSize({width:1180,height:820});await page.screenshot({path:path.join(root,'screenshots/editor.png')});await page.locator('#back').click();await page.screenshot({path:path.join(root,'screenshots/library.png')});
  });
}catch(e){console.error(e);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(path.join(out,'browser-results.json'),JSON.stringify({date:new Date().toISOString(),browser:'Headless Microsoft Edge; isolated temporary context; fake microphone',results,pageErrors:errors},null,2));await browser.close();}
