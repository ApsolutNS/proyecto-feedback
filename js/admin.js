// ----------------------------------------------
// Admin Panel - Firebase Roles
// ----------------------------------------------
import { app, db } from "./firebase.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  doc,
  setDoc,
  getDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const auth = getAuth(app);

// ----------------------------
// 🔐 PROTEGER ADMIN
// ----------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    return (location.href = "login.html");
  }

  // Leer rol
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || snap.data().rol !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  console.log("Administrador validado:", user.email);
});

// ----------------------------
// 🚪 LOGOUT
// ----------------------------
document.getElementById("btnLogout").addEventListener("click", () => {
  signOut(auth);
});

// ----------------------------
// ➕ CREAR USUARIO NUEVO
// ----------------------------
document.getElementById("btnCrear").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const rol = document.getElementById("rol").value;

  const msg = document.getElementById("msg");
  msg.textContent = "Procesando...";

  try {
    // 1️⃣ Crear usuario Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2️⃣ Guardar su rol en Firestore
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      rol: rol,
      email: email,
      creadoPor: auth.currentUser.email,
      fecha: new Date().toISOString()
    });

    msg.style.color = "green";
    msg.textContent = `Usuario creado correctamente (${rol}).`;

  } catch (e) {
    msg.style.color = "red";
    msg.textContent = e.message;
    console.error(e);
  }
});
