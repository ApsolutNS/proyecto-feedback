// js/portal_agente.js
// Portal del Agente – Material Design 3 + modo claro/oscuro + firmas sin duplicar
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
const auth = getAuth(app);

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
   ESTADO GLOBAL
------------------------------ */
let currentUser = null;
let currentAdvisorName = "";   // nombre exacto del asesor en los documentos "registros"
let currentID = null;
let currentCollection = "registros"; // "registros" o "refuerzos_calidad"
let currentDocData = null;
let signatureData = null;      // data_url de la firma actual
let ultimosFeedbacks = [];     // para el dashboard (solo registros)

const FIRMA_ALEX_URL =
  "https://firebasestorage.googleapis.com/v0/b/feedback-app-ac30e.firebasestorage.app/o/firmas%2FImagen1.png?alt=media";

/* ------------------------------
   MODO CLARO / OSCURO (toggle)
------------------------------ */
function applyTheme(theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  localStorage.setItem("portalAgenteTheme", theme);

  const iconSpan = document.querySelector("#btnTheme .material-symbols-outlined");
  const labelSpan = document.querySelector("#btnThemeLabel");
  if (iconSpan && labelSpan) {
    if (theme === "dark") {
      iconSpan.textContent = "dark_mode";
      labelSpan.textContent = "Oscuro";
    } else {
      iconSpan.textContent = "light_mode";
      labelSpan.textContent = "Claro";
    }
  }
}

function initTheme() {
  const stored = localStorage.getItem("portalAgenteTheme");
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
    return;
  }
  const prefersDark = window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function setupThemeToggle() {
  const btnTheme = document.getElementById("btnTheme");
  if (!btnTheme) return;
  btnTheme.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "light" ? "dark" : "light");
  });
}

/* ------------------------------
   AUTH + VINCULACIÓN CON USUARIO
------------------------------ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  currentUser = user;

  try {
    // Leer doc en colección "usuarios/{uid}"
    const uRef = doc(db, "usuarios", user.uid);
    const uSnap = await getDoc(uRef);
    if (!uSnap.exists()) {
      alert("No tienes permisos configurados. Contacta a tu supervisor.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    const data = uSnap.data();
    const rol = data.rol || data.role || "";
    currentAdvisorName =
      data.nombreAsesor ||
      data.nombreMostrar ||
      data.nombre ||
      data.displayName ||
      "";

    // Solo rol agente (puedes añadir 'admin' si quieres probar tú mismo)
    const allowedRoles = ["agente"];
    if (!allowedRoles.includes(rol)) {
      alert("No tienes acceso al Portal del Agente.");
      await signOut(auth);
      location.href = "login.html";
      return;
    }

    // Mostrar nombre del agente si existe span
    const nameSpan = document.getElementById("agentNameSpan");
    if (nameSpan) {
      nameSpan.textContent =
        currentAdvisorName || currentUser.email || "(Agente)";
    }

    if (!currentAdvisorName) {
      alert(
        "Tu usuario no tiene configurado el campo 'nombreAsesor' en la colección 'usuarios'."
      );
      return;
    }

    // Inicializar tema + eventos
    initTheme();
    setupThemeToggle();
    setupSignatureUI();
    setupFilterListeners();

    // Cargar lista inicial
    await loadAgentList();
  } catch (err) {
    console.error("Error al validar rol del usuario:", err);
    alert("Error al validar tus permisos. Intenta luego.");
    await signOut(auth);
    location.href = "login.html";
  }
});

// Logout (si pones botón en el navbar)
window.logout = async () => {
  await signOut(auth);
  location.href = "login.html";
};

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
    .map((f) => Number(f.bruto?.nota ?? f.nota ?? 0))
    .filter((n) => !Number.isNaN(n));

  const total = notas.length;
  const suma = notas.reduce((acc, n) => acc + n, 0);
  const promedio = total ? Math.round((suma / total) * 10) / 10 : 0;
  const aprobados = notas.filter((n) => n >= 85).length;
  const noAprobados = total - aprobados;

  avgEl.textContent = `${promedio}%`;
  totalEl.textContent = `${total}`;
  okEl.textContent = `${aprobados}`;
  badEl.textContent = `${noAprobados}`;
}

/* ------------------------------
   BADGE DE PENDIENTES
------------------------------ */
function updatePendingBadge(list) {
  const badge = document.getElementById("pendingBadge");
  if (!badge) return;
  const pendingCount = list.filter(
    (x) => (x.estado || "").toUpperCase() === "PENDIENTE"
  ).length;

  badge.innerHTML = pendingCount
    ? `<span class="badgePending">${pendingCount} pendientes</span>`
    : "";
}

/* ------------------------------
   CARGAR LISTA DEL AGENTE
------------------------------ */
window.loadAgentList = async function () {
  const tbody = document.querySelector("#agentTable tbody");
  if (!tbody) return;

  if (!currentAdvisorName) {
    tbody.innerHTML =
      "<tr><td colspan='5'>Tu usuario no tiene 'nombreAsesor' configurado.</td></tr>";
    updatePendingBadge([]);
    hideDetail();
    return;
  }

  const tipoDoc = document.getElementById("selTipoDoc")?.value || "registros";
  const filtroRegistrador =
    document.getElementById("selRegistrador")?.value || "";

  currentCollection = tipoDoc;
  const list = [];

  if (tipoDoc === "registros") {
    // === FEEDBACKS ===
    const qRef = query(
      collection(db, "registros"),
      where("asesor", "==", currentAdvisorName) // campo asesor, como me indicaste
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

    // Dashboard solo sobre feedbacks
    ultimosFeedbacks = list.slice();
    renderAgentDashboard();
  } else {
    // === REFUERZOS / CAPACITACIONES ===
    const snap = await getDocs(collection(db, "refuerzos_calidad"));
    snap.forEach((d) => {
      const r = d.data();
      const asesoresRef = Array.isArray(r.asesores) ? r.asesores : [];
      const pertenece = asesoresRef.some(
        (a) => a.nombre === currentAdvisorName
      );
      if (!pertenece) return;

      const firmas = Array.isArray(r.firmas) ? r.firmas : [];
      const firmaAgente = firmas.find(
        (f) => f.nombre === currentAdvisorName
      );
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

  // Filtro por "Registrado por"
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
      <tr>
        <td>${escapeHTML(r.id)}</td>
        <td>${escapeHTML(r.fecha.toLocaleString("es-PE"))}</td>
        <td>
          ${escapeHTML(r.detalle)}
          <span class="tag-doc">${escapeHTML(r.etiqueta)}</span>
        </td>
        <td>${escapeHTML(r.estado)}</td>
        <td>
          <button class="md3-chip" data-col="${r.collection}" data-id="${r.id}">
            <span class="material-symbols-outlined">visibility</span>
            <span>Ver</span>
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  // Delegación para botones "Ver"
  tbody.onclick = (ev) => {
    const btn = ev.target.closest("button[data-id]");
    if (!btn) return;
    const col = btn.getAttribute("data-col");
    const id = btn.getAttribute("data-id");
    openDetail(col, id);
  };
};

/* ------------------------------
   DETALLE (MODAL) FEEDBACK / REFUERZO
------------------------------ */
function showDetail() {
  const dialog = document.getElementById("detailDialog");
  const block = document.getElementById("detailBlock");
  if (dialog && typeof dialog.showModal === "function") {
    dialog.showModal();
  } else if (block) {
    block.style.display = "block";
  }
}

function hideDetail() {
  const dialog = document.getElementById("detailDialog");
  const block = document.getElementById("detailBlock");
  if (dialog && dialog.open) dialog.close();
  if (block) block.style.display = "none";
}

window.openDetail = async function (collectionName, id) {
  currentCollection = collectionName;
  currentID = id;

  const titleEl = document.getElementById("detailTitle");
  const feedbackDiv =
    document.getElementById("feedbackInfo") ||
    document.getElementById("detailBody");
  const editable = document.getElementById("editableZone");
  const msg = document.getElementById("agentMsg");
  const compromisoTA = document.getElementById("compromiso");

  if (!feedbackDiv || !editable || !msg || !compromisoTA) return;

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
    // --------- DETALLE FEEDBACK ----------
    if (titleEl) titleEl.textContent = "Detalle del Feedback";
    const fecha = toJSDate(r.fecha);
    const esReafirmacion = Number(r.nota) === 100;
    const titulo = esReafirmacion ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";
    const dniGC = r.gc ? r.gc.replace(/[^0-9]/g, "") : "-";

    const itemsHtml =
      (r.items || [])
        .map(
          (it) => `
          <div class="detalle-item">
            <strong>${escapeHTML(it.name || "")}</strong>
            ${it.perc ? ` (${escapeHTML(it.perc.toString())}%)` : ""}
            <div class="detalle-item-text">${escapeHTML(it.detail || "")}</div>
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
          )}" class="detalle-img">
        `
        )
        .join("") || "<em>Sin evidencias adjuntas</em>";

    const registrador = r.registrado_por || r.registradoPor || "No especificado";

    feedbackDiv.innerHTML = `
      <header class="detail-header">
        <div>
          <h2 class="detail-title">${escapeHTML(titulo)}</h2>
          <p class="detail-sub">
            ${escapeHTML(r.asesor || "")} · DNI ${escapeHTML(dniGC)}
          </p>
        </div>
        <img src="${FIRMA_ALEX_URL}" class="detail-logo">
      </header>

      <section class="detail-section">
        <h3>Resumen del monitoreo</h3>
        <p>
          El <strong>${escapeHTML(
            formatearFechaLarga(fecha)
          )}</strong> se realizó una
          <strong>${escapeHTML(titulo)}</strong> al/la colaborador(a)
          <strong>${escapeHTML(
            r.asesor || ""
          )}</strong> para el cumplimiento de los parámetros de la llamada.
        </p>
        <p>
          Registrado por:
          <span class="pill">${escapeHTML(registrador)}</span>
        </p>
      </section>

      <section class="detail-section">
        <h3>Cliente</h3>
        <div class="detail-grid">
          <div><strong>DNI:</strong> ${escapeHTML(r.cliente?.dni || "")}</div>
          <div><strong>Nombre:</strong> ${escapeHTML(r.cliente?.nombre || "")}</div>
          <div><strong>Teléfono:</strong> ${escapeHTML(r.cliente?.tel || "")}</div>
          <div><strong>Tipificación:</strong> ${escapeHTML(r.tipificacion || "")}</div>
        </div>
        <p class="detail-small">
          <strong>Comentario:</strong> ${escapeHTML(
            r.observacionCliente || ""
          )}
        </p>
      </section>

      <section class="detail-section">
        <h3>Gestión monitoreada</h3>
        <div class="detail-grid">
          <div><strong>ID Llamada:</strong> ${escapeHTML(r.idLlamada || "")}</div>
          <div><strong>ID Contacto:</strong> ${escapeHTML(r.idContacto || "")}</div>
          <div><strong>Tipo:</strong> ${escapeHTML(r.tipo || "")}</div>
        </div>
        <div class="resumen-box">
          ${escapeHTML(r.resumen || "")}
        </div>
      </section>

      <section class="detail-section">
        <h3>Ítems observados</h3>
        ${itemsHtml}
      </section>

      <section class="detail-section">
        <h3>Nota obtenida</h3>
        <div class="nota-box">
          <div class="nota-pill">${escapeHTML((r.nota || 0).toString())}%</div>
          <div class="nota-estado">
            Estado: <strong>${escapeHTML(r.estado || "PENDIENTE")}</strong>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3>Compromiso del agente</h3>
        <div class="detail-chip-area">
          ${
            r.compromiso
              ? escapeHTML(r.compromiso)
              : "<em>Aún no registras tu compromiso.</em>"
          }
        </div>
      </section>

      <section class="detail-section">
        <h3>Evidencias</h3>
        <div class="detail-imgs">
          ${imgsHtml}
        </div>
      </section>
    `;

    if ((r.estado || "").toUpperCase() === "COMPLETADO") {
      editable.style.display = "none";
      msg.style.color = "#22c55e";
      msg.textContent = "Este feedback ya fue completado.";
    } else {
      editable.style.display = "block";
      compromisoTA.value = r.compromiso || "";
      signatureData = r.firmaUrl || null;
      updateSignaturePreview();
    }
  } else {
    // --------- DETALLE REFUERZO ----------
    if (titleEl) titleEl.textContent = "Detalle del Refuerzo / Capacitación";

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

    const firmaAgente = firmas.find(
      (f) => f.nombre === currentAdvisorName
    );
    const compromisoAgente = firmaAgente?.compromiso || "";
    const firmaUrlAgente = firmaAgente?.url || null;
    const fechaFirma = firmaAgente?.fechaFirma
      ? new Date(firmaAgente.fechaFirma).toLocaleString("es-PE")
      : "";

    feedbackDiv.innerHTML = `
      <header class="detail-header">
        <div>
          <h2 class="detail-title">Refuerzo / Capacitación</h2>
          <p class="detail-sub">
            ${escapeHTML(r.tema || r.tipo || "Sesión de refuerzo")}
          </p>
        </div>
        <img src="${FIRMA_ALEX_URL}" class="detail-logo">
      </header>

      <section class="detail-section">
        <h3>Detalle de la sesión</h3>
        <p>
          El <strong>${escapeHTML(
            formatearFechaLarga(fechaRef)
          )}</strong> se realizó un
          <strong>${escapeHTML(r.tipo || "refuerzo / capacitación")}</strong>
          sobre <strong>${escapeHTML(r.tema || "—")}</strong>, dirigido a:
        </p>
        <p class="detail-chip-area">
          ${asesoresTexto}
        </p>
        <p>
          Responsable:
          <span class="pill">${escapeHTML(
            r.responsable || "Calidad & Formación"
          )}</span>
        </p>
      </section>

      <section class="detail-section">
        <h3>Objetivo</h3>
        <p>${escapeHTML(r.objetivo || "—")}</p>
      </section>

      <section class="detail-section">
        <h3>Detalle / acuerdos</h3>
        <p>${escapeHTML(r.detalle || "—")}</p>
      </section>

      <section class="detail-section">
        <h3>Compromiso del agente</h3>
        <div class="detail-chip-area">
          ${
            compromisoAgente
              ? escapeHTML(compromisoAgente)
              : "<em>Aún no registras tu compromiso para este refuerzo.</em>"
          }
        </div>
      </section>

      <section class="detail-section">
        <h3>Firma actual del agente</h3>
        <div class="detail-chip-area">
          ${
            firmaUrlAgente
              ? `
                <img src="${escapeHTML(
                  firmaUrlAgente
                )}" class="detalle-img">
                <div class="nota-estado">Firmado el ${escapeHTML(
                  fechaFirma
                )}</div>
              `
              : "<em>Sin firma registrada</em>"
          }
        </div>
      </section>
    `;

    if (firmaUrlAgente && compromisoAgente) {
      editable.style.display = "none";
      msg.style.color = "#22c55e";
      msg.textContent = "Este refuerzo ya fue firmado por este agente.";
    } else {
      editable.style.display = "block";
      compromisoTA.value = compromisoAgente || "";
      signatureData = firmaUrlAgente || null;
      updateSignaturePreview();
    }
  }

  showDetail();
};

/* ------------------------------
   FIRMA: PREVIEW + DIBUJO + UPLOAD
------------------------------ */
function updateSignaturePreview() {
  const box = document.getElementById("signaturePreview");
  if (!box) return;

  if (signatureData) {
    box.className = "signature-preview";
    box.innerHTML = `<img src="${signatureData}" alt="Firma del agente">`;
  } else {
    box.className = "signature-preview-empty";
    box.textContent = "Sin firma seleccionada";
  }
}

let drawing = false;
let canvas = null;
let ctx = null;
let modal = null;

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.touches ? e.touches[0].clientX : e.clientX) - rect.left,
    y: (e.touches ? e.touches[0].clientY : e.clientY) - rect.top,
  };
}

function openDrawModal() {
  if (!modal || !canvas || !ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  modal.classList.add("open");
}

function closeDrawModal() {
  if (!modal) return;
  modal.classList.remove("open");
}

function saveDrawnSignature() {
  if (!canvas) return;
  signatureData = canvas.toDataURL("image/png");
  updateSignaturePreview();
  closeDrawModal();
}

function clearCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function triggerUpload() {
  const input = document.getElementById("fileSignature");
  if (input) input.click();
}

function setupSignatureUI() {
  modal = document.getElementById("signatureModal");
  canvas = document.getElementById("sigCanvas");
  ctx = canvas ? canvas.getContext("2d") : null;

  if (canvas && ctx) {
    canvas.onmousedown = (e) => {
      drawing = true;
      ctx.beginPath();
      const p = getCanvasPos(e);
      ctx.moveTo(p.x, p.y);
    };
    canvas.onmouseup = () => (drawing = false);
    canvas.onmouseleave = () => (drawing = false);
    canvas.onmousemove = (e) => {
      if (!drawing) return;
      const p = getCanvasPos(e);
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
        const p = getCanvasPos(e);
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
        const p = getCanvasPos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      },
      { passive: false }
    );
  }

  const btnDraw = document.getElementById("btnDraw");
  const btnUpload = document.getElementById("btnUpload");
  const btnSave = document.getElementById("btnSave");
  const btnClear = document.getElementById("btnClear");
  const btnCancel = document.getElementById("btnCancel");
  const btnUse = document.getElementById("btnUse");
  const fileInput = document.getElementById("fileSignature");
  const btnCloseDetail = document.getElementById("btnCloseDetail");

  if (btnDraw) btnDraw.addEventListener("click", openDrawModal);
  if (btnUpload) btnUpload.addEventListener("click", triggerUpload);
  if (btnSave) btnSave.addEventListener("click", saveSignature);
  if (btnClear) btnClear.addEventListener("click", clearCanvas);
  if (btnCancel) btnCancel.addEventListener("click", closeDrawModal);
  if (btnUse) btnUse.addEventListener("click", saveDrawnSignature);
  if (btnCloseDetail) btnCloseDetail.addEventListener("click", hideDetail);

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

  updateSignaturePreview();
}

/* ------------------------------
   GUARDAR FIRMA + COMPROMISO
   (sin duplicar archivos: 1 archivo por agente)
------------------------------ */
async function saveSignature() {
  if (!currentID || !currentCollection) {
    alert("No hay documento abierto.");
    return;
  }
  if (!currentUser) {
    alert("Tu sesión ha expirado. Ingresa nuevamente.");
    location.href = "login.html";
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
    alert("No se encontró el nombre del asesor asociado a tu usuario.");
    return;
  }

  msg.style.color = "#22c55e";
  msg.textContent = "Guardando...";

  try {
    // 🔑 Evitar duplicar archivos:
    // usamos siempre la misma ruta por agente y tipo de documento,
    // así se sobrescribe el archivo anterior en vez de crear uno nuevo.
    let pathFolder = "firmas";
    if (currentCollection === "refuerzos_calidad") {
      pathFolder = "firmas_refuerzos";
    }

    const fileName = `${currentUser.uid}.png`; // 1 archivo por agente
    const sigRef = ref(storage, `${pathFolder}/${fileName}`);

    // Subir / sobrescribir firma
    await uploadString(sigRef, signatureData, "data_url");
    const url = await getDownloadURL(sigRef);

    // Actualizar documento en Firestore
    const docRef = doc(db, currentCollection, currentID);

    if (currentCollection === "registros") {
      // FEEDBACK: actualizamos solo compromiso, firmaUrl, estado
      await updateDoc(docRef, {
        compromiso,
        firmaUrl: url,
        estado: "COMPLETADO",
      });
      msg.textContent = "Feedback completado ✓";
    } else {
      // REFUERZOS: actualizamos la entrada correspondiente en el array "firmas"
      const snap = await getDoc(docRef);
      const data = snap.data() || {};
      const firmas = Array.isArray(data.firmas) ? data.firmas : [];
      const nowIso = new Date().toISOString();

      const nuevasFirmas = firmas.map((f) => {
        if (f.nombre === currentAdvisorName) {
          return {
            ...f,
            url,
            compromiso,
            fechaFirma: nowIso,
          };
        }
        return f;
      });

      const allFirmados =
        nuevasFirmas.length > 0 && nuevasFirmas.every((f) => !!f.url);

      await updateDoc(docRef, {
        firmas: nuevasFirmas,
        firmado: allFirmados,
        firmaNombre: currentAdvisorName,
        firmaFecha: nowIso,
        agenteNombre: currentAdvisorName,
      });

      msg.textContent = "Refuerzo firmado ✓";
    }

    // Bloqueamos zona editable y refrescamos lista
    editable.style.display = "none";
    await loadAgentList();
  } catch (e) {
    console.error(e);
    msg.style.color = "red";
    msg.textContent = "Error: " + (e.message || e.code || e);
  }
}

/* ------------------------------
   LISTENERS DE FILTROS
------------------------------ */
function setupFilterListeners() {
  const selTipoDoc = document.getElementById("selTipoDoc");
  const selReg = document.getElementById("selRegistrador");

  if (selTipoDoc) {
    selTipoDoc.addEventListener("change", () => loadAgentList());
  }
  if (selReg) {
    selReg.addEventListener("change", () => loadAgentList());
  }
}

/* ------------------------------
   NOTA FINAL SOBRE REGLAS
------------------------------ */
/*
⚠️ Para que NO vuelva a salir "Missing or insufficient permissions"
cuando el agente firma, tus reglas de Firestore para `registros` y
`refuerzos_calidad` deberían permitir que un "agente" actualice SOLO
los campos de firma/compromiso.

Ejemplo de patrón para registros (ajústalo a tu lógica):

match /registros/{docId} {
  allow read: if request.auth != null;
  allow write: if isSupervisor() || isAdmin();
  allow update: if isAgent()
    && request.resource.data.diff(resource.data).changedKeys().hasOnly(
         ['compromiso', 'firmaUrl', 'estado']
       )
    && request.resource.data.asesor == resource.data.asesor;
}

Y para refuerzos algo así:

match /refuerzos_calidad/{docId} {
  allow read: if request.auth != null;
  allow write: if isSupervisor() || isAdmin();
  allow update: if isAgent()
    && request.resource.data.diff(resource.data).changedKeys().hasOnly(
         ['firmas', 'firmado', 'firmaNombre', 'firmaFecha', 'agenteNombre']
       );
}

Además, las reglas de Storage ya deben tener:

match /firmas/{file} {
  allow read: if true;
  allow write: if request.auth != null;
}
match /firmas_refuerzos/{file} {
  allow read: if true;
  allow write: if request.auth != null;
}

*/

