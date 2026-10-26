// Cuenta y nube con Firebase (el proyecto del usuario): ingresar con email y contraseña y
// guardar en Firestore el progreso (progreso/{uid}) y, para la página publicada, la clave del
// material (claves/{uid}). Las reglas dejan a cada cuenta leer y escribir solo lo suyo.
// El SDK web modular va en vendor/firebase, con versión fija, y se carga recién cuando hace
// falta. En la página publicada lo guarda el service worker, así anda sin internet.
import { FIREBASE, EMULADORES } from './nube-config.js';

export const configurada = !!FIREBASE;

let sdk = null;
function cargarSDK() {
  if (!configurada) return Promise.reject(new Error('The cloud is not set up.'));
  sdk ??= Promise.all([
    import('../vendor/firebase/firebase-app.js'),
    import('../vendor/firebase/firebase-auth.js'),
    import('../vendor/firebase/firebase-firestore-lite.js'),
  ]).then(([app, auth, fs]) => {
    const proyecto = app.initializeApp(FIREBASE);
    // Sin el resolvedor de ventanas emergentes: en Safari cargaría de entrada un iframe de
    // Firebase que el email y la contraseña no usan (y que sin internet falla).
    const sesion = auth.initializeAuth(proyecto, { persistence: [auth.indexedDBLocalPersistence, auth.browserLocalPersistence] });
    const db = fs.getFirestore(proyecto);
    if (EMULADORES) {
      auth.connectAuthEmulator(sesion, EMULADORES.auth, { disableWarnings: true });
      fs.connectFirestoreEmulator(db, ...EMULADORES.firestore);
    }
    return { auth, fs, sesion, db };
  });
  sdk.catch(() => (sdk = null));
  return sdk;
}

// Un pedido a la nube que tarda demasiado se da por perdido (como sin conexión).
const conTiempo = (promesa, ms = 20000) => Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(Object.assign(new Error('timeout'), { code: 'unavailable' })), ms))]);

/** ¿Falló por falta de conexión (y conviene reintentar más tarde)? Firestore Lite avisa un
 *  pedido que no salió con el código 'unknown' y el mensaje del navegador («Failed to fetch»
 *  en Chrome, «Load failed» en Safari, «NetworkError…» en Firefox). */
export const sinConexion = (e) => navigator.onLine === false || e instanceof TypeError
  || ['unavailable', 'deadline-exceeded', 'auth/network-request-failed'].includes(e?.code)
  || (e?.code === 'unknown' && /fetch|load failed|network/i.test(e.message ?? ''));

// ---------- Sesión ----------
const usuario = (u) => u && { uid: u.uid, email: u.email };

/** Llama a fn con la sesión ({uid, email} o null) al cargar y en cada cambio. */
export async function alCambiarSesion(fn) {
  const { auth, sesion } = await cargarSDK();
  return auth.onAuthStateChanged(sesion, (u) => fn(usuario(u)));
}
export async function ingresar(email, contrasena) {
  const { auth, sesion } = await cargarSDK();
  return usuario((await auth.signInWithEmailAndPassword(sesion, email.trim(), contrasena)).user);
}
export async function registrarse(email, contrasena) {
  const { auth, sesion } = await cargarSDK();
  return usuario((await auth.createUserWithEmailAndPassword(sesion, email.trim(), contrasena)).user);
}
export async function salir() {
  const { auth, sesion } = await cargarSDK();
  await auth.signOut(sesion);
}
export async function restablecerContrasena(email) {
  const { auth, sesion } = await cargarSDK();
  await auth.sendPasswordResetEmail(sesion, email.trim());
}

/** Texto para el usuario a partir de un error de Firebase. */
export function mensajeError(e) {
  const c = e?.code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'Wrong email or password.';
  if (c === 'auth/invalid-email') return 'That email address doesn’t look right.';
  if (c === 'auth/missing-password') return 'Type your password.';
  if (c === 'auth/email-already-in-use') return 'There is already an account with that email. Sign in instead.';
  if (c === 'auth/weak-password') return 'Choose a longer password (at least 6 characters).';
  if (c === 'auth/too-many-requests') return 'Too many attempts. Wait a few minutes and try again.';
  if (c === 'auth/admin-restricted-operation' || c === 'auth/operation-not-allowed') return 'Creating new accounts is closed.';
  if (c === 'permission-denied') return 'The cloud refused the request (check the Firestore rules).';
  if (c === 'resource-exhausted') return 'The free daily cloud quota ran out. It will sync again tomorrow.';
  if (sinConexion(e)) return 'No connection. Try again when you are online.';
  return `Something went wrong${c ? ` (${c})` : ''}: ${e?.message ?? e}`;
}

// ---------- Progreso: progreso/{uid} ----------
// El progreso va comprimido con gzip (Bytes): así queda lejos del límite de 1 MiB por
// documento de Firestore. Si igual lo pasara, no se sube y se avisa.
const LIMITE = 900_000;

async function porStream(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
async function empaquetar(progreso, fs) {
  const json = new TextEncoder().encode(JSON.stringify(progreso));
  const gzip = typeof CompressionStream === 'function';
  const datos = gzip ? await porStream(json, new CompressionStream('gzip')) : json;
  if (datos.length > LIMITE) throw Object.assign(new Error(`Your progress is too big to sync (${Math.round(datos.length / 1024)} KB).`), { code: 'demasiado-grande' });
  return { formato: 1, compresion: gzip ? 'gzip' : 'ninguna', datos: fs.Bytes.fromUint8Array(datos), tam: json.length, guardado: fs.serverTimestamp() };
}
async function desempaquetar(doc) {
  const bytes = doc.datos.toUint8Array();
  const json = doc.compresion === 'gzip' ? await porStream(bytes, new DecompressionStream('gzip')) : bytes;
  return JSON.parse(new TextDecoder().decode(json));
}

/**
 * Lee el progreso de la cuenta y lo combina, en una transacción: si otro equipo guardó en el
 * medio, Firestore la repite con lo nuevo. decidir(remoto) recibe el progreso guardado (o
 * null) y devuelve {progreso, subir}. Devuelve el progreso que quedó.
 */
export async function sincronizarProgreso(uid, decidir) {
  const { fs, db } = await cargarSDK();
  const ref = fs.doc(db, 'progreso', uid);
  return conTiempo(fs.runTransaction(db, async (tx) => {
    const foto = await tx.get(ref);
    const remoto = foto.exists() ? await desempaquetar(foto.data()) : null;
    const { progreso, subir } = decidir(remoto);
    if (subir) tx.set(ref, await empaquetar(progreso, fs));
    return progreso;
  }));
}

/** El progreso guardado en la cuenta, o null. */
export async function leerProgreso(uid) {
  const { fs, db } = await cargarSDK();
  const foto = await conTiempo(fs.getDoc(fs.doc(db, 'progreso', uid)));
  return foto.exists() ? desempaquetar(foto.data()) : null;
}

// ---------- Clave del material: claves/{uid} ----------
/** La clave maestra guardada en la cuenta (texto base64url), o null. */
export async function leerClaveCuenta(uid) {
  const { fs, db } = await cargarSDK();
  const foto = await conTiempo(fs.getDoc(fs.doc(db, 'claves', uid)));
  return foto.exists() ? foto.data().clave ?? null : null;
}
export async function guardarClaveCuenta(uid, clave) {
  const { fs, db } = await cargarSDK();
  await conTiempo(fs.setDoc(fs.doc(db, 'claves', uid), { clave, guardada: fs.serverTimestamp() }));
}
