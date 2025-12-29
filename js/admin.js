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
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const auth = getAuth(app);

/* =====================================================
   🔐 PROTEGER ACCESO ADMIN
===================================================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "login.html");

  const snap = await getDoc(doc(db, "usuarios", user.uid));
  if (!snap.exists() || snap.data().rol !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  console.log("✅ Admin validado:", user.email);
  loadRegistradores();
});

/* =====================================================
   🚪 LOGOUT
===================================================== */
document.getElementById("btnLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* =====================================================
   ➕ CREAR USUARIO
===================================================== */
document.getElementById("btnCrear")?.addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const rol = document.getElementById("rol").value;
  const msg = document.getElementById("msg");

  if (!email || !password) {
    msg.textContent = "Email y contraseña son obligatorios";
    msg.style.color = "red";
    return;
  }

  msg.textContent = "Creando usuario...";

  try {
    // 1️⃣ Auth
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2️⃣ Firestore usuarios
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      uid: cred.user.uid,
      email,
      rol,
      nombreAsesor: "",
      cargo: "",
      GC: "",
      creadoPor: auth.currentUser.email,
      fecha: new Date().toISOString()
    });

    msg.style.color = "green";
    msg.textContent = "Usuario creado correctamente.";
    document.getElementById("email").value = "";
    document.getElementById("password").value = "";
  } catch (e) {
    console.error(e);
    msg.style.color = "red";
    msg.textContent = e.message;
  }
});

/* =====================================================
   📝 REGISTRADORES
===================================================== */
const lista = document.getElementById("listaRegistradores");
const btnCrearReg = document.getElementById("btnCrearRegistrador");

async function loadRegistradores() {
  if (!lista) return;
  lista.innerHTML = "<li>Cargando...</li>";

  const snap = await getDocs(collection(db, "registradores"));
  if (snap.empty) {
    lista.innerHTML = "<li>No hay registradores</li>";
    return;
  }

  lista.innerHTML = "";
  snap.forEach((docu) => {
    const r = docu.data();
    const li = document.createElement("li");
    li.innerHTML = `
      <b>${r.registradoPorNombre}</b> — ${r.cargo}
      <button data-id="${docu.id}" style="margin-left:8px">🗑️</button>
    `;
    li.querySelector("button").addEventListener("click", async () => {
      if (confirm("¿Eliminar registrador?")) {
        await deleteDoc(doc(db, "registradores", docu.id));
        loadRegistradores();
      }
    });
    lista.appendChild(li);
  });
}

btnCrearReg?.addEventListener("click", async () => {
  const nombre = document.getElementById("regNombre").value.trim();
  const cargo = document.getElementById("regCargo").value.trim();

  if (!nombre || !cargo) {
    alert("Nombre y cargo son obligatorios");
    return;
  }

  await addDoc(collection(db, "registradores"), {
    registradoPorNombre: nombre,
    cargo,
    activo: true,
    creadoEn: new Date().toISOString()
  });

  document.getElementById("regNombre").value = "";
  document.getElementById("regCargo").value = "";
  loadRegistradores();
});
