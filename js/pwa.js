// App instalable (solo en la página publicada): registra el service worker (sw.js), avisa
// cuando hay una versión nueva, pide almacenamiento persistente y baja todo el contenido
// cifrado, más el reconocedor de voz, para usar el curso sin internet.
import { h } from './ui.js';
import { indiceContenido, urlCifrada } from './archivos.js';
import { prepararVoz, vozDisponible, vozLista } from './voz.js';

// ---------- Service worker y versiones nuevas ----------
let aceptoVersion = false;

function avisoVersion(nuevo) {
  if (document.querySelector('.version-nueva')) return;
  document.body.append(h('div', { class: 'version-nueva', role: 'status' },
    h('span', {}, 'New version available'),
    h('button', { class: 'btn primario', type: 'button', onclick: (e) => {
      e.currentTarget.disabled = true;
      aceptoVersion = true;
      nuevo.postMessage('activar');
    } }, 'Reload')));
}

export function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  // Recarga solo si el usuario aceptó la versión nueva (la primera instalación también cambia
  // de controlador y ahí no hay que recargar).
  navigator.serviceWorker.addEventListener('controllerchange', () => aceptoVersion && location.reload());
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const siEspera = () => reg.waiting && navigator.serviceWorker.controller && avisoVersion(reg.waiting);
    siEspera();
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => nuevo.state === 'installed' && siEspera());
    });
    // Al volver a la app se fija si hay una publicación nueva (como mucho una vez por hora).
    let ultima = Date.now();
    addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < 3600000) return;
      ultima = Date.now();
      reg.update().catch(() => {});
    });
  }).catch((e) => console.warn('Service worker:', e));
}

// ---------- Almacenamiento ----------
// Persistente: el navegador no lo borra por falta de espacio. En el iPad, con la app agregada
// a la pantalla de inicio, tampoco corre el borrado de Safari a los 7 días sin entrar.
export async function pedirPersistencia() {
  try {
    return (await navigator.storage?.persisted?.()) || (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}

// ---------- Todo el curso para usar sin internet ----------
// fase: 'esperando' | 'bajando' | 'listo' | 'sin-conexion' | 'error'; voz: 'no' | 'bajando' | 'lista' | 'error'
const descarga = { fase: 'esperando', listos: 0, total: 0, voz: 'no' };
const oyentes = new Set();
export const alCambiarDescarga = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
export const estadoDescarga = () => descarga;
const cambiar = (c) => (Object.assign(descarga, c), oyentes.forEach((fn) => fn(descarga)));

let enCurso = null;
/** Baja lo que falte (cada archivo una sola vez, aunque se corte y se retome). */
export function bajarParaSinInternet() {
  enCurso ??= bajar().finally(() => (enCurso = null));
  return enCurso;
}

async function bajar() {
  if (!('caches' in window)) return cambiar({ fase: 'error' });
  const ind = await indiceContenido();
  const urls = [...Object.entries(ind.archivos).map(([n, huella]) => urlCifrada(n, huella)), ind.voz?.lib].filter(Boolean).map((u) => new URL(u, location.href).href);
  const cache = await caches.open('contenido');
  const ya = new Set((await cache.keys()).map((r) => r.url));
  const faltan = urls.filter((u) => !ya.has(u));
  cambiar({ fase: faltan.length ? 'bajando' : 'listo', total: urls.length, listos: urls.length - faltan.length });
  let corte = null;
  const trabajar = async () => {
    while (faltan.length && !corte) {
      const u = faltan.shift();
      try {
        const r = await fetch(u, { headers: { 'x-descarga': '1' } });
        if (!r.ok) throw new Error(`${r.status}`);
        await cache.put(u, r);
        cambiar({ listos: descarga.listos + 1 });
      } catch (e) {
        corte = e;
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabajar));
  if (corte) return cambiar({ fase: navigator.onLine ? 'error' : 'sin-conexion' });
  cambiar({ fase: 'listo' });
  // Después, el reconocedor de voz (vosk-browser lo guarda en IndexedDB).
  if (!vozDisponible()) return;
  if (await vozLista()) return cambiar({ voz: 'lista' });
  cambiar({ voz: 'bajando' });
  await prepararVoz().then(() => cambiar({ voz: 'lista' }), () => cambiar({ voz: 'error' }));
}

/** Para el perfil: «Ready to use offline», o cuánto falta. */
export function textoDescarga(d = descarga) {
  if (d.fase === 'listo') return d.voz === 'bajando' ? 'Course downloaded. Downloading the speech checker…' : d.voz === 'error' ? 'Course downloaded. The speech checker will download the first time you use Speaking.' : 'Ready to use offline ✓';
  if (d.fase === 'bajando') return `Downloading for offline use: ${Math.floor((d.listos / d.total) * 100)} %`;
  if (d.fase === 'sin-conexion') return `Offline: ${d.listos} of ${d.total} files downloaded. The rest will download when you are online.`;
  if (d.fase === 'error') return `${d.listos} of ${d.total} files downloaded. The rest will download later.`;
  return '';
}

addEventListener('online', () => descarga.fase === 'sin-conexion' && bajarParaSinInternet());
