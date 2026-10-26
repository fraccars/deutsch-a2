// Progreso del alumno: XP, racha diaria, pasos resueltos, repaso espaciado (Leitner)
// de vocabulario y verbos. Vive en el localStorage de esta dirección. En la versión local
// tiene además una copia automática en el servidor del curso, por si el navegador lo pierde.
// Con una cuenta se sincroniza en la nube entre equipos (sincro.js); sin cuenta se pasa
// con un archivo .json (exportar / importar).
import { CIFRADO } from './modo.js';
import { INTERVALOS, normalizar, rachaDe, conDia } from './combinar.js';

export { INTERVALOS };
// Nombres de antes de la versión web (solo en la versión local; ver legado.js).
const LEGADO = CIFRADO ? {} : await import('./legado.js').catch(() => ({}));

const KEY = 'deutsch-a2-v1';
const DIA = 86400000;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function hoy() {
  return iso(new Date());
}
export const hoyISO = hoy;

// Cada equipo (navegador y dirección) suma su XP en su propio contador: así, al juntar el
// progreso de dos equipos, lo de cada uno se cuenta una sola vez (ver combinar.js).
const EQUIPO = (() => {
  try {
    let id = localStorage.getItem('deutsch-a2-equipo');
    if (!id) localStorage.setItem('deutsch-a2-equipo', (id = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')));
    return id;
  } catch {
    return 'sin-almacenamiento';
  }
})();

function vacio() {
  return {
    xp: 0, racha: { dias: 0, ultimo: null }, xpHoy: { dia: hoy(), xp: 0, base: 0, disp: {} }, pasos: {}, srs: {}, verbos: {}, ajustes: { velocidad: 1, sonido: true },
    // Plan semanal: rondas terminadas y audios escuchados, configuración y logros.
    actividad: [], plan: null, logros: {},
    // Para combinar con otros equipos: días de estudio, XP por equipo, cuándo cambiaron el
    // plan y cada ajuste, y cuándo se reinició o importó por última vez.
    dias: [], xpBase: 0, xpDisp: {}, cambios: { plan: 0, ajustes: {} }, reinicio: 0,
  };
}

// Lo guardado en este navegador; los campos que falten quedan como en un progreso vacío.
function cargar() {
  try {
    const texto = localStorage.getItem(KEY) ?? (LEGADO.CLAVE_VIEJA && localStorage.getItem(LEGADO.CLAVE_VIEJA));
    return normalizar({ ...vacio(), ...JSON.parse(texto ?? '{}') });
  } catch {
    return vacio();
  }
}

let estado = cargar();
// Cuenta los cambios hechos en este navegador: la sincronización se fija si hubo alguno
// mientras esperaba a la nube.
let cambiosLocales = 0;

const oyentes = new Set();
// Cada oyente recibe el progreso y true si el cambio vino de afuera: de otra pestaña del
// curso o de la nube. Los de afuera no hay que volver a subirlos.
export const alCambiar = (fn) => (oyentes.add(fn), () => oyentes.delete(fn));
const avisar = (externo) => oyentes.forEach((fn) => fn(estado, externo));

function escribir(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

function guardar() {
  try {
    escribir(estado);
  } catch {
    /* sin almacenamiento: el curso funciona igual, sin recordar el progreso */
  }
  cambiosLocales++;
  programarCopia();
  avisar(false);
}

// Con el curso abierto en dos pestañas, lo que una guarda, importa o reinicia lo toma la otra:
// si no, el próximo guardado de la que quedó vieja pisaría lo nuevo. Se relee lo guardado en vez
// de usar e.newValue, que ya puede ser viejo si después escribió otra pestaña. Si se borró
// (removeItem, o clear() con key null), queda un progreso vacío.
addEventListener('storage', (e) => {
  if (e.storageArea !== localStorage || (e.key !== KEY && e.key !== null)) return;
  estado = cargar();
  avisar(true);
});

// ---------- Copia automática en el servidor (solo en la versión local) ----------
// Cada cambio se copia también al servidor del curso (tools/serve.mjs → progreso/), unos
// segundos después o al salir de la pestaña. Al abrir, recuperarCopia() la trae de vuelta
// si este navegador perdió el progreso (Safari borra los datos de un sitio tras 7 días
// sin entrar; un borrado de historial). En la página publicada no hay servidor: el respaldo
// es la cuenta en la nube, más exportar.
let tCopia = null;
let copiaPendiente = false;
let copiaApagada = CIFRADO; // sin servidor, o servidor viejo sin /api/progreso: no se insiste

function copiarAhora() {
  clearTimeout(tCopia);
  if (!copiaPendiente || copiaApagada) return;
  copiaPendiente = false;
  const cuerpo = JSON.stringify(exportar());
  // keepalive deja terminar el envío aunque se cierre la pestaña, pero solo hasta 64 KB.
  fetch('/api/progreso', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: cuerpo, keepalive: cuerpo.length < 60_000 })
    .then((r) => {
      if (r.status === 404 || r.status === 405) copiaApagada = true;
      else if (!r.ok) copiaPendiente = true;
    })
    .catch(() => (copiaPendiente = true));
}
function programarCopia() {
  if (copiaApagada) return;
  copiaPendiente = true;
  clearTimeout(tCopia);
  tCopia = setTimeout(copiarAhora, 1500);
}
addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && copiarAhora());
addEventListener('pagehide', copiarAhora);

// Lo que vale la pena recuperar: algo estudiado o un plan empezado (los ajustes no cuentan).
export const tieneProgreso = (p = estado) => p.xp > 0 || p.plan !== null || p.actividad.length > 0 || Object.keys(p.pasos).length > 0 || Object.keys(p.srs).length > 0;

/** Al abrir el curso. Si este navegador no tiene progreso y el servidor guarda una copia que
 *  sí tiene, la recupera y devuelve {progreso, exportado}. Si no, deja la copia al día. */
export async function recuperarCopia() {
  if (CIFRADO) return null;
  if (tieneProgreso(estado)) return (programarCopia(), null);
  const texto = await Promise.race([
    fetch('/api/progreso', { cache: 'no-store' }).then((r) => (r.status === 200 ? r.text() : '')),
    new Promise((listo) => setTimeout(() => listo(''), 3000)),
  ]).catch(() => '');
  const copia = texto ? leerExportacion(texto) : { error: 'vacia' };
  // Vuelve tal cual, sin contar como reinicio: si hay cuenta, se combina con la nube.
  return !copia.error && tieneProgreso(copia.progreso) && importar(copia.progreso, { reemplazo: false }) ? copia : null;
}

export const leer = () => estado;
export const cambiosHechos = () => cambiosLocales;

function marcarDia() {
  const d = hoy();
  if (estado.xpHoy.dia !== d) estado.xpHoy = { dia: d, xp: 0, base: 0, disp: {} };
  if (estado.dias.at(-1) === d) return;
  estado.dias = conDia(estado.dias, d);
  estado.racha = rachaDe(estado.dias);
}

function ayerISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return iso(d);
}

// La racha guardada solo vale si se estudió hoy o ayer; si no, ya se cortó.
export const rachaActual = (racha = estado.racha) => ([hoy(), ayerISO()].includes(racha.ultimo) ? racha.dias : 0);
export const estudioHoy = () => estado.racha.ultimo === hoy();

// Actividad para el plan: {tipo: 'ronda', area, modo, aciertos, total, puntos, tiempos} o {tipo: 'escucha', pista}.
export function registrar(evento) {
  marcarDia();
  estado.actividad.push({ t: Date.now(), dia: hoy(), ...evento });
  guardar();
}
export const actividad = () => estado.actividad;

export function configPlan(valor) {
  if (valor === undefined) return estado.plan;
  estado.plan = valor;
  estado.cambios.plan = Date.now();
  guardar();
}

export const logros = () => estado.logros;
export function desbloquearLogro(id) {
  if (estado.logros[id]) return;
  estado.logros[id] = hoy();
  guardar();
}

export function sumarXP(n) {
  marcarDia();
  estado.xp += n;
  estado.xpDisp[EQUIPO] = (estado.xpDisp[EQUIPO] ?? 0) + n;
  estado.xpHoy.xp += n;
  estado.xpHoy.disp[EQUIPO] = (estado.xpHoy.disp[EQUIPO] ?? 0) + n;
  guardar();
}

// Pasos de las lecciones: id = "k07/unterwegs/3".
export function resolverPaso(id, aciertos, total) {
  const prev = estado.pasos[id];
  const mejor = Math.max(prev?.mejor ?? 0, total ? aciertos / total : 1);
  estado.pasos[id] = { hecho: true, mejor, veces: (prev?.veces ?? 0) + 1 };
  guardar();
}
export const pasoHecho = (id) => !!estado.pasos[id]?.hecho;

// Repaso espaciado genérico (vocabulario: "v:<palabra>", verbos: "c:<inf>|<tiempo>|<persona>").
// «t» es el momento del repaso: entre dos equipos gana el repaso más reciente.
export function calificar(clave, bien) {
  const t = estado.srs[clave] ?? { caja: 0, prox: 0, bien: 0, mal: 0 };
  if (bien) {
    t.caja = Math.min(t.caja + 1, INTERVALOS.length - 1);
    t.bien++;
  } else {
    t.caja = 0;
    t.mal++;
  }
  t.t = Date.now();
  t.prox = t.t + INTERVALOS[t.caja] * DIA;
  estado.srs[clave] = t;
  guardar();
}
export const tarjeta = (clave) => estado.srs[clave];
export const pendiente = (clave) => {
  const t = estado.srs[clave];
  return !t || t.prox <= Date.now();
};

export function ajuste(nombre, valor) {
  if (valor === undefined) return estado.ajustes[nombre];
  estado.ajustes[nombre] = valor;
  estado.cambios.ajustes[nombre] = Date.now();
  guardar();
}

// Borra todo. Con cuenta, también en la nube y en los otros equipos: el reinicio más
// reciente gana sobre lo que tengan guardado.
export function reiniciar() {
  estado = { ...vacio(), reinicio: Date.now() };
  guardar();
}

// ---------- Pasar el progreso a otra máquina ----------
// El archivo dice de qué curso es y en qué formato está. Si algún día cambia la forma
// del progreso, se sube FORMATO y los archivos anteriores se convierten al importarlos.
const CURSO = 'deutsch-a2';
const FORMATO = 1;

export const exportar = () => ({ curso: CURSO, formato: FORMATO, exportado: new Date().toISOString(), progreso: estado });

// Tipo de cada campo del progreso; los que falten se completan como en un progreso vacío.
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const esNumero = (x) => typeof x === 'number' && Number.isFinite(x);
const esDia = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const CAMPOS = {
  xp: esNumero,
  racha: (r) => esObjeto(r) && esNumero(r.dias) && (r.ultimo === null || esDia(r.ultimo)),
  xpHoy: (x) => esObjeto(x) && esDia(x.dia) && esNumero(x.xp),
  pasos: (p) => esObjeto(p) && Object.values(p).every(esObjeto),
  srs: (s) => esObjeto(s) && Object.values(s).every(esObjeto),
  verbos: esObjeto,
  ajustes: esObjeto,
  actividad: (a) => Array.isArray(a) && a.every(esObjeto),
  plan: (p) => p === null || (esObjeto(p) && esDia(p.inicio)),
  logros: (l) => esObjeto(l) && Object.values(l).every(esDia),
  dias: (d) => Array.isArray(d) && d.every(esDia),
  xpBase: esNumero,
  xpDisp: (x) => esObjeto(x) && Object.values(x).every(esNumero),
  cambios: esObjeto,
  reinicio: esNumero,
};

/** ¿Es un progreso de este curso, con cada campo del tipo que corresponde? */
export const progresoSano = (p) => esObjeto(p) && Object.entries(CAMPOS).every(([k, ok]) => !(k in p) || ok(p[k]));
/** Un progreso (de un archivo o de la nube) con todos sus campos. */
export const completar = (p) => normalizar({ ...vacio(), ...p });

/** Lee un archivo exportado sin tocar nada: {progreso, exportado} o {error: 'curso' | 'version' | 'datos'}. */
export function leerExportacion(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { error: 'curso' };
  }
  if (!esObjeto(datos) || ![CURSO, LEGADO.CURSO_VIEJO].includes(datos.curso)) return { error: 'curso' };
  if (Number.isInteger(datos.formato) && datos.formato > FORMATO) return { error: 'version' };
  const p = datos.progreso;
  const sano = datos.formato === FORMATO && typeof datos.exportado === 'string' && !Number.isNaN(Date.parse(datos.exportado)) && progresoSano(p);
  return sano ? { progreso: completar(p), exportado: datos.exportado } : { error: 'datos' };
}

// Reemplaza todo el progreso por el de leerExportacion. Importar a propósito (un archivo,
// una copia elegida) cuenta como reinicio: con cuenta, reemplaza también el de la nube y el
// de los otros equipos. Si el navegador no lo puede guardar, no cambia nada y devuelve false.
export function importar(progreso, { reemplazo = true } = {}) {
  const nuevo = reemplazo ? { ...completar(progreso), reinicio: Date.now() } : completar(progreso);
  try {
    escribir(nuevo);
  } catch {
    return false;
  }
  estado = nuevo;
  cambiosLocales++;
  programarCopia();
  avisar(false);
  return true;
}

// El progreso combinado con el de la nube (sincro.js). Llega de afuera: no se vuelve a subir.
export function aplicarCombinado(progreso) {
  estado = completar(progreso);
  try {
    escribir(estado);
  } catch {
    /* igual queda en memoria */
  }
  programarCopia();
  avisar(true);
}
