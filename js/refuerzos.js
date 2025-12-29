// js/refuerzos.js
"use strict";

/* ---------------- FIREBASE IMPORTS ---------------- */
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* ---------------- CONSTANTES FIRESTORE ---------------- */
const colRefuerzos = collection(db, "refuerzos_calidad");
const colUsuarios = collection(db, "usuarios");
const colRegistradores = collection(db, "registradores");

let responsableActivo = null; // ← cache global

/* Correos con acceso a este módulo (coinciden con tus reglas isSupervisor()) */
const ALLOWED_SUPERVISORS = [
  "anunez@gefectiva.com",
  "ctorres@gefectiva.com",
  "karen@example.com"
];

/* ---------------- ESTADO GLOBAL ---------------- */
let refuerzosCache = [];
let filtroTexto = "";
let filtroEstado = "todos";
let asesoresMap = {};
let pdfActualId = null;

const auth = getAuth();

/* ---------------- QUILL (EDITOR DETALLE) ---------------- */
let quillDetalle = null;

function initQuill() {
  // Si no existe el contenedor o Quill no está cargado, salimos sin romper nada
  const editorEl = document.getElementById("detalleEditor");
  if (!editorEl) return;
  // Quill viene por CDN (window.Quill)
  if (typeof window.Quill === "undefined") {
    console.warn("Quill no está disponible. Revisa el script CDN y defer.");
    return;
  }
  // Evita reinicializar si se llama 2 veces
  if (quillDetalle) return;

  quillDetalle = new window.Quill("#detalleEditor", {
    theme: "snow",
    placeholder: "Escribe el detalle con listas, negrita, etc…",
    modules: {
      toolbar: [
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ align: [] }],
        ["link"],
        ["clean"]
      ]
    }
  });
}

function getDetalleFromEditor() {
  // Preferimos Quill si está activo
  if (quillDetalle) {
    const html = quillDetalle.root.innerHTML || "";
    // Si está vacío (Quill suele dejar <p><br></p>)
    const limpio = html.replace(/\s/g, "").toLowerCase();
    if (limpio === "<p><br></p>" || limpio === "<p></p>") return "";
    return html;
  }

  // Fallback: si existe textarea antiguo
  const ta = document.getElementById("detalle");
  return ta ? (ta.value || "").trim() : "";
}

function clearDetalleEditor() {
  if (quillDetalle) {
    quillDetalle.setText("");
    return;
  }
  const ta = document.getElementById("detalle");
  if (ta) ta.value = "";
}

/* ---------------- UTILIDADES DOM ---------------- */
function setLoading(show, text = "Procesando…") {
  const overlay = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  if (!overlay || !label) return;
  label.textContent = text;
  overlay.style.display = show ? "flex" : "none";
}

function setToday() {
  const inputFecha = document.getElementById("fecha");
  if (!inputFecha) return;
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");
  inputFecha.value = `${yyyy}-${mm}-${dd}`;
}

function formatearFechaLarga(fechaISO) {
  if (!fechaISO) return "-";
  const f = new Date(fechaISO);
  return f.toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return "-";
  return new Date(fechaISO).toLocaleDateString("es-PE");
}

function formatearFechaHora(fechaISO) {
  if (!fechaISO) return "";
  return new Date(fechaISO).toLocaleString("es-PE");
}

async function cargarResponsableActivo() {
  try {
    const snap = await getDocs(colRegistradores);

    const lider = snap.docs
      .map(d => d.data())
      .find(r =>
        r.activo === true &&
        r.cargo === "Líder de Calidad y Formación"
      );

    if (!lider) {
      alert("No hay un Líder de Calidad activo en registradores");
      return;
    }

    if (!lider.firmaUrl) {
      alert(
        "El Líder de Calidad activo no tiene firma registrada.\n" +
        "Debes subir una firma en Admin."
      );
      return;
    }

    responsableActivo = lider;

    // 👉 Actualiza input Responsable automáticamente
    const inputResp = document.getElementById("responsable");
    if (inputResp) {
      inputResp.value = `${lider.registradoPorNombre} - ${lider.cargo}`;
    }

  } catch (e) {
    console.error("Error cargando responsable:", e);
  }
}

/* ---------------- CARGAR ASESORES (DESDE usuarios) ---------------- */
async function cargarAsesores() {
  const cont = document.getElementById("asesoresContainer");
  if (!cont) return;

  try {
    setLoading(true, "Cargando asesores…");

    const snap = await getDocs(colUsuarios);

    const lista = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u =>
        u.rol === "agente" &&
        u.activo !== false &&
        u.nombreAsesor
      )
      .sort((a, b) =>
        a.nombreAsesor.localeCompare(b.nombreAsesor, "es", {
          sensitivity: "base"
        })
      );

    asesoresMap = {};
    cont.innerHTML = "";

    lista.forEach(u => {
      const id = u.uid || u.id;
      const nombre = u.nombreAsesor;
      const gc = u.GC || "SIN GC";
      const cargo = u.cargo || "";

      asesoresMap[id] = { nombre, gc, cargo };

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asesor-chip";
      btn.dataset.id = id;

      btn.innerHTML = `
        <span class="asesor-chip-name">${nombre}</span>
        <span class="asesor-chip-gc">
          ${gc} ${cargo ? "· " + cargo : ""}
        </span>
      `;

      btn.addEventListener("click", () => {
        btn.classList.toggle("selected");
      });

      cont.appendChild(btn);
    });

    if (!lista.length) {
      cont.innerHTML =
        "<div class='hint'>No hay asesores activos disponibles.</div>";
    }

  } catch (e) {
    console.error(e);
    cont.innerHTML =
      "<div class='hint'>Error cargando asesores</div>";
    alert("Error cargando asesores: " + e.message);
  } finally {
    setLoading(false);
  }
}

/* ---------------- CARGAR REFUERZOS ---------------- */
async function cargarRefuerzos() {
  setLoading(true, "Cargando refuerzos…");
  try {
    const snap = await getDocs(colRefuerzos);
    refuerzosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    refuerzosCache.sort((a, b) => {
      const fa = a.fechaRefuerzo ? new Date(a.fechaRefuerzo) : 0;
      const fb = b.fechaRefuerzo ? new Date(b.fechaRefuerzo) : 0;
      return fb - fa;
    });

    renderTabla();
  } catch (e) {
    console.error(e);
    alert("Error cargando refuerzos: " + e.message);
  } finally {
    setLoading(false);
  }
}

/* ---------------- ESTADO / FILTROS ---------------- */
function esIncompleto(r) {
  return !r.fechaRefuerzo || !r.tipo || !r.tema || !r.publico || !r.objetivo;
}

function filtrarLista() {
  const q = (filtroTexto || "").trim().toLowerCase();
  let lista = [...refuerzosCache];

  if (q) {
    lista = lista.filter(r => {
      const join = [
        r.tema || "",
        r.tipo || "",
        r.publico || "",
        r.detalle || "",
        r.objetivo || "",
        r.responsable || "",
        r.agenteNombre || ""
      ]
        .join(" ")
        .toLowerCase();

      return join.includes(q);
    });
  }

  if (filtroEstado !== "todos") {
    lista = lista.filter(r => {
      const incompleto = esIncompleto(r);
      const firmado = !!r.firmado;

      if (filtroEstado === "incompleto") return incompleto;
      if (filtroEstado === "firmado") return firmado && !incompleto;
      if (filtroEstado === "pendiente") return !firmado && !incompleto;

      return true;
    });
  }

  return lista;
}

function actualizarMetricas() {
  const total = refuerzosCache.length;
  const firmados = refuerzosCache.filter(
    r => r.firmado && !esIncompleto(r)
  ).length;
  const pendientes = refuerzosCache.filter(
    r => !r.firmado && !esIncompleto(r)
  ).length;

  const totalEl = document.getElementById("metricTotal");
  const firmadosEl = document.getElementById("metricFirmados");
  const pendientesEl = document.getElementById("metricPendientes");
  if (!totalEl || !firmadosEl || !pendientesEl) return;

  totalEl.textContent = total;
  firmadosEl.textContent = firmados;
  pendientesEl.textContent = pendientes;
}

function renderTabla() {
  const tbody = document.getElementById("tablaRefuerzos");
  if (!tbody) return;

  const lista = filtrarLista();
  actualizarMetricas();

  if (!lista.length) {
    tbody.innerHTML =
      "<tr><td colspan='6'>Sin refuerzos registrados con los criterios actuales.</td></tr>";
    return;
  }

  tbody.innerHTML = lista
    .map(r => {
      const fechaStr = r.fechaRefuerzo
        ? new Date(r.fechaRefuerzo).toLocaleDateString("es-PE")
        : "-";

      const incompleto = esIncompleto(r);
      const firmado = !!r.firmado;

      let estadoClase = "estado-pend";
      let estadoTexto = "Pendiente de firma";

      if (incompleto) {
        estadoClase = "estado-incomp";
        estadoTexto = "Datos incompletos";
      } else if (firmado) {
        estadoClase = "estado-ok";
        estadoTexto = "Firmado por agente";
      }

      const asesoresArr = Array.isArray(r.asesores) ? r.asesores : [];
      const firmasArr = Array.isArray(r.firmas) ? r.firmas : [];

      const totalA = asesoresArr.length;
      const firmadas = firmasArr.filter(f => f && f.url).length;

      const resumenFirmas = totalA
        ? `${firmadas}/${totalA} firmas`
        : r.firmaNombre || "—";

      const firmaFecha = r.firmaFecha
        ? new Date(r.firmaFecha).toLocaleString("es-PE")
        : totalA
        ? "Pendiente"
        : "";

      return `
        <tr>
          <td>${fechaStr}</td>
          <td>
            <div style="font-weight:500">${r.tema || ""}</div>
            <div style="font-size:11px;color:var(--muted);">
              ${r.tipo || ""}
            </div>
          </td>
          <td>${r.publico || ""}</td>
          <td style="font-size:11px;">
            <div><b>${resumenFirmas}</b></div>
            <div style="color:var(--muted);">${firmaFecha}</div>
          </td>
          <td>
            <span class="estado-pill ${estadoClase}">
              ${estadoTexto}
            </span>
          </td>
          <td>
            <div class="actions">
              <button
                class="btn-xs primary"
                type="button"
                data-action="verPdf"
                data-id="${r.id}"
              >
                📄 Ver PDF
              </button>
              <button
                class="btn-xs success"
                type="button"
                data-action="copiarLink"
                data-id="${r.id}"
              >
                ✍️ Link firma
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* ---------------- GUARDAR REFUERZO ---------------- */
async function guardarRefuerzo() {
  const fechaInput = document.getElementById("fecha")?.value;
  const tipo = document.getElementById("tipo")?.value;
  const tema = document.getElementById("tema")?.value.trim();
  const canal = document.getElementById("canal")?.value;
  if (!responsableActivo) {   alert("No hay Responsable de Calidad configurado.");   return; }  const responsable = `${responsableActivo.registradoPorNombre} - ${responsableActivo.cargo}`;
  const objetivo = document.getElementById("objetivo")?.value.trim();

  // ✅ AHORA DETALLE SALE DE QUILL (HTML)
  const detalle = getDetalleFromEditor().trim();

  const chipsSeleccionados = Array.from(
    document.querySelectorAll(".asesor-chip.selected")
  );

  const asesoresSeleccionados = chipsSeleccionados
    .map(chip => {
      const id = chip.dataset.id;
      const info = asesoresMap[id];
      if (!info) return null;
      return {
        asesorId: id,
        nombre: info.nombre,
        gc: info.gc || "",
        cargo: info.cargo || ""
      };
    })
    .filter(Boolean);

  const publico = asesoresSeleccionados.map(a => a.nombre).join(", ");

  if (!fechaInput || !tipo || !tema || !objetivo) {
    alert("Completa al menos: Fecha, Tipo, Tema y Objetivo.");
    return;
  }

  const fechaRefuerzo = new Date(fechaInput + "T00:00:00");

  const firmasIniciales = asesoresSeleccionados.map(a => ({
    asesorId: a.asesorId,
    nombre: a.nombre,
    gc: a.gc || "",
    cargo: a.cargo || "",
    url: "",
    fechaFirma: null,
    compromiso: ""
  }));

  const data = {
    fechaRefuerzo: fechaRefuerzo.toISOString(),
    tipo,
    tema,
    canal,
    publico,
    asesores: asesoresSeleccionados,
    responsable,
    responsableId: responsableActivo.registradorId,
    responsableNombre: responsableActivo.registradoPorNombre,
    responsableCargo: responsableActivo.cargo,
    responsableFirmaUrl: responsableActivo.firmaUrl,
    objetivo,
    detalle,
    firmado: false,
    firmaNombre: "",
    firmaFecha: null,
    agenteNombre: "",
    firmas: firmasIniciales,
    createdAt: serverTimestamp()
  };

  try {
    setLoading(true, "Guardando refuerzo…");
    await addDoc(colRefuerzos, data);
    alert("Refuerzo registrado correctamente.");
    limpiarFormulario();
    await cargarRefuerzos();
  } catch (e) {
    console.error(e);
    alert("Error al guardar: " + e.message);
  } finally {
    setLoading(false);
  }
}

/* ---------------- EDITOR TEXTO BÁSICO (CSP SAFE) ---------------- */
function initEditorBasico() {
  const editor = document.getElementById("detalleEditor");
  const hidden = document.getElementById("detalle");
  const toolbar = document.querySelector(".editor-toolbar");

  if (!editor || !hidden || !toolbar) return;

  toolbar.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const cmd = btn.dataset.cmd;
    editor.focus();
    document.execCommand(cmd, false, null);
  });

  editor.addEventListener("input", () => {
    hidden.value = editor.innerHTML;
  });
}


function limpiarFormulario() {
  // Fecha
  setToday();

  // Inputs normales
  const tipo = document.getElementById("tipo");
  const tema = document.getElementById("tema");
  const canal = document.getElementById("canal");
  const objetivo = document.getElementById("objetivo");

  if (tipo) tipo.value = "";
  if (tema) tema.value = "";
  if (canal) canal.value = "";
  if (objetivo) objetivo.value = "";

  // 🔹 LIMPIAR DETALLE (QUILL o fallback)
  const hidden = document.getElementById("detalle");

  // Caso 1: Quill activo
  if (typeof quillDetalle !== "undefined" && quillDetalle) {
    quillDetalle.setContents([]); // limpia visual
    if (hidden) hidden.value = ""; // limpia hidden
  } else {
    // Caso 2: editor básico
    const editor = document.getElementById("detalleEditor");
    if (editor) editor.innerHTML = "";
    if (hidden) hidden.value = "";
  }

  // Chips asesores
  document
    .querySelectorAll(".asesor-chip.selected")
    .forEach(ch => ch.classList.remove("selected"));
}


/* ---------------- PDF: TARJETAS DE FIRMAS ---------------- */
function construirTarjetasFirmas(ref) {
  const asesores = Array.isArray(ref.asesores) ? ref.asesores : [];
  const firmas = Array.isArray(ref.firmas) ? ref.firmas : [];

  return asesores
    .map(a => {
      const f = firmas.find(x => x.asesorId === a.asesorId) || {};
      const tieneFirma = !!f.url;

      const fechaFirmaTxt = f.fechaFirma
        ? formatearFechaHora(f.fechaFirma)
        : "Pendiente";

      const compromiso = f.compromiso || "<em>Sin compromiso registrado</em>";

      return `
        <div class="pdf-sign-card">
          <div class="pdf-sign-card-header">
            <div>
              <div class="pdf-sign-name">${a.nombre}</div>
              <div class="pdf-sign-gc">
                ${a.gc ? "GC: " + a.gc : ""}
                ${a.cargo ? "<br/>" + a.cargo : ""}
              </div>
            </div>
            <div class="${
              tieneFirma
                ? "pdf-sign-status pdf-sign-status-ok"
                : "pdf-sign-status"
            }">
              ${tieneFirma ? "Firmado" : "Pendiente"}
            </div>
          </div>
          <div class="pdf-sign-img ${tieneFirma ? "" : "pdf-sign-img-empty"}">
            ${
              tieneFirma
                ? `<img src="${f.url}" />`
                : "Sin firma registrada"
            }
          </div>
          <div class="pdf-sign-date">
            ${tieneFirma ? "Firmado el: " + fechaFirmaTxt : ""}
          </div>
          <div style="margin-top:4px;">
            <b>Compromiso:</b><br />
            ${compromiso}
          </div>
        </div>
      `;
    })
    .join("");
}

/* ---------------- PDF: RENDER CONTENIDO ---------------- */
function renderPdfContent(ref) {
  const cont = document.getElementById("pdfContentRefuerzo");
  if (!cont) return;

  const fechaLarga = formatearFechaLarga(ref.fechaRefuerzo);
  const fechaCorta = formatearFechaCorta(ref.fechaRefuerzo);

  const asesores = Array.isArray(ref.asesores) ? ref.asesores : [];
  const listadoAsesores = asesores.length
    ? asesores
        .map(a => `${a.nombre} ${a.gc ? "(" + a.gc + ")" : ""}`)
        .join(", ")
    : ref.publico || "—";

  cont.innerHTML = `
    <div class="pdf-header">
      <div class="pdf-title-block">
        <div class="pdf-main-title">REFUERZO / CAPACITACIÓN</div>
        <div class="pdf-subtitle">
          Registro formal de acciones de Calidad & Formación – Financiera Efectiva.
        </div>
      </div>
      <div>
        <div class="pdf-badge-fe">Calidad & Formación FE</div>
      </div>
    </div>

    <div class="pdf-section-body">
      <div class="pdf-field-row">
        <div class="pdf-field">
          <b>Fecha del refuerzo:</b> ${fechaLarga}
        </div>
        <div class="pdf-field">
          <b>Fecha corta:</b> ${fechaCorta}
        </div>
      </div>

      <div class="pdf-field-row">
        <div class="pdf-field">
          <b>Tipo de acción:</b> ${ref.tipo || "—"}
        </div>
        <div class="pdf-field">
          <b>Canal:</b> ${ref.canal || "—"}
        </div>
      </div>

      <div class="pdf-field-row">
        <div class="pdf-field">
          <b>Tema / título:</b> ${ref.tema || "—"}
        </div>
      </div>

      <div class="pdf-field-row" style="margin-top:4px;">
        <div class="pdf-field">
          <b>Responsable:</b> ${ref.responsable || "—"}
        </div>
      </div>
    </div>

    <div class="pdf-section-title">Asesores capacitados</div>
    <div class="pdf-section-body">
      <div class="pdf-objective-box">
        ${listadoAsesores}
      </div>
    </div>

    <div class="pdf-section-title">Objetivo del refuerzo</div>
    <div class="pdf-section-body">
      <div class="pdf-objective-box">
        ${ref.objetivo || "—"}
      </div>
    </div>

    <div class="pdf-section-title">Detalle / acuerdos clave</div>
    <div class="pdf-section-body">
      <div class="pdf-detail-box">
        ${ref.detalle || "—"}
      </div>
    </div>

    <div class="pdf-section-title">Firmas</div>
    <div class="pdf-section-body">
      <div class="pdf-signatures">
        <div class="pdf-sign-resp">
          <div class="pdf-sign-resp-title">Responsable de Calidad</div>
          <div class="pdf-sign-img">
            <img src="${ref.responsableFirmaUrl}" />
          </div>
          <div class="pdf-sign-resp-line"></div>
          <div><strong>${ref.responsableNombre}</strong></div>
          <div class="pdf-sign-resp-role">${ref.responsableCargo}</div>
        </div>

        <div class="pdf-sign-grid">
          ${construirTarjetasFirmas(ref)}
        </div>
      </div>
    </div>
  `;
}

/* ---------------- MODAL PDF ---------------- */
function abrirModalPdf(id) {
  pdfActualId = id;
  const modal = document.getElementById("pdfModal");
  const title = document.getElementById("pdfModalTitle");
  if (!modal || !title) return;

  const ref = refuerzosCache.find(x => x.id === id);
  title.textContent = "Vista previa del refuerzo (" + id + ")";

  if (ref) {
    renderPdfContent(ref);
  } else {
    const cont = document.getElementById("pdfContentRefuerzo");
    if (cont) cont.innerHTML = "<p>No se encontró información del refuerzo.</p>";
  }

  modal.style.display = "flex";
}

function cerrarModalPdf() {
  const modal = document.getElementById("pdfModal");
  if (modal) modal.style.display = "none";
}

/* ---------------- DESCARGAR PDF ---------------- */
async function descargarPdfActual() {
  if (!pdfActualId) {
    alert("No hay refuerzo seleccionado");
    return;
  }

  const element = document.getElementById("pdfContentRefuerzo");
  if (!element) return;

  try {
    setLoading(true, "Generando PDF…");

    // Asegurar imágenes cargadas
    const imgs = element.querySelectorAll("img");
    await Promise.all(
      Array.from(imgs).map(
        img =>
          new Promise(resolve => {
            if (img.complete) resolve();
            else img.onload = img.onerror = resolve;
          })
      )
    );

    const opt = {
      margin: 10,
      filename: `refuerzo_${pdfActualId}.pdf`,
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait"
      }
    };

    // html2pdf viene del script global (no es import)
    // eslint-disable-next-line no-undef
    await html2pdf().set(opt).from(element).save();
  } catch (e) {
    console.error(e);
    alert("Error al generar el PDF: " + e.message);
  } finally {
    setLoading(false);
  }
}

/* ---------------- LINK FIRMA AGENTE ---------------- */
async function copiarLinkFirma(id) {
  try {
    const base =
      window.location.origin === "null" ? "" : window.location.origin;

    const url = base
      ? `${base}/portal_agente.html?id=${id}`
      : `portal_agente.html?id=${id}`;

    await navigator.clipboard.writeText(url);
    alert("Link de firma copiado:\n" + url);
  } catch (e) {
    alert("No se pudo copiar. URL:\nportal_agente.html?id=" + id);
  }
}

/* ---------------- TEMA OSCURO / CLARO ---------------- */
const THEME_KEY = "fe_refuerzos_theme";

function applyTheme(theme) {
  const body = document.body;
  const themeBtn = document.getElementById("themeToggle");
  if (!themeBtn) return;

  if (theme === "dark") {
    body.classList.add("dark");
    themeBtn.textContent = "☀️ Modo claro";
  } else {
    body.classList.remove("dark");
    themeBtn.textContent = "🌙 Modo oscuro";
  }
}

/* ---------------- INICIALIZACIÓN CON AUTH ---------------- */
function initUIEvents() {
  // ✅ Iniciar Quill aquí (ya existe el DOM)
  initQuill();

  // Ir al dashboard
  const btnIrBuscador = document.getElementById("btnIrBuscador");
  if (btnIrBuscador) {
    btnIrBuscador.addEventListener("click", () => {
      window.location.href = "index.html";
    });
  }

  // Botones formulario
  const btnGuardar = document.getElementById("btnGuardar");
  const btnLimpiar = document.getElementById("btnLimpiar");
  if (btnGuardar) btnGuardar.addEventListener("click", guardarRefuerzo);
  if (btnLimpiar) btnLimpiar.addEventListener("click", limpiarFormulario);

  // Búsqueda y filtros
  const searchTabla = document.getElementById("searchTabla");
  const filtroEstadoSel = document.getElementById("filtroEstado");

  if (searchTabla) {
    searchTabla.addEventListener("input", e => {
      filtroTexto = e.target.value || "";
      renderTabla();
    });
  }

  if (filtroEstadoSel) {
    filtroEstadoSel.addEventListener("change", e => {
      filtroEstado = e.target.value;
      renderTabla();
    });
  }

  // Modal PDF: cerrar / descargar
  const pdfCloseBtn = document.getElementById("pdfCloseBtn");
  const pdfCloseBtnFooter = document.getElementById("pdfCloseBtnFooter");
  const pdfDownloadBtn = document.getElementById("pdfDownloadBtn");
  const pdfModal = document.getElementById("pdfModal");

  if (pdfCloseBtn) pdfCloseBtn.addEventListener("click", cerrarModalPdf);
  if (pdfCloseBtnFooter) pdfCloseBtnFooter.addEventListener("click", cerrarModalPdf);
  if (pdfDownloadBtn) pdfDownloadBtn.addEventListener("click", descargarPdfActual);

  if (pdfModal) {
    pdfModal.addEventListener("click", e => {
      if (e.target === pdfModal) cerrarModalPdf();
    });
  }

  // Delegación de eventos para botones de la tabla
  const tablaRefuerzos = document.getElementById("tablaRefuerzos");
  if (tablaRefuerzos) {
    tablaRefuerzos.addEventListener("click", e => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === "verPdf") {
        abrirModalPdf(id);
      } else if (action === "copiarLink") {
        copiarLinkFirma(id);
      }
    });
  }

  // Tema
  const themeBtn = document.getElementById("themeToggle");
  const savedTheme = localStorage.getItem(THEME_KEY) || "light";
  applyTheme(savedTheme);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const next = document.body.classList.contains("dark")
        ? "light"
        : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }
}

async function initRefuerzos() {
  setToday();

  await cargarResponsableActivo();
  await cargarAsesores();
  await cargarRefuerzos();

  initEditorBasico();
}

/* Protección con Auth + rol (coincide con tus reglas de Firestore) */
onAuthStateChanged(auth, async user => {
  if (!user) {
    // No logueado => login
    window.location.href = "login.html";
    return;
  }

  const email = (user.email || "").toLowerCase().trim();
  if (!ALLOWED_SUPERVISORS.includes(email)) {
    alert("No tienes permisos para acceder a este módulo.");
    window.location.href = "index.html";
    return;
  }

  // Usuario válido: inicializar todo
  initUIEvents();
  try {
    await initRefuerzos();
  } catch (e) {
    console.error("Error iniciando refuerzos:", e);
  }
});
