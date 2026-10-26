// Dónde corre el curso.
// - Versión local (tools/serve.mjs en 127.0.0.1:4330, o un codespace): los datos están en
//   claro y hay servidor, con copia automática del progreso y reconocedor de voz.
// - Página publicada (tools/publicar-web.mjs): el material está cifrado, no hay servidor y la
//   app se instala y anda sin internet. El script de publicación marca el index.html.
export const CIFRADO = document.querySelector('meta[name="curso-modo"]')?.content === 'cifrado';
