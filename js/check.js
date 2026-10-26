// Corrección tolerante de respuestas escritas.
// - Ignora espacios repetidos, comillas tipográficas y la puntuación final.
// - Acepta ae/oe/ue/ss en lugar de ä/ö/ü/ß (teclado en español).
// - Si solo difieren las mayúsculas, cuenta como correcta pero avisa.

export function normalizar(s) {
  return String(s)
    .normalize('NFC')
    .replace(/[„“”"«»]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s*([,.;:!?])\s*/g, '$1 ')
    .trim()
    .replace(/[.!?;:,\s]+$/, '');
}

const sinUmlaut = (s) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');

/** @returns {{ok: boolean, aviso?: string, esperado: string}} */
export function corregir(respuesta, aceptadas) {
  const lista = Array.isArray(aceptadas) ? aceptadas : [aceptadas];
  const r = normalizar(respuesta);
  for (const a of lista) {
    const n = normalizar(a);
    if (r === n) return { ok: true, esperado: a };
    if (sinUmlaut(r) === sinUmlaut(n)) return { ok: true, esperado: a, aviso: `With umlaut: ${a}` };
    if (sinUmlaut(r).toLowerCase() === sinUmlaut(n).toLowerCase()) return { ok: true, esperado: a, aviso: `Watch the capitals: ${a}` };
  }
  return { ok: false, esperado: lista[0] };
}

// Para resaltar qué palabras de la respuesta no coinciden con la esperada.
export function diferencias(respuesta, esperado) {
  const a = normalizar(respuesta).split(' ');
  const b = normalizar(esperado).split(' ');
  return b.map((w, i) => ({ w, ok: sinUmlaut(a[i] ?? '').toLowerCase() === sinUmlaut(w).toLowerCase() }));
}
