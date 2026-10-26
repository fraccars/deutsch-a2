// Datos del capítulo y progreso por lección (lo usan la app y el plan semanal).
import { pasoHecho, leer } from './store.js';
import { cargarJSON } from './archivos.js';

let CAP = null;
export async function cargarCapitulo() {
  if (!CAP) CAP = await cargarJSON('data/k07/lecciones.json');
  return CAP;
}

export const idPaso = (lec, i) => `${CAP.id}/${lec.id}/${i}`;
export const progresoLeccion = (lec) => lec.pasos.filter((_, i) => pasoHecho(idPaso(lec, i))).length / lec.pasos.length;

// Mejor resultado promedio de los pasos que se corrigen (sin teoría ni escritura libre).
export function puntajeLeccion(lec) {
  const corregidos = lec.pasos.map((p, i) => [p, i]).filter(([p]) => p.tipo !== 'teoria' && p.tipo !== 'escribir');
  if (!corregidos.length) return 1;
  return corregidos.reduce((s, [, i]) => s + (leer().pasos[idPaso(lec, i)]?.mejor ?? 0), 0) / corregidos.length;
}
