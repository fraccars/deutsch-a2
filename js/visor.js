// Visor de las páginas escaneadas del libro: "kb-084" = Kursbuch pág. 84, "ub-090" =
// Übungsbuch pág. 90. Lo usan el botón 📖 Book de cada lección y los ejercicios del libro.
import { h, aviso } from './ui.js';
import { urlMedio } from './archivos.js';

export function visorLibro(paginas, desde = 0) {
  const nombre = (p) => `${p.startsWith('kb') ? 'Kursbuch' : 'Übungsbuch'} · p. ${Number(p.slice(3))}`;
  let i = Math.max(0, Math.min(desde, paginas.length - 1));
  const img = h('img', { class: 'visor-img', alt: '' });
  const tit = h('span', { class: 'visor-tit' });
  const pintar = () => {
    const k = i;
    urlMedio(`media/paginas/${paginas[k]}.jpg`).then((url) => k === i && (img.src = url), (e) => k === i && aviso(e.message, 'mal'));
    img.alt = nombre(paginas[i]);
    tit.textContent = `${nombre(paginas[i])}  (${i + 1}/${paginas.length})`;
    img.classList.remove('zoom');
  };
  const dlg = h('dialog', { class: 'visor' },
    h('div', { class: 'visor-cab' },
      h('button', { class: 'chip', type: 'button', disabled: paginas.length < 2, onclick: () => ((i = (i - 1 + paginas.length) % paginas.length), pintar()) }, '←'),
      tit,
      h('button', { class: 'chip', type: 'button', disabled: paginas.length < 2, onclick: () => ((i = (i + 1) % paginas.length), pintar()) }, '→'),
      h('button', { class: 'chip', type: 'button', onclick: () => dlg.close() }, 'Close ✕')),
    h('div', { class: 'visor-cuerpo' }, img));
  img.addEventListener('click', () => img.classList.toggle('zoom'));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  pintar();
  dlg.showModal();
}
