// Utilidades de interfaz: creación de nodos, mezclas, avisos y festejos.

export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of hijos.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function mezclar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];

let toastTimer;
export function aviso(texto, tipo = '') {
  let t = $('#aviso');
  if (!t) document.body.append((t = h('div', { id: 'aviso', role: 'status' })));
  t.textContent = texto;
  t.className = `aviso visible ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
}

export function xpFlotante(n, origen) {
  const r = origen?.getBoundingClientRect?.() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0 };
  const el = h('div', { class: 'xp-flota' }, `+${n} XP`);
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 1500); // por si la animación no corre (pestaña en segundo plano)
}

// Una sola ráfaga aunque se festejen varias cosas a la vez (día completo + logros).
let ultimoConfeti = 0;
export function confeti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || Date.now() - ultimoConfeti < 1500) return;
  ultimoConfeti = Date.now();
  const colores = ['#3f8f2f', '#2563eb', '#db2777', '#f59e0b', '#7c3aed'];
  for (let i = 0; i < 40; i++) {
    const p = h('i', { class: 'confeti' });
    p.style.left = `${50 + (Math.random() - 0.5) * 40}vw`;
    p.style.background = azar(colores);
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 60}vw`);
    p.style.setProperty('--rot', `${Math.random() * 720}deg`);
    p.style.animationDelay = `${Math.random() * 0.15}s`;
    document.body.append(p);
    p.addEventListener('animationend', () => p.remove());
    setTimeout(() => p.remove(), 2500);
  }
}

// Color del artículo, según los apuntes del alumno: der azul, die rosa, das violeta;
// la terminación del plural va en verde esmeralda (clase «pl»).
export const claseArticulo = (art) => ({ der: 'der', die: 'die', das: 'das' })[art] ?? 'pl';

export function anillo(pct, tam = 44) {
  const r = (tam - 6) / 2;
  const c = 2 * Math.PI * r;
  const svg = `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="anillo-fondo"/>
    <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="anillo-valor" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg>`;
  return h('span', { class: 'anillo', html: svg, title: `${Math.round(pct * 100)} %` });
}
