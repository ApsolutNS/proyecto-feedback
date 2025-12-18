// js/portal_agente.js
// Portal del Agente — Auth + rol "agente" + dashboard + firma (UID) + análisis de ítems (mes/semana)
"use strict";

/* ------------------------------
   IMPORTS FIREBASE
------------------------------ */
import { app, db, storage } from "./firebase.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  ref,
  uploadString,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

/* ------------------------------
   CONSTANTES / HELPERS
------------------------------ */
const FIRMA_ALEX_URL =
  "https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media";

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

function toJSDate(value) {
  if (!value) return new Date();
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatearFechaLarga(fecha) {
  const f = toJSDate(fecha);
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  let str = f.toLocaleDateString("es-PE", opts);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getWeeksOfMonth(year, monthIndex) {
  // Semanas tipo: 1–7, 8–14, 15–21, 22–28, 29–fin
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = [];
  let start = 1;
  while (start <= lastDay) {
    const end = Math.min(start + 6, lastDay);
    weeks.push({ start, end });
    start += 7;
  }
  return weeks;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function monthNameEs(m) {
  const names = [
    "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];
  return names[m] || "";
}

/* ------------------------------
   ESTADO GLOBAL
------------------------------ */
const auth = getAuth(app);

let currentUser = null;
let currentEmail = null;
let currentRole = null;
let currentAdvisorName = "";

let currentCollection = null; // "registros" | "refuerzos_calidad"
let currentID = null;
let currentDocData = null;

// Firma (data_url)
let signatureData = null;

// DATA
let registrosFull = [];     // feedbacks del agente (raw docs)
let refuerzosFull = [];     // refuerzos del agente (raw docs)
let ultimosFeedbacks = [];  // para KPIs (mes actual fijo)

// Ítems oportunidad
let itemsUIReady = false;
let itemsFilter = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(), // 0-11
  weekIndex: "", // ""=todas
};
let itemsWeeks = getWeeksOfMonth(itemsFilter.year, itemsFilter.month);

// Cache de análisis por filtro (opcional)
let lastItemsKey = "";

/* ------------------------------
   ELEMENTOS DOM
------------------------------ */
const body = document.body;

const agentNameSpan = document.getElementById("agentNameSpan");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const btnLogout = document.getElementById("btnLogout");

const selTipoDoc = document.getElementById("selTipoDoc");
const selRegistrador = document.getElementById("selRegistrador");
const tableBody = document.querySelector("#agentTable tbody");
const pendingBadge = document.getElementById("pendingBadge");

const avgScoreEl = document.getElementById("avgScore");
const totalFbEl = document.getElementById("totalFb");
const okCountEl = document.getElementById("okCount");
const badCountEl = document.getElementById("badCount");

// Aside: ítems oportunidad
const agentItemsRisk = document.getElementById("agentItemsRisk");

// Modal detalle (documento)
const detailOverlay = document.getElementById("detailOverlay");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const detailClose = document.getElementById("detailClose");
const feedbackInfo = document.getElementById("feedbackInfo");
const editableZone = document.getElementById("editableZone");
const compromisoTextarea = document.getElementById("compromiso");
const signaturePreview = document.getElementById("signaturePreview");
const agentMsg = document.getElementById("agentMsg");

const btnSaveCommit = document.getElementById("btnSaveCommit");
const btnDraw = document.getElementById("btnDraw");
const btnUpload = document.getElementById("btnUpload");
const fileSignature = document.getElementById("fileSignature");

// Modal firma
const sigOverlay = document.getElementById("signatureModal");
const sigCanvas = document.getElementById("sigCanvas");
const btnClear = document.getElementById("btnClear");
const btnUse = document.getElementById("btnUse");
const btnCancel = document.getElementById("btnCancel");
const sigCtx = sigCanvas ? sigCanvas.getContext("2d") : null;

/* ------------------------------
   TEMA CLARO / OSCURO
------------------------------ */
function applyTheme(theme) {
  body.classList.remove("theme-light", "theme-dark");
  body.classList.add(theme);
  if (themeIcon) themeIcon.textContent = theme === "theme-dark" ? "light_mode" : "dark_mode";
  localStorage.setItem("portalAgentTheme", theme);
}

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    const current = body.classList.contains("theme-dark") ? "theme-dark" : "theme-light";
    applyTheme(current === "theme-dark" ? "theme-light" : "theme-dark");
  });
}

(() => {
  const storedTheme = localStorage.getItem("portalAgentTheme");
  if (storedTheme === "theme-dark" || storedTheme === "theme-light") {
    applyTheme(storedTheme);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "theme-dark" : "theme-light");
  }
})();

/* ------------------------------
   LOGOUT
------------------------------ */
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}

/* ------------------------------
   AUTH + ROL + USUARIO
------------------------------ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;
  currentEmail = user.email || "";

  try {
    const userRef = doc(db, "usuarios", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      alert("No tienes permisos configurados. Contacta a tu supervisor.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    const data = snap.data();
    currentRole = data.rol || "";
    currentAdvisorName =
      data.nombreAsesor ||
      data.nombre ||
      data.nombreMostrar ||
      data.displayName ||
      currentEmail ||
      "";

    const isAdmin = currentEmail === "anunez@gefectiva.com";
    const isAgent = currentRole === "agente";

    if (!isAgent && !isAdmin) {
      alert("No tienes acceso al Portal del Agente.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    if (agentNameSpan) {
      agentNameSpan.textContent = currentAdvisorName || currentEmail || "Agente";
    }

    // Carga inicial de todo
    await bootstrapData();

  } catch (err) {
    console.error("Error al cargar datos de usuario:", err);
    alert("Error al validar tus permisos. Intenta más tarde.");
    await signOut(auth);
    location.href = "login.html";
  }
});

/* ------------------------------
   BOOTSTRAP (cargar data + render inicial)
------------------------------ */
async function bootstrapData() {
  await loadRegistrosAgent();
  await loadRefuerzosAgent();

  // Sel "Registrado por" (dinámico)
  fillRegistradoresOptions();

  // Tabla según filtro tipoDoc + registrador
  await loadAgentList();

  // KPIs: SIEMPRE MES ACTUAL (no modificable)
  computeDashboardFixedCurrentMonth();

  // Aside ítems oportunidad: mes actual por defecto, pero modifiable
  initItemsOpportunityUI();
  renderItemsOpportunity(); // usa itemsFilter
}

/* ------------------------------
   CARGAR REGISTROS (feedbacks) — SOLO DEL AGENTE (UID)
------------------------------ */
async function loadRegistrosAgent() {
  registrosFull = [];
  if (!currentUser) return;

  const myUid = currentUser.uid;
  const qRef = query(collection(db, "registros"), where("asesorId", "==", myUid));
  const snap = await getDocs(qRef);

  snap.forEach((d) => {
    const r = d.data();
    registrosFull.push({
      id: d.id,
      ...r,
      fechaObj: toJSDate(r.fecha),
    });
  });

  // ordenar por fecha desc
  registrosFull.sort((a, b) => (b.fechaObj?.getTime?.() || 0) - (a.fechaObj?.getTime?.() || 0));
}

/* ------------------------------
   CARGAR REFUERZOS — PERTENECIENTES AL AGENTE (UID o nombre)
------------------------------ */
async function loadRefuerzosAgent() {
  refuerzosFull = [];
  if (!currentUser) return;

  const myUid = currentUser.uid;
  const snap = await getDocs(collection(db, "refuerzos_calidad"));

  snap.forEach((d) => {
    const r = d.data();
    const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];

    const pertenece = asesoresRef.some(
      (a) =>
        (a.asesorId && a.asesorId === myUid) ||
        (a.nombre && a.nombre === currentAdvisorName)
    );
    if (!pertenece) return;

    refuerzosFull.push({
      id: d.id,
      ...r,
      fechaObj: toJSDate(r.fechaRefuerzo),
    });
  });

  refuerzosFull.sort((a, b) => (b.fechaObj?.getTime?.() || 0) - (a.fechaObj?.getTime?.() || 0));
}

/* ------------------------------
   SELECT "REGISTRADO POR" — OPCIONES DINÁMICAS
------------------------------ */
function fillRegistradoresOptions() {
  if (!selRegistrador) return;

  const set = new Set();

  // De registros: registradoPor / registrado_por
  registrosFull.forEach((r) => {
    const v = r.registradoPor || r.registrado_por;
    if (v) set.add(v);
  });

  // De refuerzos: responsable
  refuerzosFull.forEach((r) => {
    if (r.responsable) set.add(r.responsable);
  });

  const sorted = Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  selRegistrador.innerHTML =
    `<option value="">Todos</option>` +
    sorted.map((x) => `<option value="${escapeHTML(x)}">${escapeHTML(x)}</option>`).join("");
}

/* ------------------------------
   KPIs (RESUMEN) — SIEMPRE MES ACTUAL (NO MODIFICABLE)
------------------------------ */
function computeDashboardFixedCurrentMonth() {
  // Solo usa registros del mes actual
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const monthRegs = registrosFull.filter((r) => {
    const f = r.fechaObj || toJSDate(r.fecha);
    return f.getFullYear() === y && f.getMonth() === m;
  });

  // UltimosFeedbacks con el formato que tu dashboard esperaba
  ultimosFeedbacks = monthRegs.map((r) => ({
    id: r.id,
    bruto: r,
    nota: r.nota,
  }));

  renderDashboard();
}

function renderDashboard() {
  if (!avgScoreEl || !totalFbEl || !okCountEl || !badCountEl) return;

  if (!ultimosFeedbacks.length) {
    avgScoreEl.textContent = "–";
    totalFbEl.textContent = "0";
    okCountEl.textContent = "0";
    badCountEl.textContent = "0";
    return;
  }

  const notas = ultimosFeedbacks
    .map((r) => Number(r.bruto?.nota ?? r.nota ?? 0))
    .filter((n) => !Number.isNaN(n));

  const total = notas.length;
  const suma = notas.reduce((t, n) => t + n, 0);
  const promedio = total ? Math.round((suma / total) * 10) / 10 : 0;

  const aprobados = notas.filter((n) => n >= 85).length;
  const noAprobados = total - aprobados;

  avgScoreEl.textContent = `${promedio}%`;
  totalFbEl.textContent = `${total}`;
  okCountEl.textContent = `${aprobados}`;
  badCountEl.textContent = `${noAprobados}`;
}

/* ------------------------------
   BADGE DE PENDIENTES (tabla)
------------------------------ */
function updatePendingBadge(list) {
  if (!pendingBadge) return;
  const pend = list.filter((x) => (x.estado || "").toUpperCase() === "PENDIENTE").length;

  pendingBadge.innerHTML = pend
    ? `<span class="badgePending">
         <span class="material-symbols-outlined" style="font-size:14px;">pending_actions</span>
         ${pend} pendientes
       </span>`
    : "";
}

/* ------------------------------
   TABLA (NO SE TOCA CON FILTRO DE AÑO/MES/SEMANA)
   Se sigue filtrando solo por tipoDoc y registradoPor.
------------------------------ */
async function loadAgentList() {
  if (!tableBody || !currentUser) return;

  const tipoDoc = selTipoDoc?.value || "registros";
  const filtroRegistrador = selRegistrador?.value || "";
  currentCollection = tipoDoc;

  const list = [];
  const myUid = currentUser.uid;

  if (tipoDoc === "registros") {
    // Usamos registrosFull ya cargado
    registrosFull.forEach((r) => {
      list.push({
        id: r.id,
        collection: "registros",
        fecha: r.fechaObj || toJSDate(r.fecha),
        detalle: `${r.nota ?? 0}%`,
        estado: r.estado || "PENDIENTE",
        registradoPor: r.registradoPor || r.registrado_por || "No especificado",
        etiqueta: "Feedback",
        bruto: r,
      });
    });
  } else {
    // Refuerzos: refuerzosFull ya cargado
    refuerzosFull.forEach((r) => {
      const firmas = Array.isArray(r.firmas) ? r.firmas : [];
      const firmaAgente = firmas.find(
        (f) =>
          (f.asesorId && f.asesorId === myUid) ||
          (f.nombre && f.nombre === currentAdvisorName)
      );
      const estadoAgente = firmaAgente && firmaAgente.url ? "COMPLETADO" : "PENDIENTE";

      list.push({
        id: r.id,
        collection: "refuerzos_calidad",
        fecha: r.fechaObj || toJSDate(r.fechaRefuerzo),
        detalle: r.tema || r.tipo || "Refuerzo / Capacitación",
        estado: estadoAgente,
        registradoPor: r.responsable || "No especificado",
        etiqueta: "Refuerzo",
        bruto: r,
      });
    });
  }

  // ordenar desc
  list.sort((a, b) => b.fecha - a.fecha);

  updatePendingBadge(list);

  const filtrada = filtroRegistrador
    ? list.filter((x) => x.registradoPor === filtroRegistrador)
    : list;

  if (!filtrada.length) {
    tableBody.innerHTML = "<tr><td colspan='5'>Sin registros para este filtro</td></tr>";
    return;
  }

  tableBody.innerHTML = filtrada
    .map((r) => {
      const estadoClass =
        (r.estado || "").toUpperCase() === "COMPLETADO" ? "completado" : "pendiente";

      return `
        <tr>
          <td class="table-id" title="${escapeHTML(r.id)}">${escapeHTML(r.id)}</td>
          <td>${escapeHTML(r.fecha.toLocaleString("es-PE"))}</td>
          <td>
            ${escapeHTML(r.detalle)}
            <span class="tag-doc">${escapeHTML(r.etiqueta)}</span>
          </td>
          <td>
            <span class="badgeEstado ${estadoClass}">
              ${escapeHTML(r.estado || "PENDIENTE")}
            </span>
          </td>
          <td>
            <button class="icon-button" type="button"
              data-doc-id="${escapeHTML(r.id)}"
              data-collection="${escapeHTML(r.collection)}"
              title="Ver detalle">
              <span class="material-symbols-outlined">visibility</span>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* listeners tabla */
if (tableBody) {
  tableBody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-doc-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-doc-id");
    const collectionName = btn.getAttribute("data-collection");
    if (id && collectionName) openDetail(collectionName, id);
  });
}

/* listeners filtros tabla */
if (selTipoDoc) {
  selTipoDoc.addEventListener("change", async () => {
    // No cambiamos KPIs (siempre mes actual) ni el filtro aside (se mantiene)
    await loadAgentList();
  });
}
if (selRegistrador) {
  selRegistrador.addEventListener("change", async () => {
    await loadAgentList();
  });
}

/* ------------------------------
   MODAL DETALLE — ABRIR / CERRAR
------------------------------ */
function openDetailModal() {
  if (!detailOverlay) return;
  detailOverlay.classList.add("open");
  detailOverlay.setAttribute("aria-hidden", "false");
}

function closeDetailModal() {
  if (!detailOverlay) return;
  detailOverlay.classList.remove("open");
  detailOverlay.setAttribute("aria-hidden", "true");
  currentID = null;
  currentCollection = selTipoDoc?.value || "registros";
  signatureData = null;

  if (agentMsg) {
    agentMsg.textContent = "";
    agentMsg.style.color = "";
  }
}

if (detailClose) detailClose.addEventListener("click", closeDetailModal);

if (detailOverlay) {
  detailOverlay.addEventListener("click", (ev) => {
    if (ev.target === detailOverlay) closeDetailModal();
  });
}

/* ------------------------------
   CARGAR DETALLE DOCUMENTO
------------------------------ */
async function openDetail(collectionName, id) {
  if (!feedbackInfo || !editableZone || !compromisoTextarea || !agentMsg) return;

  currentCollection = collectionName;
  currentID = id;
  signatureData = null;
  agentMsg.textContent = "";
  agentMsg.style.color = "";

  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) {
    alert("El documento ya no existe.");
    return;
  }

  const r = snap.data();
  currentDocData = r;

  if (detailSubtitle) {
    const fechaBase = collectionName === "registros" ? r.fecha : r.fechaRefuerzo;
    detailSubtitle.textContent = formatearFechaLarga(fechaBase);
  }

  if (collectionName === "registros") {
    renderDetailFeedback(r);
  } else {
    renderDetailRefuerzo(r);
  }

  openDetailModal();
}

/* ------------------------------
   DETALLE FEEDBACK
------------------------------ */
function renderDetailFeedback(r) {
  if (!feedbackInfo || !editableZone || !compromisoTextarea || !agentMsg) return;

  if (detailTitle) detailTitle.textContent = "Detalle del Feedback";

  const fecha = r.fecha;
  const esReafirmacion = Number(r.nota) === 100;
  const titulo = esReafirmacion ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";
  const dniGC = r.gc ? String(r.gc).replace(/[^0-9]/g, "") : "-";

  const itemsHtml =
    (r.items || [])
      .map(
        (it) => `
          <div style="margin-bottom:4px">
            <strong>${escapeHTML(it.name || "")}</strong>
            ${it.perc ? ` (${escapeHTML(it.perc.toString())}%)` : ""}
            <div style="margin-left:8px">${escapeHTML(it.detail || "")}</div>
          </div>
        `
      )
      .join("") || "<em>Sin ítems observados</em>";

  const imgsHtml =
    (r.imagenes || [])
      .map(
        (im) => `
          <img src="${escapeHTML(im.url)}"
            style="width:100%;max-width:680px;margin-top:8px;border-radius:12px;border:1px solid #e5e7eb;">
        `
      )
      .join("") || "<em>Sin evidencias adjuntas</em>";

  const registrador = r.registradoPor || r.registrado_por || "No especificado";

  feedbackInfo.innerHTML = `
    <div class="letter-header">
      <div>
        <div class="letter-title">${escapeHTML(titulo)}</div>
        <div style="font-size:12px;color:#6b7280;">
          Nota: ${escapeHTML((r.nota ?? 0).toString())}% · Asesor: ${escapeHTML(r.asesor || "")}
        </div>
      </div>
      <img src="${FIRMA_ALEX_URL}" style="max-height:42px">
    </div>

    <p style="font-size:13px;">
      Por medio de la presente se deja constancia que el
      <strong>${escapeHTML(formatearFechaLarga(fecha))}</strong> se realiza una
      <strong>${escapeHTML(titulo)}</strong> al/la colaborador(a)
      <strong>${escapeHTML(r.asesor || "")}</strong> con DNI
      <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de Asesor(a) Financiero(a),
      para el cumplimiento de los parámetros de la llamada.
    </p>

    <p style="font-size:13px;">
      Registrado por: <span class="pill">${escapeHTML(registrador)}</span>
    </p>

    <div class="section-title">Cliente</div>
    <div class="section-content">
      <div><strong>DNI:</strong> ${escapeHTML(r.cliente?.dni || "")}</div>
      <div><strong>Nombre:</strong> ${escapeHTML(r.cliente?.nombre || "")}</div>
      <div><strong>Teléfono:</strong> ${escapeHTML(r.cliente?.tel || "")}</div>
      <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "")}</div>
      <div><strong>Comentario:</strong> ${escapeHTML(r.observacionCliente || "")}</div>
    </div>

    <div class="section-title">Gestión monitoreada</div>
    <div class="section-content">
      <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "")}</div>
      <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "")}</div>
      <div><strong>Tipo:</strong> ${escapeHTML(r.tipo || "")}</div>
      <div style="margin-top:6px">
        <strong>Resumen:</strong>
        <div class="resumen-box">${escapeHTML(r.resumen || "")}</div>
      </div>
    </div>

    <div class="section-title">Ítems observados</div>
    <div class="section-content">${itemsHtml}</div>

    <div class="section-title">Nota obtenida</div>
    <div class="section-content nota-box">
      <div class="nota-pill">${(r.nota ?? 0).toString()}%</div>
      <div class="nota-estado">
        Estado: <strong>${escapeHTML(r.estado || "PENDIENTE")}</strong>
      </div>
    </div>

    <div class="section-title">Compromiso del agente</div>
    <div class="section-content">
      ${r.compromiso ? escapeHTML(r.compromiso) : "<em>Pendiente</em>"}
    </div>

    <div class="section-title">Evidencias</div>
    <div class="section-content">${imgsHtml}</div>
  `;

  if ((r.estado || "").toUpperCase() === "COMPLETADO" && r.firmaUrl) {
    editableZone.style.display = "none";
    agentMsg.style.color = "#16a34a";
    agentMsg.textContent = "Este feedback ya fue completado y firmado.";
  } else {
    editableZone.style.display = "block";
    compromisoTextarea.value = r.compromiso || "";
    signatureData = r.firmaUrl || null;
    updateSignaturePreview();
  }
}

/* ------------------------------
   DETALLE REFUERZO
------------------------------ */
function renderDetailRefuerzo(r) {
  if (!feedbackInfo || !editableZone || !compromisoTextarea || !agentMsg) return;

  if (detailTitle) detailTitle.textContent = "Detalle del Refuerzo / Capacitación";

  const fechaRef = r.fechaRefuerzo;
  const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
  const firmas = Array.isArray(r.firmas) ? r.firmas : [];

  const asesoresTexto = asesoresRef.length
    ? asesoresRef
        .map((a) => (a.gc ? `${escapeHTML(a.nombre)} (${escapeHTML(a.gc)})` : escapeHTML(a.nombre)))
        .join(", ")
    : escapeHTML(r.publico || "—");

  const myUid = currentUser ? currentUser.uid : null;

  const firmaAgente = firmas.find(
    (f) => (f.asesorId && f.asesorId === myUid) || f.nombre === currentAdvisorName
  );

  const compromisoAgente = firmaAgente?.compromiso || "";
  const firmaUrlAgente = firmaAgente?.url || null;
  const fechaFirma = firmaAgente?.fechaFirma
    ? new Date(firmaAgente.fechaFirma).toLocaleString("es-PE")
    : "";

  feedbackInfo.innerHTML = `
    <div class="letter-header">
      <div>
        <div class="letter-title">REFUERZO / CAPACITACIÓN</div>
        <div style="font-size:12px;color:#6b7280;">Tema: ${escapeHTML(r.tema || "—")}</div>
      </div>
      <img src="${FIRMA_ALEX_URL}" style="max-height:42px">
    </div>

    <p style="font-size:13px;">
      Se deja constancia que el <strong>${escapeHTML(formatearFechaLarga(fechaRef))}</strong>
      se realizó un <strong>${escapeHTML(r.tipo || "refuerzo / capacitación")}</strong> sobre
      <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
    </p>

    <p class="section-content">${asesoresTexto}</p>

    <p style="font-size:13px;">
      Responsable de la sesión: <span class="pill">${escapeHTML(r.responsable || "Calidad & Formación")}</span>
    </p>

    <div class="section-title">Objetivo del refuerzo</div>
    <div class="section-content">${escapeHTML(r.objetivo || "—")}</div>

    <div class="section-title">Detalle / acuerdos clave</div>
    <div class="section-content">${escapeHTML(r.detalle || "—")}</div>

    <div class="section-title">Compromiso del agente</div>
    <div class="section-content">
      ${compromisoAgente ? escapeHTML(compromisoAgente) : "<em>Pendiente</em>"}
    </div>

    <div class="section-title">Firma actual del agente</div>
    <div class="section-content">
      ${
        firmaUrlAgente
          ? `<img src="${escapeHTML(firmaUrlAgente)}"
                style="max-width:260px;border-radius:12px;border:1px solid #e5e7eb;margin-top:6px;">
             <div style="font-size:11px;color:#6b7280;margin-top:3px;">
               Fecha de firma: ${escapeHTML(fechaFirma)}
             </div>`
          : "<em>Sin firma registrada</em>"
      }
    </div>
  `;

  if (firmaUrlAgente && compromisoAgente) {
    editableZone.style.display = "none";
    agentMsg.style.color = "#16a34a";
    agentMsg.textContent = "Este refuerzo ya fue firmado por ti anteriormente.";
  } else {
    editableZone.style.display = "block";
    compromisoTextarea.value = compromisoAgente || "";
    signatureData = firmaUrlAgente || null;
    updateSignaturePreview();
  }
}

/* ------------------------------
   PREVIEW FIRMA
------------------------------ */
function updateSignaturePreview() {
  if (!signaturePreview) return;

  if (signatureData) {
    signaturePreview.className = "signature-preview";
    signaturePreview.innerHTML = `<img src="${signatureData}" alt="Firma del agente">`;
  } else {
    signaturePreview.className = "signature-preview-empty";
    signaturePreview.textContent = "Sin firma seleccionada";
  }
}

/* ------------------------------
   GUARDAR COMPROMISO + FIRMA (UID único)
------------------------------ */
async function saveSignature() {
  if (!currentID || !currentCollection) {
    alert("No hay documento abierto.");
    return;
  }
  if (!currentUser || !currentAdvisorName) {
    alert("No se encontró la sesión del agente.");
    return;
  }
  if (!compromisoTextarea || !agentMsg || !editableZone) return;

  const compromiso = compromisoTextarea.value.trim();
  if (!compromiso) {
    alert("El compromiso es obligatorio.");
    return;
  }
  if (!signatureData) {
    alert("Debes dibujar o subir una firma.");
    return;
  }

  agentMsg.style.color = "#16a34a";
  agentMsg.textContent = "Guardando cambios...";

  try {
    let pathFolder = "firmas";
    if (currentCollection === "refuerzos_calidad") pathFolder = "firmas_refuerzos";

    const fileName = `${currentUser.uid}.png`;
    const sigRef = ref(storage, `${pathFolder}/${fileName}`);

    await uploadString(sigRef, signatureData, "data_url");
    const url = await getDownloadURL(sigRef);

    const docRef = doc(db, currentCollection, currentID);

    if (currentCollection === "registros") {
      await updateDoc(docRef, { compromiso, firmaUrl: url, estado: "COMPLETADO" });
      agentMsg.textContent = "Feedback completado y firmado correctamente.";
    } else {
      const snap = await getDoc(docRef);
      const data = snap.data() || {};
      const firmas = Array.isArray(data.firmas) ? data.firmas : [];
      const nowIso = new Date().toISOString();
      const myUid = currentUser.uid;

      const nuevasFirmas = firmas.map((f) => {
        if ((f.asesorId && f.asesorId === myUid) || f.nombre === currentAdvisorName) {
          return { ...f, asesorId: f.asesorId || myUid, url, compromiso, fechaFirma: nowIso };
        }
        return f;
      });

      const allFirmados = nuevasFirmas.length > 0 && nuevasFirmas.every((f) => !!f.url);

      await updateDoc(docRef, {
        firmas: nuevasFirmas,
        firmado: allFirmados,
        firmaNombre: currentAdvisorName,
        firmaFecha: nowIso,
        agenteNombre: currentAdvisorName,
      });

      agentMsg.textContent = "Refuerzo firmado correctamente.";
    }

    editableZone.style.display = "none";

    // refrescar tabla, KPIs (mes actual) y aside ítems
    await loadRegistrosAgent();
    await loadRefuerzosAgent();
    fillRegistradoresOptions();
    await loadAgentList();
    computeDashboardFixedCurrentMonth();
    renderItemsOpportunity();

  } catch (err) {
    console.error(err);
    agentMsg.style.color = "#dc2626";
    agentMsg.textContent = "Error al guardar: " + err.message;
  }
}

if (btnSaveCommit) btnSaveCommit.addEventListener("click", saveSignature);

/* ------------------------------
   MODAL FIRMA — CANVAS
------------------------------ */
let drawing = false;

function openSignatureModal() {
  if (!sigOverlay || !sigCanvas || !sigCtx) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigOverlay.classList.add("open");
  sigOverlay.setAttribute("aria-hidden", "false");
}

function closeSignatureModal() {
  if (!sigOverlay) return;
  sigOverlay.classList.remove("open");
  sigOverlay.setAttribute("aria-hidden", "true");
}

function getCanvasPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  return {
    x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
    y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top,
  };
}

if (sigCanvas && sigCtx) {
  sigCanvas.addEventListener("mousedown", (e) => {
    drawing = true;
    sigCtx.beginPath();
    const p = getCanvasPos(e);
    sigCtx.moveTo(p.x, p.y);
  });

  sigCanvas.addEventListener("mouseup", () => (drawing = false));
  sigCanvas.addEventListener("mouseleave", () => (drawing = false));

  sigCanvas.addEventListener("mousemove", (e) => {
    if (!drawing) return;
    const p = getCanvasPos(e);
    sigCtx.lineWidth = 2;
    sigCtx.lineCap = "round";
    sigCtx.strokeStyle = "#000000";
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
  });

  sigCanvas.addEventListener(
    "touchstart",
    (e) => {
      drawing = true;
      sigCtx.beginPath();
      const p = getCanvasPos(e);
      sigCtx.moveTo(p.x, p.y);
    },
    { passive: true }
  );

  sigCanvas.addEventListener("touchend", () => (drawing = false), { passive: true });

  sigCanvas.addEventListener(
    "touchmove",
    (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getCanvasPos(e);
      sigCtx.lineTo(p.x, p.y);
      sigCtx.stroke();
    },
    { passive: false }
  );
}

if (btnDraw) btnDraw.addEventListener("click", openSignatureModal);
if (btnCancel) btnCancel.addEventListener("click", closeSignatureModal);

if (btnClear && sigCtx && sigCanvas) {
  btnClear.addEventListener("click", () => {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  });
}

if (btnUse && sigCanvas) {
  btnUse.addEventListener("click", () => {
    signatureData = sigCanvas.toDataURL("image/png");
    updateSignaturePreview();
    closeSignatureModal();
  });
}

if (sigOverlay) {
  sigOverlay.addEventListener("click", (ev) => {
    if (ev.target === sigOverlay) closeSignatureModal();
  });
}

/* ------------------------------
   SUBIR IMAGEN FIRMA
------------------------------ */
if (btnUpload && fileSignature) {
  btnUpload.addEventListener("click", () => fileSignature.click());

  fileSignature.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      signatureData = ev.target.result;
      updateSignaturePreview();
    };
    reader.readAsDataURL(file);
  });
}

/* =====================================================================
   NUEVO: ÍTEMS CON MAYOR OPORTUNIDAD (ASIDE)
   - Default: mes actual (mismo que KPIs)
   - Modificable: Año / Mes / Semana (solo afecta este bloque)
   - Click item: modal con detalle del por qué se debita (motivos)
===================================================================== */

/* UI: construir filtros dentro del contenedor (sin cambiar tu HTML) */
function initItemsOpportunityUI() {
  if (!agentItemsRisk || itemsUIReady) return;

  // Valores por defecto: mes actual
  const now = new Date();
  itemsFilter.year = now.getFullYear();
  itemsFilter.month = now.getMonth();
  itemsFilter.weekIndex = "";
  itemsWeeks = getWeeksOfMonth(itemsFilter.year, itemsFilter.month);

  agentItemsRisk.innerHTML = `
    <div class="risk-filters">
      <div class="risk-field">
        <label>Año</label>
        <select id="riskYear"></select>
      </div>
      <div class="risk-field">
        <label>Mes</label>
        <select id="riskMonth"></select>
      </div>
      <div class="risk-field">
        <label>Semana</label>
        <select id="riskWeek"></select>
      </div>
    </div>

    <div class="risk-summary" id="riskSummary"></div>
    <div class="risk-items" id="riskItems">
      <div class="small">Cargando análisis…</div>
    </div>
  `;

  fillRiskSelectors();
  attachRiskSelectorListeners();

  itemsUIReady = true;
}

function fillRiskSelectors() {
  const yearSel = document.getElementById("riskYear");
  const monthSel = document.getElementById("riskMonth");
  const weekSel = document.getElementById("riskWeek");

  if (!yearSel || !monthSel || !weekSel) return;

  // años disponibles por data
  const yearsSet = new Set(registrosFull.map((r) => (r.fechaObj || toJSDate(r.fecha)).getFullYear()));
  const years = Array.from(yearsSet).sort((a, b) => b - a);
  const fallbackYear = new Date().getFullYear();
  const yearsFinal = years.length ? years : [fallbackYear];

  // Ajuste si el año actual no está en data
  if (!yearsFinal.includes(itemsFilter.year)) itemsFilter.year = yearsFinal[0];

  yearSel.innerHTML = yearsFinal.map((y) => `<option value="${y}">${y}</option>`).join("");
  yearSel.value = String(itemsFilter.year);

  monthSel.innerHTML = Array.from({ length: 12 }).map((_, i) =>
    `<option value="${i}">${escapeHTML(monthNameEs(i))}</option>`
  ).join("");
  monthSel.value = String(itemsFilter.month);

  itemsWeeks = getWeeksOfMonth(itemsFilter.year, itemsFilter.month);
  weekSel.innerHTML =
    `<option value="">Todas</option>` +
    itemsWeeks
      .map((w, i) => `<option value="${i}">S${i + 1} (${w.start}-${w.end})</option>`)
      .join("");
  weekSel.value = itemsFilter.weekIndex === "" ? "" : String(itemsFilter.weekIndex);
}

function attachRiskSelectorListeners() {
  const yearSel = document.getElementById("riskYear");
  const monthSel = document.getElementById("riskMonth");
  const weekSel = document.getElementById("riskWeek");

  if (!yearSel || !monthSel || !weekSel) return;

  yearSel.addEventListener("change", () => {
    itemsFilter.year = Number(yearSel.value);
    itemsFilter.weekIndex = "";
    fillRiskSelectors();
    renderItemsOpportunity();
  });

  monthSel.addEventListener("change", () => {
    itemsFilter.month = Number(monthSel.value);
    itemsFilter.weekIndex = "";
    fillRiskSelectors();
    renderItemsOpportunity();
  });

  weekSel.addEventListener("change", () => {
    itemsFilter.weekIndex = weekSel.value === "" ? "" : Number(weekSel.value);
    renderItemsOpportunity();
  });
}

/* Filtrar registros por itemsFilter (año/mes/semana) */
function getRegistrosForItemsFilter() {
  const y = itemsFilter.year;
  const m = itemsFilter.month;

  let base = registrosFull.filter((r) => {
    const f = r.fechaObj || toJSDate(r.fecha);
    return f.getFullYear() === y && f.getMonth() === m;
  });

  if (itemsFilter.weekIndex !== "" && itemsWeeks[itemsFilter.weekIndex]) {
    const w = itemsWeeks[itemsFilter.weekIndex];
    base = base.filter((r) => {
      const f = r.fechaObj || toJSDate(r.fecha);
      const d = f.getDate();
      return d >= w.start && d <= w.end;
    });
  }

  return base;
}

/* Calcular ranking de ítems:
   - totalMonitoreos = N registros filtrados
   - errores = veces que el item aparece en un registro
   - errorPct = errores/N
   - impactoProm = (sum(perc del item en todos los registros)) / N   => “puntos” promedio que baja por monitoreo
*/
function buildItemsAnalysis(registrosFiltrados) {
  const totalMon = registrosFiltrados.length;
  const map = new Map(); // name -> {count, sumPerc, motivosMap, ejemplos[]}

  registrosFiltrados.forEach((r) => {
    const items = Array.isArray(r.items) ? r.items : [];
    items.forEach((it) => {
      const name = (it?.name || "").trim();
      if (!name) return;

      // perc: cuánto “baja” ese ítem (si tu data lo usa así)
      const perc = Number(it?.perc ?? 0);
      const detail = (it?.detail || "").trim();

      if (!map.has(name)) {
        map.set(name, {
          name,
          count: 0,
          sumPerc: 0,
          motivos: new Map(),
          ejemplos: [],
        });
      }

      const obj = map.get(name);
      obj.count += 1;
      obj.sumPerc += Number.isFinite(perc) ? perc : 0;

      if (detail) {
        obj.motivos.set(detail, (obj.motivos.get(detail) || 0) + 1);
      }

      // guardar algunos ejemplos
      if (obj.ejemplos.length < 8) {
        const f = r.fechaObj || toJSDate(r.fecha);
        obj.ejemplos.push({
          id: r.id,
          fecha: f,
          nota: Number(r.nota ?? 0),
          registrador: r.registradoPor || r.registrado_por || "",
        });
      }
    });
  });

  const arr = Array.from(map.values()).map((x) => {
    const errorPct = totalMon ? Math.round((x.count / totalMon) * 1000) / 10 : 0; // 1 decimal
    const impactoProm = totalMon ? Math.round((x.sumPerc / totalMon) * 10) / 10 : 0; // 1 decimal
    const avgDeductWhenFails = x.count ? Math.round((x.sumPerc / x.count) * 10) / 10 : 0;

    return {
      ...x,
      totalMon,
      errorPct,
      impactoProm,
      avgDeductWhenFails,
    };
  });

// ORDEN NUEVO: mayor reincidencia → mayor % error → mayor impacto
arr.sort((a, b) =>
  (b.count - a.count) ||           // 🔥 MÁS reincidencia primero
  (b.errorPct - a.errorPct) ||     // luego % de error
  (b.impactoProm - a.impactoProm) // luego impacto promedio
);

  return arr;
}

function renderItemsOpportunity() {
  if (!agentItemsRisk) return;

  const riskSummary = document.getElementById("riskSummary");
  const riskItems = document.getElementById("riskItems");

  if (!riskItems) return;

  const key = `${itemsFilter.year}-${itemsFilter.month}-${itemsFilter.weekIndex}`;
  lastItemsKey = key;

  const regs = getRegistrosForItemsFilter();
  const totalMon = regs.length;

  // Resumen superior
  const rangeText = (() => {
    const y = itemsFilter.year;
    const m = itemsFilter.month;
    if (itemsFilter.weekIndex === "" || !itemsWeeks[itemsFilter.weekIndex]) {
      return `${monthNameEs(m)} ${y}`;
    }
    const w = itemsWeeks[itemsFilter.weekIndex];
    return `${monthNameEs(m)} ${y} · Semana S${Number(itemsFilter.weekIndex) + 1} (${w.start}-${w.end})`;
  })();

  if (riskSummary) {
    riskSummary.innerHTML = `
      <div class="risk-summary-row">
        <span class="risk-chip">${escapeHTML(rangeText)}</span>
        <span class="risk-chip">Monitoreos: <strong>${totalMon}</strong></span>
      </div>
    `;
  }

  if (!totalMon) {
    riskItems.innerHTML = `<div class="small">No hay monitoreos para este periodo.</div>`;
    return;
  }

  const analysis = buildItemsAnalysis(regs);
  const top = analysis.slice(0, 6);

  if (!top.length) {
    riskItems.innerHTML = `<div class="small">No hay ítems observados en este periodo.</div>`;
    return;
  }

  riskItems.innerHTML = top
    .map((it, idx) => {
      const pct = clamp(it.errorPct, 0, 100);
      return `
        <button class="risk-item" type="button" data-item="${escapeHTML(it.name)}" data-index="${idx}">
          <div class="risk-item-top">
            <div class="risk-item-name">${escapeHTML(it.name)}</div>
            <div class="risk-item-metrics">
              <span class="risk-metric"><strong>${it.errorPct}%</strong> error</span>
              <span class="risk-metric">↓ <strong>${it.impactoProm}</strong> pts/mon</span>
            </div>
          </div>
          <div class="risk-bar">
            <div class="risk-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="risk-item-bottom">
            <span>${it.count}/${it.totalMon} monitoreos</span>
            <span>↓ prom fallo: ${it.avgDeductWhenFails} pts</span>
          </div>
        </button>
      `;
    })
    .join("");

  // Click -> modal detalle
  riskItems.querySelectorAll(".risk-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-item") || "";
      const regsNow = getRegistrosForItemsFilter();
      const analysisNow = buildItemsAnalysis(regsNow);
      const found = analysisNow.find((x) => x.name === name);
      if (found) openItemDetailModal(found, regsNow);
    });
  });
}

/* ------------------------------
   MODAL DETALLE ÍTEM (dinámico)
------------------------------ */
let itemOverlayEl = null;

function ensureItemModal() {
  if (itemOverlayEl) return;

  itemOverlayEl = document.createElement("div");
  itemOverlayEl.id = "itemOverlay";
  itemOverlayEl.className = "dialog-backdrop";
  itemOverlayEl.setAttribute("aria-hidden", "true");

  itemOverlayEl.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <div>
          <h2 id="itemTitle">Detalle del ítem</h2>
          <p id="itemSubtitle" class="dialog-subtitle"></p>
        </div>
        <button id="itemClose" class="icon-button" type="button">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="dialog-body">
        <div id="itemBody"></div>
      </div>
    </div>
  `;

  document.body.appendChild(itemOverlayEl);

  const closeBtn = itemOverlayEl.querySelector("#itemClose");
  if (closeBtn) closeBtn.addEventListener("click", closeItemModal);

  itemOverlayEl.addEventListener("click", (ev) => {
    if (ev.target === itemOverlayEl) closeItemModal();
  });
}

function openItemDetailModal(item, registrosFiltrados) {
  ensureItemModal();

  const title = itemOverlayEl.querySelector("#itemTitle");
  const subtitle = itemOverlayEl.querySelector("#itemSubtitle");
  const bodyEl = itemOverlayEl.querySelector("#itemBody");

  const rangeText = (() => {
    const y = itemsFilter.year;
    const m = itemsFilter.month;
    if (itemsFilter.weekIndex === "" || !itemsWeeks[itemsFilter.weekIndex]) {
      return `${monthNameEs(m)} ${y}`;
    }
    const w = itemsWeeks[itemsFilter.weekIndex];
    return `${monthNameEs(m)} ${y} · Semana S${Number(itemsFilter.weekIndex) + 1} (${w.start}-${w.end})`;
  })();

  if (title) title.textContent = item.name;
  if (subtitle) subtitle.textContent = `${rangeText} · ${item.count}/${item.totalMon} monitoreos con error`;

  // Motivos (top)
  const motivosArr = Array.from(item.motivos.entries())
    .map(([k, v]) => ({ motivo: k, count: v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const motivosHtml = motivosArr.length
    ? `
      <div class="section-title">Motivos más frecuentes</div>
      <div class="section-content">
        <ul class="risk-motivos">
          ${motivosArr
            .map(
              (m) => `<li><strong>${m.count}</strong> · ${escapeHTML(m.motivo)}</li>`
            )
            .join("")}
        </ul>
      </div>
    `
    : `
      <div class="section-title">Motivos</div>
      <div class="section-content"><em>No hay detalle registrado.</em></div>
    `;

  // Ejemplos
  const ejemplosHtml = item.ejemplos.length
    ? `
      <div class="section-title">Ejemplos (últimos)</div>
      <div class="section-content">
        <div class="risk-examples">
          ${item.ejemplos
            .map((e) => {
              return `
                <div class="risk-example">
                  <div class="risk-example-top">
                    <span class="risk-chip">ID: ${escapeHTML(e.id)}</span>
                    <span class="risk-chip">Nota: ${escapeHTML(String(e.nota))}%</span>
                  </div>
                  <div class="small">${escapeHTML(e.fecha.toLocaleString("es-PE"))}</div>
                  ${e.registrador ? `<div class="small">Por: ${escapeHTML(e.registrador)}</div>` : ""}
                </div>
              `;
            })
            .join("")}
        </div>
        <div class="small" style="margin-top:8px;color:var(--color-on-surface-variant)">
          *Los ejemplos son informativos. El detalle completo se ve entrando al documento desde la tabla.
        </div>
      </div>
    `
    : "";

  const metricsHtml = `
    <div class="kpi-grid" style="margin-top:6px">
      <div class="kpi-card">
        <div class="kpi-label">Monitoreos</div>
        <div class="kpi-value">${item.totalMon}</div>
      </div>
      <div class="kpi-card kpi-bad">
        <div class="kpi-label">Errores</div>
        <div class="kpi-value">${item.count}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">% Error</div>
        <div class="kpi-value">${item.errorPct}%</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Impacto (pts/mon)</div>
        <div class="kpi-value">↓ ${item.impactoProm}</div>
      </div>
    </div>
  `;

  if (bodyEl) {
    bodyEl.innerHTML = `
      ${metricsHtml}
      ${motivosHtml}
      ${ejemplosHtml}
    `;
  }

  itemOverlayEl.classList.add("open");
  itemOverlayEl.setAttribute("aria-hidden", "false");
}

function closeItemModal() {
  if (!itemOverlayEl) return;
  itemOverlayEl.classList.remove("open");
  itemOverlayEl.setAttribute("aria-hidden", "true");
}
