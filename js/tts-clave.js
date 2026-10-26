// Normalización compartida entre la app y el generador de audio: el texto que se
// pronuncia y la clave del manifiesto tienen que coincidir exactamente.
export function textoHablado(texto) {
  return String(texto)
    .replace(/<[^>]+>/g, '')
    .replace(/[○●→]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.?!;:])/g, '$1')
    .trim();
}

// Clave del manifiesto: el texto tal cual para la voz femenina y «m|texto» para la masculina.
export const claveTTS = (texto, voz = 'f') => (voz === 'm' ? `m|${texto}` : texto);

// Líneas de una transcripción con su voz: ○ = femenina, ● = masculina.
export function lineasDialogo(pista) {
  return pista.transcripcion.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({
    voz: l.startsWith('●') ? 'm' : l.startsWith('○') ? 'f' : pista.voz ?? 'f',
    texto: l.replace(/^[○●]\s*/, '').replace(/^\d+\s+/, ''),
  }));
}

