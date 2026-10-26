// Plano de una ciudad para practicar indicaciones (Wegbeschreibung) con las
// preposiciones de lugar del capítulo («vorbei», «durch», «gegenüber»…).
// Dos modos: «adonde» (leer/escuchar la ruta y tocar el destino) y «cual»
// (ver la ruta dibujada y elegir la descripción correcta).
import { h, mezclar } from './ui.js';
import { decir } from './audio.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...hijos) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...hijos);
  return el;
};

// Calles: horizontales (Nordstraße, Hauptstraße, Südstraße) y verticales.
const CALLES = [
  { x: 0, y: 40, w: 720, h: 30, n: 'Nordstraße' },
  { x: 0, y: 200, w: 720, h: 30, n: 'Hauptstraße' },
  { x: 0, y: 360, w: 720, h: 30, n: 'Südstraße' },
  { x: 40, y: 40, w: 30, h: 350 },
  { x: 250, y: 40, w: 30, h: 350, n: 'Bergstraße', vert: true },
  { x: 460, y: 40, w: 30, h: 350, n: 'Goethestraße', vert: true },
  { x: 670, y: 40, w: 30, h: 350 },
];

export const LUGARES = [
  { id: 'museum', de: 'das Museum', x: 300, y: 4, w: 140, h: 32, c: '#e9d5ff' },
  { id: 'schule', de: 'die Schule', x: 78, y: 80, w: 80, h: 110, c: '#fde68a' },
  { id: 'kirche', de: 'die Kirche', x: 164, y: 80, w: 80, h: 110, c: '#fecaca' },
  { id: 'park', de: 'der Park', x: 284, y: 74, w: 172, h: 122, c: '#bbf7d0', park: true },
  { id: 'cafe', de: 'das Café', x: 496, y: 80, w: 80, h: 110, c: '#fed7aa' },
  { id: 'kino', de: 'das Kino', x: 582, y: 80, w: 80, h: 110, c: '#c7d2fe' },
  { id: 'bahnhof', de: 'der Bahnhof', x: 78, y: 240, w: 166, h: 110, c: '#d6d3d1' },
  { id: 'kaufhaus', de: 'das Kaufhaus', x: 288, y: 240, w: 80, h: 110, c: '#bae6fd' },
  { id: 'supermarkt', de: 'der Supermarkt', x: 374, y: 240, w: 80, h: 110, c: '#fef08a' },
  { id: 'post', de: 'die Post', x: 496, y: 240, w: 80, h: 110, c: '#fde047' },
  { id: 'apotheke', de: 'die Apotheke', x: 582, y: 240, w: 80, h: 110, c: '#a7f3d0' },
];

// Partida: salida del Bahnhof sobre la Hauptstraße, mirando al este (→).
const INICIO = [160, 215];

const RUTAS = [
  {
    texto: 'Geh geradeaus am Kaufhaus vorbei bis zur Kreuzung. Dann geh links. Das Ziel ist gegenüber vom Park.',
    destino: 'cafe',
    camino: [INICIO, [475, 215], [475, 135]],
  },
  {
    texto: 'Geh bis zur ersten Kreuzung und dann links. Das Ziel ist auf der linken Seite, gegenüber vom Park.',
    destino: 'kirche',
    camino: [INICIO, [265, 215], [265, 135]],
  },
  {
    texto: 'Geh geradeaus, am Kaufhaus und am Supermarkt vorbei, bis zur Goethestraße. Geh rechts. Das Ziel ist auf der linken Seite.',
    destino: 'post',
    camino: [INICIO, [475, 215], [475, 295]],
  },
  {
    texto: 'Geh bis zur Bergstraße und dann durch den Park bis zur Nordstraße. Das Ziel ist gegenüber vom Park.',
    destino: 'museum',
    camino: [INICIO, [265, 215], [290, 195], [370, 120], [370, 55]],
  },
  {
    texto: 'Geh bis zur Goethestraße und dann links bis zur Nordstraße. Geh rechts und dann gleich wieder rechts. Das Ziel ist neben dem Café.',
    destino: 'kino',
    camino: [INICIO, [475, 215], [475, 55], [685, 55], [685, 135], [662, 135]],
  },
  {
    texto: 'Geh bis zur Goethestraße und dann rechts bis zur Südstraße. Geh links und dann gleich wieder links. Das Ziel ist neben der Post.',
    destino: 'apotheke',
    camino: [INICIO, [475, 215], [475, 375], [685, 375], [685, 295], [662, 295]],
  },
];

function plano({ ruta, alTocar }) {
  const svg = s('svg', { viewBox: '0 0 720 400', class: 'mapa-svg', role: 'img', 'aria-label': 'City map' });
  svg.append(s('rect', { x: 0, y: 0, width: 720, height: 400, class: 'mapa-fondo' }));
  for (const c of CALLES) {
    svg.append(s('rect', { x: c.x, y: c.y, width: c.w, height: c.h, class: 'mapa-calle' }));
    if (c.n) {
      const t = c.vert
        ? s('text', { x: c.x + 19, y: 300, class: 'mapa-calle-n', transform: `rotate(-90 ${c.x + 19} 300)` }, c.n)
        : s('text', { x: 620, y: c.y + 19, class: 'mapa-calle-n' }, c.n);
      svg.append(t);
    }
  }
  for (const l of LUGARES) {
    const g = s('g', { class: 'mapa-lugar', 'data-id': l.id, tabindex: alTocar ? 0 : -1, role: alTocar ? 'button' : 'img', 'aria-label': l.de });
    g.append(s('rect', { x: l.x, y: l.y, width: l.w, height: l.h, rx: l.park ? 18 : 6, fill: l.c }));
    if (l.park) for (const [cx, cy] of [[310, 100], [420, 95], [330, 175], [430, 170], [380, 150]]) g.append(s('circle', { cx, cy, r: 10, class: 'mapa-arbol' }));
    g.append(s('text', { x: l.x + l.w / 2, y: l.y + l.h / 2 + 5, class: 'mapa-lugar-n' }, l.de.split(' ')[1]));
    if (alTocar) {
      const fn = () => alTocar(l, g);
      g.addEventListener('click', fn);
      g.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), fn()));
    }
    svg.append(g);
  }
  if (ruta) {
    const pts = ruta.camino.map((p) => p.join(',')).join(' ');
    const linea = s('polyline', { points: pts, class: 'mapa-ruta' });
    svg.append(linea);
  }
  // Marca de partida con la dirección en la que se mira.
  svg.append(s('circle', { cx: INICIO[0], cy: INICIO[1], r: 11, class: 'mapa-inicio' }));
  svg.append(s('path', { d: `M ${INICIO[0] - 4} ${INICIO[1] - 6} L ${INICIO[0] + 6} ${INICIO[1]} L ${INICIO[0] - 4} ${INICIO[1] + 6} Z`, class: 'mapa-flecha' }));
  svg.append(s('text', { x: INICIO[0] - 16, y: INICIO[1] + 4, class: 'mapa-aqui', 'text-anchor': 'end' }, 'Du bist hier'));
  return svg;
}

function dibujarRuta(svg, ruta) {
  svg.querySelector('.mapa-ruta')?.remove();
  const linea = s('polyline', { points: ruta.camino.map((p) => p.join(',')).join(' '), class: 'mapa-ruta animada' });
  svg.insertBefore(linea, svg.querySelector('.mapa-inicio'));
}

export function ejercicioMapa(p, ctx, premio) {
  const rutas = mezclar(RUTAS).slice(0, p.cantidad ?? 4);
  const cont = h('div', { class: 'mapa' });
  let i = 0;
  let aciertos = 0;

  const siguiente = () => {
    if (i >= rutas.length) return ctx.listo(aciertos, rutas.length);
    const r = rutas[i++];
    let primera = true;
    const fb = h('div', { class: 'feedback' });
    const cab = h('div', { class: 'armar-cont' }, `${i} / ${rutas.length}`);
    const seguir = h('button', { class: 'btn primario', type: 'button', onclick: siguiente }, i < rutas.length ? 'Next →' : 'Finish');

    if ((p.modo ?? 'adonde') === 'adonde') {
      let svg;
      svg = plano({
        alTocar: (lugar, g) => {
          if (fb.classList.contains('bien')) return;
          if (lugar.id === r.destino) {
            g.classList.add('bien');
            if (primera) (aciertos++, premio(g));
            fb.className = 'feedback bien';
            fb.textContent = `✓ You made it! ${lugar.de[0].toUpperCase()}${lugar.de.slice(1)}.`;
            dibujarRuta(svg, r);
            fb.after(seguir);
          } else {
            primera = false;
            g.classList.add('sacudir');
            g.addEventListener('animationend', () => g.classList.remove('sacudir'), { once: true });
            fb.className = 'feedback mal';
            fb.textContent = `No, that's ${lugar.de}. Read it again step by step.`;
          }
        },
      });
      cont.replaceChildren(cab,
        h('div', { class: 'ruta-texto' }, h('button', { class: 'btn-icono', type: 'button', onclick: () => decir(r.texto), 'aria-label': 'Listen to the directions' }, '🔊'), h('span', {}, r.texto)),
        h('p', { class: 'pista-txt' }, 'Tap the place you end up at.'), svg, fb);
    } else {
      const svg = plano({ ruta: r });
      const opciones = mezclar([r, ...mezclar(RUTAS.filter((x) => x !== r)).slice(0, 2)]);
      cont.replaceChildren(cab, h('p', { class: 'pista-txt' }, 'Which directions describe the route drawn on the map?'), svg,
        h('div', { class: 'opciones' }, opciones.map((o) => h('button', {
          class: 'opcion larga', type: 'button',
          onclick: (e) => {
            const b = e.currentTarget;
            if (o === r) {
              b.classList.add('bien');
              cont.querySelectorAll('.opcion').forEach((x) => (x.disabled = true));
              if (primera) (aciertos++, premio(b));
              decir(r.texto);
              fb.className = 'feedback bien';
              fb.textContent = '✓ Correct.';
              fb.after(seguir);
            } else {
              primera = false;
              b.classList.add('mal');
              b.disabled = true;
            }
          },
        }, o.texto))), fb);
    }
  };
  siguiente();
  return cont;
}
