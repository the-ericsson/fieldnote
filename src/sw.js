const CACHE='__CACHE__';
const ASSETS=__ASSETS__;
const URLs=ASSETS.map(p=>new URL(p,self.registration.scope).href);
const known=new Set(URLs);
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(let i=0;i<URLs.length;i+=6)await Promise.all(URLs.slice(i,i+6).map(async url=>{
    const response=await fetch(url,{cache:'reload',credentials:'same-origin'});
    if(!response.ok||new URL(response.url).origin!==self.location.origin)throw new Error('Offline asset not available: '+url);
    const ext=new URL(url).pathname.split('.').pop(),type=response.headers.get('content-type')||'';
    if(['js','mjs'].includes(ext)&&!/javascript/.test(type))throw new Error('Invalid offline script.');
    if(ext!=='html'&&/text\/html/.test(type))throw new Error('Offline asset returned a sign-in page.');
    if(ext==='html'&&!(await response.clone().text()).includes('id="paper"'))throw new Error('Not the app shell.');
    await cache.put(url,response);
  }));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('fieldnote-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const url=new URL(event.request.url);url.search='';
  if(event.request.mode==='navigate'&&url.pathname===new URL(self.registration.scope).pathname){event.respondWith(caches.open(CACHE).then(async c=>(await c.match(new URL('./index.html',self.registration.scope).href))||fetch(event.request)));return;}
  if(known.has(url.href))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.href))||fetch(event.request)));
});
self.addEventListener('message',event=>{if(event.data?.type==='STATUS')event.waitUntil((async()=>{const c=await caches.open(CACHE);const keys=new Set((await c.keys()).map(r=>r.url));event.ports[0]?.postMessage({ready:URLs.every(url=>keys.has(url)),version:CACHE});})());});
