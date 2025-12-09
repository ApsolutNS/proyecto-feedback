// js/portal_agente.js
// Portal del Agente conectado a Firebase Auth + rol "agente"
// Requiere: js/firebase.js exportando { app, db, storage }

"use strict";

/* ------------------------------
   IMPORTS FIREBASE
------------------------------ */
import { app, db, storage } from "./firebase.js";

import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

import {
  ref,
  uploadString,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

/* ------------------------------
   HELPERS
------------------------------ */

// Escapar HTML para evitar XSS
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c] || c));
}

// Parsear fecha desde distintos formatos (Timestamp, string, etc.)
function parseFecha(value) {
  if (!value) return new Date();
  if (value.toDate) return value.toDate(); // Timestamp Firestore
  if (typeof value === "string") {
    // ISO, etc.
    return new Date(value);
  }
  return new Date(value);
}

function formatearFechaLarga(date) {
  const opts = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  };
  let str = date.toLocaleDateString("es-PE", opts);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/* ------------------------------
   ESTADO GLOBAL
------------------------------ */

const auth = getAuth(app);

let currentUser = null;
let currentRole = null;
let currentAgentName = "";
let feedbackList = [];     // registros (feedback) del agente
let refuerzoList = [];     // refuerzos del agente (solo lectura)
let currentCollection = null; // "registros" o "refuerzos_calidad"
let currentID = null;
let signatureData = null;

// DOM refs
const selTipoDoc = document.getElementById("selTipoDoc");
const selRegistrador = document.getElementById("selRegistrador");
const tableBody = document.querySelector("#agentTable tbody");
const pendingBadge = document.getElementById("pendingBadge");
const detailBlock = document.getElementById("detailBlock");
const detailTitle = document.getElementById("detailTitle");
const feedbackInfo = document.getElementById("feedbackInfo");
const editableZone = document.getElementById("editableZone");
const compromisoInput = document.getElementById("compromiso");
const signaturePreview = document.getElementById("signaturePreview");
const fileSignatureInput = document.getElementById("fileSignature");
const agentMsg = document.getElementById("agentMsg");

// KPI refs
const kpiPromedio = document.getElementById("kpiPromedio");
const kpiTotal = document.getElementById("kpiTotal");
const kpiCompletados = document.getElementById("kpiCompletados");
const kpiPendientes = document.getElementById("kpiPendientes");

// NAV / usuario
const agentNameLabel = document.getElementById("agentNameLabel");
const agentEmailLabel = document.getElementById("agentEmailLabel");
const btnLogout = document.getElementById("btnLogout");
const btnGoDashboard = document.getElementById("btnGoDashboard");

// Modal firma
const signatureModal = document.getElementById("signatureModal");
const canvas = document.getElementById("sigCanvas");
const ctx = canvas.getContext("2d");
let drawing = false;

/* ------------------------------
   AUTH + ROL
------------------------------ */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }

  currentUser = user;
  agentEmailLabel.textContent = user.email || "";

  try {
    const userDocRef = doc(db, "usuarios", user.uid);
    const snap = await getDoc(userDocRef);

    if (!snap.exists()) {
      alert("Tu usuario no tiene configuración de rol. Contacta a Calidad.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    const data = snap.data();
    currentRole = data.rol || "agente";

    if (currentRole !== "agente") {
      // Si no es agente, mandarlo al dashboard general
      if (currentRole === "admin" || currentRole === "supervisor") {
        location.href = "index.html";
      } else {
        alert("Tu rol no tiene acceso a este portal.");
        await signOut(auth);
        location.href = "login.html";
      }
      return;
    }

    // Nombre que usaremos para filtrar registros
    currentAgentName =
      data.asesorNombre || data.nombre || user.displayName || user.email;

    agentNameLabel.textContent = currentAgentName;

    await loadAllData();
  } catch (err) {
    console.error("Error obteniendo rol:", err);
    alert("Error obteniendo tu rol. Intenta nuevamente.");
    await signOut(auth);
    location.href = "login.html";
  }
});

/* ------------------------------
   CARGA DE DATOS
------------------------------ */

async function loadAllData() {
  await loadFeedbacks();
  await loadRefuerzos();
  computeDashboard();
  renderTable();
}

// Feedbacks del agente (colección "registros")
async function loadFeedbacks() {
  feedbackList = [];
  if (!currentAgentName) return;

  const qRef = query(
    collection(db, "registros"),
    where("asesor", "==", currentAgentName)
  );

  const snap = await getDocs(qRef);
  snap.forEach((d) => {
    const r = d.data();
    const fecha = parseFecha(r.fecha);
    const nota = Number(r.nota || 0);
    const estado = r.estado || "PENDIENTE";

    feedbackList.push({
      id: d.id,
      collection: "registros",
      fecha,
      detalle: `${nota}%`,
      estado,
      registradoPor: r.registrado_por || r.registradoPor || "No especificado",
      etiqueta: "Feedback",
      nota,
      raw: r
    });
  });
}

// Refuerzos del agente (solo lectura)
async function loadRefuerzos() {
  refuerzoList = [];
  if (!currentAgentName) return;

  const snap = await getDocs(collection(db, "refuerzos_calidad"));

  snap.forEach((d) => {
    const r = d.data();
    const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
    const firmas = Array.isArray(r.firmas) ? r.firmas : [];

    const pertenece = asesoresRef.some(a => a.nombre === currentAgentName);
    if (!pertenece) return;

    const firmaAgente = firmas.find(f => f.nombre === currentAgentName);
    const estadoAgente =
      firmaAgente && firmaAgente.url ? "COMPLETADO" : "PENDIENTE";

    refuerzoList.push({
      id: d.id,
      collection: "refuerzos_calidad",
      fecha: parseFecha(r.fechaRefuerzo),
      detalle: r.tema || r.tipo || "Refuerzo / Capacitación",
      estado: estadoAgente,
      registradoPor: r.responsable || "No especificado",
      etiqueta: "Refuerzo",
      raw: r
    });
  });
}

/* ------------------------------
   MINI DASHBOARD DEL AGENTE
------------------------------ */

function computeDashboard() {
  if (!feedbackList.length) {
    kpiPromedio.textContent = "--";
    kpiTotal.textContent = "0";
    kpiCompletados.textContent = "0";
    kpiPendientes.textContent = "0";
    return;
  }

  const total = feedbackList.length;
  const completados = feedbackList.filter(
    (f) => (f.estado || "").toUpperCase() === "COMPLETADO"
  ).length;
  const pendientes = total - completados;
  const suma = feedbackList.reduce((acc, f) => acc + (f.nota || 0), 0);
  const promedio = suma / total;

  kpiPromedio.textContent = `${promedio.toFixed(1)}%`;
  kpiTotal.textContent = String(total);
  kpiCompletados.textContent = String(completados);
  kpiPendientes.textContent = String(pendientes);

  kpiPromedio.classList.remove("green", "red");
  if (promedio >= 85) {
    kpiPromedio.classList.add("green");
  } else {
    kpiPromedio.classList.add("red");
  }
}

/* ------------------------------
   TABLA PRINCIPAL
------------------------------ */

function renderTable() {
  const tipoDoc = selTipoDoc.value || "registros";
  const filtroReg = selRegistrador.value || "";

  const source = tipoDoc === "registros" ? feedbackList : refuerzoList;
  const list = source.slice().sort((a, b) => b.fecha - a.fecha);

  const filtrada = filtroReg
    ? list.filter((x) => x.registradoPor === filtroReg)
    : list;

  // badge de pendientes (sobre la lista filtrada)
  const pend = filtrada.filter((x) => x.estado === "PENDIENTE").length;
  pendingBadge.innerHTML = pend
    ? `<span class="badgePending">${pend} pendientes</span>`
    : "";

  if (!filtrada.length) {
    tableBody.innerHTML =
      "<tr><td colspan='6'>Sin registros para este filtro</td></tr>";
    detailBlock.style.display = "none";
    return;
  }

  tableBody.innerHTML = filtrada
    .map((r) => {
      return `
        <tr>
          <td>${escapeHTML(r.id)}</td>
          <td>${escapeHTML(r.fecha.toLocaleString("es-PE"))}</td>
          <td>
            ${escapeHTML(r.detalle)}
            <span class="tag-doc">${escapeHTML(r.etiqueta)}</span>
          </td>
          <td>${escapeHTML(r.estado)}</td>
          <td>${escapeHTML(r.registradoPor)}</td>
          <td>
            <button
              class="btn sm btn-open"
              data-collection="${r.collection}"
              data-id="${r.id}"
            >
              Abrir
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  // listeners de botones Abrir
  document.querySelectorAll(".btn-open").forEach((btn) => {
    btn.addEventListener("click", () => {
      const collectionName = btn.dataset.collection;
      const id = btn.dataset.id;
      openDetail(collectionName, id);
    });
  });
}

/* ------------------------------
   DETALLE DE DOCUMENTO
------------------------------ */

async function openDetail(collectionName, id) {
  currentCollection = collectionName;
  currentID = id;
  signatureData = null;
  agentMsg.textContent = "";
  agentMsg.style.color = "#4ade80";

  const docRef = doc(db, collectionName, id);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    alert("No existe este documento.");
    return;
  }

  const r = snap.data();

  if (collectionName === "registros") {
    renderDetalleFeedback(r);
  } else {
    renderDetalleRefuerzo(r);
  }

  detailBlock.style.display = "block";
}

// Detalle para colección "registros"
function renderDetalleFeedback(r) {
  detailTitle.textContent = "Detalle del Feedback";
  const fecha = parseFecha(r.fecha);
  const esReafirmacion = Number(r.nota || 0) === 100;
  const titulo = esReafirmacion ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";
  const nota = Number(r.nota || 0);
  const estado = r.estado || "PENDIENTE";

  const dniGC = (r.gc || "").toString().replace(/[^0-9]/g, "") || "-";

  const itemsHtml =
    (Array.isArray(r.items) && r.items.length
      ? r.items
          .map(
            (it) => `
        <div style="margin-bottom:4px">
          <strong>${escapeHTML(it.name || "Ítem")}</strong>
          ${it.perc ? ` (${escapeHTML(String(it.perc))}%)` : ""}
          <div style="margin-left:8px">${escapeHTML(it.detail || "")}</div>
        </div>
      `
          )
          .join("")
      : "<em>Sin ítems observados</em>");

  const imgsHtml =
    (Array.isArray(r.imagenes) && r.imagenes.length
      ? r.imagenes
          .map(
            (im) => `
        <img
          src="${im.url}"
          style="width:100%;max-width:680px;margin-top:8px;border-radius:6px"
        >
      `
          )
          .join("")
      : "<em>Sin evidencias adjuntas</em>");

  const registrador =
    r.registrado_por || r.registradoPor || "No especificado";

  feedbackInfo.innerHTML = `
    <div class="letter-header">
      <div class="letter-title">${escapeHTML(titulo)}</div>
      <img
        src="https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media"
        alt="Logo"
        style="max-height:42px"
      >
    </div>
    <p>
      Por medio de la presente se deja constancia que el
      <strong>${escapeHTML(formatearFechaLarga(fecha))}</strong>
      se realiza una <strong>${escapeHTML(titulo)}</strong> al/la colaborador(a)
      <strong>${escapeHTML(r.asesor || "")}</strong> con DNI
      <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de Asesor(a)
      Financiero(a), para el cumplimiento de los parámetros de la llamada.
    </p>
    <p>
      Registrado por:
      <span class="pill">${escapeHTML(registrador)}</span>
    </p>

    <div class="section-title">Cliente</div>
    <div style="margin-left:8px">
      <div><strong>DNI:</strong> ${escapeHTML(r.cliente?.dni || "")}</div>
      <div><strong>Nombre:</strong> ${escapeHTML(r.cliente?.nombre || "")}</div>
      <div><strong>Teléfono:</strong> ${escapeHTML(r.cliente?.tel || "")}</div>
      <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "")}</div>
      <div><strong>Comentario:</strong> ${escapeHTML(r.observacionCliente || "")}</div>
    </div>

    <div class="section-title">Gestión monitoreada</div>
    <div style="margin-left:8px">
      <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "")}</div>
      <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "")}</div>
      <div><strong>Tipo:</strong> ${escapeHTML(r.tipo || "")}</div>
      <div style="margin-top:6px">
        <strong>Resumen:</strong>
        <div style="padding:6px 8px;background:#e5e7eb;border-radius:4px;margin-top:2px">
          ${escapeHTML(r.resumen || "")}
        </div>
      </div>
    </div>

    <div class="section-title">Ítems observados</div>
    <div style="margin-left:8px">${itemsHtml}</div>

    <div class="section-title">Nota obtenida</div>
    <div style="margin-left:8px;margin-bottom:6px">
      <div
        style="
          display:inline-block;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid #fecaca;
          background:#fef2f2;
          color:#b91c1c;
          font-weight:bold;
        "
      >
        ${escapeHTML(String(nota))}%
      </div>
      <div style="font-size:11px;color:#6b7280;margin-top:4px">
        Estado: <strong>${escapeHTML(estado)}</strong>
      </div>
    </div>

    <div class="section-title">Compromiso del agente</div>
    <div style="margin-left:8px">
      ${r.compromiso ? escapeHTML(r.compromiso) : "<em>Pendiente</em>"}
    </div>

    <div class="section-title">Evidencias</div>
    <div style="margin-left:8px">${imgsHtml}</div>
  `;

  // Si el feedback ya está completado → no permitir editar
  if ((r.estado || "").toUpperCase() === "COMPLETADO") {
    editableZone.style.display = "none";
    agentMsg.style.color = "#22c55e";
    agentMsg.textContent = "Este feedback ya fue completado.";
  } else {
    editableZone.style.display = "block";
    compromisoInput.value = r.compromiso || "";
    signatureData = r.firmaUrl || null;
    updateSignaturePreview();
  }
}

// Detalle para "refuerzos_calidad" (solo lectura)
function renderDetalleRefuerzo(r) {
  detailTitle.textContent = "Detalle del Refuerzo / Capacitación";

  const fechaRef = parseFecha(r.fechaRefuerzo);
  const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
  const firmas = Array.isArray(r.firmas) ? r.firmas : [];

  const asesoresTexto = asesoresRef.length
    ? asesoresRef
        .map((a) =>
          `${a.nombre}${a.gc ? " (" + a.gc + ")" : ""}`
        )
        .join(", ")
    : (r.publico || "—");

  const firmaAgente = firmas.find((f) => f.nombre === currentAgentName);
  const compromisoAgente = firmaAgente?.compromiso || "";
  const firmaUrlAgente = firmaAgente?.url || null;
  const fechaFirma = firmaAgente?.fechaFirma
    ? new Date(firmaAgente.fechaFirma).toLocaleString("es-PE")
    : "";

  feedbackInfo.innerHTML = `
    <div class="letter-header">
      <div class="letter-title">REFUERZO / CAPACITACIÓN</div>
      <img
        src="https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media"
        style="max-height:42px"
        alt="Firma Calidad"
      >
    </div>
    <p>
      Se deja constancia que el
      <strong>${escapeHTML(formatearFechaLarga(fechaRef))}</strong>
      se realizó un <strong>${escapeHTML(r.tipo || "refuerzo / capacitación")}</strong>
      sobre <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
    </p>
    <p style="margin-left:8px">
      ${escapeHTML(asesoresTexto)}
    </p>
    <p>
      Responsable de la sesión:
      <span class="pill">${escapeHTML(r.responsable || "Calidad & Formación")}</span>
    </p>

    <div class="section-title">Objetivo del refuerzo</div>
    <div style="margin-left:8px">
      ${escapeHTML(r.objetivo || "—")}
    </div>

    <div class="section-title">Detalle / acuerdos clave</div>
    <div style="margin-left:8px">
      ${escapeHTML(r.detalle || "—")}
    </div>

    <div class="section-title">Compromiso del agente</div>
    <div style="margin-left:8px">
      ${
        compromisoAgente
          ? escapeHTML(compromisoAgente)
          : "<em>Pendiente (se registra internamente)</em>"
      }
    </div>

    <div class="section-title">Firma actual del agente</div>
    <div style="margin-left:8px">
      ${
        firmaUrlAgente
          ? `
            <img
              src="${firmaUrlAgente}"
              style="max-width:260px;border:1px solid #475569;border-radius:6px;margin-top:6px"
            >
            <div style="font-size:11px;color:#6b7280;margin-top:4px">
              Fecha de firma: ${escapeHTML(fechaFirma)}
            </div>
          `
          : "<em>Sin firma registrada (vista solo lectura)</em>"
      }
    </div>
  `;

  // Por reglas de seguridad, el agente NO escribe en refuerzos_calidad
  editableZone.style.display = "none";
  agentMsg.style.color = "#9ca3af";
  agentMsg.textContent =
    "Este refuerzo es solo de consulta desde este portal. Las firmas se gestionan internamente.";
}

/* ------------------------------
   FIRMA + COMPROMISO (SOLO REGISTROS)
------------------------------ */

function updateSignaturePreview() {
  if (signatureData) {
    signaturePreview.className = "signature-preview";
    signaturePreview.innerHTML = `<img src="${signatureData}" alt="Firma">`;
  } else {
    signaturePreview.className = "signature-preview-empty";
    signaturePreview.textContent = "Sin firma seleccionada";
  }
}

async function saveSignature() {
  if (!currentID || !currentCollection) {
    alert("No hay documento abierto.");
    return;
  }

  // Solo permitimos firmar documentos de la colección "registros"
  if (currentCollection !== "registros") {
    alert("Solo puedes firmar tus feedbacks de calidad desde este portal.");
    return;
  }

  const compromiso = (compromisoInput.value || "").trim();
  if (!compromiso) {
    alert("El compromiso es obligatorio.");
    return;
  }
  if (!signatureData) {
    alert("Debes subir o dibujar una firma.");
    return;
  }

  agentMsg.style.color = "#4ade80";
  agentMsg.textContent = "Guardando...";

  try {
    const fileName = `${currentID}_${Date.now()}.png`;
    const sigRef = ref(storage, `firmas/${fileName}`);
    await uploadString(sigRef, signatureData, "data_url");
    const url = await getDownloadURL(sigRef);

    const docRef = doc(db, "registros", currentID);
    await updateDoc(docRef, {
      compromiso,
      firmaUrl: url,
      estado: "COMPLETADO"
    });

    agentMsg.textContent = "Feedback completado ✓";
    editableZone.style.display = "none";

    // Recargar feedbacks y dashboard
    await loadFeedbacks();
    computeDashboard();
    renderTable();
  } catch (err) {
    console.error("Error guardando firma:", err);
    agentMsg.style.color = "red";
    agentMsg.textContent = "Error: " + err.message;
  }
}

/* ------------------------------
   DIBUJAR FIRMA (CANVAS)
------------------------------ */

function getPosFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function startDraw(e) {
  e.preventDefault();
  drawing = true;
  ctx.beginPath();
  const { x, y } = getPosFromEvent(e);
  ctx.moveTo(x, y);
}

function draw(e) {
  if (!drawing) return;
  e.preventDefault();
  const { x, y } = getPosFromEvent(e);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#000000";
  ctx.lineTo(x, y);
  ctx.stroke();
}

function endDraw(e) {
  e && e.preventDefault();
  drawing = false;
}

// eventos mouse
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", draw);
canvas.addEventListener("mouseup", endDraw);
canvas.addEventListener("mouseleave", endDraw);

// eventos touch
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", draw, { passive: false });
canvas.addEventListener("touchend", endDraw, { passive: false });
canvas.addEventListener("touchcancel", endDraw, { passive: false });

/* ------------------------------
   EVENTOS DOM
------------------------------ */

// Cambiar tipo documento / registrador
selTipoDoc.addEventListener("change", () => {
  renderTable();
});

selRegistrador.addEventListener("change", () => {
  renderTable();
});

// Botones de firma
document.getElementById("btnDrawSignature").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signatureModal.style.display = "flex";
});

document.getElementById("btnUploadSignature").addEventListener("click", () => {
  fileSignatureInput.click();
});

document.getElementById("btnSaveSignature").addEventListener("click", () => {
  saveSignature();
});

// Input de archivo
fileSignatureInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    signatureData = ev.target.result;
    updateSignaturePreview();
  };
  reader.readAsDataURL(file);
});

// Botones modal
document.getElementById("btnClearCanvas").addEventListener("click", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

document.getElementById("btnCancelSignature").addEventListener("click", () => {
  signatureModal.style.display = "none";
});

document.getElementById("btnUseSignature").addEventListener("click", () => {
  signatureData = canvas.toDataURL("image/png");
  updateSignaturePreview();
  signatureModal.style.display = "none";
});

// Cerrar modal al clickear fondo
signatureModal.addEventListener("click", (e) => {
  if (e.target === signatureModal) {
    signatureModal.style.display = "none";
  }
});

// Navegación y logout
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

btnGoDashboard.addEventListener("click", () => {
  location.href = "index.html";
});
