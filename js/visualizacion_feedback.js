// js/visualizacion_feedback.js
"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* -------------------- FIREBASE CONFIG -------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.firebasestorage.app",
};

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

/* -------------------- HELPERS -------------------- */
function $(id) {
  return document.getElementById(id);
}

function escapeHTML(input) {
  const s = String(input ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toDateSafe(value) {
  if (!value) return new Date();
  if (typeof value?.toDate === "function") return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function formatearFechaLarga(dateLike) {
  const d = toDateSafe(dateLike);
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const s = d.toLocaleDateString("es-PE", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatearFechaHora(dateLike) {
  const d = toDateSafe(dateLike);
  return d.toLocaleString("es-PE");
}

/**
 * COMPLETADO cuando hay firmaUrl y compromiso.
 * Si no, PENDIENTE.
 */
function calcularEstado(r) {
  const tieneFirma = !!(r.firmaUrl && String(r.firmaUrl).trim());
  const tieneCompromiso = !!(r.compromiso && String(r.compromiso).trim());
  return tieneFirma && tieneCompromiso ? "COMPLETADO" : "PENDIENTE";
}

function obtenerFraseCargo(cargo = "") {
  const key = String(cargo).trim().toUpperCase();
  const mapa = {
    "ASESOR INBOUND": "Asesor(a) de Atención Telefónica",
    "ASESOR REDES": "Asesor(a) de Redes Sociales",
    "ASESOR CORREOS": "Asesor(a) de Atención por Correo",
  };
  return mapa[key] || "Asesor(a)";
}

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

function normalizarNota(nota) {
  const num = typeof nota === "number" ? nota : Number(nota || 0);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function formatNota(n) {
  const num = normalizarNota(n);
  // Si tu "nota" ya es porcentaje (0..100), muestra como porcentaje:
  // Ej: 95 -> "95%"
  // Si fuera 0..1, ajusta aquí.
  const s = num.toFixed(1).replace(/\.0$/, "");
  return `${s}%`;
}

/* -------------------- DATA: CARGAR REGISTROS -------------------- */
async function cargarRegistros() {
  registros = [];
  registrosById = new Map();

  const snap = await getDocs(collection(db, "registros"));

  snap.forEach((doc) => {
    const r = doc.data() || {};
    const fechaRaw = r.fecha || r.fechaObj || r.createdAt || r.created_at || new Date().toISOString();
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

/* -------------------- UI: SELECT ASESORES (SIN COLECCIÓN ASESORES) -------------------- */
function cargarAsesoresFiltro() {
  const filtro = $("filtroAsesor");
  if (!filtro) return;

  const asesores = [...new Set(registros.map((r) => r.asesor).filter(Boolean))];
  asesores.sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const options =
    `<option value="${ALL_VALUE}">— Todos —</option>` +
    `<option value="">— Selecciona un asesor —</option>` +
    asesores.map((a) => `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`).join("");

  filtro.innerHTML = options;
  // Por defecto: Todos (para que el usuario vea data sin elegir)
  filtro.value = ALL_VALUE;
}

/* -------------------- UI: TABLA -------------------- */
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

  // Si selecciona "Selecciona un asesor" (vacío), ocultamos tabla
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
      const estadoClass = estado === "COMPLETADO" ? "chip-estado done" : "chip-estado pending";
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

/* -------------------- UI: DETALLE -------------------- */
function verDetalle(id) {
  const r = registrosById.get(id);
  if (!r) return;

  currentFeedbackId = id;

  const detail = $("detailContent");
  const detailBox = $("detailBox");
  const titulo = $("tituloRetro");
  const subTituloEstado = $("subTituloEstado");
  if (!detail || !detailBox || !titulo || !subTituloEstado) return;

  const estado = calcularEstado(r);
  const esReaf = Number(r.nota) === 100;

  titulo.textContent = esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";
  subTituloEstado.innerHTML = `
    Estado: ${escapeHTML(estado)} · Registrado por: ${escapeHTML(r.registradoPor || "No especificado")} ·
    Fecha: ${escapeHTML(formatearFechaHora(r.fechaObj))}
  `;

  const dniGC = (r.gc || "").replace(/[^0-9]/g, "") || "—";
  const fraseCargo = obtenerFraseCargo(r.cargo);
  const fraseCanal = obtenerFraseCanal(r.tipo);

  const itemsHtml =
    r.items && r.items.length
      ? r.items
          .map((it) => {
            const name = escapeHTML(it?.name || "");
            const perc = it?.perc ? `(${escapeHTML(it.perc)}%)` : "";
            const detailTxt = escapeHTML(it?.detail || "");
            return `
              <div class="item-block">
                <strong>${name}</strong> ${perc}
                <div>${detailTxt}</div>
              </div>
            `;
          })
          .join("")
      : "<em>No se registraron ítems observados.</em>";

  // Importante para html2canvas: agrega crossorigin + referrerpolicy
  const evidenciasHtml =
    r.imagenes && r.imagenes.length
      ? r.imagenes
          .map((img) => {
            const url = escapeHTML(img?.url || "");
            if (!url) return "";
            return `<img class="evidence-img" src="${url}" crossorigin="anonymous" referrerpolicy="no-referrer" alt="Evidencia">`;
          })
          .join("")
      : "<em>Sin evidencias adjuntas.</em>";

  const firmaHtml = r.firmaUrl
    ? `<div class="firma-box"><img src="${escapeHTML(r.firmaUrl)}" crossorigin="anonymous" referrerpolicy="no-referrer" alt="Firma del agente"></div>`
    : `<div class="firma-box">Sin firma registrada</div>`;

  const clienteDni = escapeHTML(r.cliente?.dni || "—");
  const clienteNombre = escapeHTML(r.cliente?.nombre || "—");
  const clienteTel = escapeHTML(r.cliente?.tel || "—");

  detail.innerHTML = `
    <p>
      Por medio de la presente se deja constancia que el
      <strong>${escapeHTML(formatearFechaLarga(r.fechaObj))}</strong> se realiza una
      <strong>${escapeHTML(esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN")}</strong> al colaborador(a)
      <strong>${escapeHTML(r.asesor || "")}</strong> con GC <strong>${escapeHTML(r.gc || "—")}</strong> y DNI
      <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de
      <strong>${escapeHTML(fraseCargo)}</strong>, ${escapeHTML(fraseCanal)}
    </p>

    <div class="section-title">Datos del monitoreo</div>
    <div class="box">
      <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "—")}</div>
      <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "—")}</div>
      <div><strong>Tipo detectado:</strong> ${escapeHTML(r.tipo || "—")}</div>
    </div>

    <div class="section-title">Datos del cliente</div>
    <div class="box">
      <div><strong>DNI:</strong> ${clienteDni}</div>
      <div><strong>Nombre:</strong> ${clienteNombre}</div>
      <div><strong>Teléfono:</strong> ${clienteTel}</div>
      <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "—")}</div>
      <div><strong>Comentario:</strong> ${escapeHTML(r.observacionCliente || "—")}</div>
    </div>

    <div class="section-title">Gestión monitoreada</div>
    <div class="box">
      <strong>Resumen:</strong>
      <div style="margin-top:4px;">${escapeHTML(r.resumen || "—")}</div>
    </div>

    <div class="section-title">Ítems observados</div>
    <div>${itemsHtml}</div>

    <div class="section-title">Nota obtenida</div>
    <div class="box">
      <span class="nota-badge">${escapeHTML(formatNota(r.nota))}</span>
    </div>

    <div class="section-title">Compromiso del agente</div>
    <div class="box">
      ${
        r.compromiso && String(r.compromiso).trim()
          ? escapeHTML(r.compromiso)
          : "<em>Sin compromiso registrado.</em>"
      }
    </div>

    <div class="section-title">Firma del agente</div>
    ${firmaHtml}

    <div class="section-title">Evidencias</div>
    <div>${evidenciasHtml}</div>
  `;

  detailBox.style.display = "block";
}

/* -------------------- PDF -------------------- */
function initPdfExport() {
  const pdfBtn = $("pdfBtn");
  if (!pdfBtn) return;

  pdfBtn.addEventListener("click", async () => {
    const detailBox = $("detailBox");
    if (!detailBox) return;

    // Verifica librerías
    if (typeof window.html2canvas !== "function") {
      console.error("html2canvas no está disponible.");
      alert("No se pudo generar el PDF. html2canvas no está cargado.");
      return;
    }
    const jsPDF = window?.jspdf?.jsPDF;
    if (typeof jsPDF !== "function") {
      console.error("jsPDF no está disponible.");
      alert("No se pudo generar el PDF. jsPDF no está cargado.");
      return;
    }

    try {
      // Espera a que carguen imágenes dentro del detalle (firma/evidencias/logo)
      const imgs = detailBox.querySelectorAll("img");
      await Promise.all(
        Array.from(imgs).map(
          (img) =>
            new Promise((resolve) => {
              if (img.complete && img.naturalHeight !== 0) return resolve();
              img.onload = img.onerror = () => resolve();
            })
        )
      );

      const canvas = await window.html2canvas(detailBox, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const margin = 10;
      const pageWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageHeight = pdf.internal.pageSize.getHeight() - margin * 2;

      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Si el contenido es más alto que una página, lo partimos (simple)
      let y = margin;
      let remainingHeight = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);

      // Paginación básica si excede
      while (remainingHeight > pageHeight) {
        remainingHeight -= pageHeight;
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, margin + position, imgWidth, imgHeight);
      }

      const filename = currentFeedbackId ? `feedback_${currentFeedbackId}.pdf` : "feedback.pdf";
      pdf.save(filename);
    } catch (err) {
      console.error("Error exportando PDF:", err);
      alert("Ocurrió un error al exportar el PDF. Revisa la consola.");
    }
  });
}

/* -------------------- APP INIT -------------------- */
async function initApp() {
  const filtersSection = $("filtersSection");
  const tableSection = $("tableSection");
  const filtroAsesor = $("filtroAsesor");
  const filtroRegistrado = $("filtroRegistrado");
  const tabla = $("tablaFeedback");
  if (!filtersSection || !tableSection || !filtroAsesor || !filtroRegistrado || !tabla) return;

  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  filtersSection.style.display = "block";
  tableSection.style.display = "block";

  filtroAsesor.addEventListener("change", () => {
    renderTabla();
    const detailBox = $("detailBox");
    if (detailBox) detailBox.style.display = "none";
  });

  filtroRegistrado.addEventListener("change", () => {
    renderTabla();
    const detailBox = $("detailBox");
    if (detailBox) detailBox.style.display = "none";
  });

  // Delegación de eventos para botones "Ver"
  const tbody = tabla.querySelector("tbody");
  if (tbody) {
    tbody.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-ver");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (id) verDetalle(id);
    });
  }

  initPdfExport();
}

/* -------------------- AUTH GATE -------------------- */
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
    accessWarning.textContent = "Error al cargar feedbacks. Revisa la consola del navegador.";
  });
});
