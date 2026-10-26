// Perfil (#/perfil): ingresar, crear la cuenta mientras el registro esté abierto y salir, con el
// estado de la sincronización. En la página publicada, mientras el dispositivo no tenga la clave
// del material, es la pantalla de entrada: al ingresar baja la clave de la cuenta y desbloquea
// el curso.
import { h, aviso } from './ui.js';
import { CIFRADO } from './modo.js';
import { REGISTRO_ABIERTO } from './nube-config.js';
import * as nube from './nube.js';
import { estadoSincro, alCambiarSincro, iniciarSincro, ingresar, registrarse, salir, sincronizar, adoptarCuenta, textoSincro, pausarSincro } from './sincro.js';
import { guardarClave, olvidarClave } from './archivos.js';
import { alCambiarDescarga, estadoDescarga, textoDescarga, pedirPersistencia, bajarParaSinInternet } from './pwa.js';

const deBase64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// ---------- Formulario de la cuenta ----------
// modo: 'ingresar' | 'registrarse' | 'olvido'. alEntrar(sesion) corre al ingresar o registrarse.
function formularioCuenta(alEntrar) {
  let modo = 'ingresar';
  const email = h('input', { type: 'email', name: 'email', autocomplete: 'username', required: true, spellcheck: 'false' });
  const contrasena = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true, minlength: 6 });
  const repetir = h('input', { type: 'password', name: 'password-again', autocomplete: 'new-password', minlength: 6 });
  const filaContrasena = h('label', { class: 'campo' }, h('span', {}, 'Password'), contrasena);
  const filaRepetir = h('label', { class: 'campo' }, h('span', {}, 'Repeat the password'), repetir);
  const mensaje = h('p', { class: 'feedback', role: 'alert' });
  const boton = h('button', { class: 'btn primario', type: 'submit' });
  const enlaces = h('p', { class: 'cuenta-enlaces' });
  const enlace = (texto, m) => h('button', { class: 'enlace', type: 'button', onclick: () => ((modo = m), pintar()) }, texto);

  function pintar() {
    filaContrasena.hidden = modo === 'olvido';
    filaRepetir.hidden = modo !== 'registrarse';
    contrasena.required = modo !== 'olvido';
    repetir.required = modo === 'registrarse';
    contrasena.autocomplete = modo === 'registrarse' ? 'new-password' : 'current-password';
    boton.textContent = { ingresar: 'Sign in', registrarse: 'Create my account', olvido: 'Send me a reset link' }[modo];
    enlaces.replaceChildren(...(modo === 'ingresar'
      ? [enlace('Forgot your password?', 'olvido'), REGISTRO_ABIERTO && ' · ', REGISTRO_ABIERTO && enlace('Create an account', 'registrarse')]
      : [enlace('Back to sign in', 'ingresar')]).filter(Boolean));
    mensaje.textContent = '';
    mensaje.className = 'feedback';
  }

  const form = h('form', { class: 'cuenta-form' }, h('label', { class: 'campo' }, h('span', {}, 'Email'), email), filaContrasena, filaRepetir, boton, mensaje, enlaces);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    mensaje.className = 'feedback';
    if (modo === 'registrarse' && contrasena.value !== repetir.value) return void (mensaje.className = 'feedback mal', (mensaje.textContent = 'The two passwords are different.'));
    boton.disabled = true;
    mensaje.textContent = modo === 'olvido' ? 'Sending…' : 'Signing in…';
    try {
      if (modo === 'olvido') {
        await nube.restablecerContrasena(email.value);
        mensaje.className = 'feedback bien';
        mensaje.textContent = 'If there is an account with that email, a reset link is on its way. Check your inbox.';
      } else {
        const sesion = modo === 'registrarse' ? await registrarse(email.value, contrasena.value) : await ingresar(email.value, contrasena.value);
        mensaje.textContent = '';
        await alEntrar(sesion, mensaje);
      }
    } catch (err) {
      mensaje.className = 'feedback mal';
      mensaje.textContent = nube.mensajeError(err);
    } finally {
      boton.disabled = false;
    }
  });
  pintar();
  return form;
}

// ---------- Página publicada: entrada y clave ----------
// Baja la clave del material de la cuenta, la guarda en el dispositivo y recarga el curso.
async function desbloquear(sesion, mensaje) {
  mensaje.className = 'feedback';
  mensaje.textContent = 'Unlocking your course…';
  const clave = await nube.leerClaveCuenta(sesion.uid);
  if (!clave) {
    mensaje.className = 'feedback mal';
    mensaje.textContent = 'This account does not have the course key yet. Open the course once on your computer (ABRIR CURSO), sign in there with this account, and come back.';
    return false;
  }
  await guardarClave(deBase64url(clave));
  pedirPersistencia();
  location.reload();
  return true;
}

/** Pantalla de entrada de la página publicada, mientras el dispositivo no tenga la clave. */
export async function pantallaEntrada(raiz) {
  const mensaje = h('p', { class: 'feedback', role: 'alert' });
  const caja = h('div', { class: 'entrada-caja' });
  raiz.replaceChildren(h('main', { class: 'entrada' },
    h('div', { class: 'entrada-logo', 'aria-hidden': 'true' }, 'A2'),
    h('h1', {}, 'Deutsch A2'),
    h('p', { class: 'sub' }, 'Sign in to open your course. After that it also works offline.'),
    caja, mensaje));
  if (!nube.configurada) return void (mensaje.textContent = 'Sign-in is not set up on this page.');
  pausarSincro();
  await iniciarSincro({ forzar: true });
  // Al ingresar cambia la sesión y eso vuelve a pintar: ahí se baja la clave.
  const pintar = async () => {
    const { sesion } = estadoSincro();
    if (!sesion) return caja.replaceChildren(formularioCuenta(() => {}));
    // Con sesión pero sin clave en el dispositivo (por ejemplo, se borró): se intenta bajar.
    caja.replaceChildren(h('p', {}, 'Signed in as ', h('strong', {}, sesion.email)),
      h('div', { class: 'fila-btn' },
        h('button', { class: 'btn primario', type: 'button', onclick: () => desbloquear(sesion, mensaje).catch((e) => (mensaje.className = 'feedback mal', (mensaje.textContent = nube.mensajeError(e)))) }, 'Try again'),
        h('button', { class: 'btn', type: 'button', onclick: () => salir() }, 'Sign out')));
    await desbloquear(sesion, mensaje).catch((e) => (mensaje.className = 'feedback mal', (mensaje.textContent = nube.mensajeError(e))));
  };
  let anterior;
  alCambiarSincro((e) => {
    if (e.sesion?.uid === anterior) return;
    anterior = e.sesion?.uid;
    pintar();
  });
  anterior = estadoSincro().sesion?.uid;
  pintar();
}

// ---------- Estado en el inicio ----------
/** Ficha de la cuenta para la barra del inicio (vacía si la nube no está configurada). */
export function fichaCuenta() {
  const e = estadoSincro();
  if (e.fase === 'sin-config') return h('span', { class: 'ficha-cuenta', hidden: true });
  const [icono, texto] = e.fase === 'cargando' ? ['☁️', '…'] : !e.sesion ? ['👤', 'Sign in']
    : e.fase === 'error' || e.fase === 'otra-cuenta' ? ['⚠️', 'Account']
      : e.fase === 'sin-conexion' ? ['☁️', 'Offline']
        : e.fase === 'al-dia' ? ['☁️', 'Synced'] : ['☁️', 'Syncing…'];
  return h('a', { class: 'estado-item ficha-cuenta', href: '#/perfil', title: e.sesion ? `${e.sesion.email} · ${textoSincro(e)}` : 'Sign in to sync your progress' }, `${icono} `, texto);
}

// ---------- Pantalla del perfil ----------
export async function pantallaPerfil(raiz) {
  const cuerpo = h('div', { class: 'perfil' });
  raiz.replaceChildren(
    h('div', { class: 'seccion-cab' }, h('a', { class: 'btn-volver', href: '#/' }, '← Home'), h('h1', {}, 'Your account'),
      h('p', { class: 'sub' }, 'Sign in to keep your progress in the cloud and continue where you left off on any device.')),
    cuerpo);
  if (!nube.configurada) return void cuerpo.replaceChildren(h('div', { class: 'feedback' }, 'The cloud is not set up yet, so your progress stays in this browser. Export it from the plan to move it to another computer.'));
  cuerpo.replaceChildren(h('p', { class: 'pista-txt' }, 'Loading…'));
  await iniciarSincro({ forzar: true });

  const pintar = () => {
    if (!raiz.contains(cuerpo)) return quitar();
    const e = estadoSincro();
    if (!e.sesion) {
      return cuerpo.replaceChildren(h('section', { class: 'cuenta-card' },
        h('h2', {}, 'Sign in'),
        formularioCuenta(async () => aviso('✓ Signed in. Your progress is syncing.', 'bien'))));
    }
    const estadoLinea = h('p', { class: `sincro-estado ${e.fase}` }, e.fase === 'al-dia' ? '✓ ' : e.fase === 'error' ? '⚠️ ' : '☁️ ', textoSincro(e) || 'Ready');
    const partes = [
      h('section', { class: 'cuenta-card' },
        h('p', {}, 'Signed in as ', h('strong', {}, e.sesion.email)),
        estadoLinea,
        e.error && h('p', { class: 'feedback mal' }, e.error),
        e.fase !== 'otra-cuenta' && h('p', { class: 'pista-txt' }, 'Your progress syncs by itself: when you open the course, a few seconds after each change, and when you leave. Offline it keeps working and syncs when you are back.'),
        h('div', { class: 'fila-btn izq' },
          e.fase !== 'otra-cuenta' && h('button', { class: 'btn', type: 'button', disabled: e.fase === 'sincronizando', onclick: () => sincronizar() }, '⟳ Sync now'),
          h('button', { class: 'btn', type: 'button', onclick: cerrarSesion }, 'Sign out'))),
    ];
    if (e.fase === 'otra-cuenta') {
      partes.push(h('section', { class: 'cuenta-card alerta' },
        h('h2', {}, 'This browser has progress from another account'),
        h('p', {}, 'To keep accounts apart, it is not mixed with yours. You can replace it with the progress of ', h('strong', {}, e.sesion.email), ' (changes of the other account that never synced are lost), or sign out.'),
        h('div', { class: 'fila-btn izq' },
          h('button', { class: 'btn primario', type: 'button', onclick: (ev) => {
            ev.currentTarget.disabled = true;
            adoptarCuenta().then(() => aviso('✓ Now using your account’s progress.', 'bien'), (err) => aviso(nube.mensajeError(err), 'mal'));
          } }, 'Use my account’s progress'))));
    }
    if (!CIFRADO && e.clave) {
      const textos = {
        guardada: '✓ The course key is saved in your account: signing in on the web page unlocks the course.',
        'sin-archivo': 'This computer has no course key (privado/clave-web.txt). The web page uses the key already saved in your account.',
        'sin-conexion': 'The course key will be saved in your account when you are online.',
        error: 'The course key could not be saved in your account. Try signing in again later.',
      };
      partes.push(h('section', { class: 'cuenta-card' }, h('h2', {}, 'Web version'), h('p', { class: 'pista-txt' }, textos[e.clave])));
    }
    if (CIFRADO) partes.push(bloqueSinInternet());
    cuerpo.replaceChildren(...partes);
  };

  const quitar1 = alCambiarSincro(pintar);
  const quitar2 = CIFRADO ? alCambiarDescarga(() => document.querySelector('.descarga-estado')?.replaceWith(lineaDescarga())) : () => {};
  const reloj = setInterval(() => document.querySelector('.sincro-estado') && pintar(), 30000);
  const quitar = () => (quitar1(), quitar2(), clearInterval(reloj));
  addEventListener('hashchange', quitar, { once: true });
  pintar();
}

async function cerrarSesion() {
  const e = estadoSincro();
  const aviso1 = e.pendiente && e.fase === 'sin-conexion' ? 'You have changes that have not synced yet (you are offline). They stay in this browser and sync the next time you sign in here.\n\n' : '';
  const aviso2 = CIFRADO ? 'This device will forget the course key: to open the course again you will need to sign in (online).' : 'Your progress stays in this browser.';
  if (!confirm(`${aviso1}Sign out? ${aviso2}`)) return;
  await salir();
  if (CIFRADO) {
    await olvidarClave();
    location.hash = '#/';
    location.reload();
  }
}

// ---------- Página publicada: uso sin internet ----------
const lineaDescarga = () => h('p', { class: 'descarga-estado' }, textoDescarga(estadoDescarga()) || 'Checking the offline download…');

function bloqueSinInternet() {
  const persistente = h('p', { class: 'pista-txt' });
  navigator.storage?.persisted?.().then((si) => (persistente.textContent = si
    ? '✓ The browser keeps the course stored on this device.'
    : 'The browser may clear the stored course if the device runs out of space. Installing the app (Add to Home Screen) protects it.')).catch(() => {});
  return h('section', { class: 'cuenta-card' },
    h('h2', {}, 'Offline use'),
    lineaDescarga(),
    persistente,
    estadoDescarga().fase !== 'listo' && h('div', { class: 'fila-btn izq' }, h('button', { class: 'btn', type: 'button', onclick: () => bajarParaSinInternet() }, 'Download now')));
}
