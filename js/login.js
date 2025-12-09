// ----------------------------------------------
// LOGIN con ROLES usando Firebase Auth + Firestore
// ----------------------------------------------

import { getAuth, signInWithEmailAndPassword }
  from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { app } from "./firebase.js"; // tu firebase.js ya exporta app
const db = getFirestore(app);
const auth = getAuth(app);

const btnLogin = document.getElementById("btnLogin");
const msgError = document.getElementById("msgError");

// ------------------------------------------------
// FUNCIÓN LOGIN
// ------------------------------------------------
btnLogin.addEventListener("click", async () => {
  msgError.textContent = "";

  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();

  if (!email || !pass) {
    msgError.textContent = "Completa todos los campos.";
    return;
  }

  try {
    const userCred = await signInWithEmailAndPassword(auth, email, pass);
    const uid = userCred.user.uid;

    // Leer su rol desde Firestore
    const userRef = doc(db, "usuarios", uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      msgError.textContent = "Tu usuario no tiene rol asignado.";
      return;
    }

    const role = snap.data().role;

    // Redirecciones por rol
    if (role === "admin") {
      window.location.href = "index.html";
      return;
    }
    if (role === "supervisor") {
      window.location.href = "index.html";
      return;
    }
    if (role === "agente") {
      window.location.href = "portal_agente.html";
      return;
    }

    msgError.textContent = "Rol desconocido. Contacta a soporte.";

  } catch (err) {
    msgError.textContent = "Credenciales incorrectas.";
    console.error(err);
  }
});
