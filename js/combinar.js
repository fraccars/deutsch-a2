// Combinación del progreso de dos equipos (el de este navegador y el de la nube) sin perder
// avances. Es pura, sin DOM ni almacenamiento: la usan store.js, la sincronización y
// tools/probar-combinar.mjs. Da lo mismo el orden en que se junten los equipos y cuántas
// veces se repita (conmutativa, asociativa e idempotente).
//
// - pasos de las lecciones: unión; cada paso queda hecho si se hizo en alguno, con el mejor puntaje.
// - repaso espaciado (Leitner): de cada tarjeta, la del repaso más reciente.
// - actividad: unión sin duplicados, en orden de tiempo.
// - logros: unión, con la fecha más temprana.
// - días de estudio: unión; la racha sale de ahí.
// - XP: cada equipo suma en su propio contador (xpDisp) y el total es la base, lo que había
//   antes de que existieran los contadores, más todos ellos. Así nada se cuenta dos veces.
// - plan y ajustes: el cambio más reciente (marcas de tiempo en «cambios»).
// - reinicio: si en un equipo se reinició o se importó el progreso, ese gana entero.

const DIA = 86400000;
// Días hasta el próximo repaso según la caja de Leitner (0 = nueva o fallada).
export const INTERVALOS = [0, 1, 2, 4, 8, 16];
// Días de estudio que se recuerdan: alcanzan para cualquier racha razonable.
const MAX_DIAS = 400;

/** JSON con las claves ordenadas: para comparar progresos y desempatar siempre igual. */
export function estable(x) {
  if (Array.isArray(x)) return `[${x.map(estable).join(',')}]`;
  if (x !== null && typeof x === 'object') {
    return `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estable(x[k])}`).join(',')}}`;
  }
  return JSON.stringify(x) ?? 'null';
}
// Desempate determinista entre dos valores distintos.
const mayor = (a, b) => (estable(a) >= estable(b) ? a : b);
const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const suma = (o) => Object.values(o).reduce((s, n) => s + n, 0);
const claves = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

// ---------- Días y racha ----------
const numeroDia = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DIA);
};
const isoDia = (n) => new Date(n * DIA).toISOString().slice(0, 10);

/** Racha que termina en el último día estudiado: {dias, ultimo}. */
export function rachaDe(dias) {
  if (!dias.length) return { dias: 0, ultimo: null };
  let n = 1;
  for (let i = dias.length - 1; i > 0 && numeroDia(dias[i]) - numeroDia(dias[i - 1]) === 1; i--) n++;
  return { dias: n, ultimo: dias.at(-1) };
}

/** Agrega un día a la lista ordenada (sin repetir) y recorta los más viejos. */
export function conDia(dias, dia) {
  return [...new Set([...dias, dia])].sort().slice(-MAX_DIAS);
}

// ---------- Normalización ----------
/**
 * Completa los campos que agregó la sincronización a un progreso de antes (o de un archivo
 * exportado viejo): la lista de días sale de la racha y lo que había de XP pasa a la base.
 * No modifica el original.
 */
export function normalizar(p) {
  const r = { ...p };
  if (!Array.isArray(r.dias)) {
    const { dias = 0, ultimo = null } = r.racha ?? {};
    r.dias = ultimo ? Array.from({ length: Math.min(dias, MAX_DIAS) }, (_, i) => isoDia(numeroDia(ultimo) - (Math.min(dias, MAX_DIAS) - 1) + i)) : [];
  }
  if (!esObjeto(r.xpDisp)) (r.xpBase = r.xp ?? 0), (r.xpDisp = {});
  r.xpBase ??= 0;
  r.xpHoy ??= { dia: '', xp: 0 };
  if (!esObjeto(r.xpHoy.disp)) r.xpHoy = { ...r.xpHoy, base: r.xpHoy.xp ?? 0, disp: {} };
  r.cambios = { plan: r.cambios?.plan ?? 0, ajustes: { ...r.cambios?.ajustes } };
  r.reinicio ??= 0;
  return r;
}

// ---------- Cada parte ----------
function pasos(a, b) {
  const r = {};
  for (const id of claves(a, b)) {
    const [x, y] = [a[id], b[id]];
    r[id] = !x || !y ? x ?? y : { hecho: !!(x.hecho || y.hecho), mejor: Math.max(x.mejor ?? 0, y.mejor ?? 0), veces: Math.max(x.veces ?? 0, y.veces ?? 0) };
  }
  return r;
}

// Cuándo se repasó por última vez: lo guarda calificar() desde la sincronización; en las
// tarjetas de antes se deduce del próximo repaso, que es ese momento más el intervalo de su caja.
const repasada = (t) => t.t ?? (t.prox ?? 0) - (INTERVALOS[t.caja] ?? 0) * DIA;

function srs(a, b) {
  const r = {};
  for (const k of claves(a, b)) {
    const [x, y] = [a[k], b[k]];
    if (!x || !y) r[k] = x ?? y;
    else r[k] = repasada(x) > repasada(y) ? x : repasada(y) > repasada(x) ? y : mayor(x, y);
  }
  return r;
}

function actividad(a, b) {
  const unicos = new Map();
  for (const ev of [...a, ...b]) {
    const k = estable(ev);
    if (!unicos.has(k)) unicos.set(k, ev);
  }
  return [...unicos].sort(([ka, x], [kb, y]) => (x.t ?? 0) - (y.t ?? 0) || (ka < kb ? -1 : ka > kb ? 1 : 0)).map(([, ev]) => ev);
}

function logros(a, b) {
  const r = {};
  for (const id of claves(a, b)) r[id] = !a[id] || !b[id] ? a[id] ?? b[id] : a[id] < b[id] ? a[id] : b[id];
  return r;
}

// Unión de dos objetos: si una clave está en los dos, desempate determinista.
function union(a, b) {
  const r = {};
  for (const k of claves(a, b)) r[k] = !(k in a) || !(k in b) ? (k in a ? a[k] : b[k]) : mayor(a[k], b[k]);
  return r;
}

// Contadores por equipo: de cada uno, el valor más alto (solo crecen).
function contadores(a, b) {
  const r = {};
  for (const k of claves(a, b)) r[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return r;
}

function xpHoy(a, b) {
  if (a.dia !== b.dia) return a.dia > b.dia ? a : b;
  const base = Math.max(a.base ?? 0, b.base ?? 0);
  const disp = contadores(a.disp ?? {}, b.disp ?? {});
  return { dia: a.dia, xp: base + suma(disp), base, disp };
}

// Ajustes: gana el último que se cambió. El récord del sprint de artículos y el aviso del
// globito ya visto no retroceden: récord más alto y «visto» si se vio en alguno.
function ajustes(a, b, ta, tb) {
  const valores = {};
  const tiempos = {};
  for (const k of claves(a, b)) {
    const [x, y] = [ta[k] ?? 0, tb[k] ?? 0];
    tiempos[k] = Math.max(x, y);
    if (!(k in a) || !(k in b)) valores[k] = k in a ? a[k] : b[k];
    else if (k === 'recordArticulo') valores[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
    else if (k === 'glosaVista') valores[k] = !!(a[k] || b[k]);
    else valores[k] = x > y ? a[k] : y > x ? b[k] : mayor(a[k], b[k]);
    if (!tiempos[k]) delete tiempos[k];
  }
  return { valores, tiempos };
}

const CONOCIDOS = new Set(['xp', 'xpBase', 'xpDisp', 'racha', 'dias', 'xpHoy', 'pasos', 'srs', 'verbos', 'ajustes', 'actividad', 'plan', 'logros', 'cambios', 'reinicio']);

/** Junta dos progresos (con la forma de store.js) en uno que no pierde nada de ninguno. */
export function combinar(pa, pb) {
  let a = normalizar(pa);
  let b = normalizar(pb);
  // Distinto reinicio: queda el más reciente, ordenado igual que una combinación.
  if (a.reinicio !== b.reinicio) a = b = a.reinicio > b.reinicio ? a : b;
  const xpDisp = contadores(a.xpDisp, b.xpDisp);
  const xpBase = Math.max(a.xpBase, b.xpBase);
  const dias = [...new Set([...a.dias, ...b.dias])].sort().slice(-MAX_DIAS);
  const aj = ajustes(a.ajustes ?? {}, b.ajustes ?? {}, a.cambios.ajustes, b.cambios.ajustes);
  const [pa2, pb2] = [a.cambios.plan, b.cambios.plan];
  const r = {
    xp: xpBase + suma(xpDisp), xpBase, xpDisp,
    dias, racha: rachaDe(dias),
    xpHoy: xpHoy(a.xpHoy, b.xpHoy),
    pasos: pasos(a.pasos ?? {}, b.pasos ?? {}),
    srs: srs(a.srs ?? {}, b.srs ?? {}),
    verbos: union(a.verbos ?? {}, b.verbos ?? {}),
    ajustes: aj.valores,
    actividad: actividad(a.actividad ?? [], b.actividad ?? []),
    plan: pa2 > pb2 ? a.plan : pb2 > pa2 ? b.plan : mayor(a.plan ?? null, b.plan ?? null),
    logros: logros(a.logros ?? {}, b.logros ?? {}),
    cambios: { plan: Math.max(pa2, pb2), ajustes: aj.tiempos },
    reinicio: a.reinicio,
  };
  // Campos que esta versión no conoce (de una versión más nueva): se conservan.
  const otros = union(Object.fromEntries(Object.entries(a).filter(([k]) => !CONOCIDOS.has(k))), Object.fromEntries(Object.entries(b).filter(([k]) => !CONOCIDOS.has(k))));
  return { ...otros, ...r };
}
