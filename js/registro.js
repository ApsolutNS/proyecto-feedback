// js/registro.js
"use strict";

/* =========================================================
   REGISTRO.JS (M3)
   - RegistradoPor: colección "registradores" (solo activos)
   - Asesor monitoreado: colección "usuarios" (rol=agente, activo=true)
   - GC y Cargo: FIJOS desde "usuarios" (campos: GC y cargo)
   - NO usa colección "asesores"
========================================================= */

/* ---------------- FIREBASE IMPORTS ---------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

/* ---------------- CONFIG ---------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.firebasestorage.app",
  messagingSenderId: "512179147778",
  appId: "1:512179147778:web:795e4a8b177fe766d3431b",
  measurementId: "G-X6MP0FFH9P",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

/* ---------------- DOM REFS ---------------- */
const userEmailLabel = document.getElementById("userEmailLabel");

const registradoPorSel = document.getElementById("registradoPor");
const asesorSel = document.getElementById("asesor");
const cargoSel = document.getElementById("cargo");

const idLlamadaInput = document.getElementById("idLlamada");
const idContactoInput = document.getElementById("idContacto");
const tipoDetectadoInput = document.getElementById("tipoDetectado");

const cliDniInput = document.getElementById("cliDni");
const cliNombreInput = document.getElementById("cliNombre");
const cliTelInput = document.getElementById("cliTel");
const cliTipifInput = document.getElementById("cliTipif");
const cliObsInput = document.getElementById("cliObs");
const resumenInput = document.getElementById("resumen");

// ⚠️ OJO: en tu HTML hay 2 con el mismo id. Tomamos el primero.
const itemsContainer =
  document.querySelectorAll("#itemsContainer")?.[0] ||
  document.getElementById("itemsContainer");

const imgsInput = document.getElementById("imgs");
const imgPreviewContainer = document.getElementById("imgPreview");

const btnAddItem = document.getElementById("btnAddItem");
const btnClearItems = document.getElementById("btnClearItems");
const btnSubmit = document.getElementById("btnSubmit");
const msgEl = document.getElementById("msg");

// resumen
const notaPreviewEl = document.getElementById("notaPreview");
const scoreCircleEl = document.getElementById("scoreCircle");
const badgeCalidadEl = document.getElementById("badgeCalidad");
const infoPENCUFEl = document.getElementById("infoPENCUF");
const infoPECNEGEl = document.getElementById("infoPECNEG");
const infoPECUFEl = document.getElementById("infoPECUF");
const infoPECCUMPEl = document.getElementById("infoPECCUMP");
const infoEIEl = document.getElementById("infoEI");

/* ---------------- ESTADO ---------------- */
let currentUser = null;

/* ---------------- ITEMS DEFINICIÓN ---------------- */
const ITEMS = [
  // ERROR INEXCUSABLE
  { name: "Corte de Gestión", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Insulto / Falta de Respeto", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Normativa Regulatoria", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Protección de datos", perc: 100, tipo: "ERROR_INEXCUSABLE" },

  // PENCUF
  { name: "Contestación sin demora", perc: 5, tipo: "PENCUF" },
  { name: "Optimización de esperas", perc: 5, tipo: "PENCUF" },
  { name: "Empatía e implicación", perc: 7, tipo: "PENCUF" },
  { name: "Escucha Activa", perc: 7, tipo: "PENCUF" },
  { name: "Sondeo", perc: 7, tipo: "PENCUF" },
  { name: "Solicita datos de forma correcta y oportuna", perc: 7, tipo: "PENCUF" },
  { name: "Herramientas de Gestión", perc: 10, tipo: "PENCUF" },
  { name: "Codificación y Registro inConcert", perc: 7, tipo: "PENCUF" },
  { name: "Codificación y Registro en Monitor Logístico", perc: 7, tipo: "PENCUF" },
  { name: "Codificación y Registro en SmartSheet", perc: 7, tipo: "PENCUF" },
  { name: "Presentación", perc: 7, tipo: "PENCUF" },
  { name: "Personalización", perc: 7, tipo: "PENCUF" },
  { name: "Despedida", perc: 7, tipo: "PENCUF" },
  { name: "Encuesta de satisfacción", perc: 10, tipo: "PENCUF" },

  // PECNEG
  { name: "Lenguaje", perc: 30, tipo: "PECNEG" },
  { name: "Voz", perc: 30, tipo: "PECNEG" },
  { name: "Redacta de forma Correcta", perc: 30, tipo: "PECNEG" },
  { name: "Imagen trasladada", perc: 30, tipo: "PECNEG" },
  { name: "Actitud comercial", perc: 30, tipo: "PECNEG" },
  { name: "Operativa", perc: 30, tipo: "PECNEG" },
  { name: "Tramita la gestión correspondiente", perc: 30, tipo: "PECNEG" },
  { name: "Transferencia", perc: 30, tipo: "PECNEG" },

  // PECUF
  { name: "Cumple con devolución de llamado", perc: 35, tipo: "PECUF" },
  { name: "Actitud - Manejo de llamada", perc: 35, tipo: "PECUF" },
  { name: "Conocimientos para resolver la consulta", perc: 35, tipo: "PECUF" },
  { name: "Asesoramiento de Producto o Servicio (Pagina Web | Posible Compra | Servicios)", perc: 35, tipo: "PECUF" },
  { name: "Solución al primer contacto", perc: 35, tipo: "PECUF" },

  // PECCUMP
  { name: "Verificación de datos", perc: 10, tipo: "PECCUMP" },
  { name: "Damos el número de Ticket", perc: 10, tipo: "PECCUMP" },
];

/* =========================
   HELPERS
========================= */
function setMsg(text, ok = true) {
  if (!msgEl) return;
  msgEl.style.color = ok ? "#15803d" : "#b91c1c";
  msgEl.textContent = text || "";
}

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

function safeStr(x) {
  return (x ?? "").toString().trim();
}

/* =========================================================
   AUTH & INIT
========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    alert("Debes iniciar sesión para registrar monitoreos.");
    location.href = "login.html";
    return;
  }

  currentUser = user;

  if (userEmailLabel) {
    userEmailLabel.textContent = user.email || "Usuario autenticado";
  }

  // 1) Cargar combos dinámicos
  await cargarRegistradores();     // colección registradores (activos)
  await cargarUsuariosAgentes();   // colección usuarios (rol=agente, activo)
  // 2) Enlazar eventos
  inicializarEventos();
  // 3) Calcular nota inicial
  recalcularNotaPreview();
});

/* =========================================================
   CARGAR REGISTRADORES (colección: registradores)
   - Usa: registradoPorNombre + cargo, solo activo=true
   - value final: "Nombre - Cargo"
========================================================= */
async function cargarRegistradores() {
  if (!registradoPorSel) return;

  registradoPorSel.innerHTML = `<option value="">Cargando registradores...</option>`;

  try {
    const snap = await getDocs(collection(db, "registradores"));

    if (snap.empty) {
      registradoPorSel.innerHTML = `<option value="">(No hay registradores)</option>`;
      return;
    }

    const lista = snap.docs
      .map((d) => {
        const data = d.data() || {};
        const nombre = safeStr(data.registradoPorNombre);
        const cargo = safeStr(data.cargo);
        const activo = data.activo !== false;
        const label = [nombre, cargo].filter(Boolean).join(" - ").trim();
        return { id: d.id, nombre, cargo, activo, label };
      })
      .filter((x) => x.activo && x.label);

    lista.sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

    registradoPorSel.innerHTML =
      `<option value="">Selecciona...</option>` +
      lista.map((r) => `<option value="${escapeHTML(r.label)}">${escapeHTML(r.label)}</option>`).join("");
  } catch (err) {
    console.error("Error cargando registradores:", err);
    registradoPorSel.innerHTML = `<option value="">❌ Error al cargar registradores</option>`;
    setMsg("Error al cargar registradores. Revisa reglas/permisos.", false);
  }
}

/* =========================================================
   CARGAR ASESORES (desde colección: usuarios)
   - Filtra: rol == "agente" && activo != false
   - Usa campos:
       nombreAsesor (texto)
       cargo (texto)
       GC (texto)  <-- se guarda en option.dataset.gc
   - Fija el cargo al seleccionar asesor (select cargo queda bloqueado)
========================================================= */
async function cargarUsuariosAgentes() {
  if (!asesorSel) return;

  asesorSel.innerHTML = `<option value="">Cargando asesores...</option>`;

  try {
    // Si prefieres sin índices, puedes traer todo y filtrar (como hacías antes).
    // Esto usa where() para traer solo agentes (mejor si tienes índices):
    let snap;
    try {
      const qy = query(collection(db, "usuarios"), where("rol", "==", "agente"));
      snap = await getDocs(qy);
    } catch (e) {
      // fallback si no hay índice o falla:
      snap = await getDocs(collection(db, "usuarios"));
    }

    const agentes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => safeStr(u.rol).toLowerCase() === "agente")
      .filter((u) => u.activo !== false)
      .filter((u) => safeStr(u.nombreAsesor)) // obligatorio para mostrar
      .map((u) => ({
        uid: safeStr(u.uid) || safeStr(u.id),      // id del doc = uid
        nombreAsesor: safeStr(u.nombreAsesor),
        cargo: safeStr(u.cargo),                    // 👈 campo cargo
        GC: safeStr(u.GC),                          // 👈 campo GC
      }))
      .filter((u) => u.uid); // uid requerido

    if (!agentes.length) {
      asesorSel.innerHTML = `<option value="">(No hay agentes disponibles)</option>`;
      // cargo libre (por si quieres usarlo manual), pero no recomendado
      resetCargoSelect();
      return;
    }

    agentes.sort((a, b) => a.nombreAsesor.localeCompare(b.nombreAsesor, "es", { sensitivity: "base" }));

    asesorSel.innerHTML =
      `<option value="">Selecciona asesor...</option>` +
      agentes
        .map((a) => {
          const label = `${a.nombreAsesor} — ${a.cargo || "SIN CARGO"} — ${a.GC || "SIN GC"}`;
          return `
            <option
              value="${escapeHTML(a.nombreAsesor)}"
              data-uid="${escapeHTML(a.uid)}"
              data-gc="${escapeHTML(a.GC || "")}"
              data-cargo="${escapeHTML(a.cargo || "")}"
            >
              ${escapeHTML(label)}
            </option>`;
        })
        .join("");

    // al cargar, deja cargo “normal” hasta que elijan asesor
    resetCargoSelect();
  } catch (err) {
    console.error("Error cargando usuarios/agentes:", err);
    asesorSel.innerHTML = `<option value="">❌ Error al cargar agentes</option>`;
    resetCargoSelect();
    setMsg("Error al cargar asesores desde usuarios. Revisa permisos/rules.", false);
  }
}

function resetCargoSelect() {
  if (!cargoSel) return;

  // En tu HTML tienes 3 opciones; si quieres conservarlas:
  // (si ya vienen en el HTML, no toco innerHTML; solo habilito)
  cargoSel.disabled = false;

  // Si por algún motivo quedó con 1 opción fija, lo reseteamos a lo del HTML “original”
  // (Esto te evita quedarte con cargo fijo al deseleccionar asesor)
  const hasOnlyOne = cargoSel.querySelectorAll("option").length === 1;
  if (hasOnlyOne) {
    cargoSel.innerHTML = `
      <option>ASESOR INBOUND</option>
      <option>ASESOR CORREOS</option>
      <option>ASESOR REDES</option>
    `;
  }
}

function aplicarGCyCargoDesdeAsesor() {
  if (!asesorSel || !cargoSel) return;

  const opt = asesorSel.options[asesorSel.selectedIndex];
  if (!opt) return;

  const uid = safeStr(opt.dataset.uid);
  const gc = safeStr(opt.dataset.gc);
  const cargo = safeStr(opt.dataset.cargo);

  // Si no hay asesor seleccionado, libera cargo.
  if (!uid) {
    resetCargoSelect();
    return;
  }

  // Cargo fijo (solo 1 opción) + bloqueado
  const fixedCargo = cargo || "SIN CARGO";
  cargoSel.innerHTML = `<option value="${escapeHTML(fixedCargo)}">${escapeHTML(fixedCargo)}</option>`;
  cargoSel.value = fixedCargo;
  cargoSel.disabled = true;

  // GC no tiene input en tu HTML, pero queda guardado en dataset y se envía en el submit.
  // Si luego quieres mostrarlo en pantalla, me dices y lo pintamos en un helper/label.
}

/* =========================================================
   DETECTAR TIPO
========================================================= */
function detectarTipoTexto(text) {
  if (!text) return "NO IDENTIFICADO";
  const lower = text.toLowerCase();
  if (lower.includes("intefectivank") || lower.includes("vank")) return "EFECTIVANK";
  if (lower.includes("intefectiva")) return "EFECTIVA";
  if (lower.includes("intxperto")) return "XPERTO";
  if (lower.includes("facebook")) return "FACEBOOK";
  if (lower.includes("instagram")) return "INSTAGRAM";
  if (lower.includes("correo") || lower.includes("mail")) return "CORREO";
  return "OTRO";
}

function actualizarTipoDetectado() {
  const val = (idLlamadaInput?.value || "") + " " + (idContactoInput?.value || "");
  if (tipoDetectadoInput) tipoDetectadoInput.value = detectarTipoTexto(val);
}

/* =========================================================
   UI: ÍTEMS (bloques dinámicos)
========================================================= */
function crearItemBlock() {
  const w = document.createElement("div");
  w.className = "item-block";
  w.innerHTML = `
    <div class="item-main">
      <div class="item-header-row">
        <div class="item-header-left">
          <select class="item-select">
            <option value="">-- Selecciona ítem --</option>
            ${ITEMS.map((it) => `<option value="${escapeHTML(it.name)}">${escapeHTML(it.name)}</option>`).join("")}
          </select>
          <div class="item-meta"></div>
        </div>
        <div class="item-header-right">
          <button class="md-btn md-btn-text item-toggle" type="button" aria-expanded="false">
            <span class="material-symbols-outlined md-btn-icon">expand_more</span>
            Detalle
          </button>
          <button class="md-btn md-btn-text item-remove" type="button">Eliminar</button>
        </div>
      </div>

      <div class="item-body" style="display:none;">
        <div class="md-field">
          <label class="md-label">Detalle del ítem</label>
          <div class="md-input-wrapper">
            <textarea class="item-detail" rows="2" placeholder="Describe el incumplimiento..."></textarea>
          </div>
        </div>
      </div>
    </div>
  `;

  const select = w.querySelector(".item-select");
  const meta = w.querySelector(".item-meta");
  const toggleBtn = w.querySelector(".item-toggle");
  const removeBtn = w.querySelector(".item-remove");
  const body = w.querySelector(".item-body");
  const iconSpan = toggleBtn?.querySelector(".material-symbols-outlined");

  select?.addEventListener("change", () => {
    const it = ITEMS.find((x) => x.name === select.value);
    if (meta) meta.textContent = it ? `${it.perc}% · ${it.tipo.replace(/_/g, " ")}` : "";
    recalcularNotaPreview();
  });

  toggleBtn?.addEventListener("click", () => {
    const isOpen = body.style.display !== "none";
    body.style.display = isOpen ? "none" : "block";
    toggleBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
    if (iconSpan) iconSpan.textContent = isOpen ? "expand_more" : "expand_less";
  });

  removeBtn?.addEventListener("click", () => {
    w.remove();
    recalcularNotaPreview();
  });

  return w;
}

function obtenerItemsFormulario() {
  if (!itemsContainer) return [];
  const blocks = Array.from(itemsContainer.querySelectorAll(".item-block"));

  const items = [];
  for (const b of blocks) {
    const select = b.querySelector(".item-select");
    const detail = b.querySelector(".item-detail");
    if (!select || !detail) continue;

    const name = select.value;
    if (!name) continue;

    const meta = ITEMS.find((i) => i.name === name) || { tipo: "OTRO", perc: 0 };
    items.push({
      name,
      tipo: meta.tipo,
      perc: meta.perc,
      detail: detail.value || "",
    });
  }
  return items;
}

/* =========================================================
   PREVIEW IMÁGENES
========================================================= */
function manejarPreviewImagenes(event) {
  const files = event.target.files;
  if (!imgPreviewContainer) return;

  imgPreviewContainer.innerHTML = "";
  if (!files || !files.length) return;

  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.createElement("img");
      img.src = ev.target.result;
      imgPreviewContainer.appendChild(img);
    };
    reader.readAsDataURL(file);
  });
}

/* =========================================================
   CÁLCULO DE NOTA
========================================================= */
function calcularNota(items) {
  if (items.some((i) => i.tipo === "ERROR_INEXCUSABLE")) return 0;

  let nota = 100;

  const totalPENCUF = items
    .filter((i) => i.tipo === "PENCUF")
    .reduce((sum, i) => sum + (i.perc || 0), 0);

  const dedPENCUF = 25 * (totalPENCUF / 100);

  const hasPECNEG = items.some((i) => i.tipo === "PECNEG");
  const hasPECUF = items.some((i) => i.tipo === "PECUF");
  const hasPECCUMP = items.some((i) => i.tipo === "PECCUMP");

  nota -= dedPENCUF;
  if (hasPECNEG) nota -= 30;
  if (hasPECUF) nota -= 35;
  if (hasPECCUMP) nota -= 10;

  if (nota < 0) nota = 0;
  if (nota > 100) nota = 100;

  return Math.round(nota * 10) / 10;
}

function recalcularNotaPreview() {
  const items = obtenerItemsFormulario();
  const nota = calcularNota(items);

  const texto = nota.toFixed(1).replace(/\.0$/, "");
  if (notaPreviewEl) notaPreviewEl.textContent = texto;

  if (scoreCircleEl && badgeCalidadEl) {
    if (nota >= 85) {
      scoreCircleEl.classList.remove("bad");
      badgeCalidadEl.classList.remove("md-badge-bad");
      badgeCalidadEl.classList.add("md-badge-good");
      badgeCalidadEl.textContent = "🟢 Aprobado";
    } else {
      scoreCircleEl.classList.add("bad");
      badgeCalidadEl.classList.remove("md-badge-good");
      badgeCalidadEl.classList.add("md-badge-bad");
      badgeCalidadEl.textContent = "🔴 No aprobado";
    }
  }

  const totalPENCUF = items
    .filter((i) => i.tipo === "PENCUF")
    .reduce((s, i) => s + (i.perc || 0), 0);

  const dedPENCUF = 25 * (totalPENCUF / 100);
  const hasPECNEG = items.some((i) => i.tipo === "PECNEG");
  const hasPECUF = items.some((i) => i.tipo === "PECUF");
  const hasPECCUMP = items.some((i) => i.tipo === "PECCUMP");
  const hasEI = items.some((i) => i.tipo === "ERROR_INEXCUSABLE");

  if (infoPENCUFEl) infoPENCUFEl.textContent = totalPENCUF ? `-${dedPENCUF.toFixed(1)} pts (suma ${totalPENCUF}%)` : "Sin descuentos";
  if (infoPECNEGEl) infoPECNEGEl.textContent = hasPECNEG ? "-30 pts" : "Sin descuentos";
  if (infoPECUFEl) infoPECUFEl.textContent = hasPECUF ? "-35 pts" : "Sin descuentos";
  if (infoPECCUMPEl) infoPECCUMPEl.textContent = hasPECCUMP ? "-10 pts" : "Sin descuentos";
  if (infoEIEl) infoEIEl.textContent = hasEI ? "Aplica ⇒ nota 0" : "No aplicado";
}

/* =========================================================
   SUBMIT
========================================================= */
async function manejarSubmit() {
  setMsg("⏳ Subiendo monitoreo...", true);

  try {
    // Validaciones mínimas
    if (!registradoPorSel?.value) {
      setMsg("Debes seleccionar quién registra el monitoreo.", false);
      return;
    }
    if (!asesorSel?.value) {
      setMsg("Debes seleccionar al asesor monitoreado.", false);
      return;
    }

    const opt = asesorSel.options[asesorSel.selectedIndex];
    const asesorNombre = asesorSel.value;

    // ✅ Desde usuarios (dataset)
    const asesorUid = safeStr(opt?.dataset?.uid);
    const gc = safeStr(opt?.dataset?.gc) || "SIN GC";
    const cargoFixed = safeStr(opt?.dataset?.cargo) || safeStr(cargoSel?.value) || "SIN CARGO";

    if (!asesorUid) {
      setMsg("El asesor seleccionado no tiene UID. Revisa colección 'usuarios' (docId = uid).", false);
      return;
    }

    const items = obtenerItemsFormulario();
    const nota = calcularNota(items);

    // Subir evidencias
    const files = imgsInput?.files || [];
    const imageURLs = [];

    for (const f of files) {
      const safeName = f.name.replace(/[^\w.\-]/g, "_");
      const path = `monitoreo_imagenes/${Date.now()}_${safeName}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, f);
      const url = await getDownloadURL(storageRef);

      imageURLs.push({
        name: f.name,
        url,
        storagePath: storageRef.fullPath,
      });
    }

    // Armar data final
    const data = {
      idLlamada: safeStr(idLlamadaInput?.value),
      idContacto: safeStr(idContactoInput?.value),
      tipo: safeStr(tipoDetectadoInput?.value),

      asesor: asesorNombre,
      asesorId: asesorUid,  // docId en usuarios
      gc,                   // desde usuarios.GC
      cargo: cargoFixed,    // desde usuarios.cargo (FIJO)

      cliente: {
        dni: safeStr(cliDniInput?.value),
        nombre: safeStr(cliNombreInput?.value),
        tel: safeStr(cliTelInput?.value),
      },

      tipificacion: safeStr(cliTipifInput?.value),
      observacionCliente: safeStr(cliObsInput?.value),
      resumen: safeStr(resumenInput?.value),

      items,
      nota,
      imagenes: imageURLs,

      fecha: new Date().toISOString(),

      // ✅ desde registradores (label "Nombre - Cargo")
      registradoPor: registradoPorSel.value,

      estado: "PENDIENTE",

      // opcional (auditoría)
      creadoPorUid: currentUser?.uid || "",
      creadoPorEmail: currentUser?.email || "",
    };

    await addDoc(collection(db, "registros"), data);

    setMsg(`✔ Guardado correctamente · Nota final: ${nota}`, true);

    // Limpiar UI
    if (itemsContainer) itemsContainer.innerHTML = "";
    if (imgsInput) imgsInput.value = "";
    if (imgPreviewContainer) imgPreviewContainer.innerHTML = "";

    recalcularNotaPreview();
  } catch (err) {
    console.error(err);
    setMsg("❌ Error al guardar: " + (err?.message || err), false);
  }
}

/* =========================================================
   EVENTOS
========================================================= */
function inicializarEventos() {
  if (idLlamadaInput) idLlamadaInput.addEventListener("input", actualizarTipoDetectado);
  if (idContactoInput) idContactoInput.addEventListener("input", actualizarTipoDetectado);

  // ✅ Cuando cambias asesor -> fija cargo (y GC queda fijo en dataset)
  if (asesorSel) {
    asesorSel.addEventListener("change", () => {
      aplicarGCyCargoDesdeAsesor();
    });
  }

  if (btnAddItem) {
    btnAddItem.addEventListener("click", () => {
      if (!itemsContainer) return;
      itemsContainer.appendChild(crearItemBlock());
      recalcularNotaPreview();
    });
  }

  if (btnClearItems) {
    btnClearItems.addEventListener("click", () => {
      if (!itemsContainer) return;
      itemsContainer.innerHTML = "";
      recalcularNotaPreview();
    });
  }

  if (imgsInput) imgsInput.addEventListener("change", manejarPreviewImagenes);
  if (btnSubmit) btnSubmit.addEventListener("click", manejarSubmit);

  // Inicial
  actualizarTipoDetectado();
  aplicarGCyCargoDesdeAsesor(); // por si ya había un asesor preseleccionado
}

/* =========================================================
   (FIN)
========================================================= */
