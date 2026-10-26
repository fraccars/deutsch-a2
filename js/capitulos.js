// Capítulos del curso (data/capitulos.json) y cuál se está mirando. El capítulo actual es el
// que eligió el alumno en el inicio; si no eligió ninguno, el de su plan semanal mientras dure
// la semana y, si no, el último. Las lecciones, los entrenadores, el speaking, los audios y la
// gramática muestran el capítulo actual; cada capítulo tiene sus datos en data/kNN/.
import { ajuste, configPlan, hoyISO } from './store.js';
import { cargarJSON } from './archivos.js';

const diasDesde = (iso) => Math.round((Date.parse(hoyISO()) - Date.parse(iso)) / 86400000);

let INDICE = null;
export async function cargarIndice() {
  INDICE ??= await cargarJSON('data/capitulos.json');
  return INDICE;
}
export const indiceCapitulos = () => INDICE ?? [];

export function capituloActual() {
  const ids = indiceCapitulos().map((c) => c.id);
  const plan = configPlan();
  const delPlan = plan && diasDesde(plan.inicio) < 7 ? plan.capitulo : null;
  for (const id of [ajuste('capitulo'), delPlan]) if (ids.includes(id)) return id;
  return ids.at(-1) ?? 'k07';
}
export const numeroCapitulo = (cap = capituloActual()) => indiceCapitulos().find((c) => c.id === cap)?.numero ?? Number(cap.slice(1));
export const elegirCapitulo = (cap) => ajuste('capitulo', cap);

/** Ruta de un archivo de datos del capítulo: rutaDatos('vocabulario.json') → 'data/k08/vocabulario.json'. */
export const rutaDatos = (archivo, cap = capituloActual()) => `data/${cap}/${archivo}`;

/** Carga por capítulo, una sola vez: el resultado de cargar(cap) queda guardado. */
export function porCapitulo(cargar) {
  const hechos = new Map();
  return (cap = capituloActual()) => {
    if (!hechos.has(cap)) {
      const p = cargar(cap);
      p.catch(() => hechos.delete(cap));
      hechos.set(cap, p);
    }
    return hechos.get(cap);
  };
}
