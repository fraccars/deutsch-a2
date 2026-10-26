// Navegación por hash, pantalla de inicio, lecciones, audios y gramática.
import { h, anillo, confeti, aviso } from './ui.js';
import { leer, alCambiar, pasoHecho, resolverPaso, ajuste, reiniciar, rachaActual, recuperarCopia } from './store.js';
import { cargarManifiesto, pistasLibro, reproductorPista, callar } from './audio.js';
import { renderPaso } from './ejercicios.js';
import { pantallaVocab, cargarVocab, estadisticasVocab } from './vocab.js';
import { pantallaVerbos, cargarVerbos, estadisticasVerbos } from './verbos.js';
import { cargarCapitulo as cargarCap, idPaso, progresoLeccion } from './capitulo.js';
import { pantallaPlan, tarjetaPlan, vigilar } from './plan.js';
import { pantallaSpeaking } from './speaking.js';
import { activarGlosa, cargarGlosario } from './glosa.js';
import { CIFRADO } from './modo.js';
import { hayClave } from './archivos.js';
import { iniciarSincro, alCambiarSincro, estadoSincro } from './sincro.js';
import { pantallaPerfil, pantallaEntrada, fichaCuenta } from './perfil.js';
import { registrarSW, bajarParaSinInternet, pedirPersistencia } from './pwa.js';
import { cargarIndice, indiceCapitulos, elegirCapitulo } from './capitulos.js';
import { visorLibro } from './visor.js';

const raiz = document.getElementById('app');
let CAP = null;

async function cargarCapitulo() {
  CAP = await cargarCap();
  document.title = `Kapitel ${CAP.numero} · Deutsch A2`;
  return CAP;
}

function barraEstado() {
  const e = leer();
  const racha = rachaActual();
  return h('div', { class: 'estado' },
    h('span', { class: 'estado-item', title: 'Days in a row' }, '🔥 ', h('strong', {}, racha), racha === 1 ? ' day' : ' days'),
    h('span', { class: 'estado-item', title: 'XP today' }, '⭐ ', h('strong', {}, e.xpHoy.xp), ' XP today'),
    h('span', { class: 'estado-item', title: 'Total XP' }, h('strong', {}, e.xp), ' XP total'),
    fichaCuenta());
}

// Para cambiar de capítulo (solo si hay más de uno).
function selectorCapitulos() {
  const caps = indiceCapitulos();
  if (caps.length < 2) return null;
  return h('nav', { class: 'capitulos', 'aria-label': 'Chapters' }, caps.map((c) => h('button', {
    class: `chip ${c.id === CAP.id ? 'activo' : ''}`, type: 'button', title: c.titulo, 'aria-pressed': String(c.id === CAP.id),
    onclick: () => c.id !== CAP.id && (elegirCapitulo(c.id), ruta()),
  }, `Kapitel ${c.numero}`)));
}

async function inicio() {
  await Promise.all([cargarCapitulo(), cargarVocab(), cargarVerbos()]);
  const lecciones = CAP.lecciones.filter((l) => l.id !== 'test');
  const test = CAP.lecciones.find((l) => l.id === 'test');
  const siguiente = lecciones.find((l) => progresoLeccion(l) < 1);
  const ev = estadisticasVocab();
  const eb = estadisticasVerbos();
  const semana = await tarjetaPlan();
  const conPlan = leer().plan?.capitulo === CAP.id;
  raiz.replaceChildren(
    h('header', { class: 'hero' },
      selectorCapitulos(),
      h('div', { class: 'hero-cap' }, `${CAP.libro} · Kapitel ${CAP.numero}`),
      h('h1', { class: 'hero-tit' }, CAP.titulo),
      h('p', { class: 'hero-sub' }, CAP.subtitulo),
      barraEstado(),
      !conPlan && siguiente && h('a', { class: 'btn primario grande', href: `#/leccion/${siguiente.id}` }, progresoLeccion(siguiente) > 0 ? 'Continue: ' : 'Start: ', siguiente.titulo, ' →')),
    semana,
    h('section', { class: 'bloque' },
      h('h2', { class: 'bloque-tit' }, 'Trainers'),
      h('div', { class: 'grilla-grande' },
        h('a', { class: 'tarjeta-sec verbos', href: '#/verbos' }, h('span', { class: 'sec-ico' }, '🔁'), h('span', { class: 'sec-tit' }, 'Verbs'), h('span', { class: 'sec-desc' }, `${eb.verbos} verbs in every tense`), h('span', { class: 'sec-meta' }, `${eb.dominadas} / ${eb.total} forms mastered`)),
        h('a', { class: 'tarjeta-sec vocab', href: '#/vocabulario' }, h('span', { class: 'sec-ico' }, '🗂️'), h('span', { class: 'sec-tit' }, 'Vocabulary'), h('span', { class: 'sec-desc' }, 'Always with article and plural'), h('span', { class: 'sec-meta' }, ev.vencidas ? `${ev.vencidas} to review today` : `${ev.aprendidas} / ${ev.total} learned`)),
        h('a', { class: 'tarjeta-sec habla', href: '#/speaking' }, h('span', { class: 'sec-ico' }, '🎙️'), h('span', { class: 'sec-tit' }, 'Speaking'), h('span', { class: 'sec-desc' }, 'Read aloud and answer: a local checker corrects you'), h('span', { class: 'sec-meta' }, 'Microphone')),
        h('a', { class: 'tarjeta-sec audio', href: '#/escuchar' }, h('span', { class: 'sec-ico' }, '🎧'), h('span', { class: 'sec-tit' }, 'Listening'), h('span', { class: 'sec-desc' }, 'All the audio of the chapter'), h('span', { class: 'sec-meta' }, 'Kursbuch & Übungsbuch')),
        h('a', { class: 'tarjeta-sec grama', href: '#/gramatica' }, h('span', { class: 'sec-ico' }, '📐'), h('span', { class: 'sec-tit' }, 'Grammar'), h('span', { class: 'sec-desc' }, 'Quick reference'), h('span', { class: 'sec-meta' }, CAP.gramatica)))),
    h('section', { class: 'bloque' },
      h('h2', { class: 'bloque-tit' }, 'Lessons'),
      h('ol', { class: 'camino' }, lecciones.map((l, i) => {
        const p = progresoLeccion(l);
        return h('li', {}, h('a', { class: `leccion ${p === 1 ? 'hecha' : ''}`, href: `#/leccion/${l.id}` },
          anillo(p), h('span', { class: 'leccion-num' }, i + 1),
          h('span', { class: 'leccion-txt' }, h('span', { class: 'leccion-tit' }, l.icono, ' ', l.titulo), h('span', { class: 'leccion-sub' }, l.sub)),
          h('span', { class: 'leccion-libro' }, l.libro)));
      })),
      test && h('a', { class: `test-card ${progresoLeccion(test) === 1 ? 'hecha' : ''}`, href: '#/leccion/test' }, h('span', { class: 'sec-ico' }, '🏁'), h('span', {}, h('strong', {}, test.titulo), h('br'), h('span', { class: 'leccion-sub' }, test.sub)), anillo(progresoLeccion(test)))),
    h('footer', { class: 'pie' },
      h('span', {}, CAP.creditos),
      h('a', { class: 'enlace', href: '#/perfil' }, 'Account'),
      h('button', { class: 'enlace', type: 'button', onclick: () => { ajuste('sonido', !ajuste('sonido')); aviso(ajuste('sonido') ? 'Sound on' : 'Sound off'); } }, 'Sound on/off'),
      h('button', { class: 'enlace', type: 'button', onclick: () => confirm(estadoSincro().sesion
        ? 'Delete all your progress in this course? It is also deleted from your account and your other devices.'
        : 'Delete all your progress in this course?') && (reiniciar(), ruta()) }, 'Reset progress')));
}

async function leccion(id, desde) {
  await cargarCapitulo();
  const lec = CAP.lecciones.find((l) => l.id === id);
  if (!lec) return (location.hash = '#/');
  let i = desde ?? lec.pasos.findIndex((_, k) => !pasoHecho(idPaso(lec, k)));
  if (i < 0) i = 0;
  let sumaAciertos = 0;
  let sumaTotal = 0;

  const barra = h('div', { class: 'lec-barra' });
  const cuerpo = h('div', { class: 'lec-cuerpo' });
  const pie = h('div', { class: 'lec-pie' });
  raiz.replaceChildren(
    h('div', { class: 'lec-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '✕'), barra,
      lec.paginas && h('button', { class: 'chip', type: 'button', onclick: () => visorLibro(lec.paginas) }, '📖 Book'),
      h('span', { class: 'lec-tit' }, lec.icono, ' ', lec.titulo)),
    cuerpo, pie);

  const pintarBarra = () => barra.replaceChildren(...lec.pasos.map((_, k) => h('button', {
    class: `lec-seg ${k === i ? 'actual' : ''} ${pasoHecho(idPaso(lec, k)) ? 'hecho' : ''}`, type: 'button', title: lec.pasos[k].titulo ?? `Step ${k + 1}`,
    onclick: () => ((i = k), mostrar()),
  })));

  const terminar = () => {
    const pct = sumaTotal ? Math.round((sumaAciertos / sumaTotal) * 100) : 100;
    if (pct >= 80) confeti();
    const idx = CAP.lecciones.indexOf(lec);
    const sig = CAP.lecciones[idx + 1];
    pintarBarra();
    cuerpo.replaceChildren(h('div', { class: 'fin-ronda' },
      h('div', { class: 'fin-num' }, `${pct} %`),
      h('h2', {}, `“${lec.titulo}” completed`),
      h('p', {}, pct >= 80 ? 'Well done! Now reinforce it with the trainers.' : 'Repeat the steps you found hard: tap the bar at the top.'),
      lec.repaso && h('div', { class: 'fila-btn' }, lec.repaso.map((r) => h('a', { class: 'btn', href: r.href }, r.texto))),
      h('div', { class: 'fila-btn' }, sig ? h('a', { class: 'btn primario', href: `#/leccion/${sig.id}` }, `Next: ${sig.titulo} →`) : null, h('a', { class: 'btn', href: '#/' }, 'Home'))));
    pie.replaceChildren();
  };

  const mostrar = async () => {
    if (i >= lec.pasos.length) return terminar();
    pintarBarra();
    const paso = lec.pasos[i];
    const k = i;
    pie.replaceChildren();
    const el = await renderPaso(paso, {
      listo: (a, t) => {
        resolverPaso(idPaso(lec, k), a, t);
        if (paso.tipo !== 'teoria') (sumaAciertos += a), (sumaTotal += t);
        pintarBarra();
        const seguir = h('button', { class: 'btn primario grande', type: 'button', onclick: () => ((i = k + 1), mostrar()) }, k + 1 < lec.pasos.length ? 'Continue →' : 'Finish');
        if (paso.tipo === 'teoria') seguir.click();
        else pie.replaceChildren(seguir), seguir.focus({ preventScroll: true });
      },
    });
    cuerpo.replaceChildren(el);
    window.scrollTo({ top: 0 });
  };
  mostrar();
}

async function escuchar() {
  const pistas = await pistasLibro();
  const grupos = [['Kursbuch', pistas.filter((p) => p.id.startsWith('KB'))], ['Übungsbuch', pistas.filter((p) => !p.id.startsWith('KB'))]];
  raiz.replaceChildren(
    h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, 'Listening'),
      h('p', { class: 'sub' }, 'Tip: listen first without reading. Then with the transcript. Finally, once more without reading, at 0.9×.')),
    ...grupos.filter(([, ps]) => ps.length).map(([n, ps]) => h('section', { class: 'bloque' }, h('h2', { class: 'bloque-tit' }, n), ps.map((p) => reproductorPista(p)))));
}

async function gramatica() {
  await cargarCapitulo();
  const fichas = CAP.lecciones.flatMap((l) => l.pasos.filter((p) => p.tipo === 'teoria' && p.ref).map((p) => ({ ...p, lec: l })));
  const pasos = await Promise.all(fichas.map((p) => renderPaso({ ...p, ref: undefined }, { listo: () => {} })));
  pasos.forEach((el) => el.querySelector('.teoria > .btn')?.remove());
  raiz.replaceChildren(
    h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, `Chapter ${CAP.numero} grammar`)),
    ...pasos.map((el, k) => h('section', { class: 'bloque ficha-grama' }, el, h('a', { class: 'enlace', href: `#/leccion/${fichas[k].lec.id}` }, `Practice in “${fichas[k].lec.titulo}” →`))));
}

// "#/verbos/conjugar" → ['verbos', 'conjugar']; el inicio no tiene partes.
const partesRuta = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);

// arriba: false vuelve a dibujar la pantalla sin moverse del lugar de la página.
async function ruta({ arriba = true } = {}) {
  const partes = partesRuta();
  const volverA = (base) => () => (location.hash = base);
  try {
    switch (partes[0]) {
      case 'leccion': return await leccion(partes[1]);
      case 'verbos': return await pantallaVerbos(raiz, partes[1], volverA('#/verbos'));
      case 'vocabulario': return await pantallaVocab(raiz, partes[1], volverA('#/vocabulario'));
      case 'escuchar': return await escuchar();
      case 'gramatica': return await gramatica();
      case 'plan': return await pantallaPlan(raiz);
      case 'speaking': return await pantallaSpeaking(raiz, partes[1]);
      case 'perfil': return await pantallaPerfil(raiz);
      default: return await inicio();
    }
  } catch (err) {
    console.error(err);
    raiz.replaceChildren(h('div', { class: 'feedback mal' }, 'Something went wrong loading this screen: ', String(err.message ?? err)));
  } finally {
    if (arriba) window.scrollTo({ top: 0 });
  }
}

async function arrancar() {
  // Página publicada: se instala y anda sin internet; sin la clave del material, solo se
  // puede ingresar.
  if (CIFRADO) {
    registrarSW();
    if (!(await hayClave())) return pantallaEntrada(raiz);
  }
  await cargarIndice();
  addEventListener('hashchange', () => (callar(), ruta()));
  alCambiar((_, externo) => {
    const e = document.querySelector('.estado');
    if (e) e.replaceWith(barraEstado());
    vigilar(externo);
    // Lo hecho en otra pestaña o en otro equipo (por la nube) se ve también en el inicio y el
    // plan de esta. Una lección o una ronda a medias no se cortan: su próximo guardado ya
    // parte del progreso nuevo.
    if (externo && ['inicio', 'plan'].includes(partesRuta()[0] ?? 'inicio')) ruta({ arriba: false });
  });
  alCambiarSincro(() => document.querySelector('.ficha-cuenta')?.replaceWith(fichaCuenta()));
  // Si el navegador perdió el progreso, vuelve de la copia del servidor antes de mostrar nada.
  const recuperada = await recuperarCopia();
  await Promise.all([cargarManifiesto(), cargarGlosario()]);
  activarGlosa();
  ruta();
  vigilar();
  if (recuperada) aviso(`✓ Your progress was restored from the automatic backup: ${recuperada.progreso.xp} XP.`, 'bien');
  // La cuenta: restaura la sesión y sincroniza, sin demorar la primera pantalla.
  iniciarSincro();
  if (CIFRADO) (pedirPersistencia(), bajarParaSinInternet().catch(() => {}));
}
arrancar();
