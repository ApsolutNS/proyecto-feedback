// ----------------------------------------------
// Firebase Inicializado (Versión Modular v9)
// Archivo: js/firebase.js
// ----------------------------------------------

// Importar los módulos necesarios
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

// Configuración corregida de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
    authDomain: "feedback-app-ac30e.firebaseapp.com",
    projectId: "feedback-app-ac30e",
    storageBucket: "feedback-app-ac30e.firebasestorage.app",
    messagingSenderId: "512179147778",
    appId: "1:512179147778:web:795e4a8b177fe766d3431b",
    messagingSenderId: "512179147778",
    appId: "1:512179147778:web:795e4a8b177fe766d3431b"
};

// Inicialización de Firebase
const app = initializeApp(firebaseConfig);

// Exportar Firestore y Storage ya listos
export { app };
export const db = getFirestore(app);
export const storage = getStorage(app);

// ----------------------------------------------
// TODO LISTO PARA:
// - Subir firmas
// - Guardar feedbacks
// - Cargar imágenes en visualización
// - Guardar refuerzos
// - Exportar PDFs con imágenes
// ----------------------------------------------


