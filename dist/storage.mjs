import {VERSION,validateBook,assetIds} from './model.mjs';
let dbPromise;
export function database() {
  return dbPromise ||= new Promise((resolve,reject)=>{
    const req=indexedDB.open('fieldnote',1);
    req.onupgradeneeded=()=>{req.result.createObjectStore('books',{keyPath:'id'});req.result.createObjectStore('assets',{keyPath:'id'});};
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
    req.onerror=()=>{dbPromise=null;reject(req.error);};
    req.onblocked=()=>reject(new Error('Close other Fieldnote tabs to finish opening storage.'));
  });
}
export async function transaction(stores,mode,action) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let result;
    tx.oncomplete=()=>resolve(result?.result ?? result);
    tx.onerror=tx.onabort=()=>reject(tx.error || new Error('Storage operation failed. Your current edits are still in memory.'));
    try {result=action(tx);}catch(e){tx.abort();reject(e);}
  });
}
export const allBooks=()=>transaction(['books'],'readonly',tx=>tx.objectStore('books').getAll());
export const allAssets=()=>transaction(['assets'],'readonly',tx=>tx.objectStore('assets').getAll());
export const getAsset=id=>transaction(['assets'],'readonly',tx=>tx.objectStore('assets').get(id));
export function saveBook(book) { validateBook(book);return transaction(['books'],'readwrite',tx=>tx.objectStore('books').put(book)); }
export const putAsset=(id,blob)=>transaction(['assets'],'readwrite',tx=>tx.objectStore('assets').put({id,blob}));
export const deleteBook=id=>transaction(['books'],'readwrite',tx=>tx.objectStore('books').delete(id));
export async function backupBytes() {
  const {zipSync,strToU8}=await import('./vendor/fflate.mjs');
  const [books,assets]=await transaction(['books','assets'],'readonly',tx=>{const b=tx.objectStore('books').getAll(),a=tx.objectStore('assets').getAll();const result=[];b.onsuccess=()=>result[0]=b.result;a.onsuccess=()=>result[1]=a.result;return result;});
  const used=new Set(books.flatMap(assetIds));const included=assets.filter(a=>used.has(a.id));
  if(included.length!==used.size)throw new Error('Some notebook attachments are missing. Keep this tab open and restore a previous backup.');
  const files={'manifest.json':strToU8(JSON.stringify({version:VERSION,books,assets:included.map(a=>({id:a.id,type:a.blob.type}))}))};
  for(const a of included)files['assets/'+a.id]=new Uint8Array(await a.blob.arrayBuffer());
  return zipSync(files,{level:0});
}
export async function readBackup(bytes) {
  if(bytes.byteLength>150*1024*1024)throw new Error('Backup exceeds the 150 MB import limit.');
  const {unzipSync,strFromU8}=await import('./vendor/fflate.mjs');let total=0,count=0;
  const files=unzipSync(bytes,{filter:f=>{total+=f.originalSize; if(++count>25000||!Number.isFinite(total)||total>300*1024*1024)throw new Error('Expanded backup exceeds safe import limits.');return true;}});
  if(!files['manifest.json']||files['manifest.json'].length>30*1024*1024)throw new Error('Missing or oversized backup manifest.');
  const m=JSON.parse(strFromU8(files['manifest.json']));
  if(m.version!==VERSION||!Array.isArray(m.books)||m.books.length>1000||!Array.isArray(m.assets)||m.assets.length>20000)throw new Error('Unsupported or invalid backup.');
  m.books.forEach(validateBook);
  if(new Set(m.books.map(b=>b.id)).size!==m.books.length)throw new Error('Duplicate notebook IDs.');
  const ids=new Set();const assets=m.assets.map(a=>{
    if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(a.id)||ids.has(a.id)||typeof a.type!=='string'||a.type.length>100||!files['assets/'+a.id])throw new Error('Invalid, duplicate, or missing asset.');
    ids.add(a.id);return {id:a.id,blob:new Blob([files['assets/'+a.id]],{type:a.type})};
  });
  if(m.books.some(b=>assetIds(b).some(id=>!ids.has(id))))throw new Error('Backup is missing referenced media.');
  return {books:m.books,assets};
}
export async function restoreBackup(data) {
  // Restore as copies: a backup never overwrites existing notebooks or media.
  const remap=new Map(data.assets.map(a=>[a.id,crypto.randomUUID()]));
  const books=structuredClone(data.books).map(b=>{
    b.id=crypto.randomUUID();b.title+=' (restored)';
    for(const p of b.pages){if(p.background)p.background.asset=remap.get(p.background.asset);for(const o of p.objects)if(o.kind==='image')o.asset=remap.get(o.asset);}
    for(const r of b.recordings)r.assets=r.assets.map(id=>remap.get(id));validateBook(b);return b;
  });
  await transaction(['books','assets'],'readwrite',tx=>{
    for(const a of data.assets)tx.objectStore('assets').put({id:remap.get(a.id),blob:a.blob});
    for(const b of books)tx.objectStore('books').put(b);
  });return books;
}
