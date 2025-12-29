// ----------------------------------------------
// Admin Panel - Usuarios + Registradores
// (creación de usuarios con Auth secundario)
// ----------------------------------------------
"use strict";

import { app, db } from "./firebase.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

// ----------------------------
// HELPERS UI
// ----------------------------
const $ = (id) => document.getElementById(id);

function setMsg(text, type = "") {
  const el = $("msg");
  if (!el) return;
  el.classList.remove("ok", "error");
  if (type === "ok") el.classList.add("ok");
  if (type === "error") el.classList.add("error");
  el.textContent = text || "";
}

function setRegMsg(text, type = "") {
  const el = $("regMsg");
  if (!el) return;
  el.classList.remove("ok", "error");
  if (type === "ok") el.classList.add("ok");
  if (type === "error") el.classList.add("error");
  el.textContent = text || "";
}

// ----------------------------
// AUTH PRINCIPAL (admin)
/// ----------------------------
const auth = getAuth(app);

// ----------------------------
// AUTH SECUNDARIO (para crear usuarios sin cambiar sesión admin)
/// ----------------------------
let secondaryAuth = null;
(function initSecondaryAuth() {
  // Reutiliza la config del app principal
  // app.options trae apiKey, projectId, etc.
  const secondaryApp = initializeApp(app.options, "secondary");
  secondaryAuth = getAuth(secondaryApp);
})();

// ----------------------------
// 🔐 PROTEGER ADMIN
// ----------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "login.html");

  // Lee rol en /usuarios/{uid}
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || snap.data().rol !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  // Admin validado -> cargar registradores
  await loadRegistradores();
});

// ----------------------------
// 🚪 LOGOUT
// ----------------------------
$("btnLogout")?.addEventListener("click", () => signOut(auth));

// ----------------------------
// ➕ CREAR USUARIO NUEVO (Auth secundario)
/// ----------------------------
$("btnCrear")?.addEventListener("click", async () => {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const rol = ($("rol")?.value || "").trim();

  // Nuevos campos
  const nombreAsesor = ($("nombreAsesor")?.value || "").trim(); // mantener nombreAsesor
  const cargo = ($("cargo")?.value || "").trim();               // "ASESOR INBOUND/REDES/CORREOS"
  const GC = ($("GC")?.value || "").trim();

  if (!email || !password || !rol) {
    return setMsg("Completa email, contraseña y rol.", "error");
  }
  if (rol === "agente") {
    if (!nombreAsesor || !cargo) {
      return setMsg("Para rol 'agente' completa nombre del asesor y cargo.", "error");
    }
  }

  setMsg("Procesando...", "");
  try {
    // 1) Crear usuario en Auth secundario (NO cambia la sesión admin)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    // 2) Guardar perfil/rol en Firestore (con sesión admin)
    await setDoc(doc(db, "usuarios", uid), {
      uid,
      email,
      rol,
      nombreAsesor: nombreAsesor || "",
      cargo: cargo || "",
      GC: GC || "",
      creadoPor: auth.currentUser?.email || "",
      fecha: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    // 3) Limpia el secundario (opcional, recomendado)
    await signOut(secondaryAuth);

    setMsg(`Usuario creado correctamente (${rol}).`, "ok");

    // Limpia inputs
    if ($("email")) $("email").value = "";
    if ($("password")) $("password").value = "";
    if ($("nombreAsesor")) $("nombreAsesor").value = "";
    if ($("cargo")) $("cargo").value = "";
    if ($("GC")) $("GC").value = "";
  } catch (e) {
    console.error(e);
    setMsg(e?.message || "Error al crear usuario.", "error");
  }
});

// =========================================================
// REGISTRADORES (colección: registradores)
// Campos recomendados:
// { registradoPorNombre, cargo, activo, createdAt }
// =========================================================

$("btnCrearRegistrador")?.addEventListener("click", async () => {
  const nombre = ($("regNombre")?.value || "").trim();
  const cargo = ($("regCargo")?.value || "").trim();

  if (!nombre || !cargo) return setRegMsg("Completa nombre y cargo.", "error");

  setRegMsg("Agregando...", "");
  try {
    const docRef = await addDoc(collection(db, "registradores"), {
      registradoPorNombre: nombre,
      cargo,
      activo: true,
      createdAt: serverTimestamp(),
      creadoPor: auth.currentUser?.email || "",
    });

    // (opcional) guardar id como campo para que se vea como en tu screenshot
    await updateDoc(doc(db, "registradores", docRef.id), {
      registradorId: docRef.id,
    });

    if ($("regNombre")) $("regNombre").value = "";
    if ($("regCargo")) $("regCargo").value = "";

    setRegMsg("Registrador agregado.", "ok");
    await loadRegistradores();
  } catch (e) {
    console.error(e);
    setRegMsg(e?.message || "Error al agregar registrador.", "error");
  }
});

async function loadRegistradores() {
  const ul = $("listaRegistradores");
  if (!ul) return;

  ul.innerHTML = `<li>Cargando...</li>`;
  try {
    const qy = query(collection(db, "registradores"), orderBy("registradoPorNombre", "asc"));
    const snap = await getDocs(qy);

    if (snap.empty) {
      ul.innerHTML = `<li class="small">No hay registradores.</li>`;
      return;
    }

    ul.innerHTML = "";
    snap.forEach((d) => {
      const data = d.data() || {};
      const id = d.id;
      const nombre = data.registradoPorNombre || "";
      const cargo = data.cargo || "";
      const activo = data.activo !== false;

      const li = document.createElement("li");
      li.className = "reg-item";
      li.innerHTML = `
        <div class="reg-row">
          <div class="reg-main">
            <div class="reg-name"><strong>${escapeHTML(nombre)}</strong></div>
            <div class="reg-cargo">${escapeHTML(cargo)}</div>
            <div class="reg-meta">
              <label class="reg-switch">
                <input type="checkbox" ${activo ? "checked" : ""} data-action="toggle" data-id="${id}">
                <span>Activo</span>
              </label>
            </div>
          </div>

          <div class="reg-actions">
            <button type="button" class="btn-mini" data-action="edit" data-id="${id}">Editar</button>
            <button type="button" class="btn-mini danger" data-action="delete" data-id="${id}">Eliminar</button>
          </div>
        </div>

        <div class="reg-edit" style="display:none" data-edit-id="${id}">
          <label>Nombre</label>
          <input type="text" value="${escapeHTML(nombre)}" data-field="nombre">
          <label>Cargo</label>
          <input type="text" value="${escapeHTML(cargo)}" data-field="cargo">
          <div class="reg-actions" style="margin-top:8px">
            <button type="button" class="btn-mini" data-action="save" data-id="${id}">Guardar</button>
            <button type="button" class="btn-mini" data-action="cancel" data-id="${id}">Cancelar</button>
          </div>
        </div>
      `;
      ul.appendChild(li);
    });

    // Delegación de eventos
    ul.onclick = async (ev) => {
      const btn = ev.target.closest("button, input[type='checkbox']");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "delete") {
        if (!confirm("¿Eliminar registrador?")) return;
        try {
          await deleteDoc(doc(db, "registradores", id));
          setRegMsg("Registrador eliminado.", "ok");
          await loadRegistradores();
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo eliminar.", "error");
        }
      }

      if (action === "edit") {
        const box = ul.querySelector(`[data-edit-id="${id}"]`);
        if (box) box.style.display = "block";
      }

      if (action === "cancel") {
        const box = ul.querySelector(`[data-edit-id="${id}"]`);
        if (box) box.style.display = "none";
      }

      if (action === "save") {
        const box = ul.querySelector(`[data-edit-id="${id}"]`);
        if (!box) return;

        const nombre = (box.querySelector(`input[data-field="nombre"]`)?.value || "").trim();
        const cargo = (box.querySelector(`input[data-field="cargo"]`)?.value || "").trim();

        if (!nombre || !cargo) return setRegMsg("Nombre y cargo son obligatorios.", "error");

        try {
          await updateDoc(doc(db, "registradores", id), {
            registradoPorNombre: nombre,
            cargo,
          });
          setRegMsg("Registrador actualizado.", "ok");
          await loadRegistradores();
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo actualizar.", "error");
        }
      }

      if (action === "toggle") {
        try {
          const checked = btn.checked;
          await updateDoc(doc(db, "registradores", id), { activo: !!checked });
          setRegMsg("Estado actualizado.", "ok");
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo cambiar estado.", "error");
          // revertir visualmente si falla
          btn.checked = !btn.checked;
        }
      }
    };

    setRegMsg("", "");
  } catch (e) {
    console.error(e);
    ul.innerHTML = `<li class="small">Error cargando registradores.</li>`;
    setRegMsg(e?.message || "Error cargando registradores.", "error");
  }
}

// Escape básico para HTML
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c] || c));
}
