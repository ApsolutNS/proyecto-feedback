// visualizacion_feedback.js
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/* -------------------- ROLES PERMITIDOS -------------------- */
const SUPERVISOR_EMAILS = [
  "anunez@gefectiva.com",
  "ctorres@gefectiva.com",
  "kvital@gefectiva.com",
];

/* -------------------- ESTADO -------------------- */
let registros = [];
let currentFeedbackId = null;

/* -------------------- UTILIDADES -------------------- */
function toDateSafe(value) {
  if (!value) return new Date();
  if (value.toDate) return value.toDate(); // Timestamp Firestore
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatearFechaLarga(date) {
  const d = toDateSafe(date);
  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  let s = d.toLocaleDateString("es-PE", opts);
  return s.charAt(0).toUpperCase() + s.slice(1);
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

/* ---- Mapeo de cargo a frase profesional (Opción B) ---- */
function obtenerFraseCargo(cargo = "") {
  const key = cargo.trim().toUpperCase();
  const mapa = {
    "ASESOR INBOUND": "Asesor(a) de Atención Telefónica",
    "ASESOR REDES": "Asesor(a) de Redes Sociales",
    "ASESOR CORREOS": "Asesor(a) de Atención por Correo",
  };
  return mapa[key] || "Asesor(a)";
}

/* ---- Frase por canal según tipo (llamada / redes / correos) ---- */
function obtenerFraseCanal(tipo = "") {
  const t = String(tipo).toUpperCase();

  if (t.includes("FACEBOOK") || t.includes("INSTAGRAM")) {
    return "para el cumplimiento de los parámetros de la atención en redes sociales.";
  }
  if (t.includes("CORREO") || t.includes("MAIL")) {
    return "para el cumplimiento de los parámetros de la atención por correo electrónico.";
  }
  // Por defecto lo consideramos llamada
  return "para el cumplimiento de los parámetros de la llamada.";
}

/* -------------------- CARGAR REGISTROS -------------------- */
async function cargarRegistros() {
  registros = [];
  const snap = await getDocs(collection(db, "registros"));

  snap.forEach((d) => {
    const r = d.data();
    const fecha = r.fecha || r.fechaObj || new Date().toISOString();

    const normalizado = {
      id: d.id,
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
      nota:
        typeof r.nota === "number"
          ? r.nota
          : Number(r.nota || 0),

      imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],

      fechaObj: toDateSafe(fecha),
      registradoPor: r.registradoPor || r.registrado_por || "",
      firmaUrl: r.firmaUrl || "",
      compromiso: r.compromiso || "",
    };

    normalizado.estado = r.estado || calcularEstado(normalizado);
    registros.push(normalizado);
  });

  registros.sort((a, b) => b.fechaObj - a.fechaObj);
}

/* -------------------- LLENAR SELECT ASESORES -------------------- */
function cargarAsesoresFiltro() {
  const filtro = document.getElementById("filtroAsesor");
  const asesores = [...new Set(registros.map((r) => r.asesor).filter(Boolean))];

  asesores.sort((a, b) => a.localeCompare(b, "es"));

  filtro.innerHTML =
    '<option value="">— Selecciona un asesor —</option>' +
    asesores.map((a) => `<option value="${a}">${a}</option>`).join("");
}

/* -------------------- TABLA (sin ID) -------------------- */
function renderTabla() {
  const filtroAsesor = document.getElementById("filtroAsesor");
  const filtroRegistrado = document.getElementById("filtroRegistrado");
  const tabla = document.getElementById("tablaFeedback");
  const tbody = tabla.querySelector("tbody");
  const vacio = document.getElementById("tablaVaciaMsg");

  const asesorSel = filtroAsesor.value;
  const registradorSel = filtroRegistrado.value;

  tbody.innerHTML = "";

  if (!asesorSel) {
    tabla.style.display = "none";
    vacio.style.display = "none";
    return;
  }

  const filtrados = registros
    .filter((r) => r.asesor === asesorSel)
    .filter((r) => !registradorSel || r.registradoPor === registradorSel);

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

      const notaTexto =
        typeof r.nota === "number" ? `${r.nota.toFixed(1).replace(/\.0$/, "")}%` : `${r.nota}%`;

      return `
        <tr>
          <td>${r.fechaObj.toLocaleString("es-PE")}</td>
          <td>${notaTexto}</td>
          <td><span class="${estadoClass}">${estado}</span></td>
          <td>${r.registradoPor || "-"}</td>
          <td>
            <button class="m3-btn primary btn-ver" type="button" data-id="${r.id}">
              Ver
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rowsHtml;
}

/* -------------------- VER DETALLE -------------------- */
function verDetalle(id) {
  const r = registros.find((x) => x.id === id);
  if (!r) return;

  currentFeedbackId = id;

  const detail = document.getElementById("detailContent");
  const titulo = document.getElementById("tituloRetro");
  const subTituloEstado = document.getElementById("subTituloEstado");

  const estado = calcularEstado(r);
  const esReaf = Number(r.nota) === 100;

  titulo.textContent = esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";

  subTituloEstado.innerHTML = `
    Estado: ${estado} · Registrado por: ${r.registradoPor || "No especificado"} · 
    Fecha: ${r.fechaObj.toLocaleString("es-PE")}
  `;

  const dni = (r.gc || "").replace(/[^0-9]/g, "") || "—";
  const fraseCargo = obtenerFraseCargo(r.cargo);
  const fraseCanal = obtenerFraseCanal(r.tipo);

  const itemsHtml =
    r.items && r.items.length
      ? r.items
          .map(
            (it) => `
          <div class="item-block">
            <strong>${it.name || ""}</strong> ${
              it.perc ? `(${it.perc}%)` : ""
            }
            <div>${it.detail || ""}</div>
          </div>`
          )
          .join("")
      : "<em>No se registraron ítems observados.</em>";

  const evidenciasHtml =
    r.imagenes && r.imagenes.length
      ? r.imagenes
          .map(
            (img) =>
              `<img class="evidence-img" src="${img.url}" alt="Evidencia">`
          )
          .join("")
      : "<em>Sin evidencias adjuntas.</em>";

  const firmaHtml = r.firmaUrl
    ? `<div class="firma-box"><img src="${r.firmaUrl}" alt="Firma del agente"></div>`
    : `<div class="firma-box">Sin firma registrada</div>`;

  // --------- CONTENIDO PRINCIPAL DEL FEEDBACK ----------
  detail.innerHTML = `
    <p>
      Por medio de la presente se deja constancia que el
      <strong>${formatearFechaLarga(r.fechaObj)}</strong> se realiza una
      <strong>${esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN"}</strong> al colaborador(a)
      <strong>${r.asesor || ""}</strong> con GC <strong>${r.gc || "—"}</strong> y DNI
      <strong>${dni}</strong>, quien ejerce la función de
      <strong>${fraseCargo}</strong>, ${fraseCanal}
    </p>

    <div class="section-title">Datos del monitoreo</div>
    <div class="box">
      <div><strong>ID Llamada:</strong> ${r.idLlamada || "—"}</div>
      <div><strong>ID Contacto:</strong> ${r.idContacto || "—"}</div>
      <div><strong>Tipo detectado:</strong> ${r.tipo || "—"}</div>
    </div>

    <div class="section-title">Datos del cliente</div>
    <div class="box">
      <div><strong>DNI:</strong> ${r.cliente?.dni || "—"}</div>
      <div><strong>Nombre:</strong> ${r.cliente?.nombre || "—"}</div>
      <div><strong>Teléfono:</strong> ${r.cliente?.tel || "—"}</div>
      <div><strong>Tipificación:</strong> ${r.tipificacion || "—"}</div>
      <div><strong>Comentario:</strong> ${r.observacionCliente || "—"}</div>
    </div>

    <div class="section-title">Gestión monitoreada</div>
    <div class="box">
      <strong>Resumen:</strong>
      <div style="margin-top:4px;">${r.resumen || "—"}</div>
    </div>

    <div class="section-title">Ítems observados</div>
    <div>${itemsHtml}</div>

    <div class="section-title">Nota obtenida</div>
    <div class="box">
      <span class="nota-badge">
        ${typeof r.nota === "number"
          ? r.nota.toFixed(1).replace(/\.0$/, "")
          : r.nota}%</span>
    </div>

    <div class="section-title">Compromiso del agente</div>
    <div class="box">
      ${
        r.compromiso && r.compromiso.trim()
          ? r.compromiso
          : "<em>Sin compromiso registrado.</em>"
      }
    </div>

    <div class="section-title">Firma del agente</div>
    ${firmaHtml}

    <div class="section-title">Evidencias</div>
    <div>${evidenciasHtml}</div>
  `;

  document.getElementById("detailBox").style.display = "block";
}

/* -------------------- EXPORTAR PDF -------------------- */
const pdfBtn = document.getElementById("pdfBtn");

if (pdfBtn) {
  pdfBtn.addEventListener("click", async () => {
    const detailBox = document.getElementById("detailBox");
    if (!detailBox) return;

    const canvas = await html2canvas(detailBox, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });

    const imgData = canvas.toDataURL("image/png");
    const { jsPDF } = window.jspdf || {};

    if (!jsPDF) {
      console.error("jsPDF no está disponible.");
      alert("No se pudo generar el PDF. jsPDF no está cargado.");
      return;
    }

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth() - 20;
    const pageHeight = (canvas.height * pageWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 10, 10, pageWidth, pageHeight);

    const filename = currentFeedbackId
      ? `feedback_${currentFeedbackId}.pdf`
      : "feedback.pdf";
    pdf.save(filename);
  });
}

/* -------------------- INICIO + AUTH -------------------- */
async function initApp() {
  const filtersSection = document.getElementById("filtersSection");
  const tableSection = document.getElementById("tableSection");
  const filtroAsesor = document.getElementById("filtroAsesor");
  const filtroRegistrado = document.getElementById("filtroRegistrado");
  const tbody = document.querySelector("#tablaFeedback tbody");

  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  filtersSection.style.display = "block";
  tableSection.style.display = "block";

  filtroAsesor.addEventListener("change", () => {
    renderTabla();
    document.getElementById("detailBox").style.display = "none";
  });

  filtroRegistrado.addEventListener("change", () => {
    renderTabla();
    document.getElementById("detailBox").style.display = "none";
  });

  // Delegación de eventos para botones "Ver"
  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-ver");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (id) verDetalle(id);
  });
}

// Solo usuarios logueados y con rol de Admin/Supervisor
onAuthStateChanged(auth, (user) => {
  const accessWarning = document.getElementById("accessWarning");
  const filtersSection = document.getElementById("filtersSection");
  const tableSection = document.getElementById("tableSection");

  if (!user) {
    accessWarning.style.display = "block";
    accessWarning.textContent =
      "No tienes sesión activa. Inicia sesión en el portal para acceder a la visualización de feedback.";
    filtersSection.style.display = "none";
    tableSection.style.display = "none";
    return;
  }

  const email = user.email || "";
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
