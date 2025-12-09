"use strict";

// -------------------------
// IMPORTAR FIREBASE (TU ARCHIVO)
// -------------------------
import { app } from "./firebase.js";   // ⬅️ AHORA SÍ EXPORTA app
import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// Inicializar servicios
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------------
// LOGIN
// -------------------------
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();

  try {
    // 1) Autenticación
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const user = cred.user;

    // 2) Leer rol desde Firestore
    const ref = doc(db, "usuarios", user.uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("Usuario no está autorizado.");
      return;
    }

    const rol = snap.data().rol;

    // 3) Redirección por rol
    if (rol === "admin") {
      location.href = "admin.html";
    } else if (rol === "supervisor") {
      location.href = "index.html";
    } else if (rol === "agente") {
      location.href = "portal_agente.html";
    } else {
      alert("Rol inválido o no permitido.");
    }

  } catch (err) {
    console.error(err);
    alert("Credenciales inválidas o permisos insuficientes.");
  }
});
