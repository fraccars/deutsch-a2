// Entrenador de verbos: todas las conjugaciones del capítulo.
import { h, mezclar, azar, xpFlotante, confeti, aviso } from './ui.js';
import { decir, botonDecir } from './audio.js';
import { corregir } from './check.js';
import { calificar, tarjeta, pendiente, sumarXP, ajuste, registrar } from './store.js';
import { renderPaso } from './ejercicios.js';
import { cargarJSON } from './archivos.js';

let VERBOS = [];
export async function cargarVerbos() {
  if (!VERBOS.length) VERBOS = await cargarJSON('data/k07/verbos.json');
  return VERBOS;
}

export const PERSONAS = [
  ['ich', 'ich'],
  ['du', 'du'],
  ['er', 'er/sie/es'],
  ['wir', 'wir'],
  ['ihr', 'ihr'],
  ['sie', 'sie/Sie'],
];
export const TIEMPOS = {
  praesens: { n: 'Präsens', es: 'present' },
  praeteritum: { n: 'Präteritum', es: 'simple past (written)' },
  perfekt: { n: 'Perfekt', es: 'present perfect (spoken past)' },
  konjunktivII: { n: 'Konjunktiv II', es: 'conditional / politeness' },
  imperativ: { n: 'Imperativ', es: 'imperative' },
};
const PERS_IMP = [['du', 'du'], ['ihr', 'ihr'], ['Sie', 'Sie']];

const pronombre = (p, t) => (t === 'imperativ' ? '' : { ich: 'ich', du: 'du', er: 'er', wir: 'wir', ihr: 'ihr', sie: 'sie' }[p]);
const frase = (v, t, p) => (t === 'imperativ' ? v.imperativ[p] : `${pronombre(p, t)} ${v[t][p]}`);
const clave = (v, t, p) => `c:${v.inf}|${t}|${p}`;

// Los imperativos llevan complemento («Gib die PIN ein!»): se muestra la oración con
// huecos solo donde va el verbo (y el prefijo separable al final), para que el
// complemento no haya que adivinarlo.
export function plantillaImperativo(v, p) {
  const tokens = v.imperativ[p].replace(/!$/, '').split(' ');
  const ultimo = tokens.length - 1;
  const esVerbo = (tok, k) =>
    k === 0 || (k === ultimo && k > 0 && v.trennbar && v.inf.replace(/^sich /, '').toLowerCase().startsWith(tok.toLowerCase()));
  const partes = tokens.filter(esVerbo);
  const aceptadas = [v.imperativ[p], partes.join(' ')];
  // Con «du» también vale la forma con -e (Steig um / Steige um), pero solo si la raíz
  // es regular: con cambio e→i no existe (Gib, nunca «Gibe»).
  const raizWir = v.praesens.wir.split(' ')[0].replace(/e?n$/, '');
  if (p === 'du' && !/e$/.test(tokens[0]) && tokens[0].toLowerCase() === raizWir.toLowerCase()) {
    const conE = `${tokens[0]}e`;
    aceptadas.push([conE, ...tokens.slice(1)].join(' '), [conE, ...partes.slice(1)].join(' '));
  }
  return { partes, aceptadas, plantilla: `${tokens.map((tok, k) => (esVerbo(tok, k) ? '___' : tok)).join(' ')}!` };
}

function etiquetaVerbo(v) {
  return h('span', { class: 'verbo-et' }, h('strong', {}, v.inf), v.trennbar && h('span', { class: 'tag sep' }, 'separable'), v.reflexiv && h('span', { class: 'tag' }, 'reflexive'), v.irregular && h('span', { class: 'tag irr' }, 'irregular'));
}

const MODOS = {
  tabla: {
    titulo: 'Tables',
    desc: 'Every verb in every tense. Tap any form to hear it.',
    icono: '📊',
    jugar(cont) {
      let sel = VERBOS[0];
      let tiempo = 'praesens';
      const lista = h('div', { class: 'verbo-lista' });
      const panel = h('div', { class: 'verbo-panel' });
      const pintarLista = () => lista.replaceChildren(...VERBOS.map((v) => h('button', { class: `chip ${v === sel ? 'activo' : ''}`, type: 'button', onclick: () => ((sel = v), pintarLista(), pintar()) }, v.inf)));
      const pintar = () => {
        const v = sel;
        const pers = tiempo === 'imperativ' ? PERS_IMP : PERSONAS;
        panel.replaceChildren(
          h('div', { class: 'verbo-cab' }, etiquetaVerbo(v), botonDecir(v.inf), h('div', { class: 'verbo-es' }, (v.en ?? v.es))),
          h('div', { class: 'verbo-formas' },
            h('span', {}, 'Präsens: ', h('strong', {}, `er ${v.praesens.er}`)),
            h('span', {}, 'Präteritum: ', h('strong', {}, `er ${v.praeteritum.er}`)),
            h('span', {}, 'Perfekt: ', h('strong', {}, `er ${v.perfekt.er}`)),
            v.rektion && h('span', {}, 'Takes: ', h('strong', {}, v.rektion))),
          h('div', { class: 'tabs' }, Object.entries(TIEMPOS).map(([k, t]) => h('button', { class: `tab ${k === tiempo ? 'activo' : ''}`, type: 'button', onclick: () => ((tiempo = k), pintar()) }, t.n))),
          h('div', { class: 'tiempo-es' }, TIEMPOS[tiempo].es),
          h('div', { class: 'conj' }, pers.map(([p, et]) => {
            const f = v[tiempo]?.[p];
            if (!f) return '';
            const t = tarjeta(clave(v, tiempo, p));
            return h('button', { class: 'conj-fila', type: 'button', onclick: () => decir(frase(v, tiempo, p)) },
              h('span', { class: 'conj-p' }, tiempo === 'imperativ' ? `(${et})` : et), h('span', { class: 'conj-f' }, f), t && h('span', { class: `caja caja-${t.caja}` }));
          })),
          v.nebensatz && h('div', { class: 'nebensatz' }, h('span', { class: 'modelo-tit' }, 'In a subordinate clause: '), h('button', { class: 'enlace', type: 'button', onclick: () => decir(v.nebensatz) }, v.nebensatz)),
          v.ejemplos?.length && h('div', { class: 'ejemplos' }, v.ejemplos.map((e) => h('button', { class: 'frase-de', type: 'button', onclick: () => decir(e) }, '🔊 ', e))));
      };
      pintarLista();
      pintar();
      cont.replaceChildren(lista, panel);
    },
  },

  conjugar: {
    titulo: 'Conjugate',
    desc: 'You get a verb, person and tense; type the form. Choose the tenses you want to practice.',
    icono: '✍️',
    jugar(cont, volver) {
      const elegidos = new Set(ajuste('tiemposConjugar') ?? ['praesens', 'perfekt']);
      const chips = h('div', { class: 'chips' }, Object.entries(TIEMPOS).map(([k, t]) => h('button', {
        class: `chip ${elegidos.has(k) ? 'activo' : ''}`, type: 'button',
        onclick: (e) => {
          if (elegidos.has(k) && elegidos.size > 1) elegidos.delete(k);
          else elegidos.add(k);
          e.currentTarget.classList.toggle('activo', elegidos.has(k));
          ajuste('tiemposConjugar', [...elegidos]);
        },
      }, t.n)));
      cont.replaceChildren(h('p', { class: 'enunciado' }, 'Tenses for this round:'), chips,
        h('button', { class: 'btn primario', type: 'button', onclick: () => empezar() }, 'Start (10 forms)'));

      const empezar = () => {
        const todas = [];
        for (const v of VERBOS) for (const t of elegidos) for (const [p] of t === 'imperativ' ? PERS_IMP : PERSONAS) if (v[t]?.[p]) todas.push({ v, t, p });
        const vencidas = todas.filter((x) => tarjeta(clave(x.v, x.t, x.p)) && pendiente(clave(x.v, x.t, x.p)));
        const ronda = [...mezclar(vencidas), ...mezclar(todas.filter((x) => !vencidas.includes(x)))].slice(0, 10);
        let i = 0;
        let bien = 0;
        const sig = () => {
          if (i >= ronda.length) {
            registrar({ tipo: 'ronda', area: 'verbos', modo: 'conjugar', tiempos: [...elegidos], aciertos: bien, total: ronda.length });
            if (bien === ronda.length) confeti();
            return cont.replaceChildren(h('div', { class: 'fin-ronda' }, h('div', { class: 'fin-num' }, `${bien} / ${ronda.length}`),
              h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: empezar }, 'Another round'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back'))));
          }
          const { v, t, p } = ronda[i++];
          const persEt = (t === 'imperativ' ? PERS_IMP : PERSONAS).find((x) => x[0] === p)[1];
          const imp = t === 'imperativ' ? plantillaImperativo(v, p) : null;
          const input = h('input', { class: 'hueco grande', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: imp ? 'the missing words' : '' });
          const fb = h('div', { class: 'feedback' });
          let hecho = false;
          const ok = h('button', {
            class: 'btn primario', type: 'button',
            onclick: () => {
              if (hecho) return sig();
              hecho = true;
              const esperado = v[t][p];
              // Se acepta la forma sola o con el pronombre delante; en el imperativo,
              // la oración entera o solo las partes del verbo que faltan en la plantilla.
              const r2 = corregir(input.value, t === 'imperativ' ? imp.aceptadas : [esperado, frase(v, t, p)]);
              calificar(clave(v, t, p), r2.ok);
              if (r2.ok) {
                bien++;
                sumarXP(2);
                xpFlotante(2, input);
              }
              input.disabled = true;
              input.classList.add(r2.ok ? 'bien' : 'mal');
              fb.className = `feedback ${r2.ok ? 'bien' : 'mal'}`;
              fb.replaceChildren(r2.ok ? '✓ ' : 'Answer: ', h('strong', {}, frase(v, t, p)), r2.aviso ? ` · ${r2.aviso}` : '');
              decir(frase(v, t, p));
              ok.textContent = i < ronda.length ? 'Next →' : 'Finish';
            },
          }, 'Check');
          input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
          cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${ronda.length}`),
            h('div', { class: 'conj-pregunta' },
              h('div', { class: 'conj-verbo' }, etiquetaVerbo(v), h('span', { class: 'verbo-es' }, (v.en ?? v.es))),
              h('div', { class: 'conj-tiempo' }, TIEMPOS[t].n),
              h('div', { class: 'conj-persona' }, t === 'imperativ' ? `Imperative for “${persEt}”` : persEt),
              imp && h('div', { class: 'conj-plantilla' }, imp.plantilla)),
            h('div', { class: 'centro' }, t !== 'imperativ' && h('span', { class: 'conj-pron' }, pronombre(p, t)), input), fb, h('div', { class: 'centro' }, ok));
          input.focus();
        };
        sig();
      };
    },
  },

  perfekt: {
    titulo: 'haben or sein + participle',
    desc: 'For each verb: which auxiliary does it take in the Perfekt? Then type the past participle.',
    icono: '🔀',
    jugar(cont, volver) {
      const ronda = mezclar(VERBOS).slice(0, 10);
      let i = 0;
      let bien = 0;
      const sig = () => {
        if (i >= ronda.length) {
          registrar({ tipo: 'ronda', area: 'verbos', modo: 'perfekt', aciertos: bien, total: ronda.length });
          if (bien === ronda.length) confeti();
          return cont.replaceChildren(h('div', { class: 'fin-ronda' }, h('div', { class: 'fin-num' }, `${bien} / ${ronda.length}`),
            h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: () => MODOS.perfekt.jugar(cont, volver) }, 'Another round'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back'))));
        }
        const v = ronda[i++];
        const fb = h('div', { class: 'feedback' });
        const zona = h('div', { class: 'centro' });
        let auxOk = false;
        const elegirAux = (aux, b) => {
          auxOk = aux === v.aux;
          zona.querySelectorAll('.btn-art').forEach((x) => (x.disabled = true));
          b.classList.add(auxOk ? 'flash-bien' : 'flash-mal');
          fb.className = `feedback ${auxOk ? 'bien' : 'mal'}`;
          fb.textContent = auxOk ? `✓ ${v.aux}` : `No: ${v.inf} takes “${v.aux}”${v.aux === 'sein' ? ' (movement or change of state)' : ''}.`;
          const input = h('input', { class: 'hueco grande', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Partizip II' });
          const ok = h('button', {
            class: 'btn primario', type: 'button',
            onclick: () => {
              if (input.disabled) return sig();
              const r = corregir(input.value, v.partizip);
              const todo = auxOk && r.ok;
              calificar(`a:${v.inf}`, todo);
              if (todo) (bien++, sumarXP(2), xpFlotante(2, input));
              input.disabled = true;
              input.classList.add(r.ok ? 'bien' : 'mal');
              fb.className = `feedback ${todo ? 'bien' : 'mal'}`;
              fb.replaceChildren(todo ? '✓ ' : '', h('strong', {}, `er ${v.perfekt.er}`), r.aviso ? ` · ${r.aviso}` : '');
              decir(`er ${v.perfekt.er}`);
              ok.textContent = i < ronda.length ? 'Next →' : 'Finish';
            },
          }, 'Check');
          input.addEventListener('keydown', (e) => e.key === 'Enter' && ok.click());
          zona.append(h('div', {}, h('span', { class: 'conj-pron' }, `er ${v.perfekt.er.split(' ')[0]} …`), input), ok);
          input.focus();
        };
        zona.append(h('div', { class: 'blitz-btns dos' }, ['haben', 'sein'].map((a) => h('button', { class: 'btn-art aux', type: 'button', onclick: (e) => elegirAux(a, e.currentTarget) }, a))));
        cont.replaceChildren(h('div', { class: 'armar-cont' }, `${i} / ${ronda.length}`),
          h('div', { class: 'grande-centro' }, etiquetaVerbo(v), botonDecir(v.inf)), h('div', { class: 'centro pista-txt' }, (v.en ?? v.es)), zona, fb);
      };
      sig();
    },
  },

  oraciones: {
    titulo: 'Build sentences',
    desc: 'Put the tiles in order: conjugated verb in 2nd position, separable prefix at the end, and in subordinate clauses the verb goes last.',
    icono: '🧩',
    async jugar(cont, volver) {
      const items = [];
      for (const v of mezclar(VERBOS)) {
        // La primera palabra va dada: así el orden queda determinado (posición 2 del verbo).
        const m0 = v.ejemplos?.[0]?.match(/^(\S+)\s+(.*)$/);
        if (m0) items.push({ consigna: `${v.inf} — ${(v.en ?? v.es)}`, inicio: m0[1], ok: m0[2], decirConsigna: false });
        if (v.nebensatz && v.trennbar) {
          const m = v.nebensatz.match(/^(.*?,)\s*(.*)$/);
          if (m) items.push({ consigna: `${v.inf} in a subordinate clause`, inicio: m[1], ok: m[2], decirConsigna: false });
        }
      }
      const paso = { tipo: 'armar', items: mezclar(items).slice(0, 8) };
      const fin = (aciertos, total) => (registrar({ tipo: 'ronda', area: 'verbos', modo: 'oraciones', aciertos, total }), cont.replaceChildren(h('div', { class: 'fin-ronda' }, h('div', { class: 'fin-num' }, `${aciertos} / ${total}`),
        h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: () => MODOS.oraciones.jugar(cont, volver) }, 'Another round'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back')))));
      cont.replaceChildren(await renderPaso(paso, { listo: fin }));
    },
  },

  reloj: {
    titulo: 'Against the clock',
    desc: '60 seconds: pick the right form as fast as you can.',
    icono: '⏱️',
    jugar(cont, volver) {
      let restante = 60;
      let puntos = 0;
      let racha = 0;
      const reloj = h('div', { class: 'reloj' }, '60');
      const marcador = h('div', { class: 'marcador' }, '0');
      const preg = h('div', { class: 'conj-pregunta' });
      const ops = h('div', { class: 'opciones' });
      const fb = h('div', { class: 'feedback' });
      const nueva = () => {
        const v = azar(VERBOS);
        const t = azar(['praesens', 'praesens', 'praeteritum', 'perfekt', 'konjunktivII']);
        const p = azar(PERSONAS)[0];
        const correcta = v[t]?.[p];
        if (!correcta) return nueva();
        const distractores = new Set();
        for (const [q] of PERSONAS) if (v[t][q] && v[t][q] !== correcta) distractores.add(v[t][q]);
        for (const tt of ['praesens', 'praeteritum', 'perfekt']) if (v[tt]?.[p] && v[tt][p] !== correcta) distractores.add(v[tt][p]);
        const opciones = mezclar([correcta, ...mezclar([...distractores]).slice(0, 3)]);
        preg.replaceChildren(h('div', { class: 'conj-verbo' }, h('strong', {}, v.inf), h('span', { class: 'verbo-es' }, (v.en ?? v.es))), h('div', { class: 'conj-tiempo' }, TIEMPOS[t].n), h('div', { class: 'conj-persona' }, PERSONAS.find((x) => x[0] === p)[1]));
        ops.replaceChildren(...opciones.map((o) => h('button', {
          class: 'opcion', type: 'button',
          onclick: (e) => {
            if (restante <= 0) return;
            const ok = o === correcta;
            calificar(clave(v, t, p), ok);
            if (ok) {
              racha++;
              puntos += racha >= 5 ? 2 : 1;
              fb.className = 'feedback bien';
              fb.textContent = `✓ ${pronombre(p, t)} ${correcta}`;
            } else {
              racha = 0;
              fb.className = 'feedback mal';
              fb.textContent = `It was: ${pronombre(p, t)} ${correcta}`;
            }
            e.currentTarget.classList.add(ok ? 'bien' : 'mal');
            marcador.textContent = String(puntos);
            setTimeout(nueva, ok ? 200 : 700);
          },
        }, o)));
      };
      nueva();
      cont.replaceChildren(h('div', { class: 'blitz-cab' }, reloj, h('div', { class: 'combo' }), marcador), preg, ops, fb);
      const tm = setInterval(() => {
        reloj.textContent = String(--restante);
        reloj.classList.toggle('urgente', restante <= 10);
        if (restante <= 0 || !cont.isConnected) {
          clearInterval(tm);
          if (!cont.isConnected) return;
          sumarXP(puntos);
          registrar({ tipo: 'ronda', area: 'verbos', modo: 'reloj', puntos });
          const previo = ajuste('recordVerbos') ?? 0;
          if (puntos > previo) (ajuste('recordVerbos', puntos), puntos > 0 && confeti());
          cont.replaceChildren(h('div', { class: 'fin-ronda' }, h('div', { class: 'fin-num' }, `${puntos} pts`), h('p', {}, `Best: ${Math.max(previo, puntos)}${puntos > previo ? ' (new record!)' : ''}`),
            h('div', { class: 'fila-btn' }, h('button', { class: 'btn primario', type: 'button', onclick: () => MODOS.reloj.jugar(cont, volver) }, 'Play again'), h('button', { class: 'btn', type: 'button', onclick: volver }, 'Back'))));
        }
      }, 1000);
    },
  },
};

// Ícono y título de cada modo (los usa el plan semanal).
export const modosVerbos = () => Object.fromEntries(Object.entries(MODOS).map(([k, m]) => [k, [m.icono, m.titulo]]));

export function estadisticasVerbos() {
  let total = 0;
  let dominadas = 0;
  for (const v of VERBOS) for (const t of Object.keys(TIEMPOS)) for (const [p] of t === 'imperativ' ? PERS_IMP : PERSONAS) {
    if (!v[t]?.[p]) continue;
    total++;
    if ((tarjeta(clave(v, t, p))?.caja ?? 0) >= 2) dominadas++;
  }
  return { verbos: VERBOS.length, total, dominadas };
}

export async function pantallaVerbos(raiz, modo, volver) {
  await cargarVerbos();
  if (!VERBOS.length) return aviso('Verbs are missing', 'mal');
  if (modo && MODOS[modo]) {
    const cont = h('div', { class: 'juego' });
    raiz.replaceChildren(h('div', { class: 'juego-cab' }, h('button', { class: 'btn-volver', type: 'button', onclick: volver }, '← Verbs'), h('h1', {}, MODOS[modo].icono, ' ', MODOS[modo].titulo)), cont);
    MODOS[modo].jugar(cont, volver);
    return;
  }
  const e = estadisticasVerbos();
  raiz.replaceChildren(
    h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, 'Verbs'),
      h('p', { class: 'sub' }, `${e.verbos} verbs · ${e.total} forms · ${e.dominadas} mastered`),
      h('div', { class: 'barra' }, h('div', { class: 'barra-valor', style: { width: `${(e.dominadas / Math.max(1, e.total)) * 100}%` } }))),
    h('div', { class: 'grilla-modos' }, Object.entries(MODOS).map(([k, m]) => h('a', { class: 'modo', href: `#/verbos/${k}` }, h('span', { class: 'modo-ico' }, m.icono), h('span', { class: 'modo-tit' }, m.titulo), h('span', { class: 'modo-desc' }, m.desc)))),
    h('div', { class: 'tip', html: '💡 <strong>Separable verbs</strong> (um|steigen, an|kommen, herunter|laden): in a main clause the prefix goes to the end (<em>Ich steige am Bahnhof <u>um</u>.</em>); in a subordinate clause it joins the verb again, which goes last (<em>…, ob ich am Bahnhof <u>umsteige</u>.</em>).' }));
}
