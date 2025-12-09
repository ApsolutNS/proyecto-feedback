import {
  getAuth,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { app } from "./firebase.js";

const auth = getAuth(app);
const db = getFirestore(app);

document.getElementById("loginBtn").addEventListener("click", login);

async function login() {
  const email = document.getElementById("email").value.trim();
  const pass = document.getElementById("password").value.trim();
  const msg = document.getElementById("msg");

  msg.textContent = "Verificando...";

  try {
    // 1) Autenticar usuario
    const userCred = await signInWithEmailAndPassword(auth, email, pass);
    const user = userCred.user;

    // 2) Leer su rol desde Firestore
    const userDoc = await getDoc(doc(db, "usuarios", user.uid));

    if (!userDoc.exists()) {
      msg.textContent = "Acceso denegado. Usuario no autorizado.";
      return;
    }

    const { rol } = userDoc.data();

    // 3) Redirigir según rol
    if (rol === "admin") {
      msg.textContent = "Bienvenido administrador...";
      location.href = "index.html";
    } else if (rol === "supervisor") {
      msg.textContent = "Bienvenido supervisor...";
      location.href = "index.html";
    } else if (rol === "agente") {
      msg.textContent = "Bienvenido agente...";
      location.href = "portal_agente.html";
    } else {
      msg.textContent = "Rol desconocido. Contacta al administrador.";
    }

  } catch (err) {
    msg.textContent = "Error: " + err.message;
  }
}
