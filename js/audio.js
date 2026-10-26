// Audio: pistas del libro (MP3 originales) y pronunciación de palabras sueltas
// generada localmente con Piper (media/tts/manifest.json: texto → archivo).
// Si una palabra no tiene archivo, se usa la voz alemana del sistema, si existe.
// En la página publicada los audios están cifrados: se descifran a una URL blob: (archivos.js),
// que igual deja adelantar, retroceder y cambiar la velocidad.
import { h } from './ui.js';
import { ajuste, registrar } from './store.js';
import { textoHablado, claveTTS } from './tts-clave.js';
import { CIFRADO } from './modo.js';
import { cargarJSON, urlMedio, urlMedioLista } from './archivos.js';

let manifiesto = {};
export async function cargarManifiesto() {
  try {
    manifiesto = await cargarJSON('media/tts/manifest.json');
  } catch {
    /* sin audio generado todavía */
  }
}

// En la página publicada el audio llega unos milisegundos después del toque (se descifra), y
// Safari solo deja empezar a reproducir dentro de un toque. Con el primer toque se le hace
// sonar un silencio a cada reproductor: desde ahí puede sonar aunque el audio llegue después.
let silencio = null;
export function habilitarAlTocar(audio) {
  if (!CIFRADO) return;
  const habilitar = () => {
    ['click', 'touchend', 'keydown'].forEach((t) => removeEventListener(t, habilitar, true));
    if (audio.src) return;
    if (!silencio) {
      const wav = new DataView(new ArrayBuffer(44 + 320)); // 20 ms de silencio, 8 kHz, 16 bits
      [[0, 0x52494646], [8, 0x57415645], [12, 0x666d7420], [36, 0x64617461]].forEach(([i, v]) => wav.setUint32(i, v));
      [[4, 356], [16, 16], [24, 8000], [28, 16000], [40, 320]].forEach(([i, v]) => wav.setUint32(i, v, true));
      [[20, 1], [22, 1], [32, 2], [34, 16]].forEach(([i, v]) => wav.setUint16(i, v, true));
      silencio = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    }
    audio.src = silencio;
    audio.play().catch(() => {});
  };
  ['click', 'touchend', 'keydown'].forEach((t) => addEventListener(t, habilitar, true));
}

const reproductor = new Audio();
habilitarAlTocar(reproductor);
let turno = 0;

function vozDelSistema(limpio, mio) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((ok) => {
    speechSynthesis.cancel();
    if (mio !== turno) return ok();
    const u = new SpeechSynthesisUtterance(limpio);
    u.lang = 'de-DE';
    const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('de'));
    if (v) u.voice = v;
    u.onend = u.onerror = () => ok();
    speechSynthesis.speak(u);
  });
}

/** Dice un texto en alemán. Devuelve una promesa que se resuelve al terminar. */
export function decir(texto, voz = 'f') {
  if (!ajuste('sonido')) return Promise.resolve();
  const limpio = textoHablado(texto);
  if (!limpio) return Promise.resolve();
  const archivo = manifiesto[claveTTS(limpio, voz)] ?? manifiesto[limpio];
  const mio = ++turno;
  if (!archivo) return vozDelSistema(limpio, mio);
  const tocar = (url) => new Promise((ok) => {
    if (mio !== turno) return ok();
    reproductor.onended = reproductor.onerror = () => ok();
    reproductor.src = url;
    reproductor.playbackRate = 1;
    reproductor.play().catch(() => ok());
  });
  const ruta = `media/tts/${archivo}`;
  const lista = urlMedioLista(ruta);
  return lista ? tocar(lista) : urlMedio(ruta).then(tocar, () => vozDelSistema(limpio, mio));
}

export function callar() {
  turno++;
  reproductor.pause();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export const tieneAudio = (texto) => !!manifiesto[String(texto).trim()];

export function botonDecir(texto, etiqueta = 'Listen') {
  return h('button', { class: 'btn-icono', type: 'button', title: etiqueta, 'aria-label': `${etiqueta}: ${texto}`, onclick: (e) => (e.stopPropagation(), decir(texto)) }, '🔊');
}

let pistas = null;
export async function pistasLibro() {
  if (!pistas) pistas = await cargarJSON('data/k07/audios.json');
  return pistas;
}

// En la página publicada, una pista del libro se descifra cuando está por verse, no antes: en
// «Listening» hay nueve pistas de varios MB.
const alVer = new WeakMap();
const observador = 'IntersectionObserver' in window ? new IntersectionObserver((entradas) => {
  for (const e of entradas.filter((x) => x.isIntersecting)) (observador.unobserve(e.target), alVer.get(e.target)?.());
}, { rootMargin: '400px' }) : null;
function cuandoSeVea(el, fn) {
  if (!observador) return fn();
  alVer.set(el, fn);
  observador.observe(el);
}

// Reproductor de una pista del libro con velocidad, retroceso de 5 s y transcripción.
export function reproductorPista(pista, { transcripcion = true } = {}) {
  // Pistas del Übungsbuch sin el MP3 original: se trabajan leyendo la transcripción,
  // que por eso se muestra siempre abierta (sin voz sintética).
  if (!pista.archivo) {
    return h('div', { class: 'pista' },
      h('div', { class: 'pista-cab' }, h('span', { class: 'pista-id ub' }, pista.id), h('span', { class: 'pista-tema' }, pista.tema)),
      h('p', { class: 'pista-nota' }, 'The original audio for this Übungsbuch track is not in your material. Read the transcript instead.'),
      h('div', { class: 'trans-texto abierta' }, ...pista.transcripcion.split('\n').map((l) => h('p', {}, l))));
  }
  const audio = h('audio', { preload: 'none', controls: true });
  // defaultPlaybackRate también: cargar el archivo vuelve la velocidad a ese valor.
  const velocidad = (v) => ((audio.defaultPlaybackRate = v), (audio.playbackRate = v));
  const ruta = `media/libro/${pista.archivo}`;
  if (CIFRADO) cuandoSeVea(audio, () => urlMedio(ruta).then((url) => ((audio.src = url), velocidad(ajuste('velocidad') ?? 1)), () => {}));
  else audio.src = ruta;
  velocidad(ajuste('velocidad') ?? 1);
  // Para el plan: la pista cuenta como escuchada al llegar al 80 %.
  let contada = false;
  audio.addEventListener('timeupdate', () => {
    if (contada || !audio.duration || audio.currentTime / audio.duration < 0.8) return;
    contada = true;
    registrar({ tipo: 'escucha', pista: pista.id });
  });
  const vel = (v) =>
    h('button', {
      class: `chip ${(ajuste('velocidad') ?? 1) === v ? 'activo' : ''}`,
      type: 'button',
      onclick: (e) => {
        velocidad(v);
        ajuste('velocidad', v);
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === e.currentTarget));
      },
    }, `${v}×`);
  const trans = transcripcion && pista.transcripcion
    ? h('details', { class: 'transcripcion' }, h('summary', {}, 'Show transcript'), h('div', { class: 'trans-texto' }, ...pista.transcripcion.split('\n').map((l) => h('p', {}, l))))
    : null;
  return h('div', { class: 'pista' },
    h('div', { class: 'pista-cab' }, h('span', { class: 'pista-id' }, pista.id), h('span', { class: 'pista-tema' }, pista.tema)),
    audio,
    h('div', { class: 'pista-ctrl' },
      h('button', { class: 'chip', type: 'button', onclick: () => (audio.currentTime = Math.max(0, audio.currentTime - 5)) }, '⟲ 5 s'),
      vel(0.75), vel(0.9), vel(1)),
    trans);
}
