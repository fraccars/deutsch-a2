// Motor de ejercicios. Cada tipo recibe el paso (datos del JSON) y un contexto
// con `listo(aciertos, total)`, que se llama una sola vez al terminar el paso.
import { h, mezclar, xpFlotante } from './ui.js';
import { corregir, diferencias } from './check.js';
import { decir, botonDecir, reproductorPista, pistasLibro } from './audio.js';
import { sumarXP } from './store.js';
import { ejercicioMapa } from './mapa.js';

const XP_ACIERTO = 2;

function premio(el) {
  sumarXP(XP_ACIERTO);
  xpFlotante(XP_ACIERTO, el);
}

// Alemán con palabras clickeables para escucharlas (frases de ejemplo, teoría).
export function frase(de, es) {
  return h('div', { class: 'frase' }, h('button', { class: 'frase-de', type: 'button', onclick: () => decir(de) }, '🔊 ', de), es && h('div', { class: 'frase-es' }, es));
}

const TIPOS = {
  teoria(p, ctx) {
    return h('div', { class: 'teoria' },
      p.html && h('div', { class: 'teoria-html', html: p.html }),
      p.tabla && tabla(p.tabla),
      p.ejemplos && h('div', { class: 'ejemplos' }, p.ejemplos.map((e) => frase(e.de, e.es))),
      p.tip && h('div', { class: 'tip' }, '💡 ', h('span', { html: p.tip })),
      h('button', { class: 'btn primario', type: 'button', onclick: (e) => (e.currentTarget.disabled = true, ctx.listo(1, 1)) }, 'Got it'));
  },

  opcion(p, ctx) {
    let pendientes = p.preguntas.length;
    let aciertos = 0;
    return h('ol', { class: 'preguntas' }, p.preguntas.map((q) => {
      const fb = h('div', { class: 'feedback' });
      let primera = true;
      const opciones = (q.mezclar === false ? q.opciones.map((o, i) => [o, i]) : mezclar(q.opciones.map((o, i) => [o, i])));
      const botones = opciones.map(([o, i]) => h('button', {
        class: 'opcion', type: 'button',
        onclick: (e) => {
          const b = e.currentTarget;
          if (i === q.ok) {
            b.classList.add('bien');
            b.closest('li')?.removeAttribute('data-sin-glosa'); // ya respondida: se puede consultar la traducción
            botones.forEach((x) => (x.disabled = true));
            if (primera) (aciertos++, premio(b));
            fb.replaceChildren(q.explica ? h('span', { html: `✓ ${q.explica}` }) : '✓');
            fb.className = 'feedback bien';
            if (q.decir) decir(q.decir);
            if (--pendientes === 0) ctx.listo(aciertos, p.preguntas.length);
          } else {
            b.classList.add('mal');
            b.disabled = true;
            primera = false;
            fb.textContent = q.pistaError ?? 'Try again.';
            fb.className = 'feedback mal';
          }
        },
      }, o));
      return h('li', { class: 'pregunta', 'data-sin-glosa': p.glosa === false }, q.q && h('div', { class: 'pregunta-q', html: q.q }), h('div', { class: `opciones ${q.opciones.every((o) => o.length < 14) ? 'cortas' : ''}` }, botones), fb);
    }));
  },

  huecos(p, ctx) {
    const filas = p.items.map((it) => {
      const input = h('input', { class: 'hueco', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', size: Math.max(6, ...(Array.isArray(it.ok) ? it.ok : [it.ok]).map((s) => s.length)) + 1 });
      const fb = h('div', { class: 'feedback' });
      return { it, input, fb, el: h('li', { class: 'hueco-fila' }, h('div', {}, it.antes && h('span', { html: it.antes + ' ' }), input, it.despues && h('span', { html: ' ' + it.despues })), it.pista && h('div', { class: 'pista-txt' }, it.pista), fb) };
    });
    let intento = 0;
    const btn = h('button', {
      class: 'btn primario', type: 'button',
      onclick: () => {
        intento++;
        let bien = 0;
        for (const f of filas) {
          if (f.input.disabled) { bien++; continue; }
          const r = corregir(f.input.value, f.it.ok);
          if (r.ok) {
            bien++;
            f.input.disabled = true;
            f.input.classList.add('bien');
            f.fb.textContent = r.aviso ?? '';
            f.fb.className = 'feedback bien';
            if (intento === 1) premio(f.input);
            if (f.it.decir !== false) decir([f.it.antes, r.esperado, f.it.despues].filter(Boolean).join(' ').replace(/<[^>]+>/g, ''));
          } else {
            f.input.classList.add('mal');
            f.fb.className = 'feedback mal';
            f.fb.replaceChildren(intento >= 2 ? h('span', {}, 'Answer: ', h('strong', {}, r.esperado)) : 'Check it again.');
            if (intento >= 2) f.input.disabled = true;
          }
        }
        if (bien === filas.length || intento >= 2) {
          btn.remove();
          ctx.listo(filas.filter((f) => f.input.classList.contains('bien') && !f.input.classList.contains('mal')).length, filas.length);
        } else btn.textContent = 'Check again';
      },
    }, 'Check');
    const lista = h('ol', { class: 'huecos' }, filas.map((f) => f.el));
    lista.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
    return h('div', {}, p.banco && h('div', { class: 'banco' }, p.banco.map((b) => h('span', { class: 'chip' }, b))), lista, btn);
  },

  // Armar oraciones con fichas (orden de palabras, oraciones subordinadas).
  armar(p, ctx) {
    const cont = h('div', { class: 'armar' });
    let i = 0;
    let aciertos = 0;
    const siguiente = () => {
      if (i >= p.items.length) return ctx.listo(aciertos, p.items.length);
      const it = p.items[i++];
      const palabras = it.ok.replace(/[.?!]$/, '').split(' ');
      const final = it.ok.match(/[.?!]$/)?.[0] ?? '';
      const fichas = mezclar([...palabras, ...(it.distractores ?? [])].map((w, k) => ({ w, k })));
      const linea = h('div', { class: 'armar-linea' });
      const banco = h('div', { class: 'armar-banco' });
      const fb = h('div', { class: 'feedback' });
      let primera = true;
      const elegidas = [];
      const pintar = () => {
        linea.replaceChildren(it.inicio ? h('span', { class: 'armar-inicio' }, it.inicio) : '', ...elegidas.map((f) => h('button', { class: 'ficha puesta', type: 'button', onclick: () => (elegidas.splice(elegidas.indexOf(f), 1), pintar()) }, f.w)), final && h('span', {}, final));
        banco.replaceChildren(...fichas.map((f) => h('button', { class: 'ficha', type: 'button', disabled: elegidas.includes(f), onclick: () => (elegidas.push(f), pintar()) }, f.w)));
      };
      pintar();
      const comprobar = h('button', {
        class: 'btn primario', type: 'button',
        onclick: () => {
          const resp = elegidas.map((f) => f.w).join(' ');
          const ok = [it.ok, ...(it.alt ?? [])].some((a) => a.replace(/[.?!]$/, '') === resp);
          if (ok) {
            if (primera) (aciertos++, premio(comprobar));
            fb.className = 'feedback bien';
            fb.replaceChildren('✓ ', it.explica ? h('span', { html: it.explica }) : '');
            decir(`${it.inicio ?? ''} ${it.ok}`.trim());
            comprobar.replaceWith(h('button', { class: 'btn primario', type: 'button', onclick: siguiente }, i < p.items.length ? 'Next →' : 'Finish'));
            banco.remove();
          } else {
            primera = false;
            fb.className = 'feedback mal';
            fb.replaceChildren('Not yet: ', ...diferencias(resp, it.ok).map((d) => h('span', { class: d.ok ? 'dif-ok' : 'dif-mal' }, d.ok ? d.w : '___', ' ')), h('button', { class: 'enlace', type: 'button', onclick: () => fb.replaceChildren('Solution: ', h('strong', {}, `${it.inicio ?? ''} ${it.ok}`)) }, 'show solution'));
          }
        },
      }, 'Check');
      cont.replaceChildren(
        h('div', { class: 'armar-cont' }, `${i} / ${p.items.length}`),
        it.consigna && h('div', { class: 'armar-consigna' }, it.consigna, it.decirConsigna !== false && botonDecir(it.consigna)),
        linea, banco, fb, comprobar);
    };
    siguiente();
    return cont;
  },

  // Ordenar: se toca cada elemento en el orden correcto.
  orden(p, ctx) {
    const correcto = p.items;
    let pos = 0;
    let errores = 0;
    const fb = h('div', { class: 'feedback' });
    const lista = h('div', { class: 'orden' }, mezclar(correcto.map((t, i) => ({ t, i }))).map(({ t, i }) => h('button', {
      class: 'orden-item', type: 'button',
      onclick: (e) => {
        const b = e.currentTarget;
        if (i === pos) {
          b.disabled = true;
          b.classList.add('bien');
          b.prepend(h('span', { class: 'orden-num' }, String(++pos)));
          if (pos === correcto.length) {
            fb.className = 'feedback bien';
            fb.textContent = errores === 0 ? '✓ Perfect!' : `✓ Done (${errores} mistake${errores > 1 ? 's' : ''})`;
            const acc = Math.max(0, correcto.length - errores);
            for (let k = 0; k < acc; k++) sumarXP(1);
            xpFlotante(acc, b);
            ctx.listo(acc, correcto.length);
          }
        } else {
          errores++;
          b.classList.add('sacudir');
          b.addEventListener('animationend', () => b.classList.remove('sacudir'), { once: true });
          fb.className = 'feedback mal';
          fb.textContent = p.pistaError ?? 'Not that one yet.';
        }
      },
    }, t)));
    return h('div', {}, lista, fb);
  },

  emparejar(p, ctx) {
    let sel = null;
    let hechos = 0;
    let errores = 0;
    const fb = h('div', { class: 'feedback' });
    const marcar = (b, lado, idx) => {
      if (!sel || sel.lado === lado) {
        sel?.b.classList.remove('sel');
        sel = { b, lado, idx };
        b.classList.add('sel');
        if (lado === 'izq' && p.decirIzq !== false) decir(b.textContent);
        return;
      }
      if (sel.idx === idx) {
        [sel.b, b].forEach((x) => (x.classList.remove('sel'), x.classList.add('bien'), (x.disabled = true)));
        premio(b);
        if (++hechos === p.pares.length) {
          fb.className = 'feedback bien';
          fb.textContent = errores ? `✓ Done (${errores} mistake${errores > 1 ? 's' : ''})` : '✓ Perfect!';
          ctx.listo(Math.max(0, p.pares.length - errores), p.pares.length);
        }
      } else {
        errores++;
        [sel.b, b].forEach((x) => (x.classList.add('sacudir'), x.addEventListener('animationend', () => x.classList.remove('sacudir'), { once: true })));
        sel.b.classList.remove('sel');
      }
      sel = null;
    };
    const izq = mezclar(p.pares.map((par, i) => ({ t: par[0], i })));
    const der = mezclar(p.pares.map((par, i) => ({ t: par[1], i })));
    return h('div', {},
      h('div', { class: 'emparejar' },
        h('div', { class: 'col' }, izq.map(({ t, i }) => h('button', { class: 'par', type: 'button', onclick: (e) => marcar(e.currentTarget, 'izq', i) }, t))),
        h('div', { class: 'col' }, der.map(({ t, i }) => h('button', { class: 'par', type: 'button', onclick: (e) => marcar(e.currentTarget, 'der', i) }, t)))),
      fb);
  },

  // Producción libre: se escribe (o se dice en voz alta), después se compara con un modelo.
  escribir(p, ctx) {
    const area = h('textarea', { class: 'escribir', rows: p.filas ?? 5, placeholder: p.placeholder ?? 'Write here in German…', spellcheck: 'false' });
    const modelo = h('div', { class: 'modelo oculto' },
      h('div', { class: 'modelo-tit' }, 'A possible model answer'),
      (Array.isArray(p.modelo) ? p.modelo : [p.modelo]).map((m) => frase(m)),
      p.checklist && h('div', { class: 'checklist' }, h('div', { class: 'modelo-tit' }, 'Check your text'), p.checklist.map((c) => h('label', {}, h('input', { type: 'checkbox' }), ' ', c))));
    const btn = h('button', {
      class: 'btn primario', type: 'button',
      onclick: () => {
        modelo.classList.remove('oculto');
        btn.remove();
        sumarXP(5);
        xpFlotante(5, modelo);
        ctx.listo(1, 1);
      },
    }, 'Show model and compare');
    return h('div', {}, p.ayuda && h('div', { class: 'banco' }, p.ayuda.map((b) => h('span', { class: 'chip' }, b))), area, btn, modelo);
  },

  mapa(p, ctx) {
    return ejercicioMapa(p, ctx, premio);
  },
};

function tabla(t) {
  return h('table', { class: 'tabla' },
    t.cab && h('thead', {}, h('tr', {}, t.cab.map((c) => h('th', { html: c })))),
    h('tbody', {}, t.filas.map((f) => h('tr', {}, f.map((c) => h('td', { html: c }))))));
}

export async function renderPaso(paso, ctx) {
  const tipo = TIPOS[paso.tipo];
  if (!tipo) return h('div', { class: 'feedback mal' }, `Unknown exercise type: ${paso.tipo}`);
  let pista = null;
  if (paso.pista) {
    const todas = await pistasLibro();
    const ids = Array.isArray(paso.pista) ? paso.pista : [paso.pista];
    pista = h('div', { class: 'pistas' }, ids.map((id) => {
      const p = todas.find((x) => x.id === id);
      return p ? reproductorPista(p, { transcripcion: paso.transcripcion !== false }) : h('div', { class: 'feedback mal' }, `Missing track ${id}`);
    }));
  }
  // Donde la traducción regalaría la respuesta («glosa»: false) el globito se activa al
  // responder: en opción múltiple, pregunta por pregunta; en el resto, al terminar el paso.
  const bloqueado = paso.glosa === false;
  const bloquearPaso = bloqueado && paso.tipo !== 'opcion';
  let el = null;
  const desbloquear = () => {
    el?.removeAttribute('data-sin-glosa');
    el?.querySelectorAll('[data-sin-glosa]').forEach((x) => x.removeAttribute('data-sin-glosa'));
    el?.querySelector('.aviso-glosa')?.remove();
  };
  const ctxPaso = bloqueado ? { ...ctx, listo: (a, t) => (desbloquear(), ctx.listo(a, t)) } : ctx;
  // La transcripción y la lectura también quedan bloqueadas hasta terminar (pueden dar pistas).
  if (pista && bloqueado) pista.setAttribute('data-sin-glosa', '');
  el = h('div', { class: `paso paso-${paso.tipo}`, 'data-sin-glosa': bloquearPaso },
    paso.titulo && h('h2', { class: 'paso-tit' }, paso.titulo),
    paso.libro && h('div', { class: 'libro-ref' }, '📖 ', paso.libro),
    paso.enunciado && h('p', { class: 'enunciado', html: paso.enunciado }),
    bloqueado && h('p', { class: 'aviso-glosa' }, '🔒 Hover translations unlock once you answer: here they would give the answer away.'),
    pista,
    paso.texto && h('div', { class: 'texto-lectura', 'data-sin-glosa': bloqueado }, paso.texto.split('\n').map((l) => h('p', { html: l }))),
    tipo(paso, ctxPaso));
  return el;
}
