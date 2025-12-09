// js/portal_agente.js
// Portal del Agente – Material 3, modo claro/oscuro, modal y firmas sin duplicar
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
  if (value.toDate) return value.toDate(); // Timestamp
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatearFechaLarga(fecha) {
  const f = toJSDate(fecha);
  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  let str = f.toLocaleDateString("es-PE", opts);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ------------------------------
   ESTADO GLOBAL DEL PORTAL
------------------------------ */

const auth = getAuth(app);

let currentUser = null;
let currentRole = null;
let currentAdvisorName = ""; // nombre del asesor vinculado al agente

let currentID = null;
let currentCollection = null; // "registros" o "refuerzos_calidad"
let currentDocData = null;
let signatureData = null; // data_url de la firma

// Para mini-dashboard
let ultimosFeedbacks = [];

// Firma / logo de Alex
const FIRMA_ALEX_URL =
  "https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media";

/* ------------------------------
   REFERENCIAS DOM
------------------------------ */

const tbody = document.querySelector("#agentTable tbody");
const pendingBadgeEl = document.getElementById("pendingBadge");

const avgEl = document.getElementById("avgScore");
const totalEl = document.getElementById("totalFb");
const okEl = document.getElementById("okCount");
const badEl = document.getElementById("badCount");

const selTipoDoc = document.getElementById("selTipoDoc");
const selRegistrador = document.getElementById("selRegistrador");

// Modal detalle
const detailModal = document.getElementById("detailModal");
const feedbackDiv = document.getElementById("feedbackInfo");
const detailTitle = document.getElementById("detailTitle");
const editableZone = document.getElementById("editableZone");
const compromisoEl = document.getElementById("compromiso");
const agentMsgEl = document.getElementById("agentMsg");
const signaturePreview = document.getElementById("signaturePreview");
const btnCloseModal = document.getElementById("btnCloseModal");

// Modal firma
const signatureModal = document.getElementById("signatureModal");
const sigCanvas = document.getElementById("sigCanvas");
const sigCtx = sigCanvas ? sigCanvas.getContext("2d") : null;

// Botones firma
const btnDraw = document.getElementById("btnDraw");
const btnUpload = document.getElementById("btnUpload");
const fileSignatureInput = document.getElementById("fileSignature");
const btnSave = document.getElementById("btnSave");
const btnClear = document.getElementById("btnClear");
const btnUse = document.getElementById("btnUse");
const btnCloseSig = document.getElementById("btnCloseSig");

// Tema + logout
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const btnLogout = document.getElementById("btnLogout");
const agentNameSpan = document.getElementById("agentNameSpan");

/* ------------------------------
   TEMA (CLARO / OSCURO)
------------------------------ */

function applyTheme(theme) {
  const html = document.documentElement;
  html.setAttribute("data-theme", theme);
  themeIcon.textContent = theme === "dark" ? "light_mode" : "dark_mode";
  try {
    localStorage.setItem("pa-theme", theme);
  } catch {
    // ignore
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme") || "light";
  applyTheme(current === "light" ? "dark" : "light");
}

(function initThemeFromStorage() {
  try {
    const stored = localStorage.getItem("pa-theme");
    if (stored === "dark" || stored === "light") {
      applyTheme(stored);
    }
  } catch {
    // ignore
  }
})();

/* ------------------------------
   AUTH + ROL AGENTE
------------------------------ */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  currentUser = user;

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
    currentRole = data.rol || data.role || "";
    currentAdvisorName =
      data.nombreAsesor ||
      data.nombreMostrar ||
      data.nombre ||
      data.displayName ||
      "";

    const allowedRoles = ["agente"]; // puedes añadir "admin" para pruebas
    if (!allowedRoles.includes(currentRole)) {
      alert("No tienes acceso al Portal del Agente.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    if (agentNameSpan) {
      agentNameSpan.textContent =
        currentAdvisorName || currentUser.email || "(Agente)";
    }

    if (!currentAdvisorName) {
      alert(
        "Tu usuario no tiene configurado el nombre de asesor (campo 'nombreAsesor' en la colección 'usuarios')."
      );
      return;
    }

    await loadAgentList();
  } catch (err) {
    console.error("Error al validar rol del usuario:", err);
    alert("Error al validar tus permisos. Intenta más tarde.");
    await signOut(auth);
    location.href = "login.html";
  }
});

/* ------------------------------
   DASHBOARD STATS
------------------------------ */

function renderDashboard() {
  if (!avgEl || !totalEl || !okEl || !badEl) return;

  if (!ultimosFeedbacks.length) {
    avgEl.textContent = "–";
    totalEl.textContent = "–";
    okEl.textContent = "–";
    badEl.textContent = "–";
    return;
  }

  const notas = ultimosFeedbacks
    .map((f) => Number(f.bruto?.nota || 0))
    .filter((n) => !Number.isNaN(n));

  const total = notas.length;
  const suma = notas.reduce((t, n) => t + n, 0);
  const promedio = total ? Math.round((suma / total) * 10) / 10 : 0;
  const aprobados = notas.filter((n) => n >= 85).length;
  const noAprobados = total - aprobados;

  avgEl.textContent = `${promedio}%`;
  totalEl.textContent = String(total);
  okEl.textContent = String(aprobados);
  badEl.textContent = String(noAprobados);
}

/* ------------------------------
   BADGE PENDIENTES
------------------------------ */

function updatePendingBadge(list) {
  if (!pendingBadgeEl) return;
  const pend = list.filter(
    (x) => (x.estado || "").toUpperCase() === "PENDIENTE"
  ).length;

  pendingBadgeEl.innerHTML = pend
    ? `<span>${pend} pendientes</span>`
    : "";
}

/* ------------------------------
   CARGAR LISTA DE DOCUMENTOS
------------------------------ */

async function loadAgentList() {
  if (!tbody) return;

  const tipoDoc = selTipoDoc?.value || "registros";
  const filtroRegistrador = selRegistrador?.value || "";

  currentCollection = tipoDoc;

  if (!currentAdvisorName) {
    tbody.innerHTML =
      "<tr><td colspan='5'>Tu usuario no tiene configurado el nombre de asesor.</td></tr>";
    updatePendingBadge([]);
    if (detailModal) detailModal.classList.remove("pa-open");
    return;
  }

  const list = [];

  if (tipoDoc === "registros") {
    // Feedbacks
    const qRef = query(
      collection(db, "registros"),
      where("asesor", "==", currentAdvisorName)
    );
    const snap = await getDocs(qRef);
    snap.forEach((d) => {
      const r = d.data();
      const fecha = toJSDate(r.fecha);
      list.push({
        id: d.id,
        collection: "registros",
        fecha,
        detalle: `${r.nota ?? 0}% Feedback`,
        estado: r.estado || "PENDIENTE",
        registradoPor: r.registrado_por || r.registradoPor || "No especificado",
        etiqueta: "Feedback",
        bruto: r,
      });
    });

    ultimosFeedbacks = list.slice();
    renderDashboard();
  } else {
    // Refuerzos / capacitaciones
    const snap = await getDocs(collection(db, "refuerzos_calidad"));
    snap.forEach((d) => {
      const r = d.data();
      const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
      const pertenece = asesoresRef.some(
        (a) => a.nombre === currentAdvisorName
      );
      if (!pertenece) return;

      const firmas = Array.isArray(r.firmas) ? r.firmas : [];
      const firmaAgente = firmas.find((f) => f.nombre === currentAdvisorName);
      const estadoAgente =
        firmaAgente && firmaAgente.url ? "COMPLETADO" : "PENDIENTE";
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
  }

  // Ordenar por fecha desc
  list.sort((a, b) => b.fecha - a.fecha);

  updatePendingBadge(list);

  const filtrada = filtroRegistrador
    ? list.filter((x) => x.registradoPor === filtroRegistrador)
    : list;

  if (!filtrada.length) {
    tbody.innerHTML = "<tr><td colspan='5'>Sin registros para este filtro.</td></tr>";
    return;
  }

  tbody.innerHTML = filtrada
    .map(
      (r) => `
        <tr>
          <td>${escapeHTML(r.id)}</td>
          <td>${escapeHTML(r.fecha.toLocaleString("es-PE"))}</td>
          <td>
            ${escapeHTML(r.detalle)}
            <span class="tag-doc">${escapeHTML(r.etiqueta)}</span>
          </td>
          <td>${escapeHTML(r.estado)}</td>
          <td style="text-align:right">
            <button
              class="pa-filled-button"
              data-open-detail="1"
              data-collection="${escapeHTML(r.collection)}"
              data-id="${escapeHTML(r.id)}"
            >
              Abrir
            </button>
          </td>
        </tr>
      `
    )
    .join("");
}

/* ------------------------------
   DETALLE DOCUMENTO
------------------------------ */

async function openDetail(collectionName, id) {
  currentCollection = collectionName;
  currentID = id;

  if (
    !detailModal ||
    !feedbackDiv ||
    !editableZone ||
    !agentMsgEl
  ) {
    return;
  }

  if (!currentAdvisorName) {
    alert("No se encontró el nombre del asesor asociado a tu usuario.");
    return;
  }

  const snap = await getDoc(doc(db, collectionName, id));
  if (!snap.exists()) {
    alert("No existe este registro.");
    return;
  }

  const r = snap.data();
  currentDocData = r;
  signatureData = null;
  agentMsgEl.textContent = "";
  agentMsgEl.style.color = "";

  if (collectionName === "registros") {
    // ===== DETALLE FEEDBACK =====
    if (detailTitle) {
      detailTitle.textContent = "Detalle del Feedback";
    }
    const fecha = toJSDate(r.fecha);
    const esReafirmacion = Number(r.nota) === 100;
    const titulo = esReafirmacion ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";
    const dniGC = r.gc ? r.gc.replace(/[^0-9]/g, "") : "-";

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
          <img src="${escapeHTML(
            im.url
          )}" style="width:100%;max-width:680px;margin-top:8px;border-radius:6px">
        `
        )
        .join("") || "<em>Sin evidencias adjuntas</em>";

    const registrador = r.registrado_por || r.registradoPor || "No especificado";

    feedbackDiv.innerHTML = `
      <div class="pa-letter-header">
        <div class="pa-letter-title">${escapeHTML(titulo)}</div>
        <img src="${FIRMA_ALEX_URL}" alt="Firma Calidad" style="max-height:40px" />
      </div>

      <p>
        Por medio de la presente se deja constancia que el
        <strong>${escapeHTML(formatearFechaLarga(fecha))}</strong> se realiza una
        <strong>${escapeHTML(titulo)}</strong> al/la colaborador(a)
        <strong>${escapeHTML(r.asesor || "")}</strong> con DNI
        <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de Asesor(a)
        Financiero(a), para el cumplimiento de los parámetros de la llamada.
      </p>

      <p>
        Registrado por:
        <span class="pa-pill">${escapeHTML(registrador)}</span>
      </p>

      <div class="pa-section-title">Cliente</div>
      <div class="pa-section-content">
        <div><strong>DNI:</strong> ${escapeHTML(r.cliente?.dni || "")}</div>
        <div><strong>Nombre:</strong> ${escapeHTML(r.cliente?.nombre || "")}</div>
        <div><strong>Teléfono:</strong> ${escapeHTML(r.cliente?.tel || "")}</div>
        <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "")}</div>
        <div><strong>Comentario:</strong> ${escapeHTML(
          r.observacionCliente || ""
        )}</div>
      </div>

      <div class="pa-section-title">Gestión monitoreada</div>
      <div class="pa-section-content">
        <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "")}</div>
        <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "")}</div>
        <div><strong>Tipo:</strong> ${escapeHTML(r.tipo || "")}</div>
        <div style="margin-top:6px">
          <strong>Resumen:</strong>
          <div class="pa-resumen-box">
            ${escapeHTML(r.resumen || "")}
          </div>
        </div>
      </div>

      <div class="pa-section-title">Ítems observados</div>
      <div class="pa-section-content">
        ${itemsHtml}
      </div>

      <div class="pa-section-title">Nota obtenida</div>
      <div class="pa-section-content">
        <div class="pa-nota-row">
          <div class="pa-nota-pill${
            (r.nota || 0) < 85 ? " pa-nota-pill-bad" : ""
          }">
            ${escapeHTML((r.nota || 0).toString())}%
          </div>
          <div class="pa-nota-estado">
            Estado: <strong>${escapeHTML(r.estado || "PENDIENTE")}</strong>
          </div>
        </div>
      </div>

      <div class="pa-section-title">Compromiso del agente</div>
      <div class="pa-section-content">
        ${
          r.compromiso
            ? escapeHTML(r.compromiso)
            : "<em>Pendiente de completar por el agente.</em>"
        }
      </div>

      <div class="pa-section-title">Evidencias</div>
      <div class="pa-section-content">
        ${imgsHtml}
      </div>
    `;

    if ((r.estado || "").toUpperCase() === "COMPLETADO") {
      editableZone.style.display = "none";
      agentMsgEl.style.color = "#16a34a";
      agentMsgEl.textContent = "Este feedback ya fue completado.";
    } else {
      editableZone.style.display = "block";
      if (compromisoEl) compromisoEl.value = r.compromiso || "";
      signatureData = r.firmaUrl || null;
      updateSignaturePreview();
    }
  } else {
    // ===== DETALLE REFUERZO =====
    if (detailTitle) {
      detailTitle.textContent = "Detalle del Refuerzo / Capacitación";
    }

    const fechaRef = toJSDate(r.fechaRefuerzo);
    const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
    const firmas = Array.isArray(r.firmas) ? r.firmas : [];

    const asesoresTexto = asesoresRef.length
      ? asesoresRef
          .map((a) =>
            a.gc
              ? `${escapeHTML(a.nombre)} (${escapeHTML(a.gc)})`
              : escapeHTML(a.nombre)
          )
          .join(", ")
      : escapeHTML(r.publico || "—");

    const firmaAgente = firmas.find((f) => f.nombre === currentAdvisorName);
    const compromisoAgente = firmaAgente?.compromiso || "";
    const firmaUrlAgente = firmaAgente?.url || null;
    const fechaFirma = firmaAgente?.fechaFirma
      ? new Date(firmaAgente.fechaFirma).toLocaleString("es-PE")
      : "";

    feedbackDiv.innerHTML = `
      <div class="pa-letter-header">
        <div class="pa-letter-title">Refuerzo / Capacitación</div>
        <img src="${FIRMA_ALEX_URL}" alt="Firma Calidad" style="max-height:40px" />
      </div>

      <p>
        Se deja constancia que el
        <strong>${escapeHTML(formatearFechaLarga(fechaRef))}</strong> se realizó un
        <strong>${escapeHTML(r.tipo || "refuerzo / capacitación")}</strong>
        sobre <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
      </p>

      <p class="pa-section-content">
        ${asesoresTexto}
      </p>

      <p>
        Responsable de la sesión:
        <span class="pa-pill">${escapeHTML(
          r.responsable || "Calidad & Formación"
        )}</span>
      </p>

      <div class="pa-section-title">Objetivo del refuerzo</div>
      <div class="pa-section-content">
        ${escapeHTML(r.objetivo || "—")}
      </div>

      <div class="pa-section-title">Detalle / acuerdos clave</div>
      <div class="pa-section-content">
        ${escapeHTML(r.detalle || "—")}
      </div>

      <div class="pa-section-title">Compromiso del agente</div>
      <div class="pa-section-content">
        ${
          compromisoAgente
            ? escapeHTML(compromisoAgente)
            : "<em>Pendiente de completar por el agente.</em>"
        }
      </div>

      <div class="pa-section-title">Firma actual del agente</div>
      <div class="pa-section-content">
        ${
          firmaUrlAgente
            ? `<img src="${escapeHTML(
                firmaUrlAgente
              )}" style="max-width:260px;border-radius:10px;border:1px solid #e5e7eb;margin-top:6px">
               <div class="pa-nota-estado">Fecha de firma: ${escapeHTML(
                 fechaFirma
               )}</div>`
            : "<em>Sin firma registrada.</em>"
        }
      </div>
    `;

    if (firmaUrlAgente && compromisoAgente) {
      editableZone.style.display = "none";
      agentMsgEl.style.color = "#16a34a";
      agentMsgEl.textContent = "Este refuerzo ya fue firmado por este agente.";
    } else {
      editableZone.style.display = "block";
      if (compromisoEl) compromisoEl.value = compromisoAgente || "";
      signatureData = firmaUrlAgente || null;
      updateSignaturePreview();
    }
  }

  // Abrir modal
  detailModal.classList.add("pa-open");
  detailModal.setAttribute("aria-hidden", "false");
}

/* ------------------------------
   PREVIEW DE FIRMA
------------------------------ */

function updateSignaturePreview() {
  if (!signaturePreview) return;
  if (signatureData) {
    signaturePreview.className = "pa-signature-preview";
    signaturePreview.innerHTML = `<img src="${signatureData}" alt="Firma del agente">`;
  } else {
    signaturePreview.className = "pa-signature-preview-empty";
    signaturePreview.textContent = "Sin firma seleccionada";
  }
}

/* ------------------------------
   GUARDAR FIRMA + COMPROMISO
   (firma única por usuario en Storage)
------------------------------ */

async function saveSignature() {
  if (!currentID || !currentCollection) {
    alert("No hay documento abierto.");
    return;
  }
  if (!currentUser) {
    alert("Sesión no válida.");
    return;
  }
  if (!compromisoEl || !agentMsgEl || !editableZone) return;

  const compromiso = compromisoEl.value.trim();
  if (!compromiso) {
    alert("El compromiso es obligatorio.");
    return;
  }
  if (!signatureData) {
    alert("Debes subir o dibujar una firma.");
    return;
  }

  agentMsgEl.style.color = "";
  agentMsgEl.textContent = "Guardando...";

  try {
    // Un archivo por usuario para evitar duplicados
    const uid = currentUser.uid || "sinuid";
    const pathFolder =
      currentCollection === "refuerzos_calidad" ? "firmas_refuerzos" : "firmas";
    const fileName = `${uid}.png`; // siempre el mismo → sobreescribe

    const sigRef = ref(storage, `${pathFolder}/${fileName}`);
    await uploadString(sigRef, signatureData, "data_url");
    const url = await getDownloadURL(sigRef);

    const docRef = doc(db, currentCollection, currentID);

    if (currentCollection === "registros") {
      // FEEDBACK
      await updateDoc(docRef, {
        compromiso,
        firmaUrl: url,
        estado: "COMPLETADO",
      });
      agentMsgEl.style.color = "#16a34a";
      agentMsgEl.textContent = "Feedback completado ✓";
    } else {
      // REFUERZOS
      const snap = await getDoc(docRef);
      const data = snap.data() || {};
      const firmas = Array.isArray(data.firmas) ? data.firmas : [];
      const nowIso = new Date().toISOString();

      const nuevasFirmas = firmas.map((f) => {
        if (f.nombre === currentAdvisorName) {
          return {
            ...f,
            url,
            fechaFirma: nowIso,
            compromiso,
          };
        }
        return f;
      });

      const allFirmados =
        nuevasFirmas.length > 0 && nuevasFirmas.every((f) => f.url);

      await updateDoc(docRef, {
        firmas: nuevasFirmas,
        firmado: allFirmados,
        firmaNombre: currentAdvisorName,
        firmaFecha: nowIso,
        agenteNombre: currentAdvisorName,
      });

      agentMsgEl.style.color = "#16a34a";
      agentMsgEl.textContent = "Refuerzo firmado ✓";
    }

    editableZone.style.display = "none";
    await loadAgentList();
  } catch (e) {
    console.error(e);
    agentMsgEl.style.color = "#dc2626";
    agentMsgEl.textContent =
      "Error: Missing or insufficient permissions. (" + e.code + ")";
  }
}

/* ------------------------------
   CANVAS FIRMA
------------------------------ */

let drawing = false;

function getCanvasPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function openSignatureModal() {
  if (!signatureModal || !sigCtx || !sigCanvas) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  signatureModal.classList.add("pa-open");
  signatureModal.setAttribute("aria-hidden", "false");
}

function closeSignatureModal() {
  if (!signatureModal) return;
  signatureModal.classList.remove("pa-open");
  signatureModal.setAttribute("aria-hidden", "true");
}

function saveDrawnSignature() {
  if (!sigCanvas) return;
  signatureData = sigCanvas.toDataURL("image/png");
  updateSignaturePreview();
  closeSignatureModal();
}

function clearCanvas() {
  if (!sigCtx || !sigCanvas) return;
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
}

if (sigCanvas && sigCtx) {
  sigCanvas.addEventListener("mousedown", (e) => {
    drawing = true;
    sigCtx.beginPath();
    const p = getCanvasPos(e);
    sigCtx.moveTo(p.x, p.y);
  });

  sigCanvas.addEventListener("mouseup", () => {
    drawing = false;
  });

  sigCanvas.addEventListener("mouseleave", () => {
    drawing = false;
  });

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

  sigCanvas.addEventListener(
    "touchend",
    () => {
      drawing = false;
    },
    { passive: true }
  );

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

/* ------------------------------
   SUBIR IMAGEN DE FIRMA
------------------------------ */

function triggerUpload() {
  if (fileSignatureInput) fileSignatureInput.click();
}

if (fileSignatureInput) {
  fileSignatureInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
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
   EVENT LISTENERS
------------------------------ */

// Filtros
if (selTipoDoc) selTipoDoc.addEventListener("change", () => loadAgentList());
if (selRegistrador)
  selRegistrador.addEventListener("change", () => loadAgentList());

// Botón "Abrir" en tabla (delegación)
if (tbody) {
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-open-detail]");
    if (!btn) return;
    const collectionName = btn.getAttribute("data-collection");
    const id = btn.getAttribute("data-id");
    if (collectionName && id) {
      openDetail(collectionName, id);
    }
  });
}

// Cerrar modal detalle
if (btnCloseModal && detailModal) {
  btnCloseModal.addEventListener("click", () => {
    detailModal.classList.remove("pa-open");
    detailModal.setAttribute("aria-hidden", "true");
  });

  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
      detailModal.classList.remove("pa-open");
      detailModal.setAttribute("aria-hidden", "true");
    }
  });
}

// Firma: botones
if (btnDraw) btnDraw.addEventListener("click", openSignatureModal);
if (btnUpload) btnUpload.addEventListener("click", triggerUpload);
if (btnSave) btnSave.addEventListener("click", () => saveSignature());
if (btnClear) btnClear.addEventListener("click", clearCanvas);
if (btnUse) btnUse.addEventListener("click", saveDrawnSignature);
if (btnCloseSig)
  btnCloseSig.addEventListener("click", () => closeSignatureModal());

if (signatureModal) {
  signatureModal.addEventListener("click", (e) => {
    if (e.target === signatureModal) {
      closeSignatureModal();
    }
  });
}

// Tema
if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}

// Logout
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}

// Exportar algunas funciones si necesitas depurar desde consola
window._paDebug = {
  loadAgentList,
};
