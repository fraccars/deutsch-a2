// Speaking en el navegador (página publicada): reconoce la voz con vosk-browser (Vosk en
// WebAssembly, dentro de un Worker) y el modelo alemán chico, vosk-model-small-de-0.15.
// La voz no sale del dispositivo. Devuelve lo mismo que /api/reconocer del servidor local
// (tools/asr/reconocedor.py): {libre, palabras: [{w, conf, ini, fin}], estricto}.
// - libre: la transcripción sin pistas.
// - estricto (si hay frase esperada): el reconocedor solo puede elegir entre la frase y «[unk]».
// La grabación se decodifica con Web Audio y se pasa a 16 kHz mono, como hace ffmpeg en el
// servidor. La primera vez baja el modelo (unos 45 MB) y vosk-browser lo guarda en IndexedDB:
// desde ahí anda sin internet.
import { indiceContenido } from './archivos.js';

const LISTA = 'deutsch-a2-voz'; // el modelo que ya quedó guardado en este dispositivo

export const vozDisponible = () => typeof WebAssembly === 'object' && typeof Worker === 'function' && 'indexedDB' in window
  && typeof OfflineAudioContext === 'function' && typeof MediaRecorder === 'function';

let modelo = null;
function cargarModelo() {
  modelo ??= (async () => {
    const { voz } = await indiceContenido();
    // vosk.js es un paquete UMD: importado como módulo deja la biblioteca en globalThis.Vosk.
    if (!globalThis.Vosk) await import(new URL(voz.lib, location.href).href);
    // La URL tiene que ser absoluta: el Worker de vosk-browser la resuelve desde la raíz del sitio.
    const m = await globalThis.Vosk.createModel(new URL(voz.modelo, location.href).href, -2);
    localStorage.setItem(LISTA, voz.modelo);
    return m;
  })();
  modelo.catch(() => (modelo = null));
  return modelo;
}

/** ¿El modelo ya está guardado en este dispositivo (anda sin internet)? */
export async function vozLista() {
  try {
    return localStorage.getItem(LISTA) === (await indiceContenido()).voz?.modelo;
  } catch {
    return false;
  }
}

/** Baja y guarda el modelo para usarlo sin internet, y libera la memoria del Worker. */
export async function prepararVoz() {
  if (await vozLista()) return;
  const m = await cargarModelo();
  if (!location.hash.startsWith('#/speaking')) (m.terminate(), (modelo = null));
}

// La grabación (webm/opus o mp4/aac, según el navegador) → Float32Array a 16 kHz mono.
async function aPCM(blob) {
  // decodeAudioData remuestrea a la frecuencia del contexto: 16 kHz, la que espera Vosk.
  const buf = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await blob.arrayBuffer());
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const canal = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += canal[i] / buf.numberOfChannels;
  }
  return mono;
}

// Una pasada del reconocedor por toda la grabación, como en el servidor: todo el audio de una
// vez y después el resultado final. Si Vosk detecta el fin de una frase en el medio, el texto
// llega repartido en dos resultados y se juntan.
function decodificar(m, pcm, { palabras = false, gramatica = null } = {}) {
  return new Promise((listo, mal) => {
    const rec = gramatica ? new m.KaldiRecognizer(16000, JSON.stringify(gramatica)) : new m.KaldiRecognizer(16000);
    if (palabras) rec.setWords(true);
    const partes = [];
    let faltan = 2; // un mensaje por el audio (result o partialresult) y otro por el final
    const fin = () => {
      rec.remove();
      listo({
        texto: partes.map((p) => p.text).filter(Boolean).join(' '),
        palabras: partes.flatMap((p) => p.result ?? []).map((x) => ({ w: x.word, conf: Math.round(x.conf * 100) / 100, ini: x.start, fin: x.end })),
      });
    };
    rec.on('result', (msj) => (partes.push(msj.result), --faltan === 0 && fin()));
    rec.on('partialresult', () => --faltan === 0 && fin());
    rec.on('error', (msj) => (rec.remove(), mal(new Error(msj.error))));
    rec.acceptWaveformFloat(pcm, 16000);
    rec.retrieveFinalResult();
  });
}

/** Igual que el servidor: {libre, palabras, estricto}. esperado viene normalizado (normalizarHabla). */
export async function reconocer(blob, esperado = '') {
  const [m, pcm] = await Promise.all([cargarModelo(), aPCM(blob)]);
  const libre = await decodificar(m, pcm, { palabras: true });
  const salida = { libre: libre.texto, palabras: libre.palabras };
  if (esperado) salida.estricto = (await decodificar(m, pcm, { gramatica: [esperado, '[unk]'] })).texto;
  return salida;
}
