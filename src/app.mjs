import {uid,clone,newBook,newPage,validateBook,bounds,unionBounds,selectedBy,transform,eraserHit,searchable} from './model.mjs';
import {allBooks,saveBook,putAsset,getAsset,deleteBook,backupBytes,readBackup,restoreBackup} from './storage.mjs';
import {Renderer,loadPDF,pdfjs} from './render.mjs';
const $=id=>document.getElementById(id), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let books=[],book=null,page=null,folder='',tool='pen',selection=[],clipboard=[],history=new Map(),gesture=null,drawQueued=false;
let saveQueue=Promise.resolve(),saveVersion=0,saveFailed=false,recording=null,audioQueue=Promise.resolve(),audioURL=null,replayRecord=null,ocrWorker=null,ocrBusy=false;
const renderer=new Renderer($('paper')),pointers=new Map();let lastPen=0,toastTimer,appendPDF=false,loading=false;
const thumbnails=new Map();let thumbnailGeneration=0;
function toast(message,permanent=false){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);if(!permanent)toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function fail(e){console.error(e);toast(e?.message||String(e),true);}
function listen(id,event,fn){$(id).addEventListener(event,e=>{try{Promise.resolve(fn(e)).catch(fail);}catch(err){fail(err);}});}
function dialog(title,html,ok='Save'){
  if($('dialog').open)throw new Error('Finish the open dialog first.');
  $('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog-ok').textContent=ok;$('dialog').returnValue='';$('dialog').showModal();
  return new Promise(resolve=>$('dialog').addEventListener('close',()=>resolve($('dialog').returnValue==='ok'?new FormData($('dialog-form')):null),{once:true}));
}
function draw(){if(!drawQueued){drawQueued=true;requestAnimationFrame(()=>{drawQueued=false;renderer.draw({draft:gesture?.draft,selection,polygon:gesture?.polygon||[],cutoff:replayRecord&&$('replay').checked?replayRecord.startedAt+$('player').currentTime*1000:Infinity});});}}
function state(){return {objects:clone(page.objects),template:page.template,recognized:page.recognized};}
function historyFor(){if(!history.has(page.id))history.set(page.id,{past:[],future:[]});return history.get(page.id);}
function checkpoint(before){const h=historyFor();h.past.push(before);if(h.past.length>40)h.past.shift();h.future=[];}
function status(message){$('save-status').textContent=message;}
function persist(){
  if(!book)return Promise.resolve();book.updated=Date.now();const snapshot=clone(book),v=++saveVersion;status('Saving…');
  const task=saveQueue.then(()=>saveBook(snapshot));
  saveQueue=task.catch(e=>{saveFailed=true;status('Not saved — keep this tab open');fail(e);});
  task.then(()=>{if(v===saveVersion){saveFailed=false;status('Saved locally');}},()=>{});return task;
}
async function committed(before,prepare=false){checkpoint(before);thumbnails.delete(page.id);await persist();if(prepare)await preparePage();else draw();renderPages();renderSelection();}
function setTool(value){tool=value;selection=[];for(const b of document.querySelectorAll('[data-tool]')){b.classList.toggle('chosen',b.dataset.tool===tool);b.setAttribute('aria-pressed',String(b.dataset.tool===tool));}renderSelection();draw();}
function renderSelection(){
  $('selection-controls').hidden=tool!=='lasso';$('selected-count').textContent=`${selection.length} selected`;
  for(const id of ['copy','shrink','grow','delete-selection'])$(id).disabled=!selection.length;
  $('paste').disabled=!clipboard.length;$('edit-text').disabled=selection.length!==1||page?.objects.find(o=>o.id===selection[0])?.kind!=='text';
}
function renderLibrary(){
  $('book-count').textContent=books.length;$('location').textContent=folder||'All notebooks';$('collection-name').textContent=folder||'All notebooks';
  const folders=[...new Set(books.map(b=>b.folder).filter(Boolean))].sort();$('folders').replaceChildren();
  for(const f of folders){const btn=document.createElement('button');btn.className='nav'+(folder===f?' active':'');btn.textContent='▱  '+f;btn.onclick=()=>{folder=f;renderLibrary();};$('folders').append(btn);}
  $('all-notes').classList.toggle('active',!folder);
  const q=$('search').value.toLowerCase().trim(),sort=$('sort').value;
  const found=books.filter(b=>(!folder||b.folder===folder)&&(!q||searchable(b).includes(q))).sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):b[sort]-a[sort]);
  $('result-count').textContent=`${found.length} notebook${found.length===1?'':'s'}`;$('notebooks').replaceChildren();
  for(const b of found){const card=document.createElement('article');card.className='notebook-card';
    card.innerHTML=`<button class="book-open"><div class="book-cover" style="--cover:${b.color}"><div class="cover-label">${esc(b.title)}<small>FIELD NOTES</small></div></div><span class="book-name">${esc(b.title)}</span></button><p class="book-meta">${b.pages.length} page${b.pages.length===1?'':'s'} · ${new Date(b.updated).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</p><button class="book-menu" aria-label="Edit ${esc(b.title)} details">···</button>`;
    card.querySelector('.book-open').onclick=()=>openBook(b).catch(fail);card.querySelector('.book-menu').onclick=()=>details(b).catch(fail);$('notebooks').append(card);
  }
  if(q&&!found.length){const empty=document.createElement('p');empty.className='empty-results';empty.textContent='No matching notebooks. Try a title, folder, tag, or scanned text.';$('notebooks').append(empty);}
  const add=document.createElement('button');add.className='new-card';add.innerHTML='<span>＋</span>A fresh page awaits';add.onclick=()=>createBook().catch(fail);$('notebooks').append(add);
}
async function details(b){
  $('dialog').dataset.bookId=b.id;
  const data=await dialog('Notebook details',`<label>Title<input name="title" value="${esc(b.title)}" maxlength="300" required></label><label>Folder<input name="folder" value="${esc(b.folder)}" maxlength="300" list="folder-options"></label><datalist id="folder-options">${[...new Set(books.map(b=>b.folder))].map(f=>`<option value="${esc(f)}">`).join('')}</datalist><label>Tags, separated by commas<input name="tags" value="${esc(b.tags.join(', '))}" maxlength="1000"></label><label>Cover color<input name="color" type="color" value="${b.color}"></label><p><button type="button" id="delete-book" class="danger">Delete notebook…</button></p>`);
  if(data){const next=clone(b);next.title=String(data.get('title')).trim()||'Untitled notebook';next.folder=String(data.get('folder')).trim();next.tags=String(data.get('tags')).split(',').map(t=>t.trim()).filter(Boolean);next.color=data.get('color');next.updated=Date.now();validateBook(next);await saveQueue;await saveBook(next);Object.assign(b,next);if(book?.id===b.id)$('book-title').textContent=b.title;renderLibrary();}
}
// Delegation keeps the delete button working in dynamically rendered dialogs.
$('dialog-body').addEventListener('click',async e=>{if(e.target.id!=='delete-book')return;const b=books.find(b=>b.id===$('dialog').dataset.bookId);if(!b)return;$('dialog').close('cancel');setTimeout(async()=>{try{const yes=await dialog('Delete notebook?',`<p>Delete “${esc(b.title)}” from this device? Export a backup first if you may need it later.</p>`,'Delete');if(yes){if(recording&&book?.id===b.id)throw new Error('Stop recording before deleting this notebook.');await saveQueue;if(saveFailed)throw new Error('Resolve unsaved edits before deleting.');await deleteBook(b.id);books=books.filter(x=>x.id!==b.id);if(book?.id===b.id)await leaveEditor();renderLibrary();}}catch(err){fail(err);}},0);});
async function createBook(){
  const data=await dialog('A new notebook',`<label>Notebook title<input name="title" placeholder="An idea worth keeping" maxlength="300" required autofocus></label><label>Folder<input name="folder" value="${esc(folder)}" maxlength="300"></label><label>Cover color<input name="color" type="color" value="#476656"></label><label>Paper<select name="template"><option value="ruled">Ruled</option><option value="blank">Blank</option><option value="grid">Grid</option><option value="dots">Dots</option></select></label>`,'Create notebook');
  if(!data)return;const b=newBook(String(data.get('title')).trim()||'Untitled notebook');b.folder=String(data.get('folder')).trim();b.color=data.get('color');b.pages[0].template=data.get('template');await saveBook(b);books.push(b);renderLibrary();await openBook(b);
}
async function openBook(b){
  if(loading)return;if(recording)throw new Error('Stop the recording before opening another notebook.');loading=true;
  try{await saveQueue;if(saveFailed)throw new Error('Current edits have not saved. Export a backup or retry before switching notebooks.');book=b;page=b.pages[0];selection=[];$('library').hidden=true;$('editor').hidden=false;document.body.classList.add('editing');$('book-title').textContent=b.title;$('audio-count').textContent=b.recordings.length;status('Saved locally');await preparePage();renderPages();}finally{loading=false;}
}
async function leaveEditor(){if(recording)throw new Error('Stop recording before leaving the notebook.');await saveQueue;if(saveFailed)throw new Error('Edits are not saved. Keep this tab open and back up the library.');$('player').pause();$('audio-bar').hidden=true;replayRecord=null;book=null;page=null;$('editor').hidden=true;$('library').hidden=false;document.body.classList.remove('editing');renderLibrary();}
async function preparePage(){if(!page)return;selection=[];$('template').value=page.template;$('template').disabled=!!page.background;await renderer.prepare(page);draw();applyZoom();renderSelection();$('page-status').textContent=`Page ${book.pages.indexOf(page)+1} of ${book.pages.length} · ${page.background?'PDF':page.template+' paper'}`;}
function renderPages(){
  if(!book)return;$('pages').replaceChildren();book.pages.forEach((p,i)=>{
    const d=document.createElement('div');d.className='page-item';d.innerHTML=`<button class="page-select ${p.id===page.id?'active':''}" aria-label="Open page ${i+1}"><span>${p.background?'▤':'▥'}<small>${p.objects.length} objects</small></span></button><span class="page-label">${i+1}${p.background?' · PDF':''}</span><div class="page-actions"><button data-action="up" aria-label="Move page ${i+1} up" ${i===0?'disabled':''}>↑</button><button data-action="down" aria-label="Move page ${i+1} down" ${i===book.pages.length-1?'disabled':''}>↓</button><button data-action="duplicate" aria-label="Duplicate page ${i+1}">⧉</button><button data-action="delete" aria-label="Delete page ${i+1}">×</button></div>`;
    d.querySelector('.page-select').onclick=async()=>{try{if(gesture)return;page=p;await preparePage();renderPages();}catch(e){fail(e);}};
    d.querySelectorAll('[data-action]').forEach(btn=>btn.onclick=()=>pageAction(p,btn.dataset.action).catch(fail));$('pages').append(d);
  });$('audio-count').textContent=book.recordings.length;
  const generation=++thumbnailGeneration,listed=book.pages.slice(),buttons=[...$('pages').querySelectorAll('.page-select')];
  (async()=>{for(let i=0;i<listed.length;i++){
    if(generation!==thumbnailGeneration)return;const p=listed[i];let src=thumbnails.get(p.id);
    if(!src){const c=document.createElement('canvas'),r=new Renderer(c);await r.prepare(p,.14);r.draw();src=c.toDataURL('image/jpeg',.7);thumbnails.set(p.id,src);}
    if(generation!==thumbnailGeneration)return;const image=new Image();image.src=src;image.alt='';buttons[i].replaceChildren(image);
  }})().catch(e=>console.warn('Page thumbnail unavailable:',e.message));
}
async function pageAction(p,action){
  if(gesture)return;const i=book.pages.indexOf(p);
  if(action==='delete'){
    if(book.pages.length===1)throw new Error('Keep at least one page in each notebook.');
    if(!await dialog('Delete page?',`<p>Delete page ${i+1}? This cannot be undone. Recordings remain in the notebook.</p>`,'Delete page'))return;
    book.pages.splice(i,1);if(page===p)page=book.pages[Math.min(i,book.pages.length-1)];
  }else if(action==='duplicate'){if(book.pages.length>=500)throw new Error('Notebook page limit reached.');const copy=clone(p);copy.id=uid();copy.objects.forEach(o=>o.id=uid());book.pages.splice(i+1,0,copy);page=copy;}
  else {const next=i+(action==='up'?-1:1);if(next<0||next>=book.pages.length)return;[book.pages[i],book.pages[next]]=[book.pages[next],book.pages[i]];}
  await persist();await preparePage();renderPages();
}
function applyZoom(){if(!page)return;const fit=$('zoom').value==='fit';const wrap=$('paper').parentElement;wrap.style.width=fit?'100%':`${page.width*Number($('zoom').value)}px`;wrap.style.maxWidth=fit?`${page.width}px`:'none';}
function point(e){const r=$('paper').getBoundingClientRect();return [(e.clientX-r.left)/r.width*page.width,(e.clientY-r.top)/r.height*page.height,e.pointerType==='pen'&&e.pressure>0?e.pressure:.5,Date.now()];}
function baseObject(kind){return {id:uid(),kind,createdAt:Date.now(),color:$('color').value,width:Number($('width').value)};}
function inputAllowed(e){if(e.pointerType==='pen'){lastPen=Date.now();return true;}return e.pointerType==='mouse'||($('finger').checked&&Date.now()-lastPen>700);}
$('paper').addEventListener('pointerdown',e=>{
  if(!page||loading||$('replay').checked&&replayRecord)return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>1){if(gesture?.before)Object.assign(page,gesture.before);gesture=null;draw();return;}
  if(!inputAllowed(e))return;e.preventDefault();$('paper').setPointerCapture(e.pointerId);const p=point(e);
  if(tool==='text'){editText(null,p).catch(fail);return;}
  const before=state();gesture={id:e.pointerId,start:p,before,moved:false};
  if(tool==='pen'||tool==='highlight')gesture.draft={...baseObject('ink'),highlight:tool==='highlight',width:Number($('width').value)*(tool==='highlight'?4:1),points:[p]};
  else if(tool==='shape')gesture.draft={...baseObject('shape'),shape:$('shape').value,x:p[0],y:p[1],w:1,h:1};
  else if(tool==='lasso'){
    const b=unionBounds(page.objects.filter(o=>selection.includes(o.id)));
    if(b&&p[0]>=b.x-8&&p[0]<=b.x+b.w+8&&p[1]>=b.y-8&&p[1]<=b.y+b.h+8)gesture.moving=true;
    else{selection=[];gesture.polygon=[p];renderSelection();}
  }else if(tool==='erase'){page.objects=page.objects.filter(o=>!eraserHit(o,p,12));gesture.moved=page.objects.length!==before.objects.length;}
  draw();
});
$('paper').addEventListener('pointermove',e=>{
  const previous=pointers.get(e.pointerId);if(previous)pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>1){if(previous){$('paper-scroll').scrollLeft-=e.clientX-previous.x;$('paper-scroll').scrollTop-=e.clientY-previous.y;}return;}
  if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();const p=point(e),g=gesture;
  if(g.draft?.kind==='ink'){for(const event of e.getCoalescedEvents?.()||[e])g.draft.points.push(point(event));}
  else if(g.draft){g.draft.x=Math.min(g.start[0],p[0]);g.draft.y=Math.min(g.start[1],p[1]);g.draft.w=Math.max(1,Math.abs(p[0]-g.start[0]));g.draft.h=Math.max(1,Math.abs(p[1]-g.start[1]));}
  else if(tool==='erase'){const old=page.objects.length;page.objects=page.objects.filter(o=>!eraserHit(o,p,12));g.moved ||= old!==page.objects.length;}
  else if(g.moving){page.objects=clone(g.before.objects);for(const o of page.objects)if(selection.includes(o.id))transform(o,p[0]-g.start[0],p[1]-g.start[1]);g.moved=true;}
  else if(g.polygon)g.polygon.push(p);draw();
});
async function finishPointer(e,cancel=false){
  pointers.delete(e.pointerId);if(!gesture||gesture.id!==e.pointerId)return;const g=gesture;gesture=null;
  if(cancel){Object.assign(page,g.before);draw();return;}
  if(g.polygon){if(g.polygon.length>2)selection=page.objects.filter(o=>selectedBy(o,g.polygon)).map(o=>o.id);renderSelection();draw();return;}
  if(g.draft){page.objects.push(g.draft);g.moved=true;}
  if(g.moved)await committed(g.before);else draw();
}
for(const ev of ['pointerup','pointercancel','lostpointercapture'])$('paper').addEventListener(ev,e=>finishPointer(e,ev!=='pointerup').catch(fail));
async function editText(o,p){
  const data=await dialog(o?'Edit text':'Add text',`<label>Note text<textarea name="text" maxlength="100000" autofocus>${esc(o?.text||'')}</textarea></label><label>Text size<input name="size" type="number" min="8" max="160" value="${o?.size||24}"></label>`);
  if(!data)return;const text=String(data.get('text'));if(!text.trim())return;const size=Number(data.get('size'));const before=state();
  if(!o){o={...baseObject('text'),x:p[0],y:p[1],w:1,h:1};page.objects.push(o);}o.text=text;o.size=size;o.w=Math.max(20,...text.split('\n').map(line=>line.length*size*.6));o.h=text.split('\n').length*size*1.3;
  try{validateBook(book);}catch(e){Object.assign(page,before);throw new Error('Text box is too large. Split long text into smaller boxes.');}await committed(before);
}
async function undo(redo=false){if(!page||gesture)return;const h=historyFor(),from=redo?h.future:h.past,to=redo?h.past:h.future;if(!from.length)return;to.push(state());Object.assign(page,from.pop());thumbnails.delete(page.id);selection=[];await persist();await preparePage();renderPages();}
async function scaleSelection(scale){const items=page.objects.filter(o=>selection.includes(o.id)),anchor=unionBounds(items);if(!anchor)return;const before=state();for(const o of items)transform(o,0,0,scale,anchor);try{validateBook(book);}catch(e){Object.assign(page,before);throw e;}await committed(before);}
async function paste(){if(!clipboard.length)return;const before=state();selection=[];for(const original of clipboard){const o=clone(original);o.id=uid();o.createdAt=Date.now();transform(o,24,24);if(o.kind==='ink')o.points.forEach(p=>p[3]=Date.now());page.objects.push(o);selection.push(o.id);}await committed(before);}
async function importImage(file){
  if(!file)return;if(file.size>25*1024*1024)throw new Error('Choose an image smaller than 25 MB.');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Use PNG, JPEG, or WebP images.');
  const url=URL.createObjectURL(file),img=new Image();try{img.src=url;await img.decode();if(img.width*img.height>30000000)throw new Error('Image exceeds 30 megapixels.');const id=uid();await putAsset(id,file);const before=state(),w=Math.min(img.width,page.width*.7);page.objects.push({id:uid(),kind:'image',createdAt:Date.now(),asset:id,x:page.width*.1,y:100,w,h:w/img.width*img.height});await committed(before,true);}finally{URL.revokeObjectURL(url);}
}
async function importPDF(file){
  if(!file)return;if(file.size>75*1024*1024)throw new Error('Choose a PDF smaller than 75 MB. Split larger files first.');
  toast('Reading PDF…',true);const id=uid();const lib=await pdfjs();const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});task.onPassword=()=>task.destroy();let doc;
  try{
    doc=await task.promise;if(doc.numPages>250)throw new Error('Import up to 250 PDF pages at a time.');
    if(appendPDF&&book.pages.length+doc.numPages>500)throw new Error('The notebook would exceed 500 pages.');
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const p=await doc.getPage(i),view=p.getViewport({scale:1}),np=newPage('blank');np.width=800;np.height=Math.round(view.height/view.width*800);np.background={asset:id,page:i};
      try{const text=await p.getTextContent();np.recognized=text.items.map(t=>t.str||'').join(' ');}catch{np.recognized='';}pages.push(np);p.cleanup();
    }
    const next=appendPDF?clone(book):newBook(file.name.replace(/\.pdf$/i,''));if(appendPDF)next.pages.push(...pages);else next.pages=pages;validateBook(next);
    await putAsset(id,file);await saveBook(next);
    if(appendPDF){Object.assign(book,next);page=book.pages[book.pages.length-pages.length];await preparePage();renderPages();}
    else{books.push(next);await openBook(next);}toast(`Imported ${pages.length} PDF pages.`);
  }catch(e){throw new Error('PDF import failed. Encrypted or damaged files must be unlocked or repaired first. '+e.message);}finally{await doc?.destroy();}
}
async function download(blob,name){
  const url=URL.createObjectURL(blob),file=new File([blob],name,{type:blob.type});
  const promise=dialog('Your export is ready',`<p>${esc(name)}</p><p><a class="download-link" id="save-export">Save file</a> <button type="button" id="share-export" hidden>Share…</button></p><p>Save a copy to Files or another location outside this browser.</p>`,'Done');
  $('save-export').href=url;$('save-export').download=name;
  if(navigator.canShare?.({files:[file]})){$('share-export').hidden=false;$('share-export').onclick=()=>navigator.share({files:[file]}).catch(e=>{if(e.name!=='AbortError')fail(e);});}
  await promise;setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const filename=s=>s.replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,100)||'Notebook';
async function exportBook(){
  const data=await dialog('Export your notes','<label>Format<select name="format"><option value="pdf">Entire notebook as PDF</option><option value="png">Current page as PNG</option><option value="backup">Editable library backup (.zip)</option></select></label><p>PDF and PNG exports flatten the page artwork. Keep an editable backup to preserve ink, audio, and original attachments.</p>','Export');
  if(!data)return;if(data.get('format')==='backup')return backup();toast('Preparing export…',true);
  const canvas=document.createElement('canvas'),r=new Renderer(canvas);
  if(data.get('format')==='png'){await r.prepare(page,1.5);r.draw();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await download(blob,filename(book.title)+'.png');}
  else {const doc=await PDFLib.PDFDocument.create();for(const p of book.pages){await r.prepare(p,1.5);r.draw();const png=await doc.embedPng(canvas.toDataURL('image/png'));const out=doc.addPage([p.width*.75,p.height*.75]);out.drawImage(png,{x:0,y:0,width:out.getWidth(),height:out.getHeight()});}await download(new Blob([await doc.save()],{type:'application/pdf'}),filename(book.title)+'.pdf');}toast('Export ready. Save it to Files.');
}
async function backup(){await saveQueue;if(saveFailed&&book){await saveBook(clone(book));saveFailed=false;status('Saved locally');}const bytes=await backupBytes();await download(new Blob([bytes],{type:'application/zip'}),`Fieldnote-${new Date().toISOString().slice(0,10)}.zip`);toast('Backup exported. Keep a copy outside this browser.');}
async function restore(file){
  if(!file)return;const data=await readBackup(new Uint8Array(await file.arrayBuffer()));
  if(!await dialog('Restore backup?',`<p>Restore ${data.books.length} notebooks as new copies? Existing notes will remain unchanged.</p>`,'Restore copies'))return;
  const restored=await restoreBackup(data);books.push(...restored);renderLibrary();toast(`Restored ${restored.length} notebook copies.`);
}
async function toggleRecording(){
  if(recording){const current=recording;current.recorder.stop();$('record').disabled=true;return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Audio recording requires a supported browser and an HTTPS connection.');
  $('record').disabled=true;let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
    const r={id:uid(),pageId:page.id,startedAt:Date.now(),mime:recorder.mimeType,duration:0,assets:[]};book.recordings.push(r);recording={recorder,stream,r};await persist();
    recorder.ondataavailable=e=>{if(!e.data.size)return;const duration=Date.now()-r.startedAt;audioQueue=audioQueue.then(async()=>{const id=uid();await putAsset(id,e.data);r.assets.push(id);r.duration=duration;await persist();}).catch(fail);};
    recorder.onerror=e=>{fail(new Error('Recording was interrupted. Saved audio chunks remain available.'));if(recorder.state!=='inactive')recorder.stop();};
    recorder.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());await audioQueue;recording=null;$('record').disabled=false;$('record').textContent='● Record audio';$('record').classList.remove('recording');renderPages();toast('Recording saved. Keep the app open while recording.');};
    recorder.start(1500);$('record').textContent='■ Stop recording';$('record').classList.add('recording');toast('Recording. Keep Fieldnote open and the iPad unlocked.');
  }catch(e){stream?.getTracks().forEach(t=>t.stop());recording=null;throw new Error('Could not start recording. Check microphone permission. '+e.message);}finally{$('record').disabled=false;}
}
async function recordings(){
  const rs=book.recordings;
  const promise=dialog('Audio recordings',rs.length?`<div class="dialog-list">${rs.map((r,i)=>`<button type="button" data-recording="${i}">▶ ${new Date(r.startedAt).toLocaleString()} · ${Math.round(r.duration/1000)} seconds</button>`).join('')}</div><p>Replay reveals surviving ink by its original recording time. Edits and erased strokes are not historical snapshots.</p>`:'<p>No recordings yet. Tap Record audio while taking notes.</p>','Done');
  $('dialog-body').querySelectorAll('[data-recording]').forEach(btn=>btn.onclick=()=>{$('dialog').close('cancel');playRecording(rs[Number(btn.dataset.recording)]).catch(fail);});await promise;
}
async function playRecording(r){
  if(recording)throw new Error('Stop recording before playback.');
  const assets=await Promise.all(r.assets.map(getAsset));if(!assets.length||assets.some(a=>!a))throw new Error('This recording has no recoverable audio chunks.');
  if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(new Blob(assets.map(a=>a.blob),{type:r.mime}));$('player').src=audioURL;replayRecord=r;$('replay').checked=false;
  const target=book.pages.find(p=>p.id===r.pageId);if(target){page=target;await preparePage();renderPages();}
  $('audio-caption').textContent=new Date(r.startedAt).toLocaleTimeString();$('audio-bar').hidden=false;await $('player').play();
}
async function recognize(){
  if(ocrBusy)return;ocrBusy=true;const targetPage=page,targetBook=book;$('recognize').disabled=true;
  try{
    toast('Reading text locally. This can take a moment…',true);
    ocrWorker ||= await Tesseract.createWorker('eng',1,{workerPath:new URL('./vendor/ocr/worker.min.js',location.href).href,corePath:new URL('./vendor/ocr/',location.href).href,langPath:new URL('./vendor/ocr/lang/',location.href).href,workerBlobURL:false});
    const canvas=document.createElement('canvas'),r=new Renderer(canvas);await r.prepare(targetPage,1.5);r.draw();const result=await ocrWorker.recognize(canvas);
    targetPage.recognized=result.data.text;await saveQueue;await saveBook(clone(targetBook));toast('Scan saved for search. Review the text for recognition mistakes.');
    const data=await dialog('Recognized text',`<p>English print OCR runs on this device. Freeform handwriting accuracy is limited. Review and correct the result before using it.</p><label>Recognized text<textarea name="text">${esc(targetPage.recognized)}</textarea></label><label><input type="checkbox" name="insert"> Also insert as editable typed text</label>`,'Save text');
    if(data){targetPage.recognized=String(data.get('text'));if(data.has('insert'))targetPage.objects.push({id:uid(),kind:'text',createdAt:Date.now(),color:'#253c35',text:targetPage.recognized,size:20,x:80,y:80,w:640,h:Math.max(30,targetPage.recognized.split('\n').length*26)});await saveBook(clone(targetBook));if(page===targetPage)draw();}
  }finally{ocrBusy=false;$('recognize').disabled=false;}
}
async function objects(){
  const promise=dialog('Page objects',page.objects.length?`<p>Select an object to move, resize, copy, or delete it with the Lasso controls.</p><div class="dialog-list">${page.objects.map((o,i)=>`<button type="button" data-object="${i}">${i+1}. ${esc(o.kind==='text'?o.text.slice(0,65):o.kind==='shape'?o.shape:o.kind)}</button>`).join('')}</div>`:'<p>This page has no editable objects yet.</p>','Done');
  $('dialog-body').querySelectorAll('[data-object]').forEach(btn=>btn.onclick=()=>{setTool('lasso');selection=[page.objects[Number(btn.dataset.object)].id];renderSelection();draw();$('dialog').close('cancel');});await promise;
}
async function help(){await dialog('A little room for your ideas',`<p>Fieldnote keeps notes, PDFs, images, and audio in this browser on this device. No notes are sent to a server.</p><ol><li>On your iPad, open the hosted HTTPS link in Safari.</li><li>Tap Share → Add to Home Screen. Enable Open as Web App if offered, then tap Add.</li><li>Open Fieldnote from its icon, stay online until “Ready offline” appears, then test in Airplane Mode.</li></ol><p class="help-note">Use Back up library regularly and save the ZIP to Files. Browser storage can be cleared by the OS, deleting the app, or clearing website data. Autosave is not an external backup.</p><p>Keep Finger ink on for pencils that act as a finger. Turn it off only if your pencil is recognized as a pen. Two fingers pan the workspace; Zoom enlarges the paper. Lasso selects ink or objects; drag inside a selection to move it.</p><p>English OCR is local print recognition, with limited handwriting accuracy. Audio requires microphone access; keep the iPad unlocked and this app in the foreground. PDF exports are flattened; editable ZIP backups preserve original content.</p><p><button type="button" id="help-backup">Back up library</button> <button type="button" id="help-restore">Restore backup</button> <button type="button" id="request-storage">Request persistent storage</button></p><p id="storage-status"></p>`,'Done');}
$('dialog-body').addEventListener('click',e=>{if(e.target.id==='help-backup'){$('dialog').close();backup().catch(fail);}if(e.target.id==='help-restore'){$('dialog').close();$('file-backup').click();}if(e.target.id==='request-storage')(async()=>{const granted=await navigator.storage?.persist?.();$('storage-status').textContent=granted?'Persistent storage granted. External backups are still needed.':'Persistence was not granted. Keep external backups.';})().catch(fail);});
listen('new-book','click',createBook);listen('home','click',async e=>{e.preventDefault();if(book)await leaveEditor();folder='';renderLibrary();});listen('all-notes','click',async()=>{if(book)await leaveEditor();folder='';renderLibrary();});
listen('new-folder','click',async()=>{const d=await dialog('New folder','<label>Folder name<input name="folder" maxlength="300" required autofocus></label><p>The folder will be created with your next notebook.</p>','Continue');if(d){folder=String(d.get('folder')).trim();await createBook();}});
listen('search','input',renderLibrary);listen('sort','change',renderLibrary);listen('back','click',leaveEditor);listen('details','click',()=>details(book));listen('export','click',exportBook);
listen('backup','click',backup);listen('restore','click',()=>$('file-backup').click());listen('help','click',help);listen('about','click',help);
listen('import-pdf','click',()=>{appendPDF=false;$('file-pdf').click();});listen('append-pdf','click',()=>{appendPDF=true;$('file-pdf').click();});
async function locked(fn){$('library').inert=true;$('editor').inert=true;document.querySelector('.sidebar').inert=true;try{return await fn();}finally{$('library').inert=false;$('editor').inert=false;document.querySelector('.sidebar').inert=false;}}
for(const [id,fn] of [['file-pdf',importPDF],['file-image',importImage],['file-backup',restore]])listen(id,'change',async e=>{const file=e.target.files[0];e.target.value='';await locked(()=>fn(file));});
for(const btn of document.querySelectorAll('[data-tool]'))btn.onclick=()=>setTool(btn.dataset.tool);
listen('add-image','click',()=>$('file-image').click());listen('undo','click',()=>undo());listen('redo','click',()=>undo(true));listen('zoom','change',applyZoom);
listen('finger','change',()=>{$('paper').style.touchAction=$('finger').checked?'none':'pan-x pan-y';$('input-status').textContent=$('finger').checked?'Finger ink is on · use two fingers to scroll the workspace':'Pen only · fingers scroll (requires a detected pen)';});
listen('template','change',async()=>{const before=state();page.template=$('template').value;await committed(before,true);});
listen('add-page','click',async()=>{if(book.pages.length>=500)throw new Error('Notebook page limit reached.');page=newPage($('template').value);book.pages.push(page);await persist();await preparePage();renderPages();});
listen('copy','click',()=>{clipboard=clone(page.objects.filter(o=>selection.includes(o.id)));renderSelection();toast('Selection copied.');});listen('paste','click',paste);
listen('shrink','click',()=>scaleSelection(.85));listen('grow','click',()=>scaleSelection(1.15));listen('edit-text','click',()=>editText(page.objects.find(o=>o.id===selection[0])));
listen('delete-selection','click',async()=>{const before=state();page.objects=page.objects.filter(o=>!selection.includes(o.id));selection=[];await committed(before);});
listen('recognize','click',()=>locked(recognize));listen('record','click',toggleRecording);listen('audio-list','click',recordings);listen('objects','click',objects);
listen('player','timeupdate',draw);listen('replay','change',draw);listen('close-audio','click',()=>{$('player').pause();$('audio-bar').hidden=true;$('replay').checked=false;replayRecord=null;draw();});
document.addEventListener('keydown',e=>{if(!book||$('dialog').open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const mod=e.metaKey||e.ctrlKey;if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey).catch(fail);}else if(mod&&e.key.toLowerCase()==='c'){e.preventDefault();$('copy').click();}else if(mod&&e.key.toLowerCase()==='v'){e.preventDefault();paste().catch(fail);}else if(e.key==='Delete'||e.key==='Backspace'){if(selection.length){e.preventDefault();$('delete-selection').click();}}else if(e.key.toLowerCase()==='p')setTool('pen');else if(e.key.toLowerCase()==='l')setTool('lasso');});
window.addEventListener('beforeunload',e=>{if(saveFailed||$('save-status').textContent==='Saving…'||recording){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recording?.recorder.state==='recording')recording.recorder.requestData();});
async function offline(){
  if(!('serviceWorker'in navigator)){ $('offline-status').textContent='Offline install unavailable in this browser.';return;}
  try{
    await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;
    const channel=new MessageChannel();channel.port1.onmessage=e=>{$('offline-status').textContent=e.data.ready?'✓ Ready offline · back up regularly':'Offline cache incomplete. Reconnect and reload.';};
    const worker=navigator.serviceWorker.controller||(await navigator.serviceWorker.ready).active;worker.postMessage({type:'STATUS'},[channel.port2]);
  }catch(e){$('offline-status').textContent='Offline setup failed. Reconnect and reload.';console.error(e);}
}
async function start(){
  try{
    books=await allBooks();for(const b of books)validateBook(b);
    if(!books.length){const b=newBook('A place to begin');b.tags=['welcome'];b.pages[0].objects=[{id:uid(),kind:'text',createdAt:Date.now(),color:'#365c48',text:'A place to begin.',size:38,x:92,y:100,w:550,h:50},{id:uid(),kind:'text',createdAt:Date.now(),color:'#53635a',text:'Your next idea belongs here.\n\nWrite with your pencil, import a PDF,\nor add a recording while you take notes.\n\nUse Lasso to move and resize objects.\nKeep Finger ink on for a third-party pencil.\n\nBack up your library to Files regularly.\nYour notes stay in this browser on this device.',size:23,x:92,y:210,w:620,h:360}];await saveBook(b);books.push(b);}
    renderLibrary();offline();
  }catch(e){fail(new Error('Could not open your library. Do not clear website data. '+e.message));}
}
if(navigator.locks){
  navigator.locks.request('fieldnote-library-writer',{ifAvailable:true},async lock=>{
    if(!lock){books=await allBooks();renderLibrary();$('library').inert=true;document.querySelector('.sidebar').inert=true;toast('Another Fieldnote window is open. Close it and reload this window to edit safely.',true);return;}
    await start();await new Promise(()=>{});
  }).catch(fail);
}else start();
