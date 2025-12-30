// js/visualizacion_feedback.js
"use strict";

function assertPdfLibs() {
  if (typeof window.html2canvas !== "function") {
    alert("html2canvas no está cargado. Revisa el CDN.");
    return false;
  }
  if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") {
    alert("jsPDF no está cargado correctamente (CSP / CDN).");
    return false;
  }
  return true;
}


/* =====================================================================
   VISUALIZACIÓN FEEDBACK — M3
   - No usa colección "asesores"
   - Filtro de asesores incluye "— Todos —"
   - Click "Ver" abre detalle en MODAL (no abajo)
   - Exportar PDF en popup + descargar
   - CSP friendly (sin inline scripts; este archivo debe cargarse como module)
   ===================================================================== */

/* -------------------- IMPORTS FIREBASE (SDK v9) -------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* -------------------- FIREBASE CONFIG -------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.firebasestorage.app",
};

/* -------------------- INIT FIREBASE -------------------- */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* -------------------- ROLES PERMITIDOS -------------------- */
const SUPERVISOR_EMAILS = [
  "anunez@gefectiva.com",
  "ctorres@gefectiva.com",
  "kvital@gefectiva.com",
].map((e) => String(e).toLowerCase().trim());

/* -------------------- CONSTANTES UI -------------------- */
const ALL_VALUE = "__ALL__";

/* -------------------- ESTADO -------------------- */
let registros = [];
let registrosById = new Map();
let currentFeedbackId = null;

/* -------------------- HELPERS DOM -------------------- */
function $(id) {
  return document.getElementById(id);
}

function createEl(tag, attrs = {}, html = "") {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") el.className = v;
    else if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, v);
  });
  if (html) el.innerHTML = html;
  return el;
}

/* -------------------- SEGURIDAD HTML (evitar inyección) -------------------- */
function escapeHTML(input) {
  const s = String(input ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------------------- FECHAS -------------------- */
function toDateSafe(value) {
  if (!value) return new Date();
  if (typeof value?.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatearFechaLarga(dateLike) {
  const d = toDateSafe(dateLike);
  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const s = d.toLocaleDateString("es-PE", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatearFechaHora(dateLike) {
  const d = toDateSafe(dateLike);
  return d.toLocaleString("es-PE");
}

/* -------------------- NOTA -------------------- */
function normalizarNota(nota) {
  const num = typeof nota === "number" ? nota : Number(nota || 0);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function formatNota(n) {
  const num = normalizarNota(n);
  const s = num.toFixed(1).replace(/\.0$/, "");
  return `${s}%`;
}

/* -------------------- ESTADO -------------------- */
/**
 * COMPLETADO cuando hay firmaUrl y compromiso.
 * Si no, PENDIENTE.
 */
function calcularEstado(r) {
  const tieneFirma = !!(r.firmaUrl && String(r.firmaUrl).trim());
  const tieneCompromiso = !!(r.compromiso && String(r.compromiso).trim());
  return tieneFirma && tieneCompromiso ? "COMPLETADO" : "PENDIENTE";
}

/* ---- Mapeo de cargo a frase profesional ---- */
function obtenerFraseCargo(cargo = "") {
  const key = String(cargo).trim().toUpperCase();
  const mapa = {
    "ASESOR INBOUND": "Asesor(a) de Atención Telefónica",
    "ASESOR REDES": "Asesor(a) de Redes Sociales",
    "ASESOR CORREOS": "Asesor(a) de Atención por Correo",
  };
  return mapa[key] || "Asesor(a)";
}

/* ---- Frase por canal según tipo ---- */
function obtenerFraseCanal(tipo = "") {
  const t = String(tipo).toUpperCase();
  if (t.includes("FACEBOOK") || t.includes("INSTAGRAM")) {
    return "para el cumplimiento de los parámetros de la atención en redes sociales.";
  }
  if (t.includes("CORREO") || t.includes("MAIL")) {
    return "para el cumplimiento de los parámetros de la atención por correo electrónico.";
  }
  return "para el cumplimiento de los parámetros de la llamada.";
}

/* =====================================================================
   DATA: CARGAR REGISTROS (colección "registros")
   ===================================================================== */
async function cargarRegistros() {
  registros = [];
  registrosById = new Map();

  const snap = await getDocs(collection(db, "registros"));
  snap.forEach((doc) => {
    const r = doc.data() || {};

    const fechaRaw =
      r.fecha ||
      r.fechaObj ||
      r.createdAt ||
      r.created_at ||
      new Date().toISOString();

    const fechaObj = toDateSafe(fechaRaw);

    const normalizado = {
      id: doc.id,
      idLlamada: r.idLlamada || "",
      idContacto: r.idContacto || "",
      asesorId: r.asesorId || "",
      asesor: r.asesor || "",
      gc: r.gc || "",
      cargo: r.cargo || "",
      cliente: r.cliente || {},
      tipificacion: r.tipificacion || "",
      observacionCliente: r.observacionCliente || "",
      resumen: r.resumen || "",
      tipo: r.tipo || "",
      items: Array.isArray(r.items) ? r.items : [],
      nota: normalizarNota(r.nota),
      imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],
      fechaObj,
      registradoPor: r.registradoPor || r.registrado_por || "",
      firmaUrl: r.firmaUrl || "",
      compromiso: r.compromiso || "",
    };

    normalizado.estado = r.estado || calcularEstado(normalizado);

    registros.push(normalizado);
    registrosById.set(normalizado.id, normalizado);
  });

  registros.sort((a, b) => b.fechaObj - a.fechaObj);
}

/* =====================================================================
   UI: SELECT ASESORES (SIN colección asesores)
   - incluye "— Todos —"
   ===================================================================== */
function cargarAsesoresFiltro() {
  const filtro = $("filtroAsesor");
  if (!filtro) return;

  const asesores = [...new Set(registros.map((r) => r.asesor).filter(Boolean))];
  asesores.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const options =
    `<option value="">— Selecciona un asesor —</option>` +
    `<option value="${ALL_VALUE}">— Todos —</option>` +
    asesores
      .map((a) => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`)
      .join("");

  filtro.innerHTML = options;

  // Por defecto: Todos
  filtro.value = ALL_VALUE;
}

/* =====================================================================
   UI: TABLA (sin columna ID visible)
   ===================================================================== */
function renderTabla() {
  const filtroAsesor = $("filtroAsesor");
  const filtroRegistrado = $("filtroRegistrado");
  const tabla = $("tablaFeedback");
  const vacio = $("tablaVaciaMsg");
  if (!filtroAsesor || !filtroRegistrado || !tabla || !vacio) return;

  const tbody = tabla.querySelector("tbody");
  if (!tbody) return;

  const asesorSel = filtroAsesor.value;
  const registradorSel = filtroRegistrado.value;

  tbody.innerHTML = "";

  // si es "" => “Selecciona un asesor”
  if (asesorSel === "") {
    tabla.style.display = "none";
    vacio.style.display = "none";
    return;
  }

  const filtrados = registros
    .filter((r) => (asesorSel === ALL_VALUE ? true : r.asesor === asesorSel))
    .filter((r) => (!registradorSel ? true : r.registradoPor === registradorSel));

  if (!filtrados.length) {
    tabla.style.display = "none";
    vacio.style.display = "block";
    return;
  }

  tabla.style.display = "table";
  vacio.style.display = "none";

  const rowsHtml = filtrados
    .map((r) => {
      const estado = calcularEstado(r);
      const estadoClass =
        estado === "COMPLETADO" ? "chip-estado done" : "chip-estado pending";

      return `
        <tr>
          <td>${escapeHTML(formatearFechaHora(r.fechaObj))}</td>
          <td>${escapeHTML(formatNota(r.nota))}</td>
          <td><span class="${estadoClass}">${escapeHTML(estado)}</span></td>
          <td>${escapeHTML(r.registradoPor || "-")}</td>
          <td>
            <button class="m3-btn primary btn-ver" type="button" data-id="${escapeHTML(r.id)}">
              Ver
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;
}

/* =====================================================================
   MODALES: Se crean si no existen en HTML
   - Modal detalle
   - Modal PDF (iframe)
   ===================================================================== */
function ensureModalsExist() {
  // ---------- Modal Detalle ----------
  let feedbackModal = $("feedbackModal");
  if (!feedbackModal) {
    feedbackModal = createEl("div", {
      id: "feedbackModal",
      class: "m3-modal-overlay",
      style:
        "display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:9999; padding:16px; overflow:auto;",
    });

    const modalCard = createEl("div", {
      class: "m3-modal-card",
      style:
        "max-width:980px; margin:24px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.25);",
    });

    const header = createEl(
      "div",
      {
        class: "m3-modal-header",
        style:
          "display:flex; justify-content:space-between; align-items:center; padding:14px 16px; border-bottom:1px solid #eee;",
      },
      `
        <div style="display:flex; gap:10px; align-items:center;">
          <div style="font-weight:700;">Detalle de Feedback</div>
          <div id="feedbackModalSub" style="font-size:12px; color:#666;"></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="feedbackModalPdfBtn" class="m3-btn primary" type="button" style="white-space:nowrap;">
            Exportar PDF
          </button>
          <button id="feedbackModalClose" class="m3-btn" type="button" style="white-space:nowrap;">
            Cerrar
          </button>
        </div>
      `
    );

    const body = createEl("div", {
      id: "feedbackModalBody",
      class: "m3-modal-body",
      style: "padding:16px;",
    });

    modalCard.appendChild(header);
    modalCard.appendChild(body);
    feedbackModal.appendChild(modalCard);
    document.body.appendChild(feedbackModal);

    // cerrar al click fuera
    feedbackModal.addEventListener("click", (e) => {
      if (e.target === feedbackModal) closeFeedbackModal();
    });
  }

  // ---------- Modal PDF ----------
  let pdfModal = $("pdfModal");
  if (!pdfModal) {
    pdfModal = createEl("div", {
      id: "pdfModal",
      class: "m3-modal-overlay",
      style:
        "display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10000; padding:16px; overflow:auto;",
    });

    const modalCard = createEl("div", {
      class: "m3-modal-card",
      style:
        "max-width:1000px; height: calc(100vh - 80px); margin:24px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.25); display:flex; flex-direction:column;",
    });

    const header = createEl(
      "div",
      {
        style:
          "display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-bottom:1px solid #eee;",
      },
      `
        <div style="font-weight:700;">Vista previa PDF</div>
        <div style="display:flex; gap:8px;">
          <a id="pdfDownloadLink" class="m3-btn primary" href="#" download="feedback.pdf" style="text-decoration:none;">
            Descargar
          </a>
          <button id="pdfModalClose" class="m3-btn" type="button">Cerrar</button>
        </div>
      `
    );

    const iframe = createEl("iframe", {
      id: "pdfIframe",
      style: "width:100%; height:100%; border:0; flex:1;",
      title: "PDF Preview",
    });

    modalCard.appendChild(header);
    modalCard.appendChild(iframe);
    pdfModal.appendChild(modalCard);
    document.body.appendChild(pdfModal);

    // cerrar al click fuera
    pdfModal.addEventListener("click", (e) => {
      if (e.target === pdfModal) closePdfModal();
    });
  }
}

/* -------------------- MODAL CONTROL -------------------- */
function openFeedbackModal() {
  const modal = $("feedbackModal");
  if (modal) modal.style.display = "block";
  // prevenir scroll del fondo
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";
}

function closeFeedbackModal() {
  const modal = $("feedbackModal");
  if (modal) modal.style.display = "none";
  // volver scroll
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
}

let _pdfObjectUrl = "";

function openPdfModal(url, filename) {
  const pdfModal = $("pdfModal");
  const pdfIframe = $("pdfIframe");
  const dl = $("pdfDownloadLink");

  if (!pdfModal || !pdfIframe || !dl) return;

  pdfIframe.src = url;
  dl.href = url;
  dl.setAttribute("download", filename || "feedback.pdf");

  pdfModal.style.display = "block";
}

function closePdfModal() {
  const pdfModal = $("pdfModal");
  const pdfIframe = $("pdfIframe");

  if (pdfIframe) pdfIframe.src = "";
  if (pdfModal) pdfModal.style.display = "none";

  // revocar objectURL anterior (evitar fuga memoria)
  if (_pdfObjectUrl) {
    try {
      URL.revokeObjectURL(_pdfObjectUrl);
    } catch (_) {}
    _pdfObjectUrl = "";
  }
}

/* =====================================================================
   DETALLE: Construye HTML del detalle (para modal)
   ===================================================================== */
function buildDetalleHTML(r) {
  const estado = calcularEstado(r);
  const esReaf = Number(r.nota) === 100;

  const dniGC = (r.gc || "").replace(/[^0-9]/g, "") || "—";
  const fraseCargo = obtenerFraseCargo(r.cargo);
  const fraseCanal = obtenerFraseCanal(r.tipo);

  const clienteDni = escapeHTML(r.cliente?.dni || "—");
  const clienteNombre = escapeHTML(r.cliente?.nombre || "—");
  const clienteTel = escapeHTML(r.cliente?.tel || "—");

  const itemsHtml =
    r.items && r.items.length
      ? r.items
          .map((it) => {
            const name = escapeHTML(it?.name || "");
            const perc = it?.perc ? `(${escapeHTML(it.perc)}%)` : "";
            const detailTxt = escapeHTML(it?.detail || "");
            return `
              <div class="item-block" style="margin:10px 0; padding:10px; border:1px solid #eee; border-radius:12px;">
                <strong>${name}</strong> ${perc}
                <div style="margin-top:6px;">${detailTxt}</div>
              </div>
            `;
          })
          .join("")
      : "<em>No se registraron ítems observados.</em>";

  // Para html2canvas: crossorigin + referrerpolicy
  const evidenciasHtml =
    r.imagenes && r.imagenes.length
      ? r.imagenes
          .map((img) => {
            const url = escapeHTML(img?.url || "");
            if (!url) return "";
            return `
              <img
                class="evidence-img"
                src="${url}"
                crossorigin="anonymous"
                referrerpolicy="no-referrer"
                alt="Evidencia"
                style="max-width:100%; border-radius:12px; margin:8px 0; border:1px solid #eee;"
              >
            `;
          })
          .join("")
      : "<em>Sin evidencias adjuntas.</em>";

  const firmaHtml = r.firmaUrl
    ? `
      <div class="firma-box" style="margin-top:8px; padding:12px; border:1px dashed #ccc; border-radius:12px;">
        <img
          src="${escapeHTML(r.firmaUrl)}"
          crossorigin="anonymous"
          referrerpolicy="no-referrer"
          alt="Firma del agente"
          style="max-width:100%; max-height:130px; object-fit:contain;"
        >
      </div>`
    : `<div class="firma-box" style="margin-top:8px; padding:12px; border:1px dashed #ccc; border-radius:12px;">Sin firma registrada</div>`;

  const subHeader = `
    <div style="margin:6px 0 0; font-size:12px; color:#666;">
      Estado: <b>${escapeHTML(estado)}</b> · Registrado por: <b>${escapeHTML(r.registradoPor || "No especificado")}</b> ·
      Fecha: <b>${escapeHTML(formatearFechaHora(r.fechaObj))}</b>
    </div>
  `;

  const titulo = esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";

  const html = `
    <div id="pdfExportArea" style="font-family: Arial, sans-serif;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <div style="font-size:18px; font-weight:800;">${escapeHTML(titulo)}</div>
          ${subHeader}
        </div>
      </div>

      <div style="margin-top:14px;">
        <p style="line-height:1.5; margin:0;">
          Por medio de la presente se deja constancia que el
          <strong>${escapeHTML(formatearFechaLarga(r.fechaObj))}</strong> se realiza una
          <strong>${escapeHTML(titulo)}</strong> al colaborador(a)
          <strong>${escapeHTML(r.asesor || "")}</strong> con GC <strong>${escapeHTML(r.gc || "—")}</strong> y DNI
          <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de
          <strong>${escapeHTML(fraseCargo)}</strong>, ${escapeHTML(fraseCanal)}
        </p>
      </div>

      <div style="margin-top:14px; font-weight:700;">Datos del monitoreo</div>
      <div style="margin-top:8px; padding:12px; border:1px solid #eee; border-radius:12px;">
        <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "—")}</div>
        <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "—")}</div>
        <div><strong>Tipo detectado:</strong> ${escapeHTML(r.tipo || "—")}</div>
      </div>

      <div style="margin-top:14px; font-weight:700;">Datos del cliente</div>
      <div style="margin-top:8px; padding:12px; border:1px solid #eee; border-radius:12px;">
        <div><strong>DNI:</strong> ${clienteDni}</div>
        <div><strong>Nombre:</strong> ${clienteNombre}</div>
        <div><strong>Teléfono:</strong> ${clienteTel}</div>
        <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "—")}</div>
        <div><strong>Comentario:</strong> ${escapeHTML(r.observacionCliente || "—")}</div>
      </div>

      <div style="margin-top:14px; font-weight:700;">Gestión monitoreada</div>
      <div style="margin-top:8px; padding:12px; border:1px solid #eee; border-radius:12px;">
        <strong>Resumen:</strong>
        <div style="margin-top:6px;">${escapeHTML(r.resumen || "—")}</div>
      </div>

      <div style="margin-top:14px; font-weight:700;">Ítems observados</div>
      <div style="margin-top:8px;">${itemsHtml}</div>

      <div style="margin-top:14px; font-weight:700;">Nota obtenida</div>
      <div style="margin-top:8px; padding:12px; border:1px solid #eee; border-radius:12px; display:inline-block;">
        <span style="font-weight:800;">${escapeHTML(formatNota(r.nota))}</span>
      </div>

      <div style="margin-top:14px; font-weight:700;">Compromiso del agente</div>
      <div style="margin-top:8px; padding:12px; border:1px solid #eee; border-radius:12px;">
        ${
          r.compromiso && String(r.compromiso).trim()
            ? escapeHTML(r.compromiso)
            : "<em>Sin compromiso registrado.</em>"
        }
      </div>

      <div style="margin-top:14px; font-weight:700;">Firma del agente</div>
      ${firmaHtml}

      <div style="margin-top:14px; font-weight:700;">Evidencias</div>
      <div style="margin-top:8px;">${evidenciasHtml}</div>

      <div style="margin-top:18px; font-size:11px; color:#777;">
        Documento generado desde el portal de Calidad & Formación — Financiera Efectiva.
      </div>
    </div>
  `;

  return { html, titulo, estado };
}

/* =====================================================================
   ACCIÓN: "Ver" -> abre modal con detalle (no abajo)
   ===================================================================== */
function verDetalleEnModal(id) {
  const r = registrosById.get(id);
  if (!r) return;

  currentFeedbackId = id;
  ensureModalsExist();

  const body = $("feedbackModalBody");
  const sub = $("feedbackModalSub");
  if (!body || !sub) return;

  const built = buildDetalleHTML(r);

  // info arriba del modal
  sub.textContent = `GC: ${r.gc || "—"} · Nota: ${formatNota(r.nota)} · ${built.estado}`;

  // render detalle dentro del modal
  body.innerHTML = built.html;

  // abre modal
  openFeedbackModal();
}

/* =====================================================================
   PDF: genera PDF desde el área #pdfExportArea (dentro del modal)
   - lo muestra en popup (iframe) y deja descargar
   ===================================================================== */
async function generarPdfDesdeDetalleModal() {
  // 1. Verificar librerías (CSP-safe)
  if (typeof window.html2canvas !== "function") {
    alert("html2canvas no está cargado.");
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF no está cargado.");
    return;
  }

  // 2. Obtener área exportable
  const exportArea = document.getElementById("pdfExportArea");
  if (!exportArea) {
    alert("No se encontró el contenido para exportar.");
    return;
  }

  try {
    // 3. Forzar repaint real (evita PDF en blanco)
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    // 4. Esperar imágenes (Firebase Storage)
    const images = exportArea.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete && img.naturalHeight !== 0) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve(); // no bloquear
          })
      )
    );

    // 5. Captura con html2canvas (SIN document.write)
    const canvas = await window.html2canvas(exportArea, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
    });

    // 6. Crear PDF
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth() - 20;
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    const imgData = canvas.toDataURL("image/png", 1.0);
    pdf.addImage(imgData, "PNG", 10, 10, pageWidth, imgHeight);

    // 7. Crear Blob + ObjectURL
    const blob = pdf.output("blob");
    const url = URL.createObjectURL(blob);

    // 8. Mostrar en modal (iframe)
    const pdfIframe = document.getElementById("pdfIframe");
    const pdfModal = document.getElementById("pdfModal");
    const pdfDownloadLink = document.getElementById("pdfDownloadLink");

    if (pdfIframe && pdfModal) {
      pdfIframe.src = url;
      pdfModal.style.display = "block";
    }

    // 9. Link descarga
    if (pdfDownloadLink) {
      pdfDownloadLink.href = url;
      pdfDownloadLink.download = currentFeedbackId
        ? `feedback_${currentFeedbackId}.pdf`
        : "feedback.pdf";
    }

  } catch (error) {
    console.error("❌ Error exportando PDF:", error);
    alert("No se pudo generar el PDF. Revisa la consola.");
  }
}



/* -------------------- Esperar carga de imágenes -------------------- */
function waitImages(container) {
  const imgs = container.querySelectorAll("img");
  const arr = Array.from(imgs);

  return Promise.all(
    arr.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalHeight !== 0) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

/* =====================================================================
   EVENTS: engancha cierres + botones
   ===================================================================== */
function bindModalEventsOnce() {
  ensureModalsExist();

  const closeBtn = $("feedbackModalClose");
  const pdfBtn = $("feedbackModalPdfBtn");
  const pdfClose = $("pdfModalClose");

  // Evitar duplicar listeners
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = "1";
    closeBtn.addEventListener("click", () => closeFeedbackModal());
  }

  if (pdfBtn && !pdfBtn.dataset.bound) {
    pdfBtn.dataset.bound = "1";
    pdfBtn.addEventListener("click", async () => {
      await generarPdfDesdeDetalleModal();
    });
  }

  if (pdfClose && !pdfClose.dataset.bound) {
    pdfClose.dataset.bound = "1";
    pdfClose.addEventListener("click", () => closePdfModal());
  }

  // ESC para cerrar
  if (!document.body.dataset.modalEscBound) {
    document.body.dataset.modalEscBound = "1";
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        // Cierra primero PDF, luego detalle
        const pm = $("pdfModal");
        if (pm && pm.style.display !== "none") {
          closePdfModal();
          return;
        }
        const fm = $("feedbackModal");
        if (fm && fm.style.display !== "none") {
          closeFeedbackModal();
        }
      }
    });
  }
}

/* =====================================================================
   INIT APP
   ===================================================================== */
async function initApp() {
  const filtersSection = $("filtersSection");
  const tableSection = $("tableSection");
  const filtroAsesor = $("filtroAsesor");
  const filtroRegistrado = $("filtroRegistrado");
  const tabla = $("tablaFeedback");

  if (!filtersSection || !tableSection || !filtroAsesor || !filtroRegistrado || !tabla) {
    console.warn("Faltan elementos en el HTML (filtersSection/tableSection/tablaFeedback).");
    return;
  }

  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  filtersSection.style.display = "block";
  tableSection.style.display = "block";

  // Si cambias filtros: re-render y cierra modales si están abiertos
  filtroAsesor.addEventListener("change", () => {
    renderTabla();
    closePdfModal();
    closeFeedbackModal();
  });

  filtroRegistrado.addEventListener("change", () => {
    renderTabla();
    closePdfModal();
    closeFeedbackModal();
  });

  // Delegación de eventos para botones "Ver"
  const tbody = tabla.querySelector("tbody");
  if (tbody && !tbody.dataset.bound) {
    tbody.dataset.bound = "1";
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-ver");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (id) verDetalleEnModal(id);
    });
  }

  bindModalEventsOnce();
}

/* =====================================================================
   AUTH GATE
   ===================================================================== */
onAuthStateChanged(auth, (user) => {
  const accessWarning = $("accessWarning");
  const filtersSection = $("filtersSection");
  const tableSection = $("tableSection");

  if (!accessWarning || !filtersSection || !tableSection) return;

  if (!user) {
    accessWarning.style.display = "block";
    accessWarning.textContent =
      "No tienes sesión activa. Inicia sesión en el portal para acceder a la visualización de feedback.";
    filtersSection.style.display = "none";
    tableSection.style.display = "none";
    return;
  }

  const email = String(user.email || "").toLowerCase().trim();
  const isSupervisor = SUPERVISOR_EMAILS.includes(email);

  if (!isSupervisor) {
    accessWarning.style.display = "block";
    accessWarning.textContent =
      "No tienes permisos para visualizar los feedbacks. Solo administradores y supervisores pueden acceder.";
    filtersSection.style.display = "none";
    tableSection.style.display = "none";
    return;
  }

  accessWarning.style.display = "none";

  initApp().catch((err) => {
    console.error("Error inicializando visualización:", err);
    accessWarning.style.display = "block";
    accessWarning.textContent =
      "Error al cargar feedbacks. Revisa la consola del navegador.";
  });
});

/* =====================================================================
   FIN
   ===================================================================== */
