# Software de terceros

- **firebase/**: Firebase JS SDK 12.19.0 (`firebase-app`, `firebase-auth` y `firebase-firestore-lite`), de Google. Licencia Apache 2.0. Bajado tal cual de `https://www.gstatic.com/firebasejs/12.19.0/`; solo se cambió el import de `firebase-app.js` por una ruta relativa y se sacó la referencia al source map.
- **vosk/vosk.js**: vosk-browser 0.0.8 (`dist/vosk.js` del paquete npm), de Ciaran O'Reilly. Licencia Apache 2.0. Trae Vosk y Kaldi compilados a WebAssembly (Apache 2.0).
- **Modelo de voz** `vosk-model-small-de-0.15`, de Alpha Cephei. Licencia Apache 2.0. No está en el repositorio: lo empaqueta el script de publicación.

Texto de la licencia: [LICENSE-Apache-2.0.txt](LICENSE-Apache-2.0.txt).
