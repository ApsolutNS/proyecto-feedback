import { auth } from "./firebase.js";
import { db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const email = document.getElementById("email");
const password = document.getElementById("password");
const msg = document.getElementById("msg");
const btn = document.getElementById("btnLogin");

btn.addEventListener("click", login);

async function login() {
  msg.innerText = "Verificando...";
  try {
    const userCred = await signInWithEmailAndPassword(auth, email.value, password.value);
    const uid = userCred.user.uid;

    // Leer rol del usuario
    const snap = await getDoc(doc(db, "usuarios", uid));

    if (!snap.exists()) {
      msg.innerText = "El usuario no tiene rol asignado";
      return;
    }

    const rol = snap.data().rol;

    // Redirección automática según rol
    switch (rol) {
      case "admin":
      case "supervisor":
        location.href = "index.html";
        break;

      case "agente":
        location.href = "portal_agente.html";
        break;

      default:
        msg.innerText = "Rol desconocido. Contacta al administrador.";
    }

  } catch (e) {
    msg.innerText = "Credenciales incorrectas";
    console.error(e);
  }
}
