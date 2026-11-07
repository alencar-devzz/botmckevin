/* Pushdeck service worker: abre offline e atualiza sozinho */
const V='pushdeck-v2',SHELL=['./','./index.html','./manifest.json','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.hostname==='api.github.com'||u.hostname==='api.anthropic.com')return;               /* API do GitHub: sempre direto */
 if(u.origin===location.origin){                                          /* app: rede primeiro, cache se offline */
  e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x}).catch(()=>caches.match(r).then(m=>m||caches.match('./index.html'))));return}
 if(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(u.hostname)){   /* fontes e jszip: cache primeiro */
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(x=>{const c=x.clone();caches.open(V).then(k=>k.put(r,c));return x})))}});
