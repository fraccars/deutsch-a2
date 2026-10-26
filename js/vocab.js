// Entrenador de vocabulario: sustantivos siempre con artículo y plural.
import { h, mezclar, azar, claseArticulo, xpFlotante, confeti, aviso } from './ui.js';
import { decir, botonDecir } from './audio.js';
import { corregir } from './check.js';
import { calificar, pendiente, tarjeta, sumarXP, ajuste, registrar } from './store.js';
import { cargarJSON } from './archivos.js';

let VOCAB = [];
export async function cargarVocab() {
  if (!VOCAB.length) VOCAB = await cargarJSON('data/k07/vocabulario.json');
  return VOCAB;
}

// Nombre visible de cada tipo de palabra (los datos usan claves en español).
const TIPO = { todos: 'all', sustantivo: 'noun', verbo: 'verb', adjetivo: 'adjective', adverbio: 'adverb', expresion: 'expression', preposicion: 'preposition', conjuncion: 'conjunction' };
const nombreTipo = (t) => TIPO[t] ?? t;

const esSust = (v) => v.tipo === 'sustantivo' && v.art;
export const conArticulo = (v) => (esSust(v) ? `${v.art} ${v.de}` : v.de);
const claveV = (v) => `v:${conArticulo(v)}`;
const sinPlural = (v) => !!v.soloSingular || !v.plForm;

export function etiquetaPalabra(v, { plural = true } = {}) {
  return h('span', { class: 'palabra' },
    esSust(v) && h('span', { class: `art ${claseArticulo(v.art)}` }, v.art), ' ',
    h('span', { class: 'palabra-de' }, v.de),
    plural && esSust(v) && v.pl && marcaPlural(v));
}

// La terminación del plural («, -e», «, -¨er») en verde esmeralda; «Sg.» (sin plural) en gris.
export function marcaPlural(v) {
  if (sinPlural(v)) return h('span', { class: 'pl-sg' }, ', Sg.');
  return h('span', {}, h('span', { class: 'pl-sep' }, ', '), h('span', { class: 'pl' }, v.pl));
}

// Forma plural completa con lo agregado respecto del singular en verde esmeralda:
// la diéresis y la terminación (die Parkpl[ä]tz[e], die Parkh[ä]us[er], die Ampel[n]).
// El artículo plural «die» va sin color: no es el die femenino.
export function formaPlural(v) {
  const s = v.de;
  const p = v.plForm.replace(/^die /, '');
  // Subsecuencia común más larga, alineada lo antes posible: lo que sobra del plural es lo agregado.
  const dp = Array.from({ length: s.length + 1 }, () => new Array(p.length + 1).fill(0));
  for (let i = s.length - 1; i >= 0; i--) {
    for (let j = p.length - 1; j >= 0; j--) dp[i][j] = s[i] === p[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const partes = [];
  const poner = (c, nuevo) => {
    const u = partes.at(-1);
    if (u && u.nuevo === nuevo) u.t += c;
    else partes.push({ t: c, nuevo });
  };
  let i = 0;
  let j = 0;
  while (j < p.length) {
    if (i < s.length && s[i] === p[j]) (poner(p[j], false), i++, j++);
    else if (i < s.length && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else (poner(p[j], true), j++);
  }
  return h('span', { class: 'forma-pl' }, 'die ', partes.map((x) => (x.nuevo ? h('span', { class: 'pl-add' }, x.t) : x.t)));
}

// Elige las palabras de una ronda: primero las vencidas, después las nuevas.
function ronda(filtro, n = 10) {
  const lista = VOCAB.filter(filtro);
  const vencidas = lista.filter((v) => tarjeta(claveV(v)) && pendiente(claveV(v)));
  const nuevas = lista.filter((v) => !tarjeta(claveV(v)));
  const resto = lista.filter((v) => !vencidas.includes(v) && !nuevas.includes(v));
  return [...mezclar(vencidas), ...mezclar(nuevas), ...mezclar(resto)].slice(0, n);
}

function puntaje(bien, el) {
  if (bien) {
    sumarXP(1);
    xpFlotante(1, el);
  }
}

function fin(cont, aciertos, total, volver, otra, modo) {
  registrar({ tipo: 'ronda', area: 'vocabulario', modo, aciertos, total });
  if (aciertos === total && total >= 5) confeti();
  cont.replaceChildren(h('div', { class: 'fin-ronda' },
    h('div', { class: 'fin-num' }, `${aciertos} / ${total}`),
    h('p', {}, aciertos === total ? 'Flawless!' : aciertos >= total * 0.7 ? 'Well done. The ones you missed will come back soon.' : 'The ones you missed will come back in the next review.'),
    h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: otra }, 'Another round'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back'))));
}

const MODOS = {
  tarjetas: {
    titulo: 'Flashcards',
    desc: 'Look at the word, think of the meaning (and the article and plural), then flip it.',
    icono: '🃏',
    jugar(cont, volver) {
      const lista = ronda(() => true, 12);
      let i = 0;
      let bien = 0;
      const sig = () => {
        if (i >= lista.length) return fin(cont, bien, lista.length, volver, () => MODOS.tarjetas.jugar(cont, volver), 'tarjetas');
        const v = lista[i++];
        const dir = Math.random() < 0.5 ? 'de' : 'es';
        let girada = false;
        const frente = dir === 'de' ? h('div', { class: 'tarjeta-cara' }, etiquetaPalabra(v, { plural: false })) : h('div', { class: 'tarjeta-cara es' }, (v.en ?? v.es));
        const dorso = h('div', { class: 'tarjeta-dorso' },
          h('div', { class: 'tarjeta-cara' }, etiquetaPalabra(v)),
          h('div', { class: 'tarjeta-es' }, (v.en ?? v.es)),
          esSust(v) && v.plForm && h('div', { class: 'tarjeta-pl' }, 'Plural: ', h('strong', {}, formaPlural(v))),
          v.ej && h('button', { class: 'tarjeta-ej', type: 'button', onclick: (e) => (e.stopPropagation(), decir(v.ej)) }, '🔊 ', v.ej));
        const card = h('div', { class: 'tarjeta', tabindex: 0, role: 'button', 'aria-label': 'Flip the card' }, frente);
        const botones = h('div', { class: 'fila-btn oculto' },
          h('button', { class: 'btn mal', type: 'button', onclick: () => (calificar(claveV(v), false), sig()) }, '✗ Review again'),
          h('button', { class: 'btn bien', type: 'button', onclick: (e) => (calificar(claveV(v), true), bien++, puntaje(true, e.currentTarget), sig()) }, '✓ I knew it'));
        const girar = () => {
          if (girada) return;
          girada = true;
          card.classList.add('girada');
          card.replaceChildren(dorso);
          botones.classList.remove('oculto');
          decir(conArticulo(v));
        };
        card.addEventListener('click', girar);
        card.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), girar()));
        cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${lista.length}`), card, h('p', { class: 'pista-txt centro' }, 'Tap the card to flip it'), botones);
        if (dir === 'de') decir(v.de);
      };
      sig();
    },
  },

  articulo: {
    titulo: 'Article sprint',
    desc: 'der, die or das? 60-second race against the clock. Correct answers in a row build a combo.',
    icono: '⚡',
    jugar(cont, volver) {
      const sust = VOCAB.filter(esSust);
      let restante = 60;
      let puntos = 0;
      let combo = 0;
      let total = 0;
      const falladas = new Map();
      const reloj = h('div', { class: 'reloj' }, '60');
      const marcador = h('div', { class: 'marcador' }, '0');
      const comboEl = h('div', { class: 'combo' });
      const palabra = h('div', { class: 'blitz-palabra' });
      const fb = h('div', { class: 'feedback' });
      let actual;
      const nueva = () => {
        let v;
        do v = azar(sust); while (sust.length > 1 && v === actual);
        actual = v;
        palabra.replaceChildren(h('span', { class: 'palabra-de' }, v.de), h('div', { class: 'blitz-es' }, (v.en ?? v.es)));
      };
      const responder = (art, b) => {
        if (restante <= 0) return;
        total++;
        const ok = art === actual.art;
        calificar(claveV(actual), ok);
        if (ok) {
          combo++;
          const p = combo >= 5 ? 3 : combo >= 3 ? 2 : 1;
          puntos += p;
          comboEl.textContent = combo >= 3 ? `combo ×${p}` : '';
          b.classList.add('flash-bien');
          fb.className = 'feedback bien';
          fb.replaceChildren(h('span', { class: `art ${claseArticulo(actual.art)}` }, actual.art), ` ${actual.de}`);
        } else {
          combo = 0;
          comboEl.textContent = '';
          falladas.set(actual.de, actual);
          b.classList.add('flash-mal');
          fb.className = 'feedback mal';
          fb.replaceChildren('It was ', h('span', { class: `art ${claseArticulo(actual.art)}` }, actual.art), ` ${actual.de}`);
        }
        setTimeout(() => b.classList.remove('flash-bien', 'flash-mal'), 250);
        marcador.textContent = String(puntos);
        nueva();
      };
      const botones = h('div', { class: 'blitz-btns' }, ['der', 'die', 'das'].map((a) => h('button', { class: `btn-art ${a}`, type: 'button', onclick: (e) => responder(a, e.currentTarget) }, a)));
      const teclas = (e) => {
        const m = { 1: 'der', 2: 'die', 3: 'das', ArrowLeft: 'der', ArrowDown: 'die', ArrowRight: 'das' }[e.key];
        if (m) responder(m, botones.querySelector(`.${m}`));
      };
      document.addEventListener('keydown', teclas);
      nueva();
      cont.replaceChildren(h('div', { class: 'blitz-cab' }, reloj, comboEl, marcador), palabra, botones, h('p', { class: 'pista-txt centro' }, 'Keyboard: 1 = der · 2 = die · 3 = das'), fb);
      const t = setInterval(() => {
        reloj.textContent = String(--restante);
        reloj.classList.toggle('urgente', restante <= 10);
        if (restante <= 0 || !cont.isConnected) {
          clearInterval(t);
          document.removeEventListener('keydown', teclas);
          if (!cont.isConnected) return;
          sumarXP(puntos);
          registrar({ tipo: 'ronda', area: 'vocabulario', modo: 'articulo', puntos, total });
          const record = Math.max(ajuste('recordArticulo') ?? 0, puntos);
          const nuevoRecord = puntos > (ajuste('recordArticulo') ?? 0);
          ajuste('recordArticulo', record);
          if (nuevoRecord && puntos > 0) confeti();
          cont.replaceChildren(h('div', { class: 'fin-ronda' },
            h('div', { class: 'fin-num' }, `${puntos} pts`),
            h('p', {}, `${total} words · best: ${record}${nuevoRecord ? ' (new record!)' : ''}`),
            falladas.size > 0 && h('div', { class: 'falladas' }, h('div', { class: 'modelo-tit' }, 'To review'), [...falladas.values()].map((v) => h('div', { class: 'fila-pal' }, etiquetaPalabra(v), botonDecir(conArticulo(v))))),
            h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: () => MODOS.articulo.jugar(cont, volver) }, 'Play again'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back'))));
        }
      }, 1000);
    },
  },

  plural: {
    titulo: 'Plurals',
    desc: 'Type the plural with its article (die …). Words with no plural show up too.',
    icono: '👥',
    jugar(cont, volver) {
      const lista = ronda(esSust, 10);
      let i = 0;
      let bien = 0;
      const sig = () => {
        if (i >= lista.length) return fin(cont, bien, lista.length, volver, () => MODOS.plural.jugar(cont, volver), 'plural');
        const v = lista[i++];
        const sinPl = sinPlural(v);
        const input = h('input', { class: 'hueco grande', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: sinPl ? '' : 'die …' });
        const fb = h('div', { class: 'feedback' });
        const aceptadas = sinPl ? ['-', 'kein Plural', 'none', 'no plural'] : [v.plForm, v.plForm.replace(/^die /, '')];
        let hecho = false;
        const ok = h('button', {
          class: 'btn primario', type: 'button',
          onclick: () => {
            if (hecho) return sig();
            hecho = true;
            const r = corregir(input.value, aceptadas);
            calificar(`p:${conArticulo(v)}`, r.ok);
            calificar(claveV(v), r.ok);
            if (r.ok) (bien++, puntaje(true, input));
            input.disabled = true;
            input.classList.add(r.ok ? 'bien' : 'mal');
            fb.className = `feedback ${r.ok ? 'bien' : 'mal'}`;
            fb.replaceChildren(r.ok ? '✓ ' : 'Answer: ', h('strong', {}, sinPl ? 'no plural (singular only)' : formaPlural(v)), r.aviso ? ` · ${r.aviso}` : '', !sinPl && h('span', { class: 'pl-regla' }, '  (', v.de, marcaPlural(v), ')'));
            if (!sinPl) decir(v.plForm);
            ok.textContent = i < lista.length ? 'Next →' : 'Finish';
          },
        }, 'Check');
        input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
        cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${lista.length}`),
          h('div', { class: 'grande-centro' }, etiquetaPalabra(v, { plural: false }), botonDecir(conArticulo(v))),
          h('div', { class: 'centro pista-txt' }, (v.en ?? v.es)),
          sinPl ? h('p', { class: 'pista-txt centro' }, 'If it has no plural, type “-”.') : null,
          h('div', { class: 'centro' }, input), fb, h('div', { class: 'centro' }, ok));
        input.focus();
      };
      sig();
    },
  },

  traducir: {
    titulo: 'English → German',
    desc: 'Type the word in German; nouns with their article.',
    icono: '✍️',
    jugar(cont, volver) {
      const lista = ronda((v) => v.tipo !== 'expresion', 10);
      let i = 0;
      let bien = 0;
      const sig = () => {
        if (i >= lista.length) return fin(cont, bien, lista.length, volver, () => MODOS.traducir.jugar(cont, volver), 'traducir');
        const v = lista[i++];
        const input = h('input', { class: 'hueco grande', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: esSust(v) ? 'der/die/das …' : '' });
        const fb = h('div', { class: 'feedback' });
        let hecho = false;
        const ok = h('button', {
          class: 'btn primario', type: 'button',
          onclick: () => {
            if (hecho) return sig();
            hecho = true;
            let r = corregir(input.value, [conArticulo(v), ...(v.alt ?? [])]);
            // Sustantivo correcto sin artículo o con el artículo equivocado: a medias.
            let parcial = '';
            if (!r.ok && esSust(v) && corregir(input.value.replace(/^(der|die|das)\s+/i, ''), v.de).ok) parcial = 'The word is right, but the article is missing or wrong. ';
            calificar(claveV(v), r.ok);
            if (r.ok) (bien++, puntaje(true, input));
            input.disabled = true;
            input.classList.add(r.ok ? 'bien' : 'mal');
            fb.className = `feedback ${r.ok ? 'bien' : 'mal'}`;
            fb.replaceChildren(r.ok ? '✓ ' : parcial + 'Answer: ', etiquetaPalabra(v), r.aviso ? ` · ${r.aviso}` : '');
            decir(conArticulo(v));
            ok.textContent = i < lista.length ? 'Next →' : 'Finish';
          },
        }, 'Check');
        input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
        cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${lista.length}`),
          h('div', { class: 'grande-centro es' }, (v.en ?? v.es)), h('div', { class: 'centro pista-txt' }, nombreTipo(v.tipo)),
          h('div', { class: 'centro' }, input), fb, h('div', { class: 'centro' }, ok));
        input.focus();
      };
      sig();
    },
  },

  dictado: {
    titulo: 'Dictation',
    desc: 'Listen and type what you hear (with the article). Trains your ear and spelling.',
    icono: '🎧',
    jugar(cont, volver) {
      const lista = ronda((v) => v.tipo !== 'expresion' && v.de.length < 30, 10);
      let i = 0;
      let bien = 0;
      const sig = () => {
        if (i >= lista.length) return fin(cont, bien, lista.length, volver, () => MODOS.dictado.jugar(cont, volver), 'dictado');
        const v = lista[i++];
        const objetivo = conArticulo(v);
        const input = h('input', { class: 'hueco grande', type: 'text', autocomplete: 'off', spellcheck: 'false' });
        const fb = h('div', { class: 'feedback' });
        let hecho = false;
        const ok = h('button', {
          class: 'btn primario', type: 'button',
          onclick: () => {
            if (hecho) return sig();
            hecho = true;
            const r = corregir(input.value, objetivo);
            calificar(claveV(v), r.ok);
            if (r.ok) (bien++, puntaje(true, input));
            input.disabled = true;
            input.classList.add(r.ok ? 'bien' : 'mal');
            fb.className = `feedback ${r.ok ? 'bien' : 'mal'}`;
            fb.replaceChildren(r.ok ? '✓ ' : 'It was: ', etiquetaPalabra(v), ` — ${(v.en ?? v.es)}`, r.aviso ? ` · ${r.aviso}` : '');
            ok.textContent = i < lista.length ? 'Next →' : 'Finish';
          },
        }, 'Check');
        input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
        cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${lista.length}`),
          h('div', { class: 'centro' }, h('button', { class: 'btn-grande-audio', type: 'button', onclick: () => decir(objetivo) }, '🔊'), h('div', { class: 'pista-txt' }, 'Tap to repeat')),
          h('div', { class: 'centro' }, input), fb, h('div', { class: 'centro' }, ok));
        decir(objetivo);
        input.focus();
      };
      sig();
    },
  },

  lista: {
    titulo: 'Full list',
    desc: 'All the chapter vocabulary, searchable. Tap a word to hear it.',
    icono: '📋',
    jugar(cont, volver) {
      const tipos = ['todos', ...new Set(VOCAB.map((v) => v.tipo))];
      let tipo = 'todos';
      const buscar = h('input', { class: 'buscar', type: 'search', placeholder: 'Search in German or English…' });
      const cuerpo = h('div', { class: 'vocab-lista' });
      const pintar = () => {
        const q = buscar.value.trim().toLowerCase();
        const items = VOCAB.filter((v) => (tipo === 'todos' || v.tipo === tipo) && (!q || `${conArticulo(v)} ${(v.en ?? v.es)}`.toLowerCase().includes(q)));
        cuerpo.replaceChildren(...items.map((v) => {
          const t = tarjeta(claveV(v));
          return h('button', { class: 'fila-pal', type: 'button', onclick: () => decir(conArticulo(v)) },
            h('span', { class: `caja caja-${t?.caja ?? 'n'}`, title: t ? `Box ${t.caja}` : 'New' }),
            etiquetaPalabra(v), h('span', { class: 'fila-es' }, (v.en ?? v.es)));
        }), items.length ? '' : h('p', { class: 'pista-txt' }, 'No matches.'));
      };
      buscar.addEventListener('input', pintar);
      const chips = h('div', { class: 'chips' }, tipos.map((t) => h('button', { class: `chip ${t === tipo ? 'activo' : ''}`, type: 'button', onclick: (e) => { tipo = t; chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === e.currentTarget)); pintar(); } }, nombreTipo(t))));
      cont.replaceChildren(h('div', { class: 'leyenda' }, h('span', { class: 'art der' }, 'der'), ' masculine · ', h('span', { class: 'art die' }, 'die'), ' feminine · ', h('span', { class: 'art das' }, 'das'), ' neuter · ', h('span', { class: 'pl' }, '-e'), ' plural ending'), buscar, chips, cuerpo);
      pintar();
    },
  },
};

// Ícono y título de cada modo (los usa el plan semanal).
export const modosVocab = () => Object.fromEntries(Object.entries(MODOS).map(([k, m]) => [k, [m.icono, m.titulo]]));

export function estadisticasVocab() {
  const total = VOCAB.length;
  const aprendidas = VOCAB.filter((v) => (tarjeta(claveV(v))?.caja ?? 0) >= 2).length;
  const vencidas = VOCAB.filter((v) => tarjeta(claveV(v)) && pendiente(claveV(v))).length;
  return { total, aprendidas, vencidas };
}

export async function pantallaVocab(raiz, modo, volver) {
  await cargarVocab();
  if (!VOCAB.length) return aviso('Vocabulary is missing', 'mal');
  if (modo && MODOS[modo]) {
    const cont = h('div', { class: 'juego', 'data-sin-glosa': true });
    raiz.replaceChildren(h('div', { class: 'juego-cab' }, h('button', { class: 'btn-volver', type: 'button', onclick: volver }, '← Vocabulary'), h('h1', {}, MODOS[modo].icono, ' ', MODOS[modo].titulo)), cont);
    MODOS[modo].jugar(cont, volver);
    return;
  }
  const e = estadisticasVocab();
  const sust = VOCAB.filter(esSust).length;
  raiz.replaceChildren(
    h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, 'Vocabulary'),
      h('p', { class: 'sub' }, `${e.total} words in chapter 7 (${sust} nouns) · ${e.aprendidas} learned · ${e.vencidas} to review today`),
      h('div', { class: 'barra' }, h('div', { class: 'barra-valor', style: { width: `${(e.aprendidas / Math.max(1, e.total)) * 100}%` } }))),
    h('div', { class: 'grilla-modos' }, Object.entries(MODOS).map(([k, m]) => h('a', { class: 'modo', href: `#/vocabulario/${k}` }, h('span', { class: 'modo-ico' }, m.icono), h('span', { class: 'modo-tit' }, m.titulo), h('span', { class: 'modo-desc' }, m.desc)))),
    h('div', { class: 'tip' }, '💡 The colors never change: ', h('span', { class: 'art der' }, 'der'), ' blue, ', h('span', { class: 'art die' }, 'die'), ' pink, ', h('span', { class: 'art das' }, 'das'), ' purple, and the plural ending in light emerald green (',
      etiquetaPalabra({ tipo: 'sustantivo', art: 'der', de: 'Parkplatz', pl: '-¨e', plForm: 'die Parkplätze' }), ' → ',
      formaPlural({ de: 'Parkplatz', plForm: 'die Parkplätze' }),
      '). Learn every noun together with its color, article and plural: they are one single unit.'));
}
