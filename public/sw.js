const PREFIX="toyota-reading-room-";
const REVISION="__BUILD_REVISION__";
let currentCache=PREFIX+REVISION;
async function cacheName(){return currentCache;}
self.addEventListener("install",event=>{event.waitUntil((async()=>{
 const response=await fetch("/offline-assets.json",{cache:"no-store"});if(!response.ok)throw new Error("Offline manifest unavailable");const manifest=await response.json();currentCache=PREFIX+manifest.revision;const cache=await caches.open(currentCache);
 try{for(let i=0;i<manifest.urls.length;i+=15)await cache.addAll(manifest.urls.slice(i,i+15));await cache.put("/__reader-ready",new Response("ready"));}catch(e){await caches.delete(currentCache);throw e;}
})());});
self.addEventListener("activate",event=>{event.waitUntil((async()=>{if(!currentCache){const names=await caches.keys();currentCache=names.filter(n=>n.startsWith(PREFIX)).at(-1);}for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==currentCache)await caches.delete(name);await self.clients.claim();for(const client of await self.clients.matchAll())client.postMessage({type:"READER_READY"});})());});
self.addEventListener("message",event=>{if(event.data?.type==="CHECK_READY")event.waitUntil((async()=>{const name=await cacheName();if(name&&(await(await caches.open(name)).match("/__reader-ready")))event.source?.postMessage({type:"READER_READY"});})());});
self.addEventListener("fetch",event=>{
 const u=new URL(event.request.url);if(event.request.method!=="GET"||u.origin!==self.location.origin||u.pathname.startsWith("/api/")||u.pathname.includes("chatgpt")||u.searchParams.has("_rsc"))return;
 if(event.request.mode==="navigate"){if(u.pathname!=="/")return;event.respondWith(fetch(event.request).catch(async()=>{const name=await cacheName();return(name&&(await(await caches.open(name)).match("/")))||new Response("Connect once to prepare this reading room.",{status:503});}));return;}
 event.respondWith((async()=>{const name=await cacheName();return(name&&(await(await caches.open(name)).match(event.request)))||fetch(event.request);})());
});
