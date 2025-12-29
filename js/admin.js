// ----------------------------------------------
// Admin Panel - Usuarios + Registradores
// ----------------------------------------------
import { app, db } from "./firebase.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const auth = getAuth(app);

/* ======================================================
   🔐 PROTECCIÓN ADMIN
====================================================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";

  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || snap.data().rol !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return location.href = "index.html";
  }

  console.log("✅ Admin validado:", user.email);
});

/* ======================================================
   🚪 LOGOUT
====================================================== */
document.getElementById("btnLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* ======================================================
   ➕ CREAR USUARIO
====================================================== */
document.getElementById("btnCrear")?.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const rol = document.getElementById("rol").value;
  const nombreAsesor = document.getElementById("nombreAsesor")?.value.trim() || "";
  const cargo = document.getElementById("cargo")?.value.trim() || "";
  const GC = document.getElementById("gc")?.value.trim() || "";

  const msg = document.getElementById("msg");
  msg.textContent = "Creando usuario...";

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "usuarios", cred.user.uid), {
      uid: cred.user.uid,
      email,
      rol,
      nombreAsesor,
      cargo,
      GC,
      activo: true,
      creadoPor: auth.currentUser.email,
      fecha: serverTimestamp()
    });

    msg.style.color = "green";
    msg.textContent = "✅ Usuario creado correctamente";
  } catch (err) {
    console.error(err);
    msg.style.color = "red";
    msg.textContent = err.message;
  }
});

/* ======================================================
   👤 REGISTRADORES (CRUD)
====================================================== */

const regList = document.getElementById("registradoresList");
const btnAddReg = document.getElementById("btnAddRegistrador");

async function loadRegistradores() {
  if (!regList) return;
  regList.innerHTML = "Cargando...";

  const snap = await getDocs(collection(db, "registradores"));
  if (snap.empty) {
    regList.innerHTML = "<p>No hay registradores</p>";
    return;
  }

  regList.innerHTML = snap.docs.map(d => {
    const r = d.data();
    return `
      <div class="reg-card">
        <b>${r.registradoPorNombre}</b>
        <div>${r.cargo}</div>
        <div>Estado: ${r.activo ? "🟢 Activo" : "🔴 Inactivo"}</div>
        <button data-id="${d.id}" class="toggle">Activar/Desactivar</button>
        <button data-id="${d.id}" class="delete">Eliminar</button>
      </div>
    `;
  }).join("");

  // eventos
  regList.querySelectorAll(".toggle").forEach(btn => {
    btn.addEventListener("click", () => toggleRegistrador(btn.dataset.id));
  });

  regList.querySelectorAll(".delete").forEach(btn => {
    btn.addEventListener("click", () => deleteRegistrador(btn.dataset.id));
  });
}

async function toggleRegistrador(id) {
  const ref = doc(db, "registradores", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  await updateDoc(ref, { activo: !snap.data().activo });
  loadRegistradores();
}

async function deleteRegistrador(id) {
  if (!confirm("¿Eliminar registrador?")) return;
  await deleteDoc(doc(db, "registradores", id));
  loadRegistradores();
}

btnAddReg?.addEventListener("click", async () => {
  const nombre = prompt("Nombre del registrador:");
  if (!nombre) return;

  const cargo = prompt("Cargo:");
  if (!cargo) return;

  const id = "R" + Date.now();

  await setDoc(doc(db, "registradores", id), {
    registradoPorId: id,
    registradoPorNombre: nombre,
    cargo,
    activo: true,
    creadoPor: auth.currentUser.email,
    fecha: serverTimestamp()
  });

  loadRegistradores();
});

/* ======================================================
   INIT
====================================================== */
loadRegistradores();
