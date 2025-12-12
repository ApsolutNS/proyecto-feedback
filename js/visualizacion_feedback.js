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
  if (value.toDate) return value.toDate();
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

function calcularEstado(r) {
  const tieneFirma = !!(r.firmaUrl && String(r.firmaUrl).trim());
  const tieneCompromiso = !!(r.compromiso && String(r.compromiso).trim());
  return (tieneFirma && tieneCompromiso) ? "COMPLETADO" : "PENDIENTE";
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

      // 🔹 CAMPOS NUEVOS
      idLlamada: r.idLlamada || "",
      idContacto: r.idContacto || "",

      asesorId: r.asesorId || "",
      asesor: r.asesor || "",
      gc: r.gc || "",

      cliente: r.cliente || {},
      tipificacion: r.tipificacion || "",
      observacionCliente: r.observacionCliente || "",
      resumen: r.resumen || "",
      tipo: r.tipo || "",

      items: Array.isArray(r.items) ? r.items : [],
      nota: Number(r.nota || 0),

      imagenes: Array.isArray(r.imagenes) ? r.imagenes : [],

      fechaObj: toDateSafe(fecha),
      registradoPor: r.registradoPor || "",
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

/* -------------------- TABLA -------------------- */
function renderTabla() {
  const filtroAsesor = document.getElementById("filtroAsesor").value;
  const filtroReg = document.getElementById("filtroRegistrado").value;

  const tabla = document.getElementById("tablaFeedback");
  const tbody = tabla.querySelector("tbody");
  const vacio = document.getElementById("tablaVaciaMsg");

  tbody.innerHTML = "";

  if (!filtroAsesor) {
    tabla.style.display = "none";
    vacio.style.display = "none";
    return;
  }

  const filtrados = registros
    .filter((r) => r.asesor === filtroAsesor)
    .filter((r) => !filtroReg || r.registradoPor === filtroReg);

  if (!filtrados.length) {
    tabla.style.display = "none";
    vacio.style.display = "block";
    return;
  }

  tabla.style.display = "table";
  vacio.style.display = "none";

  tbody.innerHTML = filtrados
    .map((r) => {
      const estado = calcularEstado(r);
      const clase = estado === "COMPLETADO" ? "chip-estado done" : "chip-estado pending";

      return `
        <tr>
          <td>${r.idLlamada || r.id}</td>
          <td>${r.fechaObj.toLocaleString("es-PE")}</td>
          <td>${r.nota}%</td>
          <td><span class="${clase}">${estado}</span></td>
          <td>${r.registradoPor}</td>
          <td>
            <button class="m3-btn primary btn-ver" data-id="${r.id}">Ver</button>
          </td>
        </tr>`;
    })
    .join("");
}

/* -------------------- VER DETALLE -------------------- */
function verDetalle(id) {
  const r = registros.find((x) => x.id === id);
  if (!r) return;

  currentFeedbackId = id;

  const detail = document.getElementById("detailContent");
  const titulo = document.getElementById("tituloRetro");
  const estado = calcularEstado(r);
  const esReaf = Number(r.nota) === 100;

  titulo.textContent = esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";

  document.getElementById("subTituloEstado").innerHTML = `
    Estado: ${estado} · Registrado por: ${r.registradoPor} · Fecha: ${r.fechaObj.toLocaleString("es-PE")}
  `;

  const dni = (r.gc || "").replace(/[^0-9]/g, "");

  const itemsHtml = r.items.length
    ? r.items
        .map(
          (it) => `
        <div class="item-block">
          <strong>${it.name}</strong> ${it.perc ? `(${it.perc}%)` : ""}
          <div>${it.detail || ""}</div>
        </div>`
        )
        .join("")
    : "<em>No se registraron ítems observados.</em>";

  const evidenciasHtml = r.imagenes.length
    ? r.imagenes
        .map((img) => `<img class="evidence-img" src="${img.url}" />`)
        .join("")
    : "<em>Sin evidencias adjuntas.</em>";

  const firmaHtml = r.firmaUrl
    ? `<div class="firma-box"><img src="${r.firmaUrl}"></div>`
    : `<div class="firma-box">Sin firma</div>`;

  detail.innerHTML = `
    <p>
      Por medio de la presente se deja constancia que el 
      <strong>${formatearFechaLarga(r.fechaObj)}</strong> se realiza una 
      <strong>${esReaf ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN"}</strong> al colaborador(a)
      <strong>${r.asesor}</strong> con GC <strong>${r.gc}</strong> y DNI <strong>${dni}</strong>.
    </p>

    <div class="section-title">Datos del monitoreo</div>
    <div class="box">
      <div><strong>ID Llamada:</strong> ${r.idLlamada || "—"}</div>
      <div><strong>ID Contacto:</strong> ${r.idContacto || "—"}</div>
      <div><strong>Tipo:</strong> ${r.tipo || "—"}</div>
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
    <div class="box">${r.resumen}</div>

    <div class="section-title">Ítems observados</div>
    <div>${itemsHtml}</div>

    <div class="section-title">Nota obtenida</div>
    <div class="box"><span class="nota-badge">${r.nota}%</span></div>

    <div class="section-title">Compromiso</div>
    <div class="box">${r.compromiso || "<em>Sin compromiso.</em>"}</div>

    <div class="section-title">Firma</div>
    ${firmaHtml}

    <div class="section-title">Evidencias</div>
    <div>${evidenciasHtml}</div>
  `;

  document.getElementById("detailBox").style.display = "block";
}

/* -------------------- EXPORTAR PDF -------------------- */
document.getElementById("pdfBtn")?.addEventListener("click", async () => {
  const detailBox = document.getElementById("detailBox");
  const canvas = await html2canvas(detailBox, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const img = canvas.toDataURL("image/png");
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth() - 20;
  const height = (canvas.height * pageWidth) / canvas.width;

  pdf.addImage(img, "PNG", 10, 10, pageWidth, height);
  pdf.save(`feedback_${currentFeedbackId}.pdf`);
});

/* -------------------- INICIO + AUTH -------------------- */
async function initApp() {
  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  document.getElementById("filtersSection").style.display = "block";
  document.getElementById("tableSection").style.display = "block";

  document.getElementById("filtroAsesor").addEventListener("change", () => {
    renderTabla();
    document.getElementById("detailBox").style.display = "none";
  });

  document.getElementById("filtroRegistrado").addEventListener("change", () => {
    renderTabla();
    document.getElementById("detailBox").style.display = "none";
  });

  document
    .querySelector("#tablaFeedback tbody")
    .addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-ver");
      if (btn) verDetalle(btn.dataset.id);
    });
}

onAuthStateChanged(auth, (user) => {
  const warning = document.getElementById("accessWarning");

  if (!user) {
    warning.style.display = "block";
    warning.textContent = "Inicia sesión para acceder.";
    return;
  }

  if (!SUPERVISOR_EMAILS.includes(user.email)) {
    warning.style.display = "block";
    warning.textContent = "No tienes permisos.";
    return;
  }

  warning.style.display = "none";
  initApp();
});
