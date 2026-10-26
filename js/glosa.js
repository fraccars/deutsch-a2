// Globito de traducción: al pasar el cursor por una palabra alemana (o mantenerla
// apretada en una pantalla táctil) muestra la traducción. Los sustantivos llevan su
// artículo y su plural en los colores del curso; los verbos conjugados, su infinitivo.
// No modifica el texto en pantalla: la palabra bajo el puntero se ubica con
// caretPositionFromPoint / caretRangeFromPoint y se resalta con la API de highlights.
// Solo actúa sobre texto en alemán (se detecta por las palabras que conoce el glosario)
// y nunca dentro de [data-sin-glosa], donde la traducción regalaría la respuesta.
import { h, claseArticulo, aviso } from './ui.js';
import { decir } from './audio.js';
import { ajuste } from './store.js';
import { cargarJSON } from './archivos.js';
import { indiceCapitulos, rutaDatos } from './capitulos.js';

// Los glosarios de todos los capítulos juntos: las palabras de un capítulo vuelven en los
// siguientes. Si una forma está en varios, manda el del capítulo más nuevo.
let GLOSA = {};
export async function cargarGlosario() {
  const glosarios = await Promise.all(indiceCapitulos().map((c) => cargarJSON(rutaDatos('glosario.json', c.id)).catch(() => ({}))));
  GLOSA = Object.assign({}, ...glosarios);
}

const TOKEN = /\p{L}[\p{L}-]*/gu;
const buscar = (w) => GLOSA[w] ?? GLOSA[w.toLowerCase()] ?? GLOSA[w[0].toUpperCase() + w.slice(1)] ?? null;

// Texto de un elemento con un espacio entre nodos: con textContent, botones vecinos sin
// espacio entre sí pegan palabras («zu Fuß» + «eine Fahrkarte» → «Fußeine»).
function textoDe(el) {
  const partes = [];
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(), largo = 0; n && largo < 600; n = recorrido.nextNode()) (partes.push(n.data), (largo += n.data.length));
  return partes.join(' ');
}

// ¿El bloque de texto está en alemán? Proporción de palabras que conoce el glosario.
const idiomaCache = new WeakMap();
function enAleman(el) {
  if (idiomaCache.has(el)) return idiomaCache.get(el);
  const palabras = textoDe(el).match(TOKEN) ?? [];
  const si = palabras.length > 0 && palabras.filter((w) => buscar(w)).length / palabras.length >= 0.5;
  idiomaCache.set(el, si);
  return si;
}
function bloque(nodo) {
  let el = nodo.parentElement;
  while (el && el !== document.body && (textoDe(el).match(TOKEN) ?? []).length < 4 && el.parentElement) el = el.parentElement;
  return el;
}

// La palabra bajo el puntero: se toma el elemento que está ahí y se mide cada palabra de
// su texto (las APIs de caret del navegador fallan dentro de botones).
export function palabraEn(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || el.closest('[data-sin-glosa], .glosa, input, textarea, .tag')) return null;
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let nodo = recorrido.nextNode(), vistos = 0; nodo && vistos < 400; nodo = recorrido.nextNode()) {
    for (const m of nodo.data.matchAll(TOKEN)) {
      if (++vistos > 400) break;
      const palabra = m[0].replace(/^-+|-+$/g, '');
      if (!palabra) continue;
      const ini = m.index + m[0].indexOf(palabra);
      const rango = document.createRange();
      rango.setStart(nodo, ini);
      rango.setEnd(nodo, ini + palabra.length);
      const caja = [...rango.getClientRects()].find((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1);
      if (!caja) continue;
      const entrada = buscar(palabra);
      if (!entrada || entrada.pos === 'skip' || !enAleman(bloque(nodo))) return null;
      return { palabra, entrada, rango, caja, clave: `${palabra}@${Math.round(caja.left)},${Math.round(caja.top)}` };
    }
  }
  return null;
}

// ---------- El globito ----------
const globo = h('div', { class: 'glosa', role: 'tooltip', hidden: true });
let actual = null;
let tMostrar = null;
let tOcultar = null;

function contenido({ palabra, entrada: e }) {
  const nombre = e.pos === 'noun' && e.art
    ? [h('span', { class: `art ${claseArticulo(e.art)}` }, e.art), ' ', h('strong', {}, e.lema), e.pl && e.pl !== 'Sg.' ? h('span', {}, h('span', { class: 'pl-sep' }, ', '), h('span', { class: 'pl' }, e.pl)) : e.pl === 'Sg.' && h('span', { class: 'pl-sg' }, ', Sg.')]
    : [h('strong', {}, e.lema)];
  const dicho = e.pos === 'noun' && e.art ? `${e.art} ${e.lema}` : e.lema;
  const tipo = { noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', prep: 'preposition', conj: 'conjunction', pron: 'pronoun', art: 'article', num: 'number', particle: 'particle', interj: 'interjection', name: 'name' }[e.pos] ?? '';
  return [
    h('div', { class: 'glosa-cab' }, h('span', { lang: 'de' }, ...nombre), e.pos !== 'name' && h('button', { class: 'glosa-oir', type: 'button', 'aria-label': `Listen: ${dicho}`, onclick: () => decir(dicho) }, '🔊')),
    h('div', { class: 'glosa-en' }, e.en),
    (tipo || e.nota || palabra.toLowerCase() !== e.lema.toLowerCase()) && h('div', { class: 'glosa-nota' }, [tipo, e.nota].filter(Boolean).join(' · ')),
  ];
}

function mostrar(p) {
  clearTimeout(tOcultar);
  actual = p;
  globo.replaceChildren(...contenido(p).filter(Boolean));
  globo.hidden = false;
  const r = p.caja;
  const g = globo.getBoundingClientRect();
  const arriba = r.top - g.height - 8;
  globo.style.top = `${arriba >= 8 ? arriba : r.bottom + 8}px`;
  globo.style.left = `${Math.max(8, Math.min(innerWidth - g.width - 8, r.left + r.width / 2 - g.width / 2))}px`;
  if (window.CSS?.highlights && window.Highlight) CSS.highlights.set('glosa', new Highlight(p.rango));
  primeraVez();
}

export function ocultarGlosa() {
  clearTimeout(tMostrar);
  actual = null;
  globo.hidden = true;
  if (window.CSS?.highlights) CSS.highlights.delete('glosa');
}
const programarOcultar = () => {
  clearTimeout(tOcultar);
  tOcultar = setTimeout(ocultarGlosa, 220);
};

// La primera vez que aparece, un aviso de que existe (por si se descubrió de casualidad).
function primeraVez() {
  if (ajuste('glosaVista')) return;
  ajuste('glosaVista', true);
  aviso('💡 Tip: hover over any German word to see its translation.');
}

export function activarGlosa() {
  document.body.append(globo);
  // Ratón: al quedarse quieto sobre una palabra.
  document.addEventListener('pointermove', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    if (globo.contains(ev.target)) return clearTimeout(tOcultar);
    const p = palabraEn(ev.clientX, ev.clientY);
    if (p && actual && p.clave === actual.clave) return clearTimeout(tOcultar);
    clearTimeout(tMostrar);
    // Sobre otra palabra: se reemplaza (más rápido si ya había un globito abierto); fuera de las palabras: se cierra.
    if (p) tMostrar = setTimeout(() => mostrar(p), actual ? 120 : 280);
    else if (actual) programarOcultar();
  }, { passive: true });

  // Táctil: mantener apretada la palabra. Al soltar no se dispara el clic (para no
  // elegir sin querer la opción sobre la que estaba la palabra).
  let toque = null;
  let anularHasta = 0;
  document.addEventListener('pointerdown', (ev) => {
    if (globo.contains(ev.target)) return;
    if (ev.pointerType === 'mouse') return actual && ocultarGlosa();
    ocultarGlosa();
    const [x, y] = [ev.clientX, ev.clientY];
    toque = { x, y, t: setTimeout(() => {
      const p = palabraEn(x, y);
      if (p) (mostrar(p), (anularHasta = Infinity));
    }, 450) };
  }, { passive: true });
  const cancelar = (ev) => {
    if (!toque) return;
    if (ev.type === 'pointermove' && Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) <= 10) return;
    clearTimeout(toque.t);
    if (ev.type !== 'pointermove' && anularHasta === Infinity) anularHasta = Date.now() + 500;
  };
  document.addEventListener('pointermove', cancelar, { passive: true });
  document.addEventListener('pointerup', cancelar, { passive: true });
  document.addEventListener('pointercancel', cancelar, { passive: true });
  document.addEventListener('click', (ev) => {
    if (Date.now() >= anularHasta) return;
    anularHasta = 0;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
  document.addEventListener('contextmenu', (ev) => actual && ev.preventDefault());

  addEventListener('scroll', ocultarGlosa, { passive: true });
  addEventListener('hashchange', ocultarGlosa);
  addEventListener('keydown', (ev) => ev.key === 'Escape' && ocultarGlosa());
}
