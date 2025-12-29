// ----------------------------------------------
// Admin Panel - Usuarios + Registradores + Lista de Usuarios
// (creación de usuarios con Auth secundario)
// ----------------------------------------------
"use strict";

import { app, db } from "./firebase.js";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";

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

/* =========================
   CONSTANTES (LISTAS)
========================= */
const CARGOS_AGENTES = ["ASESOR INBOUND", "ASESOR REDES", "ASESOR CORREOS"];
const CARGOS_REGISTRADORES = ["Líder de Calidad y Formación", "Líder de Operaciones", "Supervisor"];
const ROLES = ["admin", "supervisor", "agente"];

/* =========================
   HELPERS DOM / UI
========================= */
const $ = (id) => document.getElementById(id);

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

function fillSelect(selectEl, options, placeholder = "Selecciona...") {
  if (!selectEl) return;
  if (selectEl.tagName !== "SELECT") return;
  selectEl.innerHTML =
    `<option value="">${escapeHTML(placeholder)}</option>` +
    options.map((x) => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
}

/* =========================
   MODAL CONFIRMACIÓN (usa tu HTML)
   Requiere en HTML:
   - #confirmModal .modal-confirm
   - #btnCancelConfirm
   - #btnConfirmAction
========================= */
let confirmResolver = null;

function openConfirmModal({
  title = "¿Estás seguro?",
  text = "Esta acción no se puede deshacer.",
  confirmText = "Confirmar",
  danger = true,
} = {}) {
  const modal = $("confirmModal");
  const btnCancel = $("btnCancelConfirm");
  const btnOk = $("btnConfirmAction");

  if (!modal || !btnCancel || !btnOk) {
    // fallback seguro
    const ok = window.confirm(`${title}\n\n${text}`);
    return Promise.resolve(ok);
  }

  // set contenido
  const h3 = modal.querySelector("h3");
  const p = modal.querySelector("p");
  if (h3) h3.textContent = title;
  if (p) p.textContent = text;

  btnOk.textContent = confirmText;
  btnOk.classList.toggle("btn-confirm", true);
  btnOk.classList.toggle("danger", !!danger);

  // mostrar
  modal.classList.add("show");

  // resolver promise
  return new Promise((resolve) => {
    confirmResolver = resolve;

    const close = (result) => {
      modal.classList.remove("show");
      confirmResolver && confirmResolver(!!result);
      confirmResolver = null;
    };

    const onCancel = () => close(false);
    const onOk = () => close(true);

    btnCancel.addEventListener("click", onCancel, { once: true });
    btnOk.addEventListener("click", onOk, { once: true });

    // click fuera para cerrar
    modal.addEventListener(
      "click",
      (ev) => {
        if (ev.target === modal) close(false);
      },
      { once: true }
    );

    // ESC para cerrar
    window.addEventListener(
      "keydown",
      (ev) => {
        if (ev.key === "Escape") close(false);
      },
      { once: true }
    );
  });
}

/* =========================
   AUTH PRINCIPAL
========================= */
const auth = getAuth(app);

/* =========================
   AUTH SECUNDARIO (CREAR USUARIOS)
========================= */
let secondaryAuth = null;

function initSecondaryAuth() {
  let secondaryApp = null;
  if (getApps().some((a) => a.name === "secondary")) {
    secondaryApp = getApp("secondary");
  } else {
    secondaryApp = initializeApp(app.options, "secondary");
  }
  secondaryAuth = getAuth(secondaryApp);
}
initSecondaryAuth();

/* =========================
   ESTADO (CACHE)
========================= */
let usersCache = []; // {id(uid), ...data}

/* =========================
   INIT UI
========================= */
document.addEventListener("DOMContentLoaded", () => {
  fillSelect($("cargo"), CARGOS_AGENTES, "Selecciona cargo del agente");
  fillSelect($("regCargo"), CARGOS_REGISTRADORES, "Selecciona cargo del registrador");

  // Mostrar/ocultar campos agente al cambiar rol
  const rolSel = $("rol");
  if (rolSel) {
    rolSel.addEventListener("change", () => {
      const rol = (rolSel.value || "").trim();
      const agentFields = document.querySelectorAll("[data-only-agent='1']");
      agentFields.forEach((el) => (el.style.display = rol === "agente" ? "" : "none"));
    });
    rolSel.dispatchEvent(new Event("change"));
  }

  // buscador usuarios
  $("userSearch")?.addEventListener("input", () => renderUsersList());

  // refresh usuarios
  $("btnRefreshUsers")?.addEventListener("click", async () => {
    await loadUsers();
  });
});

/* =========================
   🔐 PROTEGER ADMIN
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "login.html");

  // Validar rol admin en /usuarios/{uid}
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || (snap.data()?.rol || "") !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  // Admin OK
  await loadRegistradores();
  await loadUsers();
});

/* =========================
   🚪 LOGOUT
========================= */
$("btnLogout")?.addEventListener("click", () => signOut(auth));

/* =========================
   ➕ CREAR USUARIO NUEVO
========================= */
$("btnCrear")?.addEventListener("click", async () => {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const rol = ($("rol")?.value || "").trim();

  const nombreAsesor = ($("nombreAsesor")?.value || "").trim(); // se queda así
  const cargo = ($("cargo")?.value || "").trim();
  const GC = ($("GC")?.value || "").trim();

  if (!email || !password || !rol) return setMsg("Completa email, contraseña y rol.", "error");
  if (!ROLES.includes(rol)) return setMsg("Rol inválido.", "error");

  if (rol === "agente") {
    if (!nombreAsesor) return setMsg("El nombre del asesor (nombreAsesor) es obligatorio.", "error");
    if (!CARGOS_AGENTES.includes(cargo)) return setMsg("Selecciona un cargo válido para el agente.", "error");
  }

  setMsg("Procesando...", "");

  try {
    // Crear usuario Auth (secundario)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    // Guardar perfil en Firestore
    await setDoc(doc(db, "usuarios", uid), {
      uid,
      email,
      rol,
      nombreAsesor: rol === "agente" ? nombreAsesor : "",
      cargo: rol === "agente" ? cargo : "",
      GC: rol === "agente" ? GC : "",
      activo: true,
      creadoPor: auth.currentUser?.email || "",
      fecha: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    // Limpiar sesión del secundario para futuras creaciones
    await signOut(secondaryAuth);

    setMsg(`Usuario creado correctamente (${rol}).`, "ok");

    // Limpiar inputs
    if ($("email")) $("email").value = "";
    if ($("password")) $("password").value = "";
    if ($("nombreAsesor")) $("nombreAsesor").value = "";
    if ($("cargo")) $("cargo").value = "";
    if ($("GC")) $("GC").value = "";

    await loadUsers();
  } catch (e) {
    console.error(e);
    setMsg(e?.message || "Error al crear usuario.", "error");
  }
});

/* =========================================================
   REGISTRADORES (colección: registradores)
========================================================= */
$("btnCrearRegistrador")?.addEventListener("click", async () => {
  const nombre = ($("regNombre")?.value || "").trim();
  const cargo = ($("regCargo")?.value || "").trim();

  if (!nombre) return setRegMsg("El nombre es obligatorio.", "error");
  if (!CARGOS_REGISTRADORES.includes(cargo)) return setRegMsg("Selecciona un cargo válido.", "error");

  const ok = await openConfirmModal({
    title: "¿Agregar registrador?",
    text: `Se agregará: ${nombre} — ${cargo}`,
    confirmText: "Agregar",
    danger: false,
  });
  if (!ok) return setRegMsg("Acción cancelada.", "");

  setRegMsg("Agregando...", "");

  try {
    const docRef = await addDoc(collection(db, "registradores"), {
      registradoPorNombre: nombre,
      cargo,
      activo: true,
      createdAt: serverTimestamp(),
      creadoPor: auth.currentUser?.email || "",
    });

    await updateDoc(doc(db, "registradores", docRef.id), { registradorId: docRef.id });

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

  ul.innerHTML = `<li class="small">Cargando...</li>`;

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
        <div class="user-top">
          <div>
            <div><strong>${escapeHTML(nombre)}</strong></div>
            <div class="user-meta">${escapeHTML(cargo)} · ${activo ? "Activo" : "Inactivo"}</div>
          </div>
          <div class="user-actions">
            <button type="button" class="btn-mini" data-action="edit" data-id="${id}">Editar</button>
            <button type="button" class="btn-mini danger" data-action="delete" data-id="${id}">Eliminar</button>
          </div>
        </div>

        <div class="user-edit" data-edit-id="${id}" style="display:none">
          <div class="user-edit-grid">
            <div>
              <label>Nombre</label>
              <input type="text" data-field="nombre" value="${escapeHTML(nombre)}">
            </div>
            <div>
              <label>Cargo</label>
              <select data-field="cargo"></select>
            </div>
            <div>
              <label>Activo</label>
              <select data-field="activo">
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          </div>

          <div class="user-actions" style="margin-top:10px">
            <button type="button" class="btn-mini" data-action="save" data-id="${id}">Guardar</button>
            <button type="button" class="btn-mini" data-action="cancel" data-id="${id}">Cancelar</button>
          </div>
        </div>
      `;

      ul.appendChild(li);

      const cargoSel = li.querySelector(`select[data-field="cargo"]`);
      fillSelect(cargoSel, CARGOS_REGISTRADORES, "Selecciona cargo");
      if (cargoSel) cargoSel.value = cargo;

      const activoSel = li.querySelector(`select[data-field="activo"]`);
      if (activoSel) activoSel.value = activo ? "true" : "false";
    });

    // Delegación de eventos
    ul.onclick = async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      const box = ul.querySelector(`[data-edit-id="${id}"]`);

      if (action === "edit") {
        if (box) box.style.display = "block";
        return;
      }

      if (action === "cancel") {
        if (box) box.style.display = "none";
        return;
      }

      if (action === "delete") {
        const ok = await openConfirmModal({
          title: "¿Eliminar registrador?",
          text: "Esta acción eliminará el registrador de la colección.",
          confirmText: "Eliminar",
          danger: true,
        });
        if (!ok) return;

        try {
          await deleteDoc(doc(db, "registradores", id));
          setRegMsg("Registrador eliminado.", "ok");
          await loadRegistradores();
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo eliminar.", "error");
        }
        return;
      }

      if (action === "save") {
        if (!box) return;

        const nombre = (box.querySelector(`input[data-field="nombre"]`)?.value || "").trim();
        const cargo = (box.querySelector(`select[data-field="cargo"]`)?.value || "").trim();
        const activoStr = (box.querySelector(`select[data-field="activo"]`)?.value || "true").trim();
        const activo = activoStr === "true";

        if (!nombre) return setRegMsg("El nombre es obligatorio.", "error");
        if (!CARGOS_REGISTRADORES.includes(cargo)) return setRegMsg("Cargo no permitido.", "error");

        const ok = await openConfirmModal({
          title: "¿Guardar cambios?",
          text: `Actualizar registrador: ${nombre} — ${cargo}`,
          confirmText: "Guardar",
          danger: false,
        });
        if (!ok) return setRegMsg("Acción cancelada.", "");

        try {
          await updateDoc(doc(db, "registradores", id), {
            registradoPorNombre: nombre,
            cargo,
            activo,
            updatedAt: serverTimestamp(),
            actualizadoPor: auth.currentUser?.email || "",
          });
          setRegMsg("Registrador actualizado.", "ok");
          await loadRegistradores();
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo actualizar.", "error");
        }
        return;
      }
    };

    setRegMsg("", "");
  } catch (e) {
    console.error(e);
    ul.innerHTML = `<li class="small">Error cargando registradores.</li>`;
    setRegMsg(e?.message || "Error cargando registradores.", "error");
  }
}

/* =========================================================
   USUARIOS EXISTENTES (colección: usuarios)
========================================================= */
async function loadUsers() {
  const usersList = $("usersList");
  const usersInfo = $("usersInfo");
  if (!usersList) return;

  usersList.innerHTML = `<div class="small">Cargando usuarios...</div>`;
  if (usersInfo) usersInfo.textContent = "";

  try {
    const snap = await getDocs(collection(db, "usuarios"));

    const arr = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));

    const rolWeight = (r) => (r === "admin" ? 0 : r === "supervisor" ? 1 : 2);
    arr.sort((a, b) => {
      const ra = rolWeight((a.rol || "").toLowerCase());
      const rb = rolWeight((b.rol || "").toLowerCase());
      if (ra !== rb) return ra - rb;
      return String(a.email || "").localeCompare(String(b.email || ""), "es", { sensitivity: "base" });
    });

    usersCache = arr;
    renderUsersList();
  } catch (e) {
    console.error(e);
    usersList.innerHTML = `<div class="small">Error cargando usuarios (¿rules permiten read al admin?).</div>`;
  }
}

function renderUsersList() {
  const usersList = $("usersList");
  const usersInfo = $("usersInfo");
  if (!usersList) return;

  const q = ($("userSearch")?.value || "").trim().toLowerCase();

  const filtered = usersCache.filter((u) => {
    const hay = [
      u.email,
      u.rol,
      u.nombreAsesor,
      u.cargo,
      u.GC,
      String(u.uid || u.id || ""),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return q ? hay.includes(q) : true;
  });

  if (usersInfo) usersInfo.textContent = `Mostrando ${filtered.length} de ${usersCache.length} usuarios.`;

  if (!filtered.length) {
    usersList.innerHTML = `<div class="small">No hay resultados.</div>`;
    return;
  }

  usersList.innerHTML = filtered
    .map((u) => {
      const uid = u.id;
      const rol = (u.rol || "").trim();
      const activo = u.activo !== false;
      const isAgent = rol === "agente";

      return `
        <div class="user-item" data-uid="${escapeHTML(uid)}">
          <div class="user-top">
            <div>
              <div><strong>${escapeHTML(u.email || uid)}</strong></div>
              <div class="user-meta">
                Rol: <b>${escapeHTML(rol || "—")}</b> · Activo: <b>${activo ? "Sí" : "No"}</b>
                ${isAgent ? ` · nombreAsesor: <b>${escapeHTML(u.nombreAsesor || "—")}</b>` : ""}
              </div>
              ${isAgent ? `<div class="user-meta">Cargo: ${escapeHTML(u.cargo || "—")} · GC: ${escapeHTML(u.GC || "—")}</div>` : ""}
            </div>
            <div class="user-actions">
              <button type="button" class="btn-mini" data-action="edit">Editar</button>
              <button type="button" class="btn-mini danger" data-action="delete">Eliminar</button>
            </div>
          </div>

          <div class="user-edit" data-edit-box="1" style="display:none">
            <div class="user-edit-grid">
              <div>
                <label>Rol</label>
                <select data-field="rol">
                  ${ROLES.map((r) => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join("")}
                </select>
              </div>

              <div>
                <label>Activo</label>
                <select data-field="activo">
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div data-only-agent-edit="1">
                <label>nombreAsesor</label>
                <input type="text" data-field="nombreAsesor" value="${escapeHTML(u.nombreAsesor || "")}">
              </div>

              <div data-only-agent-edit="1">
                <label>Cargo</label>
                <select data-field="cargo"></select>
              </div>

              <div data-only-agent-edit="1">
                <label>GC</label>
                <input type="text" data-field="GC" value="${escapeHTML(u.GC || "")}">
              </div>
            </div>

            <div class="user-actions" style="margin-top:10px">
              <button type="button" class="btn-mini" data-action="save">Guardar</button>
              <button type="button" class="btn-mini" data-action="cancel">Cancelar</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  // Inicializar selects y mostrar/ocultar campos según rol
  usersList.querySelectorAll(".user-item").forEach((card) => {
    const uid = card.getAttribute("data-uid");
    const u = usersCache.find((x) => x.id === uid);
    if (!u) return;

    const rolSel = card.querySelector(`select[data-field="rol"]`);
    const activoSel = card.querySelector(`select[data-field="activo"]`);
    const cargoSel = card.querySelector(`select[data-field="cargo"]`);

    if (rolSel) rolSel.value = (u.rol || "").trim() || "agente";
    if (activoSel) activoSel.value = u.activo !== false ? "true" : "false";

    fillSelect(cargoSel, CARGOS_AGENTES, "Selecciona cargo");
    if (cargoSel) cargoSel.value = (u.cargo || "").trim();

    const applyRoleVisibility = () => {
      const rol = (rolSel?.value || "").trim();
      card.querySelectorAll("[data-only-agent-edit='1']").forEach((el) => {
        el.style.display = rol === "agente" ? "" : "none";
      });
    };

    rolSel?.addEventListener("change", applyRoleVisibility);
    applyRoleVisibility();
  });
}

// Delegación de eventos: Usuarios
$("usersList")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;

  const card = ev.target.closest(".user-item");
  if (!card) return;

  const uid = card.getAttribute("data-uid");
  if (!uid) return;

  const action = btn.getAttribute("data-action");
  if (!action) return;

  const editBox = card.querySelector(`[data-edit-box="1"]`);

  if (action === "edit") {
    if (editBox) editBox.style.display = "block";
    return;
  }

  if (action === "cancel") {
    if (editBox) editBox.style.display = "none";
    renderUsersList(); // resetea valores
    return;
  }

  if (action === "save") {
    const rol = (card.querySelector(`select[data-field="rol"]`)?.value || "").trim();
    const activoStr = (card.querySelector(`select[data-field="activo"]`)?.value || "true").trim();
    const activo = activoStr === "true";

    let nombreAsesor = (card.querySelector(`input[data-field="nombreAsesor"]`)?.value || "").trim();
    let cargo = (card.querySelector(`select[data-field="cargo"]`)?.value || "").trim();
    let GC = (card.querySelector(`input[data-field="GC"]`)?.value || "").trim();

    if (!ROLES.includes(rol)) return alert("Rol inválido.");

    if (rol === "agente") {
      if (!nombreAsesor) return alert("nombreAsesor es obligatorio para agente.");
      if (!CARGOS_AGENTES.includes(cargo)) return alert("Cargo inválido para agente.");
    } else {
      // limpiar si deja de ser agente
      nombreAsesor = "";
      cargo = "";
      GC = "";
    }

    const ok = await openConfirmModal({
      title: "¿Guardar cambios del usuario?",
      text: `Se actualizará el perfil Firestore del usuario: ${uid}`,
      confirmText: "Guardar",
      danger: false,
    });
    if (!ok) return;

    try {
      await updateDoc(doc(db, "usuarios", uid), {
        rol,
        activo,
        nombreAsesor,
        cargo,
        GC,
        updatedAt: serverTimestamp(),
        actualizadoPor: auth.currentUser?.email || "",
      });
      await loadUsers();
    } catch (e) {
      console.error(e);
      alert(e?.message || "No se pudo guardar.");
    }
    return;
  }

  if (action === "delete") {
    const ok = await openConfirmModal({
      title: "¿Eliminar usuario?",
      text: "Esto borra el documento en Firestore (/usuarios). NO elimina el usuario de Authentication.",
      confirmText: "Eliminar",
      danger: true,
    });
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "usuarios", uid));
      await loadUsers();
    } catch (e) {
      console.error(e);
      alert(e?.message || "No se pudo eliminar.");
    }
    return;
  }
});
