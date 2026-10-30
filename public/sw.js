const CACHE_PREFIX = 'steam-atlas-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/mobile.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Somente a interface é salva. Consultas, dados de perfis e imagens da Steam usam a rede.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search || !SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') await cache.put(url.pathname, response.clone());
      return response;
    } catch {
      return await cache.match(url.pathname) || new Response('Sem conexão. Conecte-se à internet para continuar.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
