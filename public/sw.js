self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// No caching of authenticated pages or business data.
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{const list=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=list.find(c=>new URL(c.url).pathname==='/dashboard');if(client)return client.focus();return self.clients.openWindow('/dashboard');})());});
