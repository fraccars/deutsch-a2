// Configuración web de Firebase (el proyecto del usuario, plan Spark). Es pública por
// diseño: identifica el proyecto, pero no da acceso a nada. La seguridad está en las reglas
// de Firestore (tools/firebase/firestore.rules): cada cuenta lee y escribe solo lo suyo.
// Con null, la nube no está configurada y el curso anda solo con este navegador.
export const FIREBASE = {
  apiKey: 'AIzaSyB1jF4ZGKJDIqlq8ZbcklQOncvdhFKDgME',
  authDomain: 'curso-aleman-kf.firebaseapp.com',
  projectId: 'curso-aleman-kf',
  storageBucket: 'curso-aleman-kf.firebasestorage.app',
  messagingSenderId: '709488299089',
  appId: '1:709488299089:web:e8ac18ab90179c57943c70',
};

// El formulario para crear una cuenta. Se cierra una vez creada la del usuario (y en la
// consola de Firebase se desactiva el alta de usuarios nuevos). Para sumar otra cuenta: abrir
// las dos cosas, crearla y volver a cerrarlas.
export const REGISTRO_ABIERTO = false;

// Para probar con Firebase Emulator Suite (tools/firebase), en otro archivo con un proyecto demo-…:
// { auth: 'http://127.0.0.1:9399', firestore: ['127.0.0.1', 8399] }
export const EMULADORES = null;
