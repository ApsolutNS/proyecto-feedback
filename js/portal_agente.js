// js/portal_agente.js
// Portal del Agente – MD3, modo claro/oscuro, modal, Auth + rol "agente"
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
   HELPERS
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
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  return new Date(value);
}

function formatearFechaLarga(fecha) {
  const f = fecha && fecha.toDate ? fecha.toDate() : new Date(fecha || Date.now());
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
   THEME (LIGHT / DARK)
------------------------------ */
const THEME_KEY = "portal_agent_theme";

function applyTheme(theme) {
  const root = document.documentElement;
  const btn = document.getElementById("btnTheme");
  root.setAttribute("data-theme", theme);
  if (btn) {
    btn.textContent = theme === "light" ? "🌙" : "☀️";
  }
}

(function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const initial = saved === "light" || saved === "dark" ? saved : "dark";
  applyTheme(initial);
})();

const themeBtn = document.getElementById("btnTheme");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });
}

/* ------------------------------
   AUTH + ROL AGENTE
------------------------------ */
const auth = getAuth(app);

let currentUser = null;
let currentRole = null;
let currentAdvisorName = "";

let currentID = null;
let currentCollection = null; // "registros" o "refuerzos_calidad"
let currentDocData = null;
let signatureData = null;

// Dashboard: solo feedbacks de "registros" del agente
let ultimosFeedbacks = [];

// Logo / firma Alex
const FIRMA_ALEX_URL =
  "https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media";

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

    const allowedRoles = ["agente"]; // si quieres pruebas, puedes añadir "admin"
    if (!allowedRoles.includes(currentRole)) {
      alert("No tienes acceso al Portal del Agente.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    const spanName = document.getElementById("agentNameSpan");
    const avatar = document.querySelector(".pa-user-avatar");
    if (spanName) {
      spanName.textContent =
        currentAdvisorName || currentUser.email || "(Agente)";
    }
    if (avatar) {
      const base = (currentAdvisorName || currentUser.email || "AG").trim();
      const initials = base
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() || "")
        .join("");
      avatar.textContent = initials || "AG";
    }

    if (!currentAdvisorName) {
      alert(
        "Tu usuario no tiene configurado el nombre de asesor (campo 'nombreAsesor' en 'usuarios')."
      );
      return;
    }

    await loadAgentList();
  } catch (err) {
    console.error("Error al validar rol del usuario:", err);
    alert("Error al validar tus permisos. Intenta luego.");
    await signOut(auth);
    location.href = "login.html";
  }
});

/* Logout */
const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    location.href = "login.html";
  });
}

/* ------------------------------
   DASHBOARD DEL AGENTE
------------------------------ */
function renderAgentDashboard() {
  const avgEl = document.getElementById("avgScore");
  const totalEl = document.getElementById("totalFb");
  const okEl = document.getElementById("okCount");
  const badEl = document.getElementById("badCount");
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
  totalEl.textContent = `${total}`;
  okEl.textContent = `${aprobados}`;
  badEl.textContent = `${noAprobados}`;
}

/* ------------------------------
   BADGE PENDIENTES
------------------------------ */
function updatePendingBadge(list) {
  const pend = list.filter(
    (x) => (x.estado || "").toUpperCase() === "PENDIENTE"
  ).length;
  const badge = document.getElementById("pendingBadge");
  if (!badge) return;
  badge.innerHTML = pend
    ? `<span class="badgePending">${pend} pendientes</span>`
    : "";
}

/* ------------------------------
   CARGA LISTA DOCUMENTOS
------------------------------ */
async function loadAgentList() {
  const tbody = document.querySelector("#agentTable tbody");
  if (!tbody) return;

  const tipoDoc = document.getElementById("selTipoDoc")?.value || "registros";
  const filtroRegistrador =
    document.getElementById("selRegistrador")?.value || "";

  currentCollection = tipoDoc;

  if (!currentAdvisorName) {
    tbody.innerHTML =
      "<tr><td colspan='5'>Tu usuario no tiene configurado el nombre de asesor.</td></tr>";
    updatePendingBadge([]);
    return;
  }

  const list = [];

  if (tipoDoc === "registros") {
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
        detalle: `${r.nota ?? 0}%`,
        estado: r.estado || "PENDIENTE",
        registradoPor: r.registrado_por || r.registradoPor || "No especificado",
        etiqueta: "Feedback",
        bruto: r,
      });
    });
    ultimosFeedbacks = list.slice();
    renderAgentDashboard();
  } else {
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

  list.sort((a, b) => b.fecha - a.fecha);
  updatePendingBadge(list);

  const filtrada = filtroRegistrador
    ? list.filter((x) => x.registradoPor === filtroRegistrador)
    : list;

  if (!filtrada.length) {
    tbody.innerHTML =
      "<tr><td colspan='5'>Sin registros para este filtro</td></tr>";
    return;
  }

  tbody.innerHTML = filtrada
    .map(
      (r) => `
      <tr data-id="${escapeHTML(r.id)}" data-col="${escapeHTML(r.collection)}">
        <td>${escapeHTML(r.id)}</td>
        <td>${escapeHTML(r.fecha.toLocaleString("es-PE"))}</td>
        <td>
          ${escapeHTML(r.detalle)}
          <span class="tag-doc">${escapeHTML(r.etiqueta)}</span>
        </td>
        <td>${escapeHTML(r.estado)}</td>
        <td>
          <button class="pa-tonal-button pa-tonal-button-sm pa-open-detail">
            Abrir
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  // Adjuntar listeners a los botones "Abrir" (sin inline JS)
  tbody.querySelectorAll(".pa-open-detail").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tr = e.currentTarget.closest("tr");
      if (!tr) return;
      const id = tr.getAttribute("data-id");
      const col = tr.getAttribute("data-col");
      if (id && col) openDetail(col, id);
    });
  });
}

/* Exponer para eventos de filtros */
window.loadAgentList = loadAgentList;

/* ------------------------------
   MODAL DETALLE (FEEDBACK / REFUERZO)
------------------------------ */
const detailModal = document.getElementById("detailModal");
const btnCloseDetail = document.getElementById("btnCloseDetail");

function openDetailModal() {
  if (!detailModal) return;
  detailModal.classList.add("pa-open");
}

function closeDetailModal() {
  if (!detailModal) return;
  detailModal.classList.remove("pa-open");
  signatureData = null;
}

if (btnCloseDetail) {
  btnCloseDetail.addEventListener("click", closeDetailModal);
}
if (detailModal) {
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) {
      closeDetailModal();
    }
  });
}

async function openDetail(collectionName, id) {
  currentCollection = collectionName;
  currentID = id;

  const detailTitle = document.getElementById("detailTitle");
  const detailSubtitle = document.getElementById("detailSubtitle");
  const feedbackDiv = document.getElementById("feedbackInfo");
  const editable = document.getElementById("editableZone");
  const msg = document.getElementById("agentMsg");
  if (!feedbackDiv || !editable || !msg) return;

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
  msg.textContent = "";
  msg.style.color = "#22c55e";

  if (collectionName === "registros") {
    if (detailTitle) detailTitle.textContent = "Detalle del Feedback";
    if (detailSubtitle)
      detailSubtitle.textContent = "Carta de retroalimentación de calidad";

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
      <div class="letter-header">
        <div class="letter-title">${escapeHTML(titulo)}</div>
        <img src="${FIRMA_ALEX_URL}" style="max-height:42px">
      </div>
      <p class="section-content">
        Por medio de la presente se deja constancia que el
        <strong>${escapeHTML(formatearFechaLarga(fecha))}</strong> se realiza una
        <strong>${escapeHTML(titulo)}</strong> al/la colaborador(a)
        <strong>${escapeHTML(r.asesor || "")}</strong> con DNI
        <strong>${escapeHTML(dniGC)}</strong>, quien ejerce la función de Asesor(a) Financiero(a),
        para el cumplimiento de los parámetros de la llamada.
      </p>
      <p class="section-content">
        Registrado por: <span class="pill">${escapeHTML(registrador)}</span>
      </p>

      <div class="section-title">Cliente</div>
      <div class="section-content">
        <div><strong>DNI:</strong> ${escapeHTML(r.cliente?.dni || "")}</div>
        <div><strong>Nombre:</strong> ${escapeHTML(r.cliente?.nombre || "")}</div>
        <div><strong>Teléfono:</strong> ${escapeHTML(r.cliente?.tel || "")}</div>
        <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "")}</div>
        <div><strong>Comentario:</strong> ${escapeHTML(
          r.observacionCliente || ""
        )}</div>
      </div>

      <div class="section-title">Gestión monitoreada</div>
      <div class="section-content">
        <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "")}</div>
        <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "")}</div>
        <div><strong>Tipo:</strong> ${escapeHTML(r.tipo || "")}</div>
        <div style="margin-top:6px">
          <strong>Resumen:</strong>
          <div class="resumen-box">
            ${escapeHTML(r.resumen || "")}
          </div>
        </div>
      </div>

      <div class="section-title">Ítems observados</div>
      <div class="section-content">
        ${itemsHtml}
      </div>

      <div class="section-title">Nota obtenida</div>
      <div class="section-content nota-box">
        <div class="nota-pill">
          ${escapeHTML((r.nota || 0).toString())}%
        </div>
        <div class="nota-estado">
          Estado: <strong>${escapeHTML(r.estado || "PENDIENTE")}</strong>
        </div>
      </div>

      <div class="section-title">Compromiso del agente</div>
      <div class="section-content">
        ${r.compromiso ? escapeHTML(r.compromiso) : "<em>Pendiente</em>"}
      </div>

      <div class="section-title">Evidencias</div>
      <div class="section-content">
        ${imgsHtml}
      </div>
    `;

    if ((r.estado || "").toUpperCase() === "COMPLETADO") {
      editable.style.display = "none";
      msg.style.color = "#22c55e";
      msg.textContent = "Este feedback ya fue completado.";
    } else {
      editable.style.display = "block";
      const ta = document.getElementById("compromiso");
      if (ta) ta.value = r.compromiso || "";
      signatureData = r.firmaUrl || null;
      updateSignaturePreview();
    }
  } else {
    // REFUERZO / CAPACITACIÓN
    if (detailTitle) detailTitle.textContent = "Detalle del Refuerzo / Capacitación";
    if (detailSubtitle)
      detailSubtitle.textContent =
        "Constancia de refuerzo / capacitación aplicada";

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
      <div class="letter-header">
        <div class="letter-title">REFUERZO / CAPACITACIÓN</div>
        <img src="${FIRMA_ALEX_URL}" style="max-height:42px">
      </div>
      <p class="section-content">
        Se deja constancia que el
        <strong>${escapeHTML(formatearFechaLarga(fechaRef))}</strong>
        se realizó un <strong>${escapeHTML(
          r.tipo || "refuerzo / capacitación"
        )}</strong> sobre
        <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
      </p>
      <p class="section-content">
        ${asesoresTexto}
      </p>
      <p class="section-content">
        Responsable de la sesión:
        <span class="pill">${escapeHTML(
          r.responsable || "Calidad & Formación"
        )}</span>
      </p>

      <div class="section-title">Objetivo del refuerzo</div>
      <div class="section-content">
        ${escapeHTML(r.objetivo || "—")}
      </div>

      <div class="section-title">Detalle / acuerdos clave</div>
      <div class="section-content">
        ${escapeHTML(r.detalle || "—")}
      </div>

      <div class="section-title">Compromiso del agente</div>
      <div class="section-content">
        ${
          compromisoAgente
            ? escapeHTML(compromisoAgente)
            : "<em>Pendiente</em>"
        }
      </div>

      <div class="section-title">Firma actual del agente</div>
      <div class="section-content">
        ${
          firmaUrlAgente
            ? `<img src="${escapeHTML(
                firmaUrlAgente
              )}" style="max-width:260px;border:1px solid #475569;border-radius:6px;margin-top:6px">
               <div class="nota-estado">Fecha de firma: ${escapeHTML(
                 fechaFirma
               )}</div>`
            : "<em>Sin firma registrada</em>"
        }
      </div>
    `;

    if (firmaUrlAgente && compromisoAgente) {
      editable.style.display = "none";
      msg.style.color = "#22c55e";
      msg.textContent = "Este refuerzo ya fue firmado por este agente.";
    } else {
      editable.style.display = "block";
      const ta = document.getElementById("compromiso");
      if (ta) ta.value = compromisoAgente || "";
      signatureData = firmaUrlAgente || null;
      updateSignaturePreview();
    }
  }

  openDetailModal();
}

/* ------------------------------
   PREVIEW DE FIRMA
------------------------------ */
function updateSignaturePreview() {
  const box = document.getElementById("signaturePreview");
  if (!box) return;

  if (signatureData) {
    box.className = "signature-preview";
    box.innerHTML = `<img src="${signatureData}">`;
  } else {
    box.className = "signature-preview-empty";
    box.textContent = "Sin firma seleccionada";
  }
}
/* ------------------------------
   GUARDAR FIRMA + COMPROMISO
   (con prevención de duplicado)
------------------------------ */
window.saveSignature = async function () {
  if (!currentID || !currentCollection) {
    alert("No hay documento abierto.");
    return;
  }

  const ta = document.getElementById("compromiso");
  const msg = document.getElementById("agentMsg");
  const editable = document.getElementById("editableZone");

  if (!ta || !msg || !editable) return;

  const compromiso = ta.value.trim();
  if (!compromiso) {
    alert("El compromiso es obligatorio.");
    return;
  }
  if (!signatureData) {
    alert("Debes subir o dibujar una firma.");
    return;
  }
  if (!currentAdvisorName) {
    alert("No se encontró el nombre del asesor asociado.");
    return;
  }

  msg.style.color = "#4ade80";
  msg.textContent = "Guardando...";

  try {
    const docRef = doc(db, currentCollection, currentID);
    const snap = await getDoc(docRef);
    const data = snap.data() || {};

    /* ==========================================================
       🔍 1) VERIFICAR SI YA EXISTE UNA FIRMA (NO SUBIR DE NUEVO)
       ========================================================== */
    let existingSignatureURL = null;

    if (currentCollection === "registros") {
      // feedback clásico
      existingSignatureURL = data.firmaUrl || null;

    } else if (currentCollection === "refuerzos_calidad") {
      // refuerzo/capacitación
      const firmas = Array.isArray(data.firmas) ? data.firmas : [];
      const fAgente = firmas.find(f => f.nombre === currentAdvisorName);
      existingSignatureURL = fAgente?.url || null;
    }

    let finalURL = existingSignatureURL;

    /* ==========================================================
       🔄 2) SUBIR SOLO SI NO EXISTE FIRMA PREVIA
       ========================================================== */
    if (!existingSignatureURL) {
      // Carpeta correcta según tipo
      let pathFolder = currentCollection === "registros"
        ? "firmas"
        : "firmas_refuerzos";

      let fileName =
        currentCollection === "registros"
          ? `${currentID}.png`
          : `${currentID}_${currentAdvisorName.replace(/[^a-zA-Z0-9]/g, "_")}.png`;

      const sigRef = ref(storage, `${pathFolder}/${fileName}`);

      // subir
      await uploadString(sigRef, signatureData, "data_url");

      // obtener url final
      finalURL = await getDownloadURL(sigRef);
    }

    /* ==========================================================
       📝 3) ACTUALIZAR DOCUMENTO
       ========================================================== */

    if (currentCollection === "registros") {
      await updateDoc(docRef, {
        compromiso,
        firmaUrl: finalURL,
        estado: "COMPLETADO",
      });

      msg.textContent = "Feedback completado ✓";

    } else {
      // REFUERZOS
      const firmas = Array.isArray(data.firmas) ? data.firmas : [];
      const nowIso = new Date().toISOString();

      const nuevasFirmas = firmas.map(f => {
        if (f.nombre === currentAdvisorName) {
          return {
            ...f,
            url: finalURL,
            fechaFirma: nowIso,
            compromiso,
          };
        }
        return f;
      });

      const allFirmados = nuevasFirmas.length > 0 && nuevasFirmas.every(f => f.url);

      await updateDoc(docRef, {
        firmas: nuevasFirmas,
        firmado: allFirmados,
        firmaNombre: currentAdvisorName,
        firmaFecha: nowIso,
        agenteNombre: currentAdvisorName,
      });

      msg.textContent = "Refuerzo firmado ✓";
    }

    /* ==========================================================
       ✔ FINAL
       ========================================================== */
    editable.style.display = "none";
    await loadAgentList(); // refrescar lista + dashboard

  } catch (e) {
    console.error(e);
    msg.style.color = "red";
    msg.textContent = "Error: " + e.message;
  }
};

/* Bind botón guardar */
const btnSave = document.getElementById("btnSave");
if (btnSave) {
  btnSave.addEventListener("click", () => {
    saveSignature();
  });
}

/* ------------------------------
   MODAL FIRMA - CANVAS
------------------------------ */
const signatureModal = document.getElementById("signatureModal");
const canvas = document.getElementById("sigCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
let drawing = false;

function openSignatureModal() {
  if (!signatureModal || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  signatureModal.classList.add("pa-open");
}

function closeSignatureModal() {
  if (!signatureModal) return;
  signatureModal.classList.remove("pa-open");
}

if (signatureModal) {
  signatureModal.addEventListener("click", (e) => {
    if (e.target === signatureModal) {
      closeSignatureModal();
    }
  });
}

function getPos(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.touches ? e.touches[0].clientX : e.clientX) - r.left,
    y: (e.touches ? e.touches[0].clientY : e.clientY) - r.top,
  };
}

if (canvas && ctx) {
  canvas.onmousedown = (e) => {
    drawing = true;
    ctx.beginPath();
    const p = getPos(e);
    ctx.moveTo(p.x, p.y);
  };
  canvas.onmouseup = () => (drawing = false);
  canvas.onmouseleave = () => (drawing = false);
  canvas.onmousemove = (e) => {
    if (!drawing) return;
    const p = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  canvas.addEventListener(
    "touchstart",
    (e) => {
      drawing = true;
      ctx.beginPath();
      const p = getPos(e);
      ctx.moveTo(p.x, p.y);
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchend",
    () => {
      drawing = false;
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = getPos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    },
    { passive: false }
  );
}

function clearCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function saveDrawnSignature() {
  if (!canvas) return;
  signatureData = canvas.toDataURL("image/png");
  updateSignaturePreview();
  closeSignatureModal();
}

/* Botones modal firma */
const btnDraw = document.getElementById("btnDraw");
if (btnDraw) btnDraw.addEventListener("click", openSignatureModal);

const btnClear = document.getElementById("btnClear");
if (btnClear) btnClear.addEventListener("click", clearCanvas);

const btnCancel = document.getElementById("btnCancel");
if (btnCancel) btnCancel.addEventListener("click", closeSignatureModal);

const btnUse = document.getElementById("btnUse");
if (btnUse) btnUse.addEventListener("click", saveDrawnSignature);

/* ------------------------------
   SUBIR ARCHIVO DE FIRMA
------------------------------ */
function triggerUpload() {
  const input = document.getElementById("fileSignature");
  if (input) input.click();
}

const btnUpload = document.getElementById("btnUpload");
if (btnUpload) btnUpload.addEventListener("click", triggerUpload);

const fileInput = document.getElementById("fileSignature");
if (fileInput) {
  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      signatureData = ev.target.result;
      updateSignaturePreview();
    };
    reader.readAsDataURL(file);
  };
}

/* ------------------------------
   LISTENERS DE FILTROS
------------------------------ */
const selTipoDoc = document.getElementById("selTipoDoc");
if (selTipoDoc) {
  selTipoDoc.addEventListener("change", () => loadAgentList());
}
const selReg = document.getElementById("selRegistrador");
if (selReg) {
  selReg.addEventListener("change", () => loadAgentList());
}
