// Speaking: leer en voz alta y responder consignas. Graba con el micrófono, transcribe con
// Vosk y corrige. La voz no sale del equipo: en la versión local la reconoce el servidor
// (/api/reconocer); en la página publicada, el navegador (voz.js).
// El modelo de pronunciación es el audio original del libro cuando la frase está en
// una pista (se reproduce solo ese tramo, sin modificar el archivo); si no, la voz sintética.
import { h, confeti, xpFlotante } from './ui.js';
import { decir, callar, pistasLibro, habilitarAlTocar } from './audio.js';
import { registrar, sumarXP, actividad } from './store.js';
import { CIFRADO } from './modo.js';
import { cargarJSON, urlMedio } from './archivos.js';
import { reconocer, vozDisponible, vozLista } from './voz.js';
import { capituloActual, porCapitulo, rutaDatos } from './capitulos.js';

// Los bloques de un capítulo y los tramos del libro que sirven de modelo.
export const datosSpeaking = porCapitulo((cap) => Promise.all([
  cargarJSON(rutaDatos('speaking.json', cap)),
  cargarJSON(rutaDatos('segmentos.json', cap)).catch(() => ({})),
]).then(([datos, segmentos]) => ({ datos, segmentos })));

// Los del capítulo actual, para la pantalla.
let DATOS = null;
let SEGMENTOS = {};
export async function cargarSpeaking() {
  ({ datos: DATOS, segmentos: SEGMENTOS } = await datosSpeaking());
  return DATOS;
}
// Los intentos de un ítem (los de antes de haber varios capítulos son del K7).
export const intentosDe = (cap, item) => actividad().filter((a) => a.tipo === 'speaking' && a.item === item && (a.cap ?? 'k07') === cap);

// ---------- Normalización (las mismas reglas que tools/segmentar.py) ----------
const UNIDADES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
const DECENAS = { 2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fünfzig', 6: 'sechzig', 7: 'siebzig', 8: 'achtzig', 9: 'neunzig' };
function numero(n) {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const [d, u] = [Math.floor(n / 10), n % 10];
    return u === 0 ? DECENAS[d] : `${u === 1 ? 'ein' : UNIDADES[u]}und${DECENAS[d]}`;
  }
  return String(n);
}
export const normalizarHabla = (s) => String(s).toLowerCase()
  .replace(/\d+/g, (m) => numero(Number(m)))
  .replace(/[„“”"«»().,!?;:–—…‘’']/g, ' ')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const palabras = (s) => normalizarHabla(s).split(' ').filter(Boolean);

// ---------- Corrección ----------
// Palabras esperadas encontradas en la transcripción libre, en orden. Las de 3 letras o
// menos tienen que aparecer enteras; las largas pueden estar partidas («kinder abteil»).
function alinearLibre(esperadas, oidas) {
  const unidas = oidas.join('');
  const inicios = [];
  let acc = 0;
  for (const w of oidas) (inicios.push([acc, w]), (acc += w.length));
  const ok = new Set();
  let pos = 0;
  esperadas.forEach((w, i) => {
    if (w.length <= 3) {
      const k = inicios.find(([ini, x]) => ini >= pos && x === w);
      if (k) (ok.add(i), (pos = k[0] + w.length));
    } else {
      const j = unidas.indexOf(w, pos);
      if (j >= 0) (ok.add(i), (pos = j + w.length));
    }
  });
  return ok;
}

// Índices de las palabras esperadas que forman parte de la subsecuencia común más larga.
function enComun(esperadas, oidas) {
  const dp = Array.from({ length: esperadas.length + 1 }, () => new Array(oidas.length + 1).fill(0));
  for (let i = esperadas.length - 1; i >= 0; i--) {
    for (let j = oidas.length - 1; j >= 0; j--) dp[i][j] = esperadas[i] === oidas[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out = new Set();
  let i = 0;
  let j = 0;
  while (i < esperadas.length && j < oidas.length) {
    if (esperadas[i] === oidas[j]) (out.add(i), i++, j++);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * Lectura en voz alta. Verde: el reconocedor la entendió. Ámbar: solo la confirmó la
 * verificación estricta (dudosa). Rojo: no se reconoció. Si la verificación estricta
 * reconoce la frase completa, cuenta como bien entera.
 */
export function evaluarLectura(texto, res) {
  const esperadas = palabras(texto);
  const libre = alinearLibre(esperadas, palabras(res.libre ?? ''));
  const estricta = enComun(esperadas, palabras((res.estricto ?? '').replace('[unk]', '')));
  const completa = estricta.size === esperadas.length;
  const estados = esperadas.map((_, i) => (completa || libre.has(i) ? 'bien' : estricta.has(i) ? 'dudosa' : 'mal'));
  // La letra suelta de E-Scooter, U-Bahn o S-Bahn el reconocedor suele omitirla: sigue a la palabra de al lado.
  for (let i = esperadas.length - 2; i >= 0; i--) if (esperadas[i].length === 1) estados[i] = estados[i + 1];
  const puntaje = completa ? 1 : (estados.filter((e) => e === 'bien').length + 0.6 * estados.filter((e) => e === 'dudosa').length) / esperadas.length;
  return { estados, puntaje };
}

/** Respuesta libre: estructuras pedidas (claves) y largo mínimo. */
export function evaluarRespuesta(item, res) {
  const texto = normalizarHabla(res.libre ?? '');
  const n = texto ? texto.split(' ').length : 0;
  const claves = item.claves.map((c) => ({ ...c, ok: new RegExp(c.re, 'i').test(texto) }));
  const largoOk = n >= item.minPalabras;
  const puntaje = (claves.filter((c) => c.ok).length + (largoOk ? 1 : 0)) / (claves.length + 1);
  return { texto, n, claves, largoOk, puntaje };
}

// Pinta la frase original (con mayúsculas y puntuación) con el estado de cada palabra.
function frasePintada(texto, estados) {
  let k = 0;
  return h('p', { class: 'sp-frase', lang: 'de' }, texto.split(' ').map((w) => {
    const partes = palabras(w);
    const mios = estados ? estados.slice(k, k + partes.length) : [];
    k += partes.length;
    const estado = !estados || !mios.length ? '' : mios.includes('mal') ? 'mal' : mios.includes('dudosa') ? 'dudosa' : 'bien';
    return [h('span', { class: `sp-pal ${estado}` }, w), ' '];
  }));
}

// ---------- Audio: modelo y grabación ----------
const modelo = new Audio();
habilitarAlTocar(modelo);
let finTramo = null;
let tramoCargado = null;
async function tocarTramo(archivo, desde, hasta) {
  callar();
  clearTimeout(finTramo);
  const ruta = `media/libro/${archivo}`;
  if (tramoCargado !== ruta) {
    modelo.src = await urlMedio(ruta);
    tramoCargado = ruta;
    await new Promise((ok) => modelo.addEventListener('loadedmetadata', ok, { once: true }));
  }
  modelo.playbackRate = 1;
  modelo.currentTime = desde;
  await modelo.play().catch(() => {});
  finTramo = setTimeout(() => modelo.pause(), (hasta - desde) * 1000);
}
function pararModelo() {
  clearTimeout(finTramo);
  modelo.pause();
  callar();
}

async function botonModelo(item) {
  const seg = SEGMENTOS[item.id];
  if (seg) {
    const pista = (await pistasLibro()).find((p) => p.id === seg.pista);
    // En la página publicada la pista se descifra ya, para que al tocar suene enseguida.
    await urlMedio(`media/libro/${pista.archivo}`).catch(() => {});
    return h('button', { class: 'btn', type: 'button', onclick: () => tocarTramo(pista.archivo, seg.desde, seg.hasta) }, '🔊 Model ', h('span', { class: 'tag' }, `book ${seg.pista}`));
  }
  return h('button', { class: 'btn', type: 'button', onclick: () => (pararModelo(), decir(item.de ?? item.modelo)) }, '🔊 Model');
}

async function grabar(maxSeg, alNivel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const tipo = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  const trozos = [];
  rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
  // Vúmetro: el nivel del micrófono, para ver que te está escuchando.
  const ctx = new AudioContext();
  const analizador = ctx.createAnalyser();
  analizador.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analizador);
  const buf = new Uint8Array(analizador.fftSize);
  let cuadro;
  const medir = () => {
    analizador.getByteTimeDomainData(buf);
    let max = 0;
    for (const v of buf) max = Math.max(max, Math.abs(v - 128));
    alNivel(max / 128);
    cuadro = requestAnimationFrame(medir);
  };
  medir();
  const terminada = new Promise((ok) => {
    rec.onstop = () => {
      cancelAnimationFrame(cuadro);
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      ok(new Blob(trozos, { type: rec.mimeType || 'audio/webm' }));
    };
  });
  rec.start();
  const tope = setTimeout(() => rec.state === 'recording' && rec.stop(), maxSeg * 1000);
  return { terminada, detener: () => (clearTimeout(tope), rec.state === 'recording' && rec.stop(), terminada) };
}

export async function transcribir(blob, esperado = '') {
  if (CIFRADO) return reconocer(blob, esperado);
  const r = await fetch('/api/reconocer', { method: 'POST', body: blob, headers: { 'x-esperado': encodeURIComponent(esperado) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
  return j;
}

// En la página publicada, si el modelo de voz ya está guardado en el dispositivo.
let vozYaLista = true;

const mensajeMicrofono = (e) => (e.name === 'NotAllowedError'
  ? 'The browser blocked the microphone. Allow it with the 🎙️/🔒 icon in the address bar and try again.'
  : e.name === 'NotFoundError' ? 'No microphone found. Plug one in (or check the headset) and try again.' : `Could not record: ${e.message}`);

// ---------- Un ítem (leer o responder) ----------
function vistaItem(set, item, i, alTerminar) {
  const cont = h('div', { class: 'sp-item' });
  const esLectura = item.tipo === 'leer';
  const zonaResultado = h('div', { class: 'sp-resultado' });
  const nivel = h('span', { class: 'sp-nivel' }, h('span', { class: 'sp-nivel-barra' }));
  const reloj = h('span', { class: 'sp-reloj' });
  const estado = h('div', { class: 'sp-estado', 'aria-live': 'polite' });
  let grabacion = null;
  let miAudio = null;
  let segundos = 0;
  let cronometro = null;

  const botonGrabar = h('button', { class: 'btn primario sp-grabar', type: 'button' }, '🎙️ Record');
  botonGrabar.addEventListener('click', async () => {
    if (grabacion) return detener();
    pararModelo();
    zonaResultado.replaceChildren();
    try {
      grabacion = await grabar(esLectura ? 15 : 60, (v) => (nivel.firstChild.style.width = `${Math.min(100, v * 140)}%`));
    } catch (e) {
      estado.className = 'sp-estado mal';
      estado.textContent = mensajeMicrofono(e);
      return;
    }
    segundos = 0;
    reloj.textContent = '0:00';
    cronometro = setInterval(() => (reloj.textContent = `0:${String(++segundos).padStart(2, '0')}`), 1000);
    cont.classList.add('grabando');
    botonGrabar.textContent = '■ Stop';
    estado.className = 'sp-estado';
    estado.textContent = esLectura ? 'Recording… read the sentence, then press Stop.' : 'Recording… speak, then press Stop (max. 60 s).';
    grabacion.terminada.then(() => grabacion && detener());
  });

  async function detener() {
    const g = grabacion;
    grabacion = null;
    clearInterval(cronometro);
    cont.classList.remove('grabando');
    botonGrabar.textContent = '🎙️ Record again';
    botonGrabar.disabled = true;
    const blob = await g.detener();
    if (miAudio) URL.revokeObjectURL(miAudio.src);
    miAudio = new Audio(URL.createObjectURL(blob));
    estado.className = 'sp-estado';
    estado.textContent = vozYaLista ? 'Checking…' : 'Checking… The first time takes a while: the speech checker is downloading (about 45 MB).';
    try {
      const res = await transcribir(blob, esLectura ? normalizarHabla(item.de) : '');
      vozYaLista = true;
      mostrarResultado(res);
      estado.textContent = '';
    } catch (e) {
      estado.className = 'sp-estado mal';
      estado.textContent = `The speech checker failed: ${e.message}`;
    } finally {
      botonGrabar.disabled = false;
    }
  }

  function mostrarResultado(res) {
    const ev = esLectura ? evaluarLectura(item.de, res) : evaluarRespuesta(item, res);
    const pct = Math.round(ev.puntaje * 100);
    registrar({ tipo: 'speaking', cap: capituloActual(), set: set.id, item: item.id, modo: item.tipo, puntaje: ev.puntaje });
    const xp = Math.round(ev.puntaje * 5);
    if (xp) (sumarXP(xp), xpFlotante(xp, botonGrabar));
    const msg = ev.puntaje >= 0.9 ? ['bien', 'Excellent! 🎉'] : ev.puntaje >= 0.7 ? ['medio', esLectura ? 'Good! Practice the highlighted words and try again.' : 'Good! Try to add what is missing.'] : ['mal', esLectura ? 'Not quite. Listen to the model, then try again.' : 'Try again using the hints below.'];
    const tuyo = h('button', { class: 'btn', type: 'button', onclick: () => (pararModelo(), miAudio.play()) }, '▶ Your recording');
    if (esLectura) {
      cont.querySelector('.sp-frase').replaceWith(frasePintada(item.de, ev.estados));
      zonaResultado.replaceChildren(
        h('div', { class: `sp-nota ${msg[0]}` }, h('strong', {}, `${pct}%`), ' ', msg[1]),
        h('p', { class: 'sp-leyenda' }, h('span', { class: 'sp-pal bien' }, 'understood'), ' · ', h('span', { class: 'sp-pal dudosa' }, 'unclear'), ' · ', h('span', { class: 'sp-pal mal' }, 'not recognized')),
        h('p', { class: 'pista-txt' }, 'The checker heard: ', h('em', { lang: 'de' }, res.libre || '(nothing)')),
        h('div', { class: 'fila-btn izq' }, tuyo));
    } else {
      botonModelo(item).then((b) => zonaResultado.querySelector('.sp-modelo-btn')?.replaceWith(b));
      zonaResultado.replaceChildren(
        h('div', { class: `sp-nota ${msg[0]}` }, h('strong', {}, `${pct}%`), ' ', msg[1]),
        h('p', { class: 'sp-oido' }, 'The checker heard: ', h('em', { lang: 'de' }, res.libre || '(nothing)')),
        h('ul', { class: 'sp-claves' },
          ev.claves.map((c) => h('li', { class: c.ok ? 'ok' : '' }, c.ok ? '✓ ' : '✗ ', c.et)),
          h('li', { class: ev.largoOk ? 'ok' : '' }, ev.largoOk ? '✓ ' : '✗ ', `at least ${item.minPalabras} words (you said ${ev.n})`)),
        h('div', { class: 'sp-modelo' }, h('div', { class: 'modelo-tit' }, 'A possible answer'), h('p', { lang: 'de' }, item.modelo)),
        h('div', { class: 'fila-btn izq' }, tuyo, h('span', { class: 'sp-modelo-btn' })));
    }
    siguiente.classList.remove('oculto');
  }

  const siguiente = h('button', { class: 'btn primario oculto', type: 'button', onclick: () => (pararModelo(), alTerminar()) }, i + 1 < set.items.length ? 'Next →' : 'Finish');
  const cabecera = esLectura
    ? [h('div', { class: 'sp-tipo' }, '📖 Read aloud'), frasePintada(item.de), h('p', { class: 'sp-en' }, item.en)]
    : [h('div', { class: 'sp-tipo' }, '💬 Answer'), h('p', { class: 'sp-consigna' }, item.consigna), h('div', { class: 'banco' }, item.ayuda.map((a) => h('span', { class: 'chip', lang: 'de' }, a)))];
  const acciones = h('div', { class: 'fila-btn izq sp-acciones' }, botonGrabar, h('span', { class: 'sp-rec' }, h('span', { class: 'sp-punto' }), reloj, nivel));
  cont.append(...cabecera, acciones, estado, zonaResultado, h('div', { class: 'fila-btn izq' }, siguiente));
  if (esLectura) botonModelo(item).then((b) => acciones.prepend(b));
  return cont;
}

// ---------- Pantallas ----------
const mejores = (set) => set.items.map((it) => Math.max(0, ...intentosDe(capituloActual(), it.id).map((a) => a.puntaje)));
const intentados = (set) => set.items.filter((it) => intentosDe(capituloActual(), it.id).length).length;

export async function pantallaSpeaking(raiz, setId) {
  await cargarSpeaking();
  let aviso = '';
  vozYaLista = !CIFRADO || (await vozLista());
  if (CIFRADO) {
    if (!vozDisponible()) aviso = h('div', { class: 'feedback mal' }, 'This browser cannot run the speech checker. Try an up-to-date Safari, Chrome or Edge.');
    else if (!vozYaLista) aviso = h('div', { class: 'tip' }, '⏳ The first check downloads the speech checker (about 45 MB, once). After that it works offline.');
  } else {
    const disponible = await fetch('/api/reconocer').then((r) => r.json()).then((j) => j.disponible).catch(() => false);
    if (!disponible) aviso = h('div', { class: 'feedback mal' }, 'The speech checker is not available. Open the course with “ABRIR CURSO.cmd” (it starts the local server with the recognizer).');
  }
  const set = DATOS.sets.find((s) => s.id === setId);
  if (!set) {
    raiz.replaceChildren(
      h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, '🎙️ Speaking'),
        h('p', { class: 'sub' }, 'Read sentences aloud and answer short questions. A speech recognizer running on this device checks what you said; nothing is recorded or sent anywhere.')),
      aviso,
      h('div', { class: 'tip' }, '💡 The checker understands clear, calm speech best. Use a headset if you can, speak at a normal pace, and don\'t worry about a few amber words: it is a helper, not a judge.'),
      h('div', { class: 'grilla-modos' }, DATOS.sets.map((s, k) => {
        const m = mejores(s);
        const prom = Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 100);
        return h('a', { class: 'modo', href: `#/speaking/${s.id}` }, h('span', { class: 'modo-ico' }, `${k + 1}`), h('span', { class: 'modo-tit' }, `Day ${k + 1} · ${s.titulo}`),
          h('span', { class: 'modo-desc' }, `${intentados(s)}/${s.items.length} done${intentados(s) ? ` · best average ${prom}%` : ''}`));
      })));
    return;
  }
  const n = DATOS.sets.indexOf(set) + 1;
  const cont = h('div', { class: 'juego' });
  raiz.replaceChildren(h('div', { class: 'juego-cab' }, h('a', { class: 'btn-volver', href: '#/speaking' }, '← Speaking'), h('h1', {}, `🎙️ Day ${n} · ${set.titulo}`)), aviso, cont);
  let i = 0;
  const mostrar = () => {
    if (i >= set.items.length) {
      const m = mejores(set);
      const prom = m.reduce((a, b) => a + b, 0) / m.length;
      if (prom >= 0.6) confeti();
      return cont.replaceChildren(h('div', { class: 'fin-ronda' },
        h('div', { class: 'fin-num' }, `${Math.round(prom * 100)}%`),
        h('p', {}, prom >= 0.6 ? 'Speaking set complete! 🎉' : 'Repeat the items with a low score to reach 60% on average.'),
        h('div', { class: 'fila-btn' }, h('button', { class: 'btn', type: 'button', onclick: () => ((i = 0), mostrar()) }, 'Practice again'), h('a', { class: 'btn primario', href: '#/plan' }, 'Back to the plan'))));
    }
    cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i + 1} / ${set.items.length}`), vistaItem(set, set.items[i], i, () => (i++, mostrar())));
  };
  mostrar();
}
