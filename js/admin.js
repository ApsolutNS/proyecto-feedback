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
   HELPERS UI
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
   CONFIRM MODAL (popup pequeño)
========================= */
let confirmOverlay = null;
function ensureConfirmModal() {
  if (confirmOverlay) return;
  confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-backdrop";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true">
      <h3 class="confirm-title" id="confirmTitle">¿Estás seguro?</h3>
      <p class="confirm-text" id="confirmText">Confirma para continuar.</p>
      <div class="confirm-actions">
        <button class="btn-mini" id="confirmCancel" type="button">Cancelar</button>
        <button class="btn-mini danger" id="confirmOk" type="button">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  // Cerrar al click afuera
  confirmOverlay.addEventListener("click", (ev) => {
    if (ev.target === confirmOverlay) closeConfirmModal(false);
  });
}

let confirmResolver = null;
function openConfirmModal({ title = "¿Estás seguro?", text = "Confirma para continuar.", danger = true } = {}) {
  ensureConfirmModal();
  const t = confirmOverlay.querySelector("#confirmTitle");
  const p = confirmOverlay.querySelector("#confirmText");
  const ok = confirmOverlay.querySelector("#confirmOk");
  const cancel = confirmOverlay.querySelector("#confirmCancel");
  if (t) t.textContent = title;
  if (p) p.textContent = text;

  if (ok) {
    ok.classList.toggle("danger", !!danger);
  }

  confirmOverlay.style.display = "flex";

  return new Promise((resolve) => {
    confirmResolver = resolve;

    const onCancel = () => closeConfirmModal(false);
    const onOk = () => closeConfirmModal(true);

    cancel?.addEventListener("click", onCancel, { once: true });
    ok?.addEventListener("click", onOk, { once: true });
  });
}

function closeConfirmModal(result) {
  if (confirmOverlay) confirmOverlay.style.display = "none";
  if (typeof confirmResolver === "function") confirmResolver(!!result);
  confirmResolver = null;
}

/* =========================
   AUTH PRINCIPAL (admin)
========================= */
const auth = getAuth(app);

/* =========================
   AUTH SECUNDARIO (para crear usuarios)
   - evita cerrar la sesión admin
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
   ESTADO: cache de usuarios
========================= */
let usersCache = []; // {id(uid), ...data}

/* =========================
   INIT UI
========================= */
document.addEventListener("DOMContentLoaded", () => {
  fillSelect($("cargo"), CARGOS_AGENTES, "Selecciona cargo del agente");
  fillSelect($("regCargo"), CARGOS_REGISTRADORES, "Selecciona cargo del registrador");

  // Mostrar/ocultar fields agente
  const rolSel = $("rol");
  if (rolSel) {
    rolSel.addEventListener("change", () => {
      const rol = (rolSel.value || "").trim();
      const agenteFields = document.querySelectorAll("[data-only-agent='1']");
      agenteFields.forEach((el) => {
        el.style.display = rol === "agente" ? "" : "none";
      });
    });
    rolSel.dispatchEvent(new Event("change"));
  }

  // Buscador usuarios
  $("userSearch")?.addEventListener("input", () => {
    renderUsersList();
  });
  $("btnRefreshUsers")?.addEventListener("click", async () => {
    await loadUsers();
  });
});

/* =========================
   🔐 PROTEGER ADMIN
========================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "login.html");

  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || (snap.data()?.rol || "") !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  // Admin validado -> cargar registradores y usuarios
  await loadRegistradores();
  await loadUsers();
});

/* =========================
   🚪 LOGOUT
========================= */
$("btnLogout")?.addEventListener("click", () => signOut(auth));

/* =========================
   ➕ CREAR USUARIO NUEVO (Auth secundario)
========================= */
$("btnCrear")?.addEventListener("click", async () => {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const rol = ($("rol")?.value || "").trim();

  const nombreAsesor = ($("nombreAsesor")?.value || "").trim(); // mantener nombreAsesor
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
    // 1) Crear usuario en Auth secundario
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    // 2) Guardar perfil en Firestore
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

    // 3) Cerrar sesión del secundario
    await signOut(secondaryAuth);

    setMsg(`Usuario creado correctamente (${rol}).`, "ok");

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
   { registradoPorNombre, cargo, activo, createdAt }
========================================================= */
$("btnCrearRegistrador")?.addEventListener("click", async () => {
  const nombre = ($("regNombre")?.value || "").trim();
  const cargo = ($("regCargo")?.value || "").trim();

  if (!nombre) return setRegMsg("El nombre es obligatorio.", "error");
  if (!CARGOS_REGISTRADORES.includes(cargo)) {
    return setRegMsg("Selecciona un cargo válido para el registrador.", "error");
  }

  setRegMsg("Agregando...", "");

  try {
    const ok = await openConfirmModal({
      title: "¿Agregar registrador?",
      text: `Se agregará: ${nombre} — ${cargo}`,
      danger: false,
    });
    if (!ok) return setRegMsg("Acción cancelada.", "");

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

        <div class="user-edit" data-edit-id="${id}">
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

    ul.onclick = async (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "delete") {
        const ok = await openConfirmModal({
          title: "¿Eliminar registrador?",
          text: "Esta acción eliminará el registrador de la colección.",
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
        const cargo = (box.querySelector(`select[data-field="cargo"]`)?.value || "").trim();
        const activoStr = (box.querySelector(`select[data-field="activo"]`)?.value || "true").trim();
        const activo = activoStr === "true";

        if (!nombre) return setRegMsg("El nombre es obligatorio.", "error");
        if (!CARGOS_REGISTRADORES.includes(cargo)) return setRegMsg("Cargo no permitido.", "error");

        const ok = await openConfirmModal({
          title: "¿Guardar cambios?",
          text: `Actualizar registrador: ${nombre} — ${cargo}`,
          danger: false,
        });
        if (!ok) return setRegMsg("Acción cancelada.", "");

        try {
          await updateDoc(doc(db, "registradores", id), {
            registradoPorNombre: nombre,
            cargo,
            activo,
          });
          setRegMsg("Registrador actualizado.", "ok");
          await loadRegistradores();
        } catch (e) {
          console.error(e);
          setRegMsg(e?.message || "No se pudo actualizar.", "error");
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

/* =========================================================
   USUARIOS EXISTENTES (colección: usuarios)
   - Listar
   - Editar (rol, nombreAsesor, cargo, GC, activo)
   - “Eliminar” perfil (borra doc Firestore)
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

    // ordenar: admin primero, luego supervisor, luego agente; luego email
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
    usersList.innerHTML = `<div class="small">Error cargando usuarios (revisa Rules / permisos).</div>`;
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
      const uid = u.id; // doc id = uid
      const rol = (u.rol || "").trim();
      const activo = u.activo !== false;

      const isAgent = rol === "agente";
      const nameLine = isAgent ? (u.nombreAsesor || "—") : "—";

      return `
        <div class="user-item" data-uid="${escapeHTML(uid)}">
          <div class="user-top">
            <div>
              <div><strong>${escapeHTML(u.email || uid)}</strong></div>
              <div class="user-meta">
                Rol: <b>${escapeHTML(rol || "—")}</b> ·
                Activo: <b>${activo ? "Sí" : "No"}</b>
                ${isAgent ? ` · nombreAsesor: <b>${escapeHTML(nameLine)}</b>` : ""}
              </div>
              ${isAgent ? `<div class="user-meta">Cargo: ${escapeHTML(u.cargo || "—")} · GC: ${escapeHTML(u.GC || "—")}</div>` : ""}
            </div>
            <div class="user-actions">
              <button type="button" class="btn-mini" data-action="edit">Editar</button>
              <button type="button" class="btn-mini danger" data-action="delete">Eliminar</button>
            </div>
          </div>

          <div class="user-edit" data-edit-box="1">
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

  // inicializar selects y visibilidad por rol dentro de cada item
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
      const agentFields = card.querySelectorAll("[data-only-agent-edit='1']");
      agentFields.forEach((el) => {
        el.style.display = rol === "agente" ? "" : "none";
      });
    };

    rolSel?.addEventListener("change", applyRoleVisibility);
    applyRoleVisibility();
  });
}

// Delegación de eventos usuarios
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
    // re-render para resetear valores
    renderUsersList();
    return;
  }

  if (action === "save") {
    const rol = (card.querySelector(`select[data-field="rol"]`)?.value || "").trim();
    const activoStr = (card.querySelector(`select[data-field="activo"]`)?.value || "true").trim();
    const activo = activoStr === "true";

    let nombreAsesor = (card.querySelector(`input[data-field="nombreAsesor"]`)?.value || "").trim();
    let cargo = (card.querySelector(`select[data-field="cargo"]`)?.value || "").trim();
    let GC = (card.querySelector(`input[data-field="GC"]`)?.value || "").trim();

    if (!ROLES.includes(rol)) {
      return alert("Rol inválido.");
    }

    if (rol === "agente") {
      if (!nombreAsesor) return alert("nombreAsesor es obligatorio para agente.");
      if (!CARGOS_AGENTES.includes(cargo)) return alert("Cargo inválido para agente.");
    } else {
      // limpiar campos de agente si no aplica
      nombreAsesor = "";
      cargo = "";
      GC = "";
    }

    const ok = await openConfirmModal({
      title: "¿Guardar cambios del usuario?",
      text: `Se actualizará el perfil Firestore del usuario ${uid}.`,
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
