// Sincronización del progreso con la cuenta, para seguir donde quedaste en cualquier equipo.
// - Al abrir el curso y al ingresar: baja el progreso de la cuenta y lo combina con el de este
//   navegador (combinar.js), sin perder avances de ninguno.
// - Ante cada cambio sube lo combinado, unos segundos después, y enseguida al ocultar la pestaña.
// - Sin internet el curso anda igual: el cambio queda pendiente y se sincroniza al volver.
// - En la versión local, además, guarda en la cuenta la clave del material para la página
//   publicada (la que usa tools/publicar-web.mjs), así la página se desbloquea al ingresar.
// Sin cuenta, el curso funciona como siempre, solo con este navegador.
import { leer, alCambiar, aplicarCombinado, cambiosHechos, completar, progresoSano } from './store.js';
import { combinar, estable } from './combinar.js';
import { CIFRADO } from './modo.js';
import * as nube from './nube.js';

const RECUERDO = 'deutsch-a2-sincro'; // {uid, ultima, pendiente}: sobrevive a recargar la página
const DUENO = 'deutsch-a2-cuenta'; // de qué cuenta es el progreso guardado en este navegador
const HUBO_SESION = 'deutsch-a2-sesion'; // para no cargar Firebase si nunca se ingresó acá
const ESPERA = 4000; // tras un cambio, para juntar varios en una sola subida
const ESPERA_MAX = 30000;

const leerLocal = (k, def) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? def;
  } catch {
    return def;
  }
};
const guardarLocal = (k, v) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
};

// fase: 'sin-config' | 'cargando' | 'sin-sesion' | 'otra-cuenta' | 'pendiente' | 'sincronizando' | 'al-dia' | 'sin-conexion' | 'error'
const estado = { fase: nube.configurada ? 'cargando' : 'sin-config', sesion: null, ultima: null, pendiente: false, error: null, clave: null };
const oyentes = new Set();
export const alCambiarSincro = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
export const estadoSincro = () => estado;
function cambiar(cambios) {
  Object.assign(estado, cambios);
  if (estado.sesion) guardarLocal(RECUERDO, { uid: estado.sesion.uid, ultima: estado.ultima, pendiente: estado.pendiente });
  oyentes.forEach((fn) => fn(estado));
}

// ---------- Cuándo sincronizar ----------
let tEspera = null;
let primerCambio = 0;
function programar(ms = ESPERA) {
  clearTimeout(tEspera);
  if (!primerCambio) primerCambio = Date.now();
  tEspera = setTimeout(sincronizar, Math.max(0, Math.min(ms, primerCambio + ESPERA_MAX - Date.now())));
}

alCambiar((_, externo) => {
  if (externo || !estado.sesion || estado.fase === 'otra-cuenta') return;
  if (!estado.pendiente || estado.fase === 'al-dia') cambiar({ pendiente: true, fase: estado.fase === 'sin-conexion' ? 'sin-conexion' : 'pendiente' });
  programar();
});
addEventListener('visibilitychange', () => {
  if (!estado.sesion) return;
  // Al irse, sube lo pendiente; al volver, trae lo que se haya hecho en otro equipo.
  if (document.visibilityState === 'hidden') estado.pendiente && sincronizar();
  else if (Date.now() - ultimoIntento > 30000) sincronizar();
});
addEventListener('online', () => estado.sesion && sincronizar());
// Sin conexión se reintenta cada minuto (navigator.onLine no siempre avisa); tras otro error,
// cada cinco.
let vueltas = 0;
setInterval(() => {
  vueltas++;
  if (estado.sesion && (estado.fase === 'sin-conexion' || (estado.fase === 'error' && vueltas % 5 === 0))) sincronizar();
}, 60000);

// ---------- Sincronizar ----------
let enCurso = null;
let otraVez = false;
let ultimoIntento = 0;
// En la pantalla de entrada de la página publicada no se sincroniza: al ingresar se recarga.
let pausada = false;
export const pausarSincro = () => (pausada = true);

/** Combina este navegador con la cuenta, ahora. */
export function sincronizar() {
  if (!estado.sesion || estado.fase === 'otra-cuenta' || pausada) return Promise.resolve();
  if (enCurso) return (otraVez = true), enCurso;
  clearTimeout(tEspera);
  primerCambio = 0;
  ultimoIntento = Date.now();
  // Sin red ni se intenta: queda pendiente hasta que vuelva (evento online o el reintento).
  if (navigator.onLine === false) return (cambiar({ fase: 'sin-conexion', pendiente: true }), Promise.resolve());
  const { uid } = estado.sesion;
  enCurso = (async () => {
    cambiar({ fase: 'sincronizando' });
    const antes = cambiosHechos();
    try {
      const guardado = await nube.sincronizarProgreso(uid, (remoto) => {
        const local = leer();
        if (!remoto) return { progreso: local, subir: true };
        if (!progresoSano(remoto)) throw Object.assign(new Error('The progress saved in your account is damaged.'), { code: 'danado' });
        const c = combinar(local, completar(remoto));
        return { progreso: c, subir: estable(c) !== estable(remoto) };
      });
      if (estado.sesion?.uid !== uid) return; // se cerró la sesión mientras tanto
      // Si se estudió algo mientras esperaba a la nube, se combina también y queda pendiente.
      const cambio = cambiosHechos() !== antes;
      const final = cambio ? combinar(leer(), guardado) : guardado;
      if (estable(final) !== estable(leer())) aplicarCombinado(final);
      guardarLocal(DUENO, uid);
      cambiar({ fase: cambio ? 'pendiente' : 'al-dia', pendiente: cambio, ultima: Date.now(), error: null });
      if (cambio) programar();
      // Si guardar la clave había fallado (por ejemplo, antes de publicar las reglas), ahora que
      // la nube responde se reintenta.
      if (!CIFRADO && ['error', 'sin-conexion'].includes(estado.clave)) subirClave(uid);
    } catch (e) {
      if (estado.sesion?.uid !== uid) return;
      cambiar(nube.sinConexion(e) ? { fase: 'sin-conexion', pendiente: true } : { fase: 'error', error: nube.mensajeError(e) });
    } finally {
      enCurso = null;
      if (otraVez) (otraVez = false), programar(0);
    }
  })();
  return enCurso;
}

// ---------- Sesión ----------
let iniciada = null;
/**
 * Arranca la cuenta: restaura la sesión guardada y sincroniza. Si en este navegador nunca
 * se ingresó, no carga Firebase hasta que se abre el perfil (forzar).
 */
export function iniciarSincro({ forzar = false } = {}) {
  if (!nube.configurada) return Promise.resolve();
  if (!forzar && !iniciada && !leerLocal(HUBO_SESION, false)) return (cambiar({ fase: 'sin-sesion' }), Promise.resolve());
  iniciada ??= new Promise((listo) => {
    nube.alCambiarSesion((sesion) => {
      alCambiarSesion(sesion);
      listo();
    }).catch((e) => (cambiar({ fase: 'error', error: nube.mensajeError(e) }), listo()));
  });
  return iniciada;
}

function alCambiarSesion(sesion) {
  if (!sesion) {
    guardarLocal(HUBO_SESION, null);
    return cambiar({ sesion: null, fase: 'sin-sesion', error: null, clave: null });
  }
  guardarLocal(HUBO_SESION, true);
  const recuerdo = leerLocal(RECUERDO, {});
  const mio = recuerdo.uid === sesion.uid;
  const dueno = leerLocal(DUENO, null);
  // El progreso de este navegador es de otra cuenta: no se mezcla sin preguntar (perfil.js).
  if (dueno && dueno !== sesion.uid) return cambiar({ sesion, fase: 'otra-cuenta', ultima: null, pendiente: false });
  cambiar({ sesion, fase: 'pendiente', ultima: mio ? recuerdo.ultima : null, pendiente: true, error: null });
  sincronizar();
  if (!CIFRADO) subirClave(sesion.uid);
}

/** Con el progreso de otra cuenta en este navegador: lo reemplaza por el de la cuenta actual. */
export async function adoptarCuenta() {
  const { uid } = estado.sesion;
  const remoto = await nube.leerProgreso(uid);
  aplicarCombinado(remoto && progresoSano(remoto) ? completar(remoto) : completar({}));
  guardarLocal(DUENO, uid);
  cambiar({ fase: 'pendiente', pendiente: false });
  if (!CIFRADO) subirClave(uid);
  return sincronizar();
}

// ---------- Clave del material (versión local) ----------
// El servidor local la lee de privado/clave-web.txt (/api/clave). Si la cuenta no la tiene, o
// tiene otra, se guarda: la página publicada la baja de ahí al ingresar.
async function subirClave(uid) {
  try {
    const r = await fetch('/api/clave', { cache: 'no-store' });
    if (!r.ok) return cambiar({ clave: 'sin-archivo' });
    const { clave } = await r.json();
    if ((await nube.leerClaveCuenta(uid)) !== clave) await nube.guardarClaveCuenta(uid, clave);
    if (estado.sesion?.uid === uid) cambiar({ clave: 'guardada' });
  } catch (e) {
    if (estado.sesion?.uid === uid) cambiar({ clave: nube.sinConexion(e) ? 'sin-conexion' : 'error' });
  }
}

// ---------- Ingresar y salir ----------
export async function ingresar(email, contrasena) {
  await iniciarSincro({ forzar: true });
  return nube.ingresar(email, contrasena);
}
export async function registrarse(email, contrasena) {
  await iniciarSincro({ forzar: true });
  return nube.registrarse(email, contrasena);
}
/** Cierra la sesión. Antes intenta subir lo pendiente; el progreso queda en este navegador. */
export async function salir() {
  if (estado.pendiente && estado.fase !== 'otra-cuenta') await sincronizar().catch(() => {});
  guardarLocal(RECUERDO, null);
  await nube.salir();
}

/** «Synced 2 min ago», «Offline — will sync»… para el perfil y el inicio. */
export function textoSincro(e = estado) {
  if (e.fase === 'sincronizando') return 'Syncing…';
  if (e.fase === 'sin-conexion') return 'Offline — will sync';
  if (e.fase === 'error') return 'Sync problem';
  if (e.fase === 'otra-cuenta') return 'Choose what to keep';
  if (e.fase === 'pendiente') return navigator.onLine ? 'Syncing soon…' : 'Offline — will sync';
  if (e.fase !== 'al-dia' || !e.ultima) return '';
  const min = Math.floor((Date.now() - e.ultima) / 60000);
  if (min < 1) return 'Synced just now';
  if (min < 60) return `Synced ${min} min ago`;
  if (min < 24 * 60) return `Synced ${Math.floor(min / 60)} h ago`;
  return `Synced ${Math.floor(min / (24 * 60))} d ago`;
}
