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

const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.firebasestorage.app",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Estado global
let registros = [];
let currentFeedbackId = null;

/* -------------------- UTILES -------------------- */
function toDateSafe(value) {
  if (!value) return new Date();
  if (value.toDate) return value.toDate(); // Timestamp
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
 * Opción A (tu elección):
 * COMPLETADO cuando hay firmaUrl y compromiso.
 * Si no, PENDIENTE.
 */
function calcularEstado(r) {
  const tieneFirma = !!(r.firmaUrl && String(r.firmaUrl).trim());
  const tieneCompromiso = !!(r.compromiso && String(r.compromiso).trim());
  if (tieneFirma && tieneCompromiso) return "COMPLETADO";
  return "PENDIENTE";
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
      asesorId: r.asesorId || null, // UID del asesor si existe
      asesor: r.asesor || "",
      gc: r.gc || "",
      cliente: r.cliente || {},
      tipificacion: r.tipificacion || "",
      observacionCliente: r.observacionCliente || "",
      resumen: r.resumen || "",
      items: Array.isArray(r.items) ? r.items : [],
      nota: typeof r.nota === "number" ? r.nota : Number(r.nota || 0),
      imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],
      fechaRaw: fecha,
      fechaObj: toDateSafe(fecha),
      registradoPor: r.registradoPor || r.registrado_por || "",
      firmaUrl: r.firmaUrl || "",
      compromiso: r.compromiso || "",
      tipo: r.tipo || "",
    };

    normalizado.estado = r.estado || calcularEstado(normalizado);

    registros.push(normalizado);
  });

  registros.sort((a, b) => b.fechaObj - a.fechaObj);
}

/* -------------------- LLENAR SELECT ASESORES -------------------- */
function cargarAsesoresFiltro() {
  const filtroAsesor = document.getElementById("filtroAsesor");
  const asesores = [...new Set(registros.map((r) => r.asesor).filter(Boolean))];
  asesores.sort((a, b) => a.localeCompare(b, "es"));

  filtroAsesor.innerHTML =
    '<option value="">— Selecciona un asesor —</option>' +
    asesores.map((a) => `<option value="${a}">${a}</option>`).join("");
}

/* -------------------- RENDER TABLA -------------------- */
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

  filtrados.forEach((r) => {
    const estadoCalculado = calcularEstado(r);
    const estadoClass =
      estadoCalculado === "COMPLETADO" ? "chip-estado done" : "chip-estado pending";

    tbody.innerHTML += `
      <tr>
        <td>${r.id}</td>
        <td>${r.fechaObj.toLocaleString("es-PE")}</td>
        <td>${r.nota}%</td>
        <td>
          <span class="${estadoClass}">
            ${estadoCalculado}
          </span>
        </td>
        <td>${r.registradoPor || "-"}</td>
        <td>
          <button class="m3-btn primary" type="button" onclick="verDetalle('${r.id}')">
            Ver
          </button>
        </td>
      </tr>
    `;
  });
}

/* -------------------- DETALLE -------------------- */
window.verDetalle = function (id) {
  const r = registros.find((x) => x.id === id);
  if (!r) return;

  currentFeedbackId = id;

  const detailBox = document.getElementById("detailBox");
  const tituloRetro = document.getElementById("tituloRetro");
  const subTituloEstado = document.getElementById("subTituloEstado");
  const detailContent = document.getElementById("detailContent");

  const esReafirmacion = Number(r.nota) === 100;
  const palabraRetro = esReafirmacion ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";

  tituloRetro.textContent = palabraRetro;

  const estadoCalculado = calcularEstado(r);
  subTituloEstado.innerHTML = `
    <span>Estado: ${estadoCalculado}</span> ·
    <span>Registrado por: ${r.registradoPor || "No especificado"}</span> ·
    <span>Fecha: ${r.fechaObj.toLocaleString("es-PE")}</span>
  `;

  const dniDesdeGC = (r.gc || "").replace(/[^0-9]/g, "");

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
        </div>
      `
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

  detailContent.innerHTML = `
    <p>
      Por medio de la presente se deja constancia que el
      <strong>${formatearFechaLarga(r.fechaObj)}</strong> se realiza una
      <strong>${palabraRetro}</strong> al/la colaborador(a)
      <strong>${r.asesor || ""}</strong> con DNI
      <strong>${dniDesdeGC || "—"}</strong>, quien ejerce la función de Asesor(a)
      Financiero(a), para el cumplimiento de los parámetros de la llamada.
    </p>

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
      <div><strong>Tipo:</strong> ${r.tipo || "—"}</div>
      <div style="margin-top:4px">
        <strong>Resumen:</strong>
        <div style="margin-top:4px;">
          ${r.resumen || "—"}
        </div>
      </div>
    </div>

    <div class="section-title">Ítems observados</div>
    <div>
      ${itemsHtml}
    </div>

    <div class="section-title">Nota obtenida</div>
    <div class="box">
      <span class="nota-badge">${r.nota}%</span>
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
    <div>
      ${evidenciasHtml}
    </div>
  `;

  detailBox.style.display = "block";
};

/* -------------------- EXPORTAR PDF -------------------- */
document.getElementById("pdfBtn").addEventListener("click", async () => {
  const detailBox = document.getElementById("detailBox");
  if (!detailBox) return;

  const canvas = await html2canvas(detailBox, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jspdf.jsPDF("p", "mm", "a4");

  const pageWidth = pdf.internal.pageSize.getWidth() - 20;
  const pageHeight = (canvas.height * pageWidth) / canvas.width;

  pdf.addImage(imgData, "PNG", 10, 10, pageWidth, pageHeight);
  const filename = currentFeedbackId
    ? `feedback_${currentFeedbackId}.pdf`
    : "feedback.pdf";
  pdf.save(filename);
});

/* -------------------- INICIO + AUTH -------------------- */
async function initApp() {
  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  const filtroAsesor = document.getElementById("filtroAsesor");
  const filtroRegistrado = document.getElementById("filtroRegistrado");

  filtroAsesor.addEventListener("change", renderTabla);
  filtroRegistrado.addEventListener("change", renderTabla);
}

// Solo usuarios logueados pueden ver (coincide con tus rules)
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // si no está logueado, redirige a tu login
    window.location.href = "login.html";
    return;
  }
  initApp().catch((err) => {
    console.error("Error inicializando visualización:", err);
    alert("Error al cargar feedbacks. Revisa la consola.");
  });
});
