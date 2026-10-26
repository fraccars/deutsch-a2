// Service worker de la página publicada: hace que el curso se instale y ande sin internet.
// En la versión local no se registra.
// - Al instalarse guarda la «cáscara»: el HTML, el CSS, el código, el SDK de Firebase, los
//   íconos y el índice del contenido (contenido.json).
// - El contenido cifrado (c/…) y vosk-browser van aparte, en la caché «contenido»: se guardan
//   a medida que se piden y cuando la app los baja todos para usar sin internet (pwa.js). Sus
//   URL llevan la huella del archivo, así una publicación nueva solo baja lo que cambió.
// - Responde primero desde la caché. Cada publicación trae una VERSION nueva: la nueva
//   cáscara espera instalada hasta que la app la activa («New version available»).
// El modelo de voz no pasa por acá: vosk-browser lo guarda en IndexedDB la primera vez.
// tools/publicar-web.mjs completa VERSION y CASCARA.
const VERSION = '966f01d415ad';
const CASCARA = ["contenido.json","css/app.css","iconos/apple-touch-icon.png","iconos/icono-192.png","iconos/icono-32.png","iconos/icono-512.png","iconos/icono-maskable-512.png","iconos/icono.svg","index.html","js/archivos.js","js/audio.js","js/capitulo.js","js/check.js","js/combinar.js","js/ejercicios.js","js/glosa.js","js/main.js","js/mapa.js","js/modo.js","js/nube-config.js","js/nube.js","js/perfil.js","js/plan.js","js/pwa.js","js/sincro.js","js/speaking.js","js/store.js","js/tts-clave.js","js/ui.js","js/verbos.js","js/vocab.js","js/voz.js","manifest.webmanifest","vendor/firebase/firebase-app.js","vendor/firebase/firebase-auth.js","vendor/firebase/firebase-firestore-lite.js"];
const CACHE_CASCARA = `cascara-${VERSION}`;
const CACHE_CONTENIDO = 'contenido';

const base = new URL(self.registration.scope);
const ruta = (url) => (url.origin === base.origin && url.pathname.startsWith(base.pathname) ? url.pathname.slice(base.pathname.length) : null);
const esContenido = (r) => r.startsWith('c/') || (r.startsWith('vendor/vosk/') && r.endsWith('.js'));

self.addEventListener('install', (e) => {
  // Sin la caché del navegador: tiene que ser exactamente lo de esta publicación.
  e.waitUntil(caches.open(CACHE_CASCARA).then((c) => c.addAll(CASCARA.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cascara-') && k !== CACHE_CASCARA) await caches.delete(k);
    // Del contenido quedan solo los archivos de esta publicación.
    const indice = await (await caches.open(CACHE_CASCARA)).match('contenido.json').then((r) => r?.json()).catch(() => null);
    if (indice) {
      const vigentes = new Set([...Object.entries(indice.archivos).map(([n, h]) => `c/${n}?v=${h}`), indice.voz?.lib].filter(Boolean).map((u) => new URL(u, base).href));
      const contenido = await caches.open(CACHE_CONTENIDO);
      for (const pedido of await contenido.keys()) if (!vigentes.has(pedido.url)) await contenido.delete(pedido);
    }
    await self.clients.claim();
  })());
});

// La app avisa que el usuario aceptó la versión nueva.
self.addEventListener('message', (e) => e.data === 'activar' && self.skipWaiting());

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);
  const r = request.method === 'GET' ? ruta(url) : null;
  // Firebase, el modelo de voz y lo de otros sitios: directo a la red.
  if (r === null || r.endsWith('.tar.gz')) return;
  if (esContenido(r)) {
    // La descarga completa (pwa.js) guarda ella misma lo que baja.
    if (request.headers.get('x-descarga')) return;
    e.respondWith(caches.open(CACHE_CONTENIDO).then(async (c) => {
      const guardado = await c.match(request);
      if (guardado) return guardado;
      const respuesta = await fetch(request);
      if (respuesta.ok) c.put(request, respuesta.clone()).catch(() => {});
      return respuesta;
    }));
    return;
  }
  // La cáscara: la página (cualquier navegación) es index.html.
  const clave = request.mode === 'navigate' ? 'index.html' : r;
  e.respondWith(caches.open(CACHE_CASCARA).then((c) => c.match(clave, { ignoreSearch: true })).then((guardado) => guardado ?? fetch(request)));
});
