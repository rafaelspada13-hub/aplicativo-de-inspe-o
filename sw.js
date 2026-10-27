/* Service worker do app de inspeção New Válvulas.
   Com internet: busca sempre a versão mais nova (e guarda uma cópia).
   Sem internet (ou rede travada por mais de 4 s): abre a cópia guardada. */
const CACHE="nv-app-v1";

self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));

self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET") return;
  if(new URL(req.url).origin!==self.location.origin) return; // Supabase, CNPJ etc. passam direto
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const daRede=fetch(req,{cache:"no-store"}).then(res=>{ if(res.ok) cache.put(req,res.clone()); return res; });
    const guardada=()=>cache.match(req,{ignoreSearch:true});
    try{
      return await Promise.race([daRede,new Promise((_,rej)=>setTimeout(()=>rej(new Error("lento")),4000))]);
    }catch(err){
      const c=await guardada(); if(c) return c;
      return daRede; // sem cópia guardada: espera a rede mesmo
    }
  })());
});
