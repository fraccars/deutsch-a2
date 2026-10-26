// Plan semanal: un capítulo por semana. Reparte el capítulo en 7 días de ~50 minutos
// con tareas concretas (lecciones, rondas de entrenadores, audios del libro, speaking) que se
// marcan solas a medida que se cumplen. Motiva con el ritmo de la semana, la racha,
// logros, festejos al completar cada día y recordatorios para el calendario (.ics).
// Hay un plan a la vez: el del capítulo con que se empezó (configPlan().capitulo). Empezar el
// de otro capítulo lo reemplaza; las lecciones hechas y los logros quedan.
// También lleva el progreso a otra computadora (exportar e importar un .json), deja volver
// a una de las copias automáticas que guarda el servidor del curso (versión local) y muestra
// la cuenta en la nube, que sincroniza sola entre equipos.
import { h, anillo, confeti, aviso } from './ui.js';
import { actividad, configPlan, logros, desbloquearLogro, hoyISO, ajuste, rachaActual, estudioHoy, leer, exportar, leerExportacion, importar } from './store.js';
import { cargarCapitulo, progresoLeccion, puntajeLeccion } from './capitulo.js';
import { cargarVocab, estadisticasVocab, modosVocab } from './vocab.js';
import { cargarVerbos, estadisticasVerbos, modosVerbos } from './verbos.js';
import { datosSpeaking } from './speaking.js';
import { pistasLibro } from './audio.js';
import { cargarJSON } from './archivos.js';
import { CIFRADO } from './modo.js';
import { estadoSincro, textoSincro } from './sincro.js';
import { capituloActual, numeroCapitulo, porCapitulo, rutaDatos } from './capitulos.js';

export const cargarPlan = porCapitulo((cap) => cargarJSON(rutaDatos('plan.json', cap)));

// ---------- Fechas (siempre locales, en formato AAAA-MM-DD) ----------
const aFecha = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const aISO = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
export const sumarDias = (iso, n) => {
  const f = aFecha(iso);
  f.setDate(f.getDate() + n);
  return aISO(f);
};
const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);
const fechaCorta = (iso) => aFecha(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const diaSemana = (iso) => aFecha(iso).toLocaleDateString('en-GB', { weekday: 'short' });
const cuantas = (n, una, varias = `${una}s`) => `${n} ${n === 1 ? una : varias}`;

// ---------- Evaluación del plan ----------
const TIEMPOS = { praesens: 'Präsens', praeteritum: 'Präteritum', perfekt: 'Perfekt', konjunktivII: 'Konjunktiv II', imperativ: 'Imperativ' };

function describir(t, CAP, SPK) {
  if (t.tipo === 'speaking') {
    const set = SPK.sets.find((x) => x.id === t.set);
    return { icono: '🎙️', texto: `Speaking: ${set.titulo}`, href: `#/speaking/${t.set}` };
  }
  if (t.tipo === 'leccion' || t.tipo === 'test') {
    const l = CAP.lecciones.find((x) => x.id === t.leccion);
    const texto = t.tipo === 'test' ? `${l.titulo} (pass with ${Math.round(t.minimo * 100)}%+)` : `Lesson: ${l.titulo}`;
    return { icono: l.icono, texto, href: `#/leccion/${l.id}` };
  }
  if (t.tipo === 'ronda') {
    const [icono, titulo] = (t.area === 'verbos' ? modosVerbos() : modosVocab())[t.modo];
    const tiempos = t.tiempos ? ` (${t.tiempos.map((x) => TIEMPOS[x]).join(' + ')})` : '';
    const nombre = t.area === 'verbos' && !/verb/i.test(titulo) ? `Verbs: ${titulo}` : titulo;
    return { icono, texto: `${nombre}${tiempos}${t.veces > 1 ? ` × ${t.veces}` : ''}`, href: `#/${t.area}/${t.modo}` };
  }
  return { icono: '🎧', texto: `Listen to the book audio ${t.pistas[0]}–${t.pistas.at(-1).split(' ')[1]}`, href: '#/escuchar' };
}

/** Estado del plan: tareas cumplidas, día de hoy, atrasos y la próxima tarea. */
export function evaluar(P, CAP, SPK, cfg = configPlan()) {
  if (!cfg) return null;
  // Solo cuenta lo hecho desde el comienzo del plan y, en rondas y speaking, en el capítulo
  // del plan (lo de antes de haber varios capítulos es del K7); cada ronda cumple una sola tarea.
  const delCapitulo = (a) => (a.tipo !== 'ronda' && a.tipo !== 'speaking') || (a.cap ?? 'k07') === cfg.capitulo;
  const acts = actividad().filter((a) => a.dia >= cfg.inicio && delCapitulo(a));
  const usadas = new Set();
  const tomar = (cumple, n) => {
    let k = 0;
    acts.forEach((a, i) => {
      if (k < n && !usadas.has(i) && cumple(a)) (usadas.add(i), k++);
    });
    return k;
  };
  const oidas = new Set(acts.filter((a) => a.tipo === 'escucha').map((a) => a.pista));
  const hoyIdx = diasEntre(cfg.inicio, hoyISO());

  const dias = P.dias.map((d, i) => {
    const tareas = d.tareas.map((t) => {
      const r = { ...t, ...describir(t, CAP, SPK), dia: i };
      if (t.tipo === 'leccion' || t.tipo === 'test') {
        const lec = CAP.lecciones.find((l) => l.id === t.leccion);
        r.progreso = progresoLeccion(lec);
        r.puntaje = puntajeLeccion(lec);
        r.hecha = r.progreso === 1 && (t.tipo !== 'test' || r.puntaje >= t.minimo);
      } else if (t.tipo === 'ronda') {
        const n = tomar((a) => a.tipo === 'ronda' && a.area === t.area && a.modo === t.modo && (t.tiempos ?? []).every((x) => a.tiempos?.includes(x)), t.veces);
        r.progreso = n / t.veces;
        r.hecha = n >= t.veces;
      } else if (t.tipo === 'speaking') {
        const items = SPK.sets.find((x) => x.id === t.set).items;
        const hablas = acts.filter((a) => a.tipo === 'speaking' && a.set === t.set);
        const mejores = items.map((it) => Math.max(0, ...hablas.filter((a) => a.item === it.id).map((a) => a.puntaje)));
        r.intentados = items.filter((it) => hablas.some((a) => a.item === it.id)).length;
        r.items = items.length;
        r.promedio = mejores.reduce((x, y) => x + y, 0) / items.length;
        r.progreso = r.intentados / items.length;
        r.hecha = r.intentados === items.length && r.promedio >= 0.6;
      } else {
        const n = t.pistas.filter((p) => oidas.has(p)).length;
        r.progreso = n / t.pistas.length;
        r.hecha = n === t.pistas.length;
      }
      return r;
    });
    const hechas = tareas.filter((t) => t.hecha).length;
    const estado = hechas === tareas.length ? 'hecho' : i < hoyIdx ? 'atrasado' : i === hoyIdx ? 'hoy' : 'futuro';
    return { ...d, n: i + 1, fecha: sumarDias(cfg.inicio, i), tareas, hechas, estado, minutos: tareas.reduce((s, t) => s + t.minutos, 0) };
  });

  const todas = dias.flatMap((d) => d.tareas);
  const atrasadas = dias.slice(0, Math.max(0, hoyIdx)).flatMap((d) => d.tareas.filter((t) => !t.hecha));
  const deHoy = hoyIdx >= 0 && hoyIdx < dias.length ? dias[hoyIdx].tareas : [];
  const pendientesHoy = [...atrasadas, ...deHoy.filter((t) => !t.hecha)];
  const hechas = todas.filter((t) => t.hecha).length;
  return {
    cfg, numero: CAP.numero, dias, hoyIdx, todas, hechas, total: todas.length, atrasadas, deHoy, pendientesHoy,
    adelantadas: dias.slice(Math.max(0, hoyIdx + 1)).flatMap((d) => d.tareas).filter((t) => t.hecha).length,
    siguiente: pendientesHoy[0] ?? todas.find((t) => !t.hecha) ?? null,
    fin: sumarDias(cfg.inicio, dias.length - 1),
    completo: hechas === todas.length,
  };
}

/** El plan en curso (o el que se pase), con los datos de su capítulo. */
export async function evaluarAhora(cfg = configPlan()) {
  const cap = cfg?.capitulo ?? capituloActual();
  const [P, CAP, { datos: SPK }] = await Promise.all([cargarPlan(cap), cargarCapitulo(cap), datosSpeaking(cap), cargarVocab(), cargarVerbos()]);
  return evaluar(P, CAP, SPK, cfg);
}
// ¿El plan en curso es del capítulo que se está mirando?
const planDelActual = () => configPlan()?.capitulo === capituloActual();

// ---------- Logros ----------
const LOGROS = [
  { id: 'primer-paso', icono: '👣', titulo: 'First step', desc: 'Complete your first plan task', cond: (c) => c.hechas >= 1 },
  { id: 'dia-completo', icono: '✅', titulo: 'Full day', desc: 'Complete every task of a day', cond: (c) => c.diasCompletos >= 1 },
  { id: 'racha-3', icono: '🔥', titulo: 'On fire', desc: 'Study 3 days in a row', cond: (c) => c.racha >= 3 },
  { id: 'racha-7', icono: '🌟', titulo: 'Unstoppable', desc: 'Study 7 days in a row', cond: (c) => c.racha >= 7 },
  { id: 'ronda-perfecta', icono: '💯', titulo: 'Perfect round', desc: 'Get every answer right in a trainer round', cond: (c) => c.perfectas >= 1 },
  { id: 'sprint-25', icono: '⚡', titulo: 'Lightning articles', desc: 'Score 25+ in the Article sprint', cond: (c) => c.recordArticulo >= 25 },
  { id: 'palabras-50', icono: '🗂️', titulo: 'Word collector', desc: 'Learn 50 words', cond: (c) => c.palabras >= 50 },
  { id: 'palabras-150', icono: '📚', titulo: 'Word hoarder', desc: 'Learn 150 words', cond: (c) => c.palabras >= 150 },
  { id: 'verbos-300', icono: '🔁', titulo: 'Verb machine', desc: 'Master 300 verb forms', cond: (c) => c.formas >= 300 },
  { id: 'primeras-palabras', icono: '🎙️', titulo: 'First words', desc: 'Do your first speaking exercise', cond: (c) => c.speaking >= 1 },
  { id: 'voz-clara', icono: '🗣️', titulo: 'Clear speaker', desc: 'Read 10 different sentences aloud with 90%+', cond: (c) => c.frasesClaras >= 10 },
  // Estos tres son de cada capítulo.
  { id: 'oido', icono: '🎧', titulo: 'All ears', desc: 'Listen to every Kursbuch track of the chapter', porCapitulo: true, cond: (c) => c.pistasKB > 0 && c.pistasOidas >= c.pistasKB },
  { id: 'test', icono: '🏁', titulo: 'Chapter champion', desc: 'Pass the final test with 80%+', porCapitulo: true, cond: (c) => c.testOk },
  { id: 'semana', icono: '🏆', titulo: 'Chapter in a week', desc: 'Complete the whole plan within 7 days', porCapitulo: true, cond: (c) => c.semana },
];
// Los del K7 conservan el id de antes de haber varios capítulos; los demás llevan el suyo.
const idLogro = (l, cap) => (l.porCapitulo && cap !== 'k07' ? `${l.id}-${cap}` : l.id);

// pistas: las del capítulo (del plan o el actual), para «All ears».
function contexto(ev, pistas) {
  const acts = actividad();
  const delLibro = pistas.filter((p) => p.id.startsWith('KB') && p.archivo).map((p) => p.id);
  const oidas = new Set(acts.filter((a) => a.tipo === 'escucha').map((a) => a.pista));
  return {
    pistasKB: delLibro.length,
    pistasOidas: delLibro.filter((p) => oidas.has(p)).length,
    hechas: ev?.hechas ?? 0,
    diasCompletos: ev ? ev.dias.filter((d) => d.estado === 'hecho').length : 0,
    racha: rachaActual(),
    perfectas: acts.filter((a) => a.tipo === 'ronda' && a.total >= 8 && a.aciertos === a.total).length,
    recordArticulo: ajuste('recordArticulo') ?? 0,
    palabras: estadisticasVocab().aprendidas,
    formas: estadisticasVerbos().dominadas,
    speaking: acts.filter((a) => a.tipo === 'speaking').length,
    frasesClaras: new Set(acts.filter((a) => a.tipo === 'speaking' && a.modo === 'leer' && a.puntaje >= 0.9).map((a) => a.item)).size,
    testOk: !!ev?.todas.some((t) => t.tipo === 'test' && t.hecha),
    semana: !!ev && ev.completo && ev.hoyIdx < ev.dias.length,
  };
}

// Si se desbloquean varios a la vez, se apilan en vez de taparse.
function mostrarLogro(l) {
  confeti();
  let pila = document.querySelector('.logros-pila');
  if (!pila) document.body.append((pila = h('div', { class: 'logros-pila', role: 'status' })));
  const pop = h('div', { class: 'logro-pop' }, h('span', { class: 'logro-pop-ico' }, l.icono), h('span', {}, h('small', {}, 'Badge unlocked!'), h('strong', {}, l.titulo)));
  pila.append(pop);
  setTimeout(() => pop.classList.add('sale'), 3600);
  setTimeout(() => (pop.remove(), pila.childElementCount || pila.remove()), 4200);
}

// Se llama ante cada cambio de progreso: festeja tareas, días y logros nuevos.
let previo = null;
let temporizador = null;
let ocupado = false;
export function vigilar(deOtraPestana = false) {
  if (deOtraPestana) previo = null; // ya se festejó en la pestaña donde se hizo
  clearTimeout(temporizador);
  temporizador = setTimeout(revisar, 150);
}
async function revisar() {
  if (ocupado) return vigilar();
  ocupado = true;
  try {
    const ev = await evaluarAhora();
    const cap = ev?.cfg.capitulo ?? capituloActual();
    const ahora = {
      plan: ev?.cfg.inicio ?? null,
      tareas: new Set(ev ? ev.todas.filter((t) => t.hecha).map((t) => t.id) : []),
      dias: new Set(ev ? ev.dias.filter((d) => d.estado === 'hecho').map((d) => d.n) : []),
    };
    // Al abrir la app no se festeja lo que ya estaba hecho.
    const festejar = previo !== null && previo.plan === ahora.plan;
    if (festejar && ev) {
      const diasNuevos = [...ahora.dias].filter((n) => !previo.dias.has(n));
      const tareasNuevas = ev.todas.filter((t) => t.hecha && !previo.tareas.has(t.id));
      if (diasNuevos.length) {
        confeti();
        aviso(ev.completo ? `🏆 Plan complete! Kapitel ${ev.numero} is done.` : `📅 Day ${diasNuevos[0]} complete! Great job.`, 'bien');
      } else if (tareasNuevas.length) aviso(`✓ Plan task done: ${tareasNuevas[0].texto}`, 'bien');
    }
    const primera = previo === null;
    previo = ahora;
    const ctx = contexto(ev, await pistasLibro(cap));
    for (const l of LOGROS) {
      const id = idLogro(l, cap);
      if (logros()[id] || !l.cond(ctx)) continue;
      desbloquearLogro(id);
      if (!primera) mostrarLogro(l);
    }
  } finally {
    ocupado = false;
  }
}

// ---------- Mensajes de ritmo ----------
function ritmo(ev) {
  const min = ev.pendientesHoy.reduce((s, t) => s + t.minutos, 0);
  const n = ev.pendientesHoy.length;
  if (ev.completo) return ['exito', ev.hoyIdx < ev.dias.length ? `🏆 Kapitel ${ev.numero} done within the week! Fantastic work.` : `🏆 Kapitel ${ev.numero} done! Fantastic work.`];
  if (ev.hoyIdx < 0) return ['info', `Your week starts ${ev.hoyIdx === -1 ? 'tomorrow' : `on ${fechaCorta(ev.cfg.inicio)}`}. Want a head start? You can begin right now.`];
  if (ev.hoyIdx >= ev.dias.length) return ['atraso', `The week is over and ${cuantas(ev.total - ev.hechas, 'task')} ${ev.total - ev.hechas === 1 ? 'is' : 'are'} left. Finish them to close the chapter — you're almost there!`];
  if (ev.atrasadas.length) return ['atraso', `You're ${cuantas(ev.atrasadas.length, 'task')} behind. Do them today (≈ ${min} min with today's) and you're back on track.`];
  if (!n) return ['exito', ev.adelantadas ? `Today's goal: done! You're ${cuantas(ev.adelantadas, 'task')} ahead. 🚀` : "Today's goal: done! 🎉 See you tomorrow."];
  if (ev.hoyIdx === ev.dias.length - 1) return ['info', `Last day! ${cuantas(n, 'task')} left (≈ ${min} min). Finish strong 💪`];
  return ['info', `Today: ${cuantas(n, 'task')}, ≈ ${min} min. You're on track${ev.adelantadas ? ` and ${ev.adelantadas} ahead` : ''}.`];
}

function avisoRacha() {
  const r = rachaActual();
  if (estudioHoy()) return r > 1 ? h('p', { class: 'plan-racha' }, `🔥 ${r}-day streak — keep it going tomorrow!`) : null;
  return r > 0 ? h('p', { class: 'plan-racha alerta' }, `🔥 Study today to keep your ${cuantas(r, 'day')} streak!`) : null;
}

// ---------- Piezas de interfaz ----------
function irA(hash) {
  if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

function iniciar(inicio) {
  configPlan({ capitulo: capituloActual(), inicio, hora: ajuste('horaRecordatorio') ?? '19:00' });
  irA('#/plan');
}

// Enlace a la tarea; si pide tiempos verbales concretos, los deja elegidos.
function enlaceTarea(t, clase, ...hijos) {
  return h('a', { class: clase, href: t.href, onclick: () => t.tiempos && ajuste('tiemposConjugar', t.tiempos) }, ...hijos);
}

function filaTarea(t, { atrasada = false } = {}) {
  let det = `${t.minutos} min`;
  if (!t.hecha && t.tipo === 'escuchar' && t.progreso > 0) det = `${Math.round(t.progreso * t.pistas.length)}/${t.pistas.length} heard`;
  else if (!t.hecha && t.tipo === 'leccion' && t.progreso > 0) det = `${Math.round(t.progreso * 100)}% done`;
  else if (!t.hecha && t.tipo === 'test' && t.progreso === 1) det = `score ${Math.round(t.puntaje * 100)}%: retry the steps you missed`;
  else if (!t.hecha && t.tipo === 'speaking' && t.intentados === t.items) det = `average ${Math.round(t.promedio * 100)}%: aim for 60%`;
  else if (!t.hecha && t.tipo === 'speaking' && t.intentados > 0) det = `${t.intentados}/${t.items} done`;
  return h('li', { class: `tarea ${t.hecha ? 'hecha' : t.progreso > 0 ? 'parcial' : ''}` },
    h('span', { class: 'tarea-check', title: t.hecha ? 'Done' : 'To do' }, t.hecha ? '✓' : ''),
    enlaceTarea(t, 'tarea-link', h('span', { class: 'tarea-ico' }, t.icono), h('span', { class: 'tarea-txt' }, t.texto, atrasada && h('span', { class: 'tag atraso' }, `day ${t.dia + 1}`))),
    h('span', { class: 'tarea-det' }, det));
}

function tiraSemana(ev) {
  return h('ol', { class: 'semana', 'aria-label': 'Days of the week' }, ev.dias.map((d, i) => h('li', {
    class: `dia-pill ${d.estado} ${i === ev.hoyIdx ? 'es-hoy' : ''}`,
    title: `Day ${d.n}: ${d.titulo} (${d.hechas}/${d.tareas.length})`,
  }, h('span', { class: 'dia-sem' }, diaSemana(d.fecha)), h('span', { class: 'dia-num' }, d.estado === 'hecho' ? '✓' : d.n))));
}

// Para empezar el plan del capítulo que se mira (si había otro, lo reemplaza).
function invitacion() {
  const otro = configPlan() && !planDelActual() ? numeroCapitulo(configPlan().capitulo) : null;
  return h('section', { class: 'plan-card' },
    h('div', { class: 'plan-cab' }, h('span', { class: 'plan-ico' }, '📅'),
      h('div', { class: 'plan-cab-txt' }, h('h2', {}, 'One chapter a week'),
        h('p', { class: 'plan-sub' }, `Kapitel ${numeroCapitulo()} in a 7-day plan with about 50 minutes a day. Tasks tick themselves off as you do them.`),
        otro && h('p', { class: 'plan-sub' }, `Starting it replaces your Kapitel ${otro} plan. Your lessons and badges stay.`))),
    h('div', { class: 'fila-btn izq' },
      h('button', { class: 'btn primario', type: 'button', onclick: () => iniciar(hoyISO()) }, 'Start today'),
      h('button', { class: 'btn', type: 'button', onclick: () => iniciar(sumarDias(hoyISO(), 1)) }, 'Start tomorrow'),
      h('a', { class: 'btn', href: '#/plan' }, 'See the plan')));
}

/** Tarjeta de la semana para la pantalla de inicio. */
export async function tarjetaPlan() {
  const ev = planDelActual() ? await evaluarAhora() : null;
  if (!ev) return invitacion();
  const [tono, texto] = ritmo(ev);
  const enCurso = ev.hoyIdx >= 0 && ev.hoyIdx < ev.dias.length;
  const hoyDia = enCurso ? ev.dias[ev.hoyIdx] : null;
  const titulo = enCurso ? `Day ${hoyDia.n} of ${ev.dias.length} · ${hoyDia.titulo}` : ev.hoyIdx < 0 ? 'Your week plan' : ev.completo ? 'Week plan complete' : 'Overtime';
  let lista;
  if (enCurso) lista = [...ev.atrasadas.map((t) => filaTarea(t, { atrasada: true })), ...ev.deHoy.map((t) => filaTarea(t))];
  else if (ev.hoyIdx < 0) lista = ev.dias[0].tareas.map((t) => filaTarea(t));
  else lista = ev.todas.filter((t) => !t.hecha).map((t) => filaTarea(t, { atrasada: true }));
  return h('section', { class: `plan-card ${tono}` },
    h('div', { class: 'plan-cab' },
      h('span', { class: 'plan-ico' }, ev.completo ? '🏆' : '📅'),
      h('div', { class: 'plan-cab-txt' }, h('h2', {}, titulo), h('p', { class: 'plan-sub' }, `Kapitel ${ev.numero} · ${fechaCorta(ev.cfg.inicio)} → ${fechaCorta(ev.fin)} · ${ev.hechas}/${ev.total} tasks`)),
      anillo(ev.hechas / ev.total, 52)),
    tiraSemana(ev),
    h('p', { class: `plan-msg ${tono}` }, texto),
    avisoRacha(),
    lista.length > 0 && h('ul', { class: 'tareas' }, lista),
    h('div', { class: 'fila-btn izq' },
      ev.siguiente && enlaceTarea(ev.siguiente, 'btn primario', `Next: ${ev.siguiente.texto} →`),
      h('a', { class: 'btn', href: '#/plan' }, 'Full plan')));
}

// ---------- Recordatorios de calendario (.ics) ----------
const escICS = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
function plegar(linea) {
  // RFC 5545: líneas de 75 octetos como máximo; las siguientes empiezan con un espacio.
  const enc = new TextEncoder();
  const partes = [];
  let resto = linea;
  while (enc.encode(resto).length > 75) {
    let n = 74;
    while (enc.encode(resto.slice(0, n)).length > 74) n--;
    partes.push(resto.slice(0, n));
    resto = ` ${resto.slice(n)}`;
  }
  partes.push(resto);
  return partes.join('\r\n');
}

export function calendario(ev) {
  const [hh, mm] = (ev.cfg.hora ?? '19:00').split(':').map(Number);
  const p2 = (n) => String(n).padStart(2, '0');
  const local = (f) => `${f.getFullYear()}${p2(f.getMonth() + 1)}${p2(f.getDate())}T${p2(f.getHours())}${p2(f.getMinutes())}00`;
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Deutsch A2//Plan semanal//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const d of ev.dias) {
    const ini = aFecha(d.fecha);
    ini.setHours(hh, mm, 0, 0);
    const fin = new Date(ini.getTime() + d.minutos * 60000);
    const detalle = [`Kapitel ${ev.numero}, day ${d.n} of ${ev.dias.length}: ${d.titulo} (≈ ${d.minutos} min)`, ...d.tareas.map((t) => `- ${t.texto} (${t.minutos} min)`), '', `Open the course: ${location.origin}${location.pathname}#/plan`].join('\n');
    lineas.push('BEGIN:VEVENT', `UID:${ev.cfg.capitulo}-${ev.cfg.inicio}-dia${d.n}@deutsch-a2.local`, `DTSTAMP:${sello}`, `DTSTART:${local(ini)}`, `DTEND:${local(fin)}`,
      `SUMMARY:${escICS(`German: Kapitel ${ev.numero}, day ${d.n} – ${d.titulo}`)}`, `DESCRIPTION:${escICS(detalle)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT10M', `DESCRIPTION:${escICS('Time for German! 🇩🇪')}`, 'END:VALARM', 'END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function descargarCalendario(ev) {
  descargar(`deutsch-a2-kapitel-${ev.numero}-${ev.cfg.inicio}.ics`, calendario(ev), 'text/calendar;charset=utf-8');
  aviso('Calendar file downloaded: open it to add the reminders.');
}

// ---------- Progreso en otra computadora (.json) ----------
// Cada navegador guarda su propio progreso: se exporta en una máquina y se importa en la otra.
function exportarProgreso() {
  descargar(`deutsch-a2-progress-${hoyISO()}.json`, JSON.stringify(exportar(), null, 2), 'application/json');
  aviso('Progress exported: import the file on the other computer.');
}

const ERRORES_IMPORTAR = {
  curso: 'That file is not a progress file from this course. Choose the .json you got with “Export progress”.',
  version: 'That file comes from a newer version of the course. Update the course on this computer and try again.',
  datos: 'That progress file is damaged, so it cannot be imported.',
  guardar: 'This browser could not save the progress (its storage is full or blocked).',
  copia: 'That backup could not be read.',
};

// Textos del cuadro de confirmación según de dónde viene el progreso.
const ORIGEN = {
  archivo: { titulo: 'Import this progress?', fecha: 'File exported on', columna: 'In the file', accion: 'Importing', hecho: 'imported' },
  copia: { titulo: 'Restore this backup?', fecha: 'Backup saved on', columna: 'In the backup', accion: 'Restoring', hecho: 'restored' },
};

// Lo que se compara antes de importar: XP, racha, día del plan y logros.
function resumenProgreso(p, nDias) {
  const i = p.plan ? diasEntre(p.plan.inicio, hoyISO()) : null;
  const dia = i === null ? 'Not started' : i < 0 ? `Starts ${fechaCorta(p.plan.inicio)}` : i < nDias ? `Day ${i + 1} of ${nDias}` : 'Week over';
  return [`${p.xp} XP`, cuantas(rachaActual(p.racha), 'day'), dia, `${Object.keys(p.logros).length} unlocked`];
}

// Muestra el resumen del archivo (o de la copia) al lado del progreso actual; resuelve true si se confirma.
function confirmarImportacion(nuevo, exportado, nDias, origen = 'archivo') {
  const o = ORIGEN[origen];
  const [delArchivo, actual] = [resumenProgreso(nuevo, nDias), resumenProgreso(leer(), nDias)];
  const cuando = new Date(exportado).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return new Promise((listo) => {
    const dlg = h('dialog', { class: 'dialogo', 'aria-labelledby': 'importar-tit' },
      h('h2', { id: 'importar-tit' }, o.titulo),
      h('p', { class: 'pista-txt' }, `${o.fecha} ${cuando}.`),
      h('table', { class: 'tabla' },
        h('thead', {}, h('tr', {}, h('td'), h('th', { scope: 'col' }, o.columna), h('th', { scope: 'col' }, 'Here now'))),
        h('tbody', {}, ['XP', 'Streak', 'Plan', 'Badges'].map((fila, i) => h('tr', {}, h('th', { scope: 'row' }, fila), h('td', {}, delArchivo[i]), h('td', {}, actual[i]))))),
      leer().xp > nuevo.xp && h('p', { class: 'plan-msg atraso' }, `⚠️ You have more XP here than ${origen === 'copia' ? 'in the backup' : 'in the file'}: ${o.accion.toLowerCase()} it would lose it.`),
      h('p', {}, `${o.accion} replaces all the progress saved in this browser${estadoSincro().sesion ? ', in your account and on your other devices' : ''}.`),
      h('form', { method: 'dialog', class: 'fila-btn izq' },
        h('button', { class: 'btn primario', value: 'si' }, 'Replace my progress'),
        h('button', { class: 'btn', value: 'no', autofocus: true }, 'Cancel')));
    dlg.addEventListener('close', () => (dlg.remove(), listo(dlg.returnValue === 'si')));
    document.body.append(dlg);
    dlg.showModal();
  });
}

// Texto de un archivo exportado o de una copia automática → confirmación → reemplaza el progreso.
async function importarProgreso(texto, mensaje, origen = 'archivo') {
  const fallar = (motivo) => (mensaje.textContent = `${ERRORES_IMPORTAR[motivo]} Nothing was changed.`);
  const r = leerExportacion(texto);
  if (r.error) return fallar(origen === 'copia' && r.error !== 'version' ? 'copia' : r.error);
  if (!(await confirmarImportacion(r.progreso, r.exportado, (await cargarPlan()).dias.length, origen))) return;
  if (!importar(r.progreso)) return fallar('guardar');
  previo = null; // lo que trae ya se festejó cuando se hizo
  irA('#/plan');
  aviso(`✓ Progress ${ORIGEN[origen].hecho}: ${r.progreso.xp} XP.`, 'bien');
}

// Cuándo se guardó la última copia: «today at 14:32», «yesterday at 09:10» o la fecha.
function cuandoFue(fechaHora) {
  const f = new Date(fechaHora);
  const [dia, hora] = [aISO(f), f.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })];
  return `${dia === hoyISO() ? 'today' : dia === sumarDias(hoyISO(), -1) ? 'yesterday' : fechaCorta(dia)} at ${hora}`;
}

// Las copias automáticas que guarda el servidor del curso: la última y una por día (dos semanas).
function bloqueCopia() {
  const mensaje = h('p', { class: 'feedback mal', role: 'alert' });
  const estadoCopia = h('p', { class: 'pista-txt' }, 'Checking the automatic backup…');
  const lista = h('select', { 'aria-label': 'Backup to restore', hidden: true });
  const restaurar = h('button', { class: 'btn', type: 'button', hidden: true, onclick: async () => {
    mensaje.textContent = '';
    const texto = await fetch(`/api/progreso?dia=${lista.value}`, { cache: 'no-store' }).then((r) => (r.status === 200 ? r.text() : '')).catch(() => '');
    importarProgreso(texto, mensaje, 'copia');
  } }, '🛟 Restore this backup');
  fetch('/api/progreso?dias', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
    if (!d) return void (estadoCopia.textContent = 'The automatic backup is off: close the course window and open the course again to turn it on.');
    estadoCopia.textContent = d.ultima ? `Last copy: ${cuandoFue(d.ultima)}.` : 'No copy yet: the first one is saved as soon as you study.';
    lista.replaceChildren(...d.dias.map((dia) => h('option', { value: dia }, dia === hoyISO() ? 'Today' : dia === sumarDias(hoyISO(), -1) ? 'Yesterday' : fechaCorta(dia))));
    lista.hidden = restaurar.hidden = !d.dias.length;
  });
  return h('div', { class: 'ajuste' },
    h('strong', {}, '🛟 Automatic backup'),
    h('p', { class: 'pista-txt' }, 'Wherever the course runs (this computer or your codespace), it also keeps a copy of your progress: the latest one and one per day for the last two weeks. If this browser loses your progress, it comes back by itself when you open the course.'),
    estadoCopia,
    h('div', { class: 'fila-btn izq' }, lista, restaurar),
    mensaje);
}

// La cuenta en la nube: con sesión, el progreso se sincroniza solo entre equipos.
function bloqueNube() {
  const e = estadoSincro();
  if (e.fase === 'sin-config') return null;
  return h('div', { class: 'ajuste' },
    h('strong', {}, '☁️ Your account'),
    e.sesion
      ? h('p', { class: 'pista-txt' }, `Signed in as ${e.sesion.email}. Your progress is saved in your account and syncs across your devices. ${textoSincro(e)}`.trim())
      : h('p', { class: 'pista-txt' }, 'Sign in to keep your progress in the cloud and continue where you left off on any device.'),
    h('div', { class: 'fila-btn izq' }, h('a', { class: 'btn', href: '#/perfil' }, e.sesion ? 'Account' : 'Sign in')));
}

function bloqueTraspaso() {
  const mensaje = h('p', { class: 'feedback mal', role: 'alert' });
  const elegir = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => {
    const [archivo] = e.target.files;
    e.target.value = ''; // así se puede volver a elegir el mismo archivo
    mensaje.textContent = '';
    if (archivo) (archivo.size > 10e6 ? Promise.resolve('') : archivo.text().catch(() => '')).then((texto) => importarProgreso(texto, mensaje));
  } });
  const conCuenta = !!estadoSincro().sesion;
  // En la página publicada no hay servidor ni copia automática: el respaldo es la cuenta, más exportar.
  return h('section', { class: 'bloque' }, h('h2', { class: 'bloque-tit' }, 'Saving your progress'),
    h('div', { class: 'plan-ajustes' },
      bloqueNube(),
      !CIFRADO && bloqueCopia(),
      h('div', { class: 'ajuste' },
        h('strong', {}, conCuenta ? 'An extra backup' : 'Studying on two computers?'),
        h('p', { class: 'pista-txt' }, conCuenta
          ? 'Your account already keeps your devices in sync. Exporting a file is still a handy extra backup. Importing one replaces your progress everywhere.'
          : 'Each one keeps its own progress. Export it when you finish and import the file on the other one before you start: XP, streak, plan, badges and reviews come along. Importing replaces what was there.'),
        h('div', { class: 'fila-btn izq' },
          h('button', { class: 'btn', type: 'button', onclick: exportarProgreso }, '💾 Export progress'),
          h('button', { class: 'btn', type: 'button', onclick: () => elegir.click() }, '📂 Import progress')),
        elegir, mensaje)));
}

// ---------- Pantalla del plan ----------
export async function pantallaPlan(raiz) {
  // El plan en curso, si es del capítulo que se mira; si no, cómo quedaría el de este capítulo.
  const cap = capituloActual();
  const n = numeroCapitulo(cap);
  const ev = planDelActual() ? await evaluarAhora() : null;
  const vista = ev ?? (await evaluarAhora({ capitulo: cap, inicio: hoyISO(), hora: '19:00' }));
  const cab = h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, 'Your week plan'),
    h('p', { class: 'sub' }, ev ? `Kapitel ${n} · ${fechaCorta(ev.cfg.inicio)} → ${fechaCorta(ev.fin)} · about 50 minutes a day` : `Kapitel ${n} in 7 days, about 50 minutes a day. This is how your week would look if you started today:`));

  const resumen = ev
    ? h('section', { class: `plan-card ${ritmo(ev)[0]}` },
      h('div', { class: 'plan-cab' }, anillo(ev.hechas / ev.total, 64),
        h('div', { class: 'plan-cab-txt' }, h('h2', {}, `${ev.hechas} of ${ev.total} tasks done`), h('p', { class: `plan-msg ${ritmo(ev)[0]}` }, ritmo(ev)[1]))),
      tiraSemana(ev), avisoRacha(),
      ev.siguiente && h('div', { class: 'fila-btn izq' }, enlaceTarea(ev.siguiente, 'btn primario', `Next: ${ev.siguiente.texto} →`)))
    : invitacion();

  const dias = h('section', { class: 'bloque' }, h('h2', { class: 'bloque-tit' }, 'Day by day'),
    h('div', { class: 'dias' }, vista.dias.map((d) => h('article', { class: `dia-card ${ev ? d.estado : 'futuro'} ${ev && d.n - 1 === ev.hoyIdx ? 'es-hoy' : ''}` },
      h('header', { class: 'dia-cab' },
        h('span', { class: 'dia-n' }, d.estado === 'hecho' && ev ? '✓' : d.n),
        h('div', {}, h('div', { class: 'dia-fecha' }, `Day ${d.n} · ${fechaCorta(d.fecha)}${ev && d.n - 1 === ev.hoyIdx ? ' · today' : ''}`), h('h3', {}, d.titulo), h('p', { class: 'dia-foco' }, d.foco)),
        h('span', { class: 'dia-min' }, `≈ ${d.minutos} min`)),
      h('ul', { class: 'tareas' }, d.tareas.map((t) => filaTarea(t)))))));

  // Los logros generales y los de este capítulo.
  const obtenidos = logros();
  const delCapitulo = LOGROS.map((l) => ({ ...l, id: idLogro(l, cap), desc: l.porCapitulo ? `${l.desc} (Kapitel ${n})` : l.desc }));
  const insignias = h('section', { class: 'bloque' }, h('h2', { class: 'bloque-tit' }, `Badges · ${delCapitulo.filter((l) => obtenidos[l.id]).length}/${delCapitulo.length}`),
    h('div', { class: 'logros' }, delCapitulo.map((l) => h('div', { class: `logro ${obtenidos[l.id] ? 'si' : 'no'}`, title: l.desc },
      h('span', { class: 'logro-ico' }, l.icono), h('span', { class: 'logro-tit' }, l.titulo),
      h('span', { class: 'logro-desc' }, obtenidos[l.id] ? `Unlocked ${fechaCorta(obtenidos[l.id])}` : l.desc)))));

  let ajustes = null;
  if (ev) {
    const fecha = h('input', { type: 'date', value: ev.cfg.inicio });
    const hora = h('input', { type: 'time', value: ev.cfg.hora ?? '19:00' });
    hora.addEventListener('change', () => {
      ajuste('horaRecordatorio', hora.value);
      configPlan({ ...configPlan(), hora: hora.value });
      aviso(`Reminder time: ${hora.value}. Download the calendar file again to update it.`);
    });
    ajustes = h('section', { class: 'bloque' }, h('h2', { class: 'bloque-tit' }, 'Reminders and settings'),
      h('div', { class: 'plan-ajustes' },
        h('div', { class: 'ajuste' },
          h('label', {}, h('strong', {}, 'Daily reminder at '), hora),
          h('p', { class: 'pista-txt' }, 'Download one event per day of your plan (with an alert 10 minutes before) and open the file: it gets added to Google Calendar, Outlook or your phone.'),
          h('button', { class: 'btn primario', type: 'button', onclick: () => descargarCalendario(ev) }, '📆 Download calendar reminders')),
        h('div', { class: 'ajuste' },
          h('label', {}, h('strong', {}, 'Plan start '), fecha),
          h('p', { class: 'pista-txt' }, 'Moving the start keeps your lessons; trainer rounds done before the new start do not count.'),
          h('button', { class: 'btn', type: 'button', onclick: () => fecha.value && (configPlan({ ...configPlan(), inicio: fecha.value }), irA('#/plan')) }, 'Move my plan'),
          h('button', { class: 'enlace', type: 'button', onclick: () => confirm('Stop the plan? Your lessons and badges stay.') && (configPlan(null), irA('#/plan')) }, 'Stop the plan'))));
  }
  raiz.replaceChildren(...[cab, resumen, dias, insignias, ajustes, bloqueTraspaso()].filter(Boolean));
}
