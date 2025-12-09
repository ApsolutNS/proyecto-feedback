// ------------------------------------------------
// LOGIN CON ROLES – Firebase v9 + Firestore roles
// ------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } 
  from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getFirestore, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// -------------------------
// CONFIG FIREBASE
// -------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.appspot.com",
  messagingSenderId: "512179147778",
  appId: "1:512179147778:web:795e4a8b177fe766d3431b"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// -------------------------
// ELEMENTOS
// -------------------------
const email = document.getElementById("email");
const password = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const msg = document.getElementById("msg");

// -------------------------
// LOGIN
// -------------------------
btnLogin.addEventListener("click", async () => {
  msg.textContent = "";

  try {
    const userCred = await signInWithEmailAndPassword(auth, email.value.trim(), password.value);

    const uid = userCred.user.uid;

    // Buscar rol en Firestore
    const userDoc = await getDoc(doc(db, "usuarios", uid));

    if (!userDoc.exists()) {
      msg.textContent = "Usuario sin permiso.";
      return;
    }

    const role = userDoc.data().rol;

    if (!role) {
      msg.textContent = "Rol no asignado.";
      return;
    }

    // Redirección por rol
    if (role === "admin") {
      location.href = "index.html";
    } 
    else if (role === "supervisor") {
      location.href = "index.html";
    } 
    else if (role === "agente") {
      location.href = "portal_agente.html";
    } 
    else {
      msg.textContent = "Rol desconocido.";
    }

  } catch (err) {
    msg.textContent = "Credenciales incorrectas.";
  }
});
