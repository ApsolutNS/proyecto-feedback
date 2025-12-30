// ----------------------------------------------
// Admin Panel - Usuarios + Registradores + Lista Usuarios
// Firebase v9 modular
// ----------------------------------------------
//
// Crea usuarios con Auth secundario (no cambia sesión admin)
// CRUD Registradores (colección "registradores")
// Listado/edición/eliminación de Usuarios (colección "usuarios")
// Modal confirmación pequeño “¿Estás seguro?” usando #confirmModal del HTML
//
// NOTA: El botón "Eliminar usuario" solo borra el doc de Firestore /usuarios/{uid}
//       NO elimina el usuario de Authentication (eso requiere Admin SDK / Cloud Function)
//
// ----------------------------------------------

"use strict";
const $ = (id) => document.getElementById(id);
// ----------------------------
// IMPORTS
// ----------------------------
import { app, db } from "./firebase.js";
import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

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
// CONSTANTES (LISTAS FIJAS)
// ----------------------------
const ROLES = ["admin", "supervisor", "agente"];

const CARGOS_AGENTES = [
  "ASESOR INBOUND",
  "ASESOR REDES",
  "ASESOR CORREOS",
];

const CARGOS_REGISTRADORES = [
  "Líder de Calidad y Formación",
  "Líder de Operaciones",
  "Supervisor",
];

const storage = getStorage(app);

let FIRMA_LIDER_URL = "";
let FIRMA_LIDER_NOMBRE = "";

async function cargarFirmaLider() {
  const snap = await getDocs(
    query(collection(db, "registradores"))
  );

  const lider = snap.docs
    .map(d => d.data())
    .find(r =>
      r.activo !== false &&
      r.cargo === "Líder de Calidad y Formación" &&
      r.firmaUrl
    );

  if (!lider) {
    throw new Error("No existe Líder de Calidad con firma activa.");
  }

  FIRMA_LIDER_URL = lider.firmaUrl;
  FIRMA_LIDER_NOMBRE = lider.registradoPorNombre;
}

async function existeLiderCalidadActivo(excludeId = null) {
  const snap = await getDocs(
    query(collection(db, "registradores"), orderBy("cargo", "asc"))
  );
  return snap.docs.some(d => {
    const data = d.data();
    if (excludeId && d.id === excludeId) return false;
    return data.activo !== false &&
           data.cargo === "Líder de Calidad y Formación";
  });
}

// ----------------------------
// HELPERS DOM / UI
// ----------------------------

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

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "";
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
    options
      .map((x) => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`)
      .join("");
}

// ----------------------------
// CONFIRM MODAL (usa tu HTML)
// ----------------------------
//
// Estructura esperada en HTML:
// <div id="confirmModal" class="modal-confirm">
//   ...
//   <button id="btnCancelConfirm">Cancelar</button>
//   <button id="btnConfirmAction">Eliminar</button>
// </div>

let confirmState = {
  resolver: null,
  isOpen: false,
};

function ensureConfirmModalWiring() {
  const modal = $("confirmModal");
  if (!modal) return false;

  // Click afuera para cerrar (opcional)
  modal.addEventListener("click", (ev) => {
    if (ev.target === modal && confirmState.isOpen) {
      closeConfirm(false);
    }
  });

  return true;
}

function openConfirm({ title = "¿Estás seguro?", text = "Esta acción no se puede deshacer.", confirmText = "Confirmar", danger = true } = {}) {
  const modal = $("confirmModal");
  const btnCancel = $("btnCancelConfirm");
  const btnOk = $("btnConfirmAction");

  if (!modal || !btnCancel || !btnOk) {
    // fallback: confirm nativo
    const ok = window.confirm(`${title}\n\n${text}`);
    return Promise.resolve(ok);
  }

  // set texts (buscamos h3/p si existen)
  const h3 = modal.querySelector("h3");
  const p = modal.querySelector("p");

  if (h3) h3.textContent = title;
  if (p) p.textContent = text;

  btnOk.textContent = confirmText;

  // estilo danger en botón
  btnOk.classList.toggle("btn-confirm", true);
  btnCancel.classList.toggle("btn-cancel", true);

  // si quieres: danger visual extra
  btnOk.style.opacity = "1";
  if (!danger) {
    // modo no peligroso: “Confirmar”
    btnOk.style.filter = "none";
  }

  modal.classList.add("show");
  confirmState.isOpen = true;

  return new Promise((resolve) => {
    confirmState.resolver = resolve;

    const onCancel = () => closeConfirm(false);
    const onOk = () => closeConfirm(true);

    // once: true para no acumular listeners
    btnCancel.addEventListener("click", onCancel, { once: true });
    btnOk.addEventListener("click", onOk, { once: true });

    // ESC para cerrar
    const onKey = (e) => {
      if (e.key === "Escape" && confirmState.isOpen) {
        closeConfirm(false);
      }
    };
    document.addEventListener("keydown", onKey, { once: true });
  });
}

function closeConfirm(result) {
  const modal = $("confirmModal");
  if (modal) modal.classList.remove("show");
  confirmState.isOpen = false;

  if (typeof confirmState.resolver === "function") {
    confirmState.resolver(!!result);
  }
  confirmState.resolver = null;
}

// ----------------------------
// AUTH PRINCIPAL (ADMIN)
// ----------------------------
const auth = getAuth(app);

// ----------------------------
// AUTH SECUNDARIO (CREAR USUARIOS)
// ----------------------------
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

async function subirFirmaLider(file, registradorId) {
  if (!file) throw new Error("Firma requerida");

  const refFirma = storageRef(
    storage,
    `firmas/lider_calidad_${registradorId}.png`
  );

  await uploadBytes(refFirma, file);
  return await getDownloadURL(refFirma);
}

// ----------------------------
// ESTADO EN MEMORIA
// ----------------------------
let usersCache = [];        // array de usuarios (/usuarios)
let registradoresCache = []; // array de registradores (/registradores)


// ----------------------------
// INIT UI
// ----------------------------
document.addEventListener("DOMContentLoaded", () => {
  ensureConfirmModalWiring();

  const regCargoSel = $("regCargo");
  const firmaBox = $("firmaLiderBox");
  if (regCargoSel && firmaBox) {
    const toggleFirma = () => {
      firmaBox.style.display =
        regCargoSel.value === "Líder de Calidad y Formación" ? "block" : "none";
    };
    regCargoSel.addEventListener("change", toggleFirma);
    toggleFirma(); // estado inicial
  }

  // Selects fijos
  fillSelect($("cargo"), CARGOS_AGENTES, "Selecciona cargo del agente");
  fillSelect($("regCargo"), CARGOS_REGISTRADORES, "Selecciona cargo del registrador");

  // Mostrar/ocultar sección solo-agente en formulario de creación
  const rolSel = $("rol");
  if (rolSel) {
    rolSel.addEventListener("change", () => {
      const rol = (rolSel.value || "").trim();
      document.querySelectorAll("[data-only-agent='1']").forEach((el) => {
        el.style.display = rol === "agente" ? "" : "none";
      });
    });

    // dispara al inicio
    rolSel.dispatchEvent(new Event("change"));
  }

  // Buscador de usuarios
  $("userSearch")?.addEventListener("input", debounce(() => {
    renderUsersList();
  }, 120));

  // Refresh manual
  $("btnRefreshUsers")?.addEventListener("click", async () => {
    await loadUsers();
  });
});

// ----------------------------
// PROTEGER ADMIN
// ----------------------------
onAuthStateChanged(auth, async (user) => {
  if (!user) return (location.href = "login.html");

  // Validación por rol desde /usuarios/{uid}
  const ref = doc(db, "usuarios", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists() || (snap.data()?.rol || "") !== "admin") {
    alert("No tienes permisos para acceder al panel administrador.");
    return (location.href = "index.html");
  }

  // Admin OK -> cargar módulos
  await loadRegistradores();
  await loadUsers();
});

// ----------------------------
// LOGOUT
// ----------------------------
$("btnLogout")?.addEventListener("click", () => signOut(auth));

// ----------------------------
// CREAR USUARIO (Auth secundario)
// ----------------------------
$("btnCrear")?.addEventListener("click", async () => {
  const email = ($("email")?.value || "").trim();
  const password = ($("password")?.value || "").trim();
  const rol = ($("rol")?.value || "").trim();

  const nombreAsesor = ($("nombreAsesor")?.value || "").trim();
  const cargo = ($("cargo")?.value || "").trim();
  const GC = ($("GC")?.value || "").trim();

  // validación base
  if (!email || !password || !rol) {
    return setMsg("Completa email, contraseña y rol.", "error");
  }
  if (!ROLES.includes(rol)) {
    return setMsg("Rol inválido.", "error");
  }

  // validación solo-agente
  if (rol === "agente") {
    if (!nombreAsesor) return setMsg("El nombreAsesor es obligatorio para agente.", "error");
    if (!CARGOS_AGENTES.includes(cargo)) return setMsg("Selecciona un cargo válido para el agente.", "error");
    // GC opcional (si lo quieres obligatorio, descomenta):
    // if (!GC) return setMsg("GC es obligatorio para el agente.", "error");
  }

  setMsg("Procesando...", "");

  try {
    // Confirm opcional (si quieres confirmación al crear)
    const ok = await openConfirm({
      title: "¿Crear usuario?",
      text: `Se creará el usuario: ${email} con rol: ${rol}.`,
      confirmText: "Crear",
      danger: false,
    });
    if (!ok) return setMsg("Acción cancelada.", "");

    // 1) Auth secundario crea el usuario en Authentication
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    // 2) Firestore: crea doc /usuarios/{uid}
    await setDoc(doc(db, "usuarios", uid), {
      uid,
      email,
      rol,
      // extras para agente
      nombreAsesor: rol === "agente" ? nombreAsesor : "",
      cargo: rol === "agente" ? cargo : "",
      GC: rol === "agente" ? GC : "",
      // control
      activo: true,
      creadoPor: auth.currentUser?.email || "",
      fecha: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    // 3) Cerrar sesión del secundario para no “ensuciar”
    await signOut(secondaryAuth);

    setMsg(`Usuario creado correctamente (${rol}).`, "ok");

    // limpiar inputs
    if ($("email")) $("email").value = "";
    if ($("password")) $("password").value = "";
    if ($("nombreAsesor")) $("nombreAsesor").value = "";
    if ($("cargo")) $("cargo").value = "";
    if ($("GC")) $("GC").value = "";

    // recargar lista
    await loadUsers();
  } catch (e) {
    console.error(e);
    setMsg(e?.message || "Error al crear usuario.", "error");
  }
});

// =========================================================
// REGISTRADORES
// =========================================================
$("btnCrearRegistrador")?.addEventListener("click", async () => {
  const nombre = ($("regNombre")?.value || "").trim();
  const cargo = ($("regCargo")?.value || "").trim();

  if (!nombre) return setRegMsg("El nombre es obligatorio.", "error");
  if (!CARGOS_REGISTRADORES.includes(cargo)) {
    return setRegMsg("Selecciona un cargo válido.", "error");
  }

  setRegMsg("Procesando...", "");

  try {
    const ok = await openConfirm({
      title: "¿Agregar registrador?",
      text: `Se agregará: ${nombre} — ${cargo}`,
      confirmText: "Agregar",
      danger: false,
    });
    if (!ok) return setRegMsg("Acción cancelada.", "");

    // ✅ Validación: solo 1 líder activo
    if (cargo === "Líder de Calidad y Formación") {
      const existe = await existeLiderCalidadActivo();
      if (existe) {
        return setRegMsg(
          "Ya existe un Líder de Calidad y Formación activo. Desactívalo antes de crear otro.",
          "error"
        );
      }

      // ✅ Firma obligatoria
      const file = $("firmaLider")?.files?.[0];
      if (!file) {
        return setRegMsg("Debes subir la firma del Líder de Calidad.", "error");
      }

      // 1) Crear doc
      const docRef = await addDoc(collection(db, "registradores"), {
        registradoPorNombre: nombre,
        cargo,
        activo: true,
        createdAt: serverTimestamp(),
        creadoPor: auth.currentUser?.email || "",
      });

      // 2) Subir firma a Storage y guardar URL en el doc
      const firmaUrl = await subirFirmaLider(file, docRef.id);

      await updateDoc(doc(db, "registradores", docRef.id), {
        registradorId: docRef.id,
        firmaUrl,
      });

      // limpiar
      if ($("regNombre")) $("regNombre").value = "";
      if ($("regCargo")) $("regCargo").value = "";
      if ($("firmaLider")) $("firmaLider").value = "";

      setRegMsg("Líder de Calidad creado con firma.", "ok");
      await loadRegistradores();
      return;
    }

    // ✅ Caso normal (no líder)
    const docRef = await addDoc(collection(db, "registradores"), {
      registradoPorNombre: nombre,
      cargo,
      activo: true,
      createdAt: serverTimestamp(),
      creadoPor: auth.currentUser?.email || "",
    });

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

  ul.innerHTML = `<li class="small">Cargando...</li>`;

  try {
    const qy = query(collection(db, "registradores"), orderBy("registradoPorNombre", "asc"));
    const snap = await getDocs(qy);

    registradoresCache = [];
    snap.forEach((d) => registradoresCache.push({ id: d.id, ...d.data() }));

    if (!registradoresCache.length) {
      ul.innerHTML = `<li class="small">No hay registradores.</li>`;
      return;
    }

    ul.innerHTML = registradoresCache.map((r) => {
      const id = r.id;
      const nombre = r.registradoPorNombre || "";
      const cargo = r.cargo || "";
      const activo = r.activo !== false;

      return `
        <li class="reg-item" data-id="${escapeHTML(id)}">
          <div class="reg-card">
            <div class="reg-left">
              <div class="reg-title">${escapeHTML(nombre)}</div>
              <div class="reg-sub">${escapeHTML(cargo)}</div>
              <div class="reg-meta">
                <label class="reg-switch">
                  <input type="checkbox" data-action="toggle" ${activo ? "checked" : ""}>
                  <span>Activo</span>
                </label>
              </div>
            </div>

            <div class="reg-right">
              <button class="btn-mini" type="button" data-action="edit">Editar</button>
              <button class="btn-mini danger" type="button" data-action="delete">Eliminar</button>
            </div>
          </div>

          <div class="reg-editbox" style="display:none" data-editbox="1">
            <div class="reg-editgrid">
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

            <div class="reg-actions">
              <button class="btn-mini" type="button" data-action="save">Guardar</button>
              <button class="btn-mini" type="button" data-action="cancel">Cancelar</button>
            </div>
          </div>
        </li>
      `;
    }).join("");

    // Rellenar selects cargo + activo en cada editor
    ul.querySelectorAll("li.reg-item").forEach((li) => {
      const id = li.getAttribute("data-id");
      const item = registradoresCache.find((x) => x.id === id);
      if (!item) return;

      const cargoSel = li.querySelector(`select[data-field="cargo"]`);
      fillSelect(cargoSel, CARGOS_REGISTRADORES, "Selecciona cargo");
      if (cargoSel) cargoSel.value = (item.cargo || "").trim();

      const activoSel = li.querySelector(`select[data-field="activo"]`);
      if (activoSel) activoSel.value = item.activo !== false ? "true" : "false";
    });

    // Delegación de eventos
    ul.onclick = async (ev) => {
      const btn = ev.target.closest("button");
      const chk = ev.target.closest("input[type='checkbox']");
      const li = ev.target.closest("li.reg-item");
      if (!li) return;

      const id = li.getAttribute("data-id");
      if (!id) return;

      // toggle activo
      if (chk && chk.getAttribute("data-action") === "toggle") {
        try {
          await updateDoc(doc(db, "registradores", id), { activo: !!chk.checked });
        } catch (e) {
          console.error(e);
          chk.checked = !chk.checked;
          setRegMsg(e?.message || "No se pudo cambiar activo.", "error");
        }
        return;
      }

      if (!btn) return;
      const action = btn.getAttribute("data-action");
      if (!action) return;

      const editBox = li.querySelector(`[data-editbox="1"]`);

      if (action === "edit") {
        if (editBox) editBox.style.display = "block";
        return;
      }

      if (action === "cancel") {
        if (editBox) editBox.style.display = "none";
        // re-render para reset
        await loadRegistradores();
        return;
      }

      if (action === "delete") {
        const ok = await openConfirm({
          title: "¿Eliminar registrador?",
          text: "Esta acción no se puede deshacer.",
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
        if (!editBox) return;

        const nombre = (editBox.querySelector(`input[data-field="nombre"]`)?.value || "").trim();
        const cargo = (editBox.querySelector(`select[data-field="cargo"]`)?.value || "").trim();
        const activoStr = (editBox.querySelector(`select[data-field="activo"]`)?.value || "true").trim();
        const activo = activoStr === "true";

        if (!nombre) return setRegMsg("Nombre obligatorio.", "error");
        if (!CARGOS_REGISTRADORES.includes(cargo)) return setRegMsg("Cargo no permitido.", "error");

        const ok = await openConfirm({
          title: "¿Guardar cambios?",
          text: `Se actualizará: ${nombre} — ${cargo}`,
          confirmText: "Guardar",
          danger: false,
        });
        if (!ok) return;
        
        if (cargo === "Líder de Calidad y Formación" && activo) {
          const existe = await existeLiderCalidadActivo(id);
          if (existe) {
            return setRegMsg(
              "Ya existe otro Líder de Calidad y Formación activo.",
              "error"
            );
          }
        }

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
          setRegMsg(e?.message || "No se pudo guardar.", "error");
        }
        return;
      }
    };

  } catch (e) {
    console.error(e);
    ul.innerHTML = `<li class="small">Error cargando registradores.</li>`;
    setRegMsg(e?.message || "Error cargando registradores.", "error");
  }
}

// =========================================================
// USUARIOS EXISTENTES
// =========================================================
async function loadUsers() {
  const usersList = $("usersList");
  const usersInfo = $("usersInfo");

  if (!usersList) return;

  usersList.innerHTML = `<div class="small">Cargando usuarios...</div>`;
  if (usersInfo) usersInfo.textContent = "";

  try {
    const snap = await getDocs(collection(db, "usuarios"));

    usersCache = [];
    snap.forEach((d) => usersCache.push({ id: d.id, ...d.data() }));

    // Orden: admin -> supervisor -> agente, luego email
    const rolWeight = (r) => (r === "admin" ? 0 : r === "supervisor" ? 1 : 2);
    usersCache.sort((a, b) => {
      const ra = rolWeight((a.rol || "").toLowerCase());
      const rb = rolWeight((b.rol || "").toLowerCase());
      if (ra !== rb) return ra - rb;
      return String(a.email || "").localeCompare(String(b.email || ""), "es", { sensitivity: "base" });
    });

    renderUsersList();
  } catch (e) {
    console.error(e);
    usersList.innerHTML = `<div class="small">Error cargando usuarios. Revisa Firestore Rules.</div>`;
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
    ].filter(Boolean).join(" ").toLowerCase();
    return q ? hay.includes(q) : true;
  });

  if (usersInfo) usersInfo.textContent = `Mostrando ${filtered.length} de ${usersCache.length} usuarios.`;

  if (!filtered.length) {
    usersList.innerHTML = `<div class="small">No hay resultados.</div>`;
    return;
  }

  usersList.innerHTML = filtered.map((u) => {
    const uid = u.id; // doc id
    const rol = (u.rol || "").trim();
    const activo = u.activo !== false;
    const isAgent = rol === "agente";

    return `
      <div class="user-item" data-uid="${escapeHTML(uid)}">
        <div class="user-top">
          <div class="user-main">
            <div class="user-email"><strong>${escapeHTML(u.email || uid)}</strong></div>
            <div class="user-meta">
              Rol: <b>${escapeHTML(rol || "—")}</b> ·
              Activo: <b>${activo ? "Sí" : "No"}</b>
            </div>
            ${
              isAgent
                ? `<div class="user-meta">
                     nombreAsesor: <b>${escapeHTML(u.nombreAsesor || "—")}</b> ·
                     Cargo: <b>${escapeHTML(u.cargo || "—")}</b> ·
                     GC: <b>${escapeHTML(u.GC || "—")}</b>
                   </div>`
                : ``
            }
          </div>

          <div class="user-actions">
            <button type="button" class="btn-mini" data-action="edit">Editar</button>
            <button type="button" class="btn-mini danger" data-action="delete">Eliminar</button>
          </div>
        </div>

        <div class="user-edit" style="display:none" data-editbox="1">
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
  }).join("");

  // Inicializar selects y visibilidad en cada card
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

// Delegación de eventos de usuarios
$("usersList")?.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  const card = ev.target.closest(".user-item");
  if (!btn || !card) return;

  const uid = card.getAttribute("data-uid");
  const action = btn.getAttribute("data-action");
  if (!uid || !action) return;

  const editBox = card.querySelector(`[data-editbox="1"]`);

  if (action === "edit") {
    if (editBox) editBox.style.display = "block";
    return;
  }

  if (action === "cancel") {
    if (editBox) editBox.style.display = "none";
    renderUsersList(); // reset
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
      alert("Rol inválido.");
      return;
    }

    if (rol === "agente") {
      if (!nombreAsesor) {
        alert("nombreAsesor es obligatorio para agente.");
        return;
      }
      if (!CARGOS_AGENTES.includes(cargo)) {
        alert("Cargo inválido para agente.");
        return;
      }
    } else {
      // limpiar campos agente si no aplica
      nombreAsesor = "";
      cargo = "";
      GC = "";
    }

    const ok = await openConfirm({
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
    const ok = await openConfirm({
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

// ----------------------------
// UTIL: debounce
// ----------------------------
function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
