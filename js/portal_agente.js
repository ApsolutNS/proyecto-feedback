/* ============================================================
   PORTAL AGENTE — AUTENTICACIÓN + ROL + PROTECCIÓN
============================================================ */
import { getAuth, onAuthStateChanged, signOut } 
  from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import { 
  getFirestore, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import { app } from "./firebase.js";

/* ---------------- FIREBASE ---------------- */
const auth = getAuth(app);
const db   = getFirestore(app);

/* ------------- escapeHTML para mayor seguridad  ------------ */
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;",
      "\"": "&quot;", "'": "&#39;"
    }[m] || m));
}

/* ------------------ PROTEGER LA PÁGINA ---------------------- */
onAuthStateChanged(auth, async user => {

  if (!user) {
    location.href = "login.html";
    return;
  }

  /* Leer rol del usuario */
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    alert("Tu usuario no tiene rol asignado.");
    await signOut(auth);
    location.href = "login.html";
    return;
  }

  const data = snap.data();
  const rol = data.rol;

  if (rol !== "agente") {
    alert("No tienes permiso para acceder al portal del agente.");
    location.href = "index.html";
    return;
  }

  console.log("✔ Acceso permitido para agente.");

  /* Auto‑seleccionar al asesor (el agente solo ve sus documentos) */
  const sel = document.getElementById("selAgent");
  sel.innerHTML = `
    <option value="${escapeHTML(data.nombre)}">${escapeHTML(data.nombre)}</option>
  `;

  /* Cargar automáticamente */
  window.loadAgentList();
});

/* --------------------- CERRAR SESIÓN ------------------------ */
window.logout = async function () {
  await signOut(auth);
  location.href = "login.html";
};
