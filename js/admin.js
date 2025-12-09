// -------------------------------
// IMPORTS
// -------------------------------
import { app, db } from "./firebase.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const auth = getAuth(app);

// -------------------------------
// PROTEGER PÁGINA ADMIN
// -------------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.href = "login.html";

  const snap = await getDocs(collection(db, "usuarios"));
  const current = snap.docs.find(d => d.id === user.uid);

  if (!current || current.data().rol !== "admin") {
    alert("Acceso restringido al administrador.");
    return location.href = "index.html";
  }

  loadUsers();
});

// -------------------------------
// CARGAR USUARIOS DESDE FIRESTORE
// -------------------------------
async function loadUsers() {
  const tbody = document.querySelector("#usersTable tbody");
  tbody.innerHTML = "<tr><td colspan='4'>Cargando...</td></tr>";

  const snap = await getDocs(collection(db, "usuarios"));
  let html = "";

  snap.forEach(docu => {
    const data = docu.data();
    html += `
      <tr>
        <td>${data.email}</td>
        <td>${docu.id}</td>
        <td>
          <select class="role-select" data-uid="${docu.id}">
            <option value="admin" ${data.rol==="admin"?"selected":""}>Admin</option>
            <option value="supervisor" ${data.rol==="supervisor"?"selected":""}>Supervisor</option>
            <option value="agente" ${data.rol==="agente"?"selected":""}>Agente</option>
          </select>
        </td>
        <td><button class="btn-save" data-uid="${docu.id}">Guardar</button></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Activar botones
  document.querySelectorAll(".btn-save").forEach(btn => {
    btn.addEventListener("click", updateRole);
  });
}

// -------------------------------
// ACTUALIZAR ROL
// -------------------------------
async function updateRole(e) {
  const uid = e.target.dataset.uid;
  const select = document.querySelector(`select[data-uid="${uid}"]`);
  const newRole = select.value;

  await updateDoc(doc(db, "usuarios", uid), {
    rol: newRole
  });

  alert("Rol actualizado correctamente.");
}

// -------------------------------
// CREAR USUARIO NUEVO
// -------------------------------
document.getElementById("btnCreateUser").addEventListener("click", async () => {
  const email = document.getElementById("newEmail").value.trim();
  const pass = document.getElementById("newPass").value.trim();
  const rol = document.getElementById("newRole").value;

  if (!email || !pass) {
    return alert("Completa email y contraseña.");
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    await setDoc(doc(db, "usuarios", cred.user.uid), {
      email,
      rol
    });

    alert("Usuario creado correctamente.");
    loadUsers();

  } catch (err) {
    console.error(err);
    alert("Error al crear usuario: " + err.message);
  }
});

// -------------------------------
// LOGOUT
// -------------------------------
document.getElementById("logoutBtn").addEventListener("click", () => {
  signOut(auth);
});
