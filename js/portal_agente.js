// js/portal_agente.js
// Portal del Agente M3 — Auth + rol "agente" + dashboard + firma reutilizable por UID
// + NUEVO: Aside "Ítems con mayor oportunidad" (risk panel) + popup detalle por ítem
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
   HELPERS GENERALES
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
  if (value.toDate) return value.toDate(); // Timestamp Firestore
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatearFechaLarga(fecha) {
  const f = toJSDate(fecha);
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  let str = f.toLocaleDateString("es-PE", opts);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function normalizeKey(str) {
  return (str ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
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

let signatureData = null; // data_url o url (preview)
let ultimosFeedbacks = []; // lista "list" de registros (para dashboard y risk)
let riskAgg = [];          // lista agregada para panel
let riskAggMap = new Map();// nameKey -> agg
let registradoresCache = []; // para llenar select sin perder selección

/* ------------------------------
   ELEMENTOS DOM
------------------------------ */
const body = document.body;

// Topbar
const agentNameSpan = document.getElementById("agentNameSpan");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const btnLogout = document.getElementById("btnLogout");

// Filtros + tabla
const selTipoDoc = document.getElementById("selTipoDoc");
const selRegistrador = document.getElementById("selRegistrador");
const tableBody = document.querySelector("#agentTable tbody");
const pendingBadge = document.getElementById("pendingBadge");

// KPIs
const avgScoreEl = document.getElementById("avgScore");
const totalFbEl = document.getElementById("totalFb");
const okCountEl = document.getElementById("okCount");
const badCountEl = document.getElementById("badCount");

// NUEVO: risk panel
const agentItemsRisk = document.getElementById("agentItemsRisk");

// Modal detalle doc
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

(function initTheme() {
  const storedTheme = localStorage.getItem("portalAgentTheme");
  if (storedTheme === "theme-dark" || storedTheme === "theme-light") {
    applyTheme(storedTheme);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "theme-dark" : "theme-light");
  }
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = body.classList.contains("theme-dark") ? "theme-dark" : "theme-light";
      applyTheme(current === "theme-dark" ? "theme-light" : "theme-dark");
    });
  }
})();

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

    await loadAgentList(); // primera carga
  } catch (err) {
    console.error("Error al cargar datos de usuario:", err);
    alert("Error al validar tus permisos. Intenta más tarde.");
    await signOut(auth);
    location.href = "login.html";
  }
});

/* ------------------------------
   LOGOUT
------------------------------ */
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } finally {
      location.href = "login.html";
    }
  });
}

/* ------------------------------
   DASHBOARD DEL AGENTE (KPIs)
------------------------------ */
function renderDashboardKPIs() {
  if (!avgScoreEl || !totalFbEl || !okCountEl || !badCountEl) return;

  const notas = ultimosFeedbacks
    .map((x) => Number(x?.bruto?.nota ?? x?.nota ?? 0))
    .filter((n) => !Number.isNaN(n));

  if (!notas.length) {
    avgScoreEl.textContent = "–";
    totalFbEl.textContent = "–";
    okCountEl.textContent = "–";
    badCountEl.textContent = "–";
    return;
  }

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
   BADGE DE PENDIENTES
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
   NUEVO: RISK PANEL (Ítems con mayor oportunidad)
   - errorRate = (feedbacks donde aparece el ítem) / (total feedbacks) * 100
   - debitAvg = promedio % débito del ítem (it.perc)
   - impactAvg ≈ debitAvg (representa cuánto baja ese ítem)
   - detalles: lista para popup (motivos + contexto)
------------------------------ */
function aggregateRiskFromFeedbacks(feedbackList) {
  const totalMonitoreos = feedbackList.length || 0;
  const map = new Map(); // key -> agg

  for (const row of feedbackList) {
    const r = row?.bruto || row || {};
    const fecha = toJSDate(r.fecha);
    const nota = Number(r.nota ?? 0) || 0;
    const tipo = r.tipo || "";
    const registrador = r.registradoPor || r.registrado_por || "";
    const docId = row?.id || "";

    const items = Array.isArray(r.items) ? r.items : [];
    // Queremos "por monitoreo": si un item aparece 2 veces en el mismo doc, cuenta 1 ocurrencia para errorRate.
    const seenInThisDoc = new Set();

    for (const it of items) {
      const nameRaw = (it?.name || "Sin nombre").toString().trim();
      if (!nameRaw) continue;

      const key = normalizeKey(nameRaw);
      const perc = Number(it?.perc ?? 0) || 0;
      const detail = (it?.detail ?? "").toString();

      if (!map.has(key)) {
        map.set(key, {
          key,
          name: nameRaw,
          appearDocs: 0,
          totalMentions: 0,
          sumPerc: 0,
          details: [],
        });
      }
      const agg = map.get(key);

      agg.totalMentions += 1;
      agg.sumPerc += perc;

      // detalles SIEMPRE (para explicar el motivo)
      if (detail) {
        agg.details.push({
          docId,
          fecha,
          nota,
          tipo,
          perc,
          registrador,
          detail,
        });
      }

      if (!seenInThisDoc.has(key)) {
        seenInThisDoc.add(key);
        agg.appearDocs += 1;
      }
    }
  }

  const list = Array.from(map.values()).map((x) => {
    const debitAvg = x.totalMentions ? Math.round((x.sumPerc / x.totalMentions) * 10) / 10 : 0;
    const errorRate = totalMonitoreos ? Math.round((x.appearDocs / totalMonitoreos) * 1000) / 10 : 0; // 1 decimal
    return {
      ...x,
      totalMonitoreos,
      debitAvg,
      errorRate,
      impactAvg: debitAvg, // “cantidad de nota que baja” (aprox por ocurrencia)
    };
  });

  // Ranking: primero por errorRate (peso principal), luego por debitAvg
  list.sort((a, b) => (b.errorRate - a.errorRate) || (b.debitAvg - a.debitAvg) || (b.appearDocs - a.appearDocs));
  return list;
}

function renderRiskPanel() {
  if (!agentItemsRisk) return;

  // solo aplica a feedbacks (registros)
  const tipoDoc = selTipoDoc?.value || "registros";
  if (tipoDoc !== "registros") {
    agentItemsRisk.innerHTML = `<div class="small">Disponible al ver “Feedback de calidad”.</div>`;
    return;
  }

  if (!ultimosFeedbacks.length) {
    agentItemsRisk.innerHTML = `<div class="small">Sin feedbacks para analizar.</div>`;
    return;
  }

  riskAgg = aggregateRiskFromFeedbacks(ultimosFeedbacks);
  riskAggMap = new Map(riskAgg.map((x) => [x.key, x]));

  const top = riskAgg.slice(0, 6); // puedes subir/bajar
  if (!top.length) {
    agentItemsRisk.innerHTML = `<div class="small">No hay ítems observados en tus feedbacks.</div>`;
    return;
  }

  agentItemsRisk.innerHTML = top
    .map((it) => {
      const pct = clamp(it.errorRate, 0, 100);
      const ocurr = `${it.appearDocs}/${it.totalMonitoreos}`;
      // “barrita”: usamos un div inline con width
      return `
        <button class="risk-item" type="button" data-risk-key="${escapeHTML(it.key)}" title="Ver detalle">
          <div class="risk-top">
            <div class="risk-name">${escapeHTML(it.name)}</div>
            <div class="risk-metrics">
              <span class="risk-pill">${escapeHTML(ocurr)}</span>
              <span class="risk-pill">↓ ${escapeHTML(it.debitAvg.toString())}%</span>
            </div>
          </div>
          <div class="risk-bar">
            <div class="risk-bar-fill" style="width:${pct}%;"></div>
          </div>
          <div class="risk-foot small">
            <b>${escapeHTML(it.errorRate.toString())}%</b> de tus monitoreos tienen este ítem
          </div>
        </button>
      `;
    })
    .join("");

  // clicks
  agentItemsRisk.querySelectorAll(".risk-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-risk-key") || "";
      const item = riskAggMap.get(key);
      if (item) openRiskDetailModal(item);
    });
  });
}

/* ------------------------------
   NUEVO: MODAL DETALLE ÍTEM (dinámico, no necesitas editar HTML)
------------------------------ */
let riskOverlayEl = null;

function ensureRiskModal() {
  if (riskOverlayEl) return riskOverlayEl;

  const wrap = document.createElement("div");
  wrap.id = "riskOverlay";
  wrap.className = "dialog-backdrop";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = `
    <div class="dialog" role="dialog" aria-modal="true">
      <div class="dialog-header">
        <div>
          <h2 id="riskTitle">Detalle del ítem</h2>
          <p id="riskSubtitle" class="dialog-subtitle"></p>
        </div>
        <button id="riskClose" class="icon-button" type="button" title="Cerrar">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="dialog-body" id="riskBody"></div>
    </div>
  `;
  document.body.appendChild(wrap);
  riskOverlayEl = wrap;

  // cerrar: botón + backdrop
  const btn = wrap.querySelector("#riskClose");
  btn?.addEventListener("click", closeRiskDetailModal);
  wrap.addEventListener("click", (ev) => {
    if (ev.target === wrap) closeRiskDetailModal();
  });

  return wrap;
}

function openRiskDetailModal(itemAgg) {
  const overlay = ensureRiskModal();
  const title = overlay.querySelector("#riskTitle");
  const subtitle = overlay.querySelector("#riskSubtitle");
  const bodyEl = overlay.querySelector("#riskBody");

  if (title) title.textContent = `Detalle del ítem — ${itemAgg.name}`;
  if (subtitle) {
    subtitle.textContent = `${itemAgg.appearDocs}/${itemAgg.totalMonitoreos} monitoreos · ${itemAgg.errorRate}% · Promedio débito: ${itemAgg.debitAvg}%`;
  }

  const detalles = (itemAgg.details || []).slice().sort((a, b) => b.fecha - a.fecha);
  if (!bodyEl) return;

  bodyEl.innerHTML = detalles.length
    ? detalles
        .map((d) => {
          return `
            <div class="detail-card">
              <div class="detail-meta">
                <b>${escapeHTML(d.fecha.toLocaleString("es-PE"))}</b>
                · Nota ${escapeHTML((d.nota ?? 0).toString())}%
                · Ítem ${escapeHTML((d.perc ?? 0).toString())}%
                · ${escapeHTML(d.tipo || "—")}
                ${d.registrador ? `· <span class="pill">${escapeHTML(d.registrador)}</span>` : ""}
              </div>
              <div class="detail-text">${escapeHTML(d.detail)}</div>
              ${d.docId ? `<div class="small" style="margin-top:6px;opacity:.8;">ID: ${escapeHTML(d.docId)}</div>` : ""}
            </div>
          `;
        })
        .join("")
    : `<div class="small">No hay motivos/detalles registrados para este ítem.</div>`;

  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeRiskDetailModal() {
  const overlay = ensureRiskModal();
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

/* ------------------------------
   SELECT: Registradores (auto)
------------------------------ */
function fillRegistradoresSelect(listRows) {
  if (!selRegistrador) return;

  const prev = selRegistrador.value || "";
  const values = new Set();
  for (const x of listRows) {
    const r = x?.bruto || x || {};
    const reg = (r.registradoPor || r.registrado_por || "").toString().trim();
    if (reg) values.add(reg);
  }

  registradoresCache = Array.from(values).sort((a, b) => a.localeCompare(b, "es"));

  selRegistrador.innerHTML =
    `<option value="">Todos</option>` +
    registradoresCache.map((v) => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");

  // restaurar selección si existe
  if (prev && registradoresCache.includes(prev)) selRegistrador.value = prev;
}

/* ------------------------------
   CARGAR LISTA — REGISTROS / REFUERZOS (POR UID)
   (mantiene todas tus funciones anteriores)
------------------------------ */
async function loadAgentList() {
  if (!tableBody || !currentUser) return;

  const tipoDoc = selTipoDoc?.value || "registros";
  const filtroRegistrador = selRegistrador?.value || "";
  currentCollection = tipoDoc;

  const list = [];
  const myUid = currentUser.uid;

  if (tipoDoc === "registros") {
    // Preferimos asesorId == uid (nuevo esquema)
    const qRef = query(collection(db, "registros"), where("asesorId", "==", myUid));
    const snap = await getDocs(qRef);

    snap.forEach((d) => {
      const r = d.data();
      const fecha = toJSDate(r.fecha);
      list.push({
        id: d.id,
        collection: "registros",
        fecha,
        detalle: `${r.nota ?? 0}%`,
        estado: r.estado || "PENDIENTE",
        registradoPor: r.registradoPor || r.registrado_por || "No especificado",
        etiqueta: "Feedback",
        bruto: r,
      });
    });

    // ordenar por fecha desc
    list.sort((a, b) => b.fecha - a.fecha);

    // llena registradores dinámico (sin romper tu filtro)
    fillRegistradoresSelect(list);

    // aplica filtro registrador a tabla + KPIs + risk
    const filtrada = filtroRegistrador
      ? list.filter((x) => (x.registradoPor || "") === filtroRegistrador)
      : list;

    // Guardamos para dashboard/risk (respetando filtro)
    ultimosFeedbacks = filtrada.slice();
    renderDashboardKPIs();
    renderRiskPanel();

    updatePendingBadge(filtrada);

    // tabla
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

    return;
  }

  // =============== REFUERZOS ===============
  const snap = await getDocs(collection(db, "refuerzos_calidad"));
  snap.forEach((d) => {
    const r = d.data();

    const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
    const pertenece = asesoresRef.some(
      (a) =>
        (a.asesorId && a.asesorId === myUid) ||
        a.nombre === currentAdvisorName
    );
    if (!pertenece) return;

    const firmas = Array.isArray(r.firmas) ? r.firmas : [];
    const firmaAgente = firmas.find(
      (f) =>
        (f.asesorId && f.asesorId === myUid) ||
        f.nombre === currentAdvisorName
    );
    const estadoAgente = firmaAgente && firmaAgente.url ? "COMPLETADO" : "PENDIENTE";
    const fecha = toJSDate(r.fechaRefuerzo);

    list.push({
      id: d.id,
      collection: "refuerzos_calidad",
      fecha,
      detalle: r.tema || r.tipo || "Refuerzo / Capacitación",
      estado: estadoAgente,
      registradoPor: r.responsable || "No especificado",
      etiqueta: "Refuerzo",
      bruto: r,
    });
  });

  list.sort((a, b) => b.fecha - a.fecha);

  // para refuerzos: KPIs quedan, risk panel avisa
  ultimosFeedbacks = [];
  renderDashboardKPIs();
  renderRiskPanel();

  // llenamos registradores en modo refuerzos también (por si filtras)
  fillRegistradoresSelect(list);

  const filtrada = (selRegistrador?.value || "")
    ? list.filter((x) => (x.registradoPor || "") === (selRegistrador.value || ""))
    : list;

  updatePendingBadge(filtrada);

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

/* ------------------------------
   EVENTOS TABLA — ABRIR DETALLE
------------------------------ */
if (tableBody) {
  tableBody.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-doc-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-doc-id");
    const collectionName = btn.getAttribute("data-collection");
    if (id && collectionName) openDetail(collectionName, id);
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
  currentDocData = null;

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
   CARGAR DETALLE DE UN DOCUMENTO
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

  if (collectionName === "registros") renderDetailFeedback(r);
  else renderDetailRefuerzo(r);

  openDetailModal();
}

/* ------------------------------
   RENDER DETALLE FEEDBACK
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
            <div style="margin-left:8px">
              ${escapeHTML(it.detail || "")}
            </div>
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
      Registrado por:
      <span class="pill">${escapeHTML(registrador)}</span>
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
      <div class="nota-estado">Estado: <strong>${escapeHTML(r.estado || "PENDIENTE")}</strong></div>
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
   RENDER DETALLE REFUERZO
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
      Se deja constancia que el
      <strong>${escapeHTML(formatearFechaLarga(fechaRef))}</strong>
      se realizó un <strong>${escapeHTML(r.tipo || "refuerzo / capacitación")}</strong>
      sobre <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
    </p>

    <p class="section-content">${asesoresTexto}</p>

    <p style="font-size:13px;">
      Responsable de la sesión:
      <span class="pill">${escapeHTML(r.responsable || "Calidad & Formación")}</span>
    </p>

    <div class="section-title">Objetivo del refuerzo</div>
    <div class="section-content">${escapeHTML(r.objetivo || "—")}</div>

    <div class="section-title">Detalle / acuerdos clave</div>
    <div class="section-content">${escapeHTML(r.detalle || "—")}</div>

    <div class="section-title">Compromiso del agente</div>
    <div class="section-content">${compromisoAgente ? escapeHTML(compromisoAgente) : "<em>Pendiente</em>"}</div>

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
   GUARDAR COMPROMISO + FIRMA
   (Evita duplicar archivos: un archivo por UID)
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
    let pathFolder = currentCollection === "refuerzos_calidad" ? "firmas_refuerzos" : "firmas";
    const fileName = `${currentUser.uid}.png`;
    const sigRef = ref(storage, `${pathFolder}/${fileName}`);

    // Sube / sobrescribe la firma única por UID
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
    await loadAgentList();
  } catch (err) {
    console.error(err);
    agentMsg.style.color = "#dc2626";
    agentMsg.textContent = "Error al guardar: " + (err?.message || err);
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
      sigCtx.lineWidth = 2;
      sigCtx.lineCap = "round";
      sigCtx.strokeStyle = "#000000";
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
   SUBIR ARCHIVO DE FIRMA
------------------------------ */
if (btnUpload && fileSignature) {
  btnUpload.addEventListener("click", () => fileSignature.click());
  fileSignature.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      signatureData = ev.target.result;
      updateSignaturePreview();
    };
    reader.readAsDataURL(file);
  });
}

/* ------------------------------
   LISTENERS DE FILTROS
------------------------------ */
if (selTipoDoc) selTipoDoc.addEventListener("change", loadAgentList);
if (selRegistrador) selRegistrador.addEventListener("change", loadAgentList);

/* ------------------------------
   INIT: si el auth ya validó, loadAgentList() corre ahí.
   (no hacemos doble init para evitar duplicados)
------------------------------ */
