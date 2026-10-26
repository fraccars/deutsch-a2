// Carga de los datos (data/) y los medios (media/) del curso.
// - Versión local: se leen los archivos en claro, como siempre.
// - Página publicada: están cifrados con AES-256-GCM (12 bytes de iv + texto cifrado, con la
//   ruta como dato autenticado) y publicados en c/ con un nombre que no dice nada,
//   HMAC-SHA256(clave, ruta). Las dos subclaves salen de la clave maestra con HKDF. La clave
//   maestra baja de la cuenta del usuario al ingresar (nube.js) y queda en este dispositivo,
//   en IndexedDB y sin poder leerse, hasta que se cierra la sesión.
// El mismo esquema, del lado de Node, está en tools/cifrado.mjs.
import { CIFRADO } from './modo.js';

// ---------- Clave ----------
const BD = 'deutsch-a2-clave';
function abrirBD() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('claves');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}
async function enBD(modo, fn) {
  const bd = await abrirBD();
  return new Promise((ok, mal) => {
    const tx = bd.transaction('claves', modo);
    const pedido = fn(tx.objectStore('claves'));
    tx.oncomplete = () => (bd.close(), ok(pedido?.result));
    tx.onerror = tx.onabort = () => (bd.close(), mal(tx.error));
  });
}

let claves = null; // {cifrado, nombres}: CryptoKey no exportables
async function cargarClaves() {
  if (!claves) claves = (await enBD('readonly', (s) => s.get('maestra')).catch(() => null)) ?? null;
  return claves;
}
export const hayClave = async () => !!(await cargarClaves());

const texto = (s) => new TextEncoder().encode(s);
async function derivar(maestra) {
  const base = await crypto.subtle.importKey('raw', maestra, 'HKDF', false, ['deriveKey']);
  const hkdf = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: texto(info) });
  return {
    cifrado: await crypto.subtle.deriveKey(hkdf('deutsch-a2/cifrado'), base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']),
    nombres: await crypto.subtle.deriveKey(hkdf('deutsch-a2/nombres'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
  };
}

/** Guarda en el dispositivo la clave maestra (32 bytes) que bajó de la cuenta. */
export async function guardarClave(maestra) {
  const c = await derivar(maestra);
  await enBD('readwrite', (s) => s.put(c, 'maestra'));
  claves = c;
}
/** Al cerrar la sesión: el dispositivo olvida la clave y lo descifrado. */
export async function olvidarClave() {
  claves = null;
  for (const [ruta, url] of listas) if (url.startsWith('blob:')) (URL.revokeObjectURL(url), listas.delete(ruta));
  urls.clear();
  await enBD('readwrite', (s) => s.delete('maestra')).catch(() => {});
}

// ---------- Índice de lo publicado ----------
// contenido.json (lo arma tools/publicar-web.mjs): versión y huella de cada archivo cifrado.
// La huella va en la URL, así una publicación nueva solo baja lo que cambió.
let indice = null;
export async function indiceContenido() {
  if (!indice) {
    const r = await fetch('contenido.json');
    if (!r.ok) throw new Error(`contenido.json: ${r.status}`);
    indice = await r.json();
  }
  return indice;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export async function nombreCifrado(ruta) {
  const c = await cargarClaves();
  if (!c) throw new SinClave();
  return hex(await crypto.subtle.sign('HMAC', c.nombres, texto(ruta))).slice(0, 32);
}

/** URL de un archivo cifrado, con su huella (la usan también la descarga para usar sin internet). */
export const urlCifrada = (nombre, huella) => `c/${nombre}?v=${huella}`;

export class SinClave extends Error {
  constructor() {
    super('Sign in to unlock the course.');
  }
}

async function descifrar(ruta) {
  const c = await cargarClaves();
  if (!c) throw new SinClave();
  const nombre = await nombreCifrado(ruta);
  const huella = (await indiceContenido()).archivos[nombre];
  if (!huella) throw new Error(`Not in the published course: ${ruta}`);
  let r;
  try {
    r = await fetch(urlCifrada(nombre, huella));
  } catch {
    throw new Error('This part of the course is not downloaded yet. Connect to the internet once to download it.');
  }
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  const datos = new Uint8Array(await r.arrayBuffer());
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: datos.subarray(0, 12), additionalData: texto(ruta) }, c.cifrado, datos.subarray(12));
}

// ---------- Lo que usa el resto de la app ----------
/** Un JSON de data/ o media/ (por ejemplo, 'data/k07/lecciones.json'). */
export async function cargarJSON(ruta) {
  if (!CIFRADO) {
    const r = await fetch(ruta);
    if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
    return r.json();
  }
  return JSON.parse(new TextDecoder().decode(await descifrar(ruta)));
}

// URLs blob: ya descifradas. Las de la pronunciación (miles de archivos chicos) se reciclan:
// quedan las últimas MAX_TTS. Las de los audios del libro y las páginas, que son pocas, quedan
// todas, porque un audio que se está escuchando tiene que poder adelantarse y retrocederse.
const TIPOS = { mp3: 'audio/mpeg', jpg: 'image/jpeg', png: 'image/png' };
const MAX_TTS = 300;
const urls = new Map(); // ruta → Promise<url>
const listas = new Map(); // ruta → url ya resuelta

/** URL para reproducir o mostrar un medio: la ruta tal cual en la versión local, una URL blob: en la publicada. */
export function urlMedio(ruta) {
  if (!CIFRADO) return Promise.resolve(ruta);
  if (urls.has(ruta)) {
    const p = urls.get(ruta);
    urls.delete(ruta);
    urls.set(ruta, p); // la más reciente queda al final
    return p;
  }
  const p = descifrar(ruta).then((buf) => {
    const url = URL.createObjectURL(new Blob([buf], { type: TIPOS[ruta.split('.').pop()] ?? '' }));
    listas.set(ruta, url);
    return url;
  });
  p.catch(() => urls.delete(ruta));
  urls.set(ruta, p);
  reciclar();
  return p;
}

/** La URL si ya está lista (para usarla dentro de un toque, sin esperar). */
export const urlMedioLista = (ruta) => (CIFRADO ? listas.get(ruta) : ruta);

function reciclar() {
  const tts = [...urls.keys()].filter((r) => r.startsWith('media/tts/'));
  for (const ruta of tts.slice(0, Math.max(0, tts.length - MAX_TTS))) {
    urls.delete(ruta);
    const url = listas.get(ruta);
    if (url) (URL.revokeObjectURL(url), listas.delete(ruta));
  }
}
