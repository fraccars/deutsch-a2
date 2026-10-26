// Datos del capítulo y progreso por lección (lo usan la app y el plan semanal).
import { pasoHecho, leer } from './store.js';
import { cargarJSON } from './archivos.js';
import { porCapitulo, rutaDatos } from './capitulos.js';

// Las lecciones de un capítulo (el actual, si no se dice cuál). Cada lección sabe de qué
// capítulo es, para el id de sus pasos.
export const cargarCapitulo = porCapitulo((cap) => cargarJSON(rutaDatos('lecciones.json', cap)).then((c) => {
  for (const l of c.lecciones) l.cap = c.id;
  return c;
}));

export const idPaso = (lec, i) => `${lec.cap}/${lec.id}/${i}`;
export const progresoLeccion = (lec) => lec.pasos.filter((_, i) => pasoHecho(idPaso(lec, i))).length / lec.pasos.length;

// Mejor resultado promedio de los pasos que se corrigen (sin teoría ni escritura libre).
export function puntajeLeccion(lec) {
  const corregidos = lec.pasos.map((p, i) => [p, i]).filter(([p]) => p.tipo !== 'teoria' && p.tipo !== 'escribir');
  if (!corregidos.length) return 1;
  return corregidos.reduce((s, [, i]) => s + (leer().pasos[idPaso(lec, i)]?.mejor ?? 0), 0) / corregidos.length;
}
