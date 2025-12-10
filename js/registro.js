// js/registro.js
"use strict";

/* ---------------- FIREBASE IMPORTS ---------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

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

const itemsContainer = document.getElementById("itemsContainer");
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
/* Cada ítem: name, perc, tipo */
const ITEMS = [
  // ERROR INEXCUSABLE
  { name: "Corte de Gestión", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Insulto / Falta de Respeto", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Normativa Regulatoria", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Protección de datos", perc: 100, tipo: "ERROR_INEXCUSABLE" },

  // PENCUF (hasta -25 pts según % acumulado)
  { name: "Contestación sin demora", perc: 5, tipo: "PENCUF" },
  { name: "Optimización de esperas", perc: 5, tipo: "PENCUF" },
  { name: "Empatía e implicación", perc: 7, tipo: "PENCUF" },
  { name: "Escucha Activa", perc: 7, tipo: "PENCUF" },
  { name: "Sondeo", perc: 7, tipo: "PENCUF" },
  {
    name: "Solicita datos de forma correcta y oportuna",
    perc: 7,
    tipo: "PENCUF",
  },
  { name: "Herramientas de Gestión", perc: 10, tipo: "PENCUF" },
  { name: "Codificación y Registro inConcert", perc: 7, tipo: "PENCUF" },
  {
    name: "Codificación y Registro en Monitor Logístico",
    perc: 7,
    tipo: "PENCUF",
  },
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
  {
    name: "Conocimientos para resolver la consulta",
    perc: 35,
    tipo: "PECUF",
  },
  {
    name: "Asesoramiento de Producto o Servicio (Pagina Web | Posible Compra | Servicios)",
    perc: 35,
    tipo: "PECUF",
  },
  { name: "Solución al primer contacto", perc: 35, tipo: "PECUF" },

  // PECCUMP
  { name: "Verificación de datos", perc: 10, tipo: "PECCUMP" },
  { name: "Damos el número de Ticket", perc: 10, tipo: "PECCUMP" },
];

/* ---------------- AUTH & INIT ---------------- */
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

  await cargarAsesores();
  inicializarEventos();
  recalcularNotaPreview();
});

/* ---------------- CARGAR ASESORES (UID reales) ---------------- */
async function cargarAsesores() {
  if (!asesorSel) return;

  asesorSel.innerHTML = `<option value="">Cargando asesores...</option>`;

  try {
    const colRef = collection(db, "asesores");
    const snap = await getDocs(colRef);

    if (snap.empty) {
      asesorSel.innerHTML =
        '<option value="">(No hay asesores registrados)</option>';
      return;
    }

    const lista = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id, // UID REAL
        nombre: (data.nombre || "SIN NOMBRE").trim(),
        gc: (data.gc || data.GC || "").trim(),
      };
    });

    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    asesorSel.innerHTML =
      '<option value="">Selecciona asesor...</option>' +
      lista
        .map(
          (a) => `
        <option value="${a.nombre}"
                data-uid="${a.uid}"
                data-gc="${a.gc}">
          ${a.nombre} — ${a.gc || "SIN GC"}
        </option>`
        )
        .join("");
  } catch (err) {
    console.error("Error cargando asesores:", err);
    asesorSel.innerHTML =
      '<option value="">❌ Error al cargar asesores</option>';
    if (msgEl) {
      msgEl.style.color = "red";
      msgEl.textContent =
        "Error al cargar asesores. Verifica tus reglas o conexión.";
    }
  }
}

/* ---------------- DETECTAR TIPO ---------------- */
function detectarTipoTexto(text) {
  if (!text) return "NO IDENTIFICADO";
  const lower = text.toLowerCase();
  if (lower.includes("intefectivank") || lower.includes("vank"))
    return "EFECTIVANK";
  if (lower.includes("intefectiva")) return "EFECTIVA";
  if (lower.includes("intxperto")) return "XPERTO";
  if (lower.includes("facebook")) return "FACEBOOK";
  if (lower.includes("instagram")) return "INSTAGRAM";
  if (lower.includes("correo") || lower.includes("mail")) return "CORREO";
  return "OTRO";
}

function actualizarTipoDetectado() {
  const val =
    (idLlamadaInput?.value || "") + " " + (idContactoInput?.value || "");
  tipoDetectadoInput.value = detectarTipoTexto(val);
}

/* ---------------- UI: ÍTEMS ---------------- */
function crearItemBlock() {
  const w = document.createElement("div");
  w.className = "item-block";
  w.innerHTML = `
    <div class="item-main">
      <select class="item-select">
        <option value="">-- Selecciona ítem --</option>
        ${ITEMS.map(
          (it) => `<option value="${it.name}">${it.name}</option>`
        ).join("")}
      </select>
      <div class="item-meta"></div>
      <textarea class="item-detail"
        placeholder="Detalle del ítem: contexto, frase del cliente/asesor, impacto, etc."></textarea>
    </div>
    <button class="md-btn md-btn-text" type="button">
      Eliminar
    </button>
  `;

  const select = w.querySelector(".item-select");
  const meta = w.querySelector(".item-meta");
  const detail = w.querySelector(".item-detail");
  const removeBtn = w.querySelector("button");

  select.addEventListener("change", () => {
    const it = ITEMS.find((x) => x.name === select.value);
    if (it) {
      meta.textContent = `${it.perc}% · ${it.tipo.replace(/_/g, " ")}`;
    } else {
      meta.textContent = "";
    }
    recalcularNotaPreview();
  });

  detail.addEventListener("input", () => {
    // no-op, pero permite futuro uso
  });

  removeBtn.addEventListener("click", () => {
    w.remove();
    recalcularNotaPreview();
  });

  return w;
}

function obtenerItemsFormulario() {
  const blocks = Array.from(itemsContainer.querySelectorAll(".item-block"));
  const items = [];

  for (const b of blocks) {
    const select = b.querySelector(".item-select");
    const detail = b.querySelector(".item-detail");
    if (!select || !detail) continue;
    const name = select.value;
    if (!name) continue;

    const meta = ITEMS.find((i) => i.name === name) || {
      tipo: "OTRO",
      perc: 0,
    };

    items.push({
      name,
      tipo: meta.tipo,
      perc: meta.perc,
      detail: detail.value || "",
    });
  }
  return items;
}

/* ---------------- PREVIEW IMÁGENES ---------------- */
function manejarPreviewImagenes(event) {
  const files = event.target.files;
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

/* ---------------- CÁLCULO DE NOTA ---------------- */
/*
  Reglas:
  - Si hay ERROR_INEXCUSABLE → nota = 0
  - Nota base: 100
  - PENCUF → 25 * (sumaPercPENCUF / 100)
  - PECNEG → -30 (si hay al menos uno)
  - PECUF → -35 (si hay al menos uno)
  - PECCUMP → -10 (si hay al menos uno)
*/

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

  // nota
  const texto = nota.toFixed(1).replace(/\.0$/, "");
  notaPreviewEl.textContent = texto;

  // estilo
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

  // detalles por grupo
  const totalPENCUF = items
    .filter((i) => i.tipo === "PENCUF")
    .reduce((s, i) => s + (i.perc || 0), 0);
  const dedPENCUF = 25 * (totalPENCUF / 100);

  const hasPECNEG = items.some((i) => i.tipo === "PECNEG");
  const hasPECUF = items.some((i) => i.tipo === "PECUF");
  const hasPECCUMP = items.some((i) => i.tipo === "PECCUMP");
  const hasEI = items.some((i) => i.tipo === "ERROR_INEXCUSABLE");

  infoPENCUFEl.textContent = totalPENCUF
    ? `-${dedPENCUF.toFixed(1)} pts (suma ${totalPENCUF}%)`
    : "Sin descuentos";
  infoPECNEGEl.textContent = hasPECNEG ? "-30 pts" : "Sin descuentos";
  infoPECUFEl.textContent = hasPECUF ? "-35 pts" : "Sin descuentos";
  infoPECCUMPEl.textContent = hasPECCUMP ? "-10 pts" : "Sin descuentos";
  infoEIEl.textContent = hasEI ? "Aplica ⇒ nota 0" : "No aplicado";
}

/* ---------------- SUBMIT ---------------- */
async function manejarSubmit() {
  msgEl.style.color = "#15803d";
  msgEl.textContent = "⏳ Subiendo monitoreo...";

  try {
    if (!registradoPorSel.value) {
      msgEl.style.color = "#b91c1c";
      msgEl.textContent = "Debes seleccionar quién registra el monitoreo.";
      return;
    }
    if (!asesorSel.value) {
      msgEl.style.color = "#b91c1c";
      msgEl.textContent = "Debes seleccionar al asesor monitoreado.";
      return;
    }

    const opt = asesorSel.options[asesorSel.selectedIndex];
    const asesorNombre = asesorSel.value;
    const asesorUid = opt.dataset.uid || "";
    const gc = opt.dataset.gc || "SIN GC";

    if (!asesorUid) {
      msgEl.style.color = "#b91c1c";
      msgEl.textContent =
        "El asesor seleccionado no tiene UID configurado. Revisa la colección 'asesores'.";
      return;
    }

    const items = obtenerItemsFormulario();
    const nota = calcularNota(items);

    // subir evidencias
    const files = imgsInput.files || [];
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

    const data = {
      idLlamada: idLlamadaInput.value.trim(),
      idContacto: idContactoInput.value.trim(),
      tipo: tipoDetectadoInput.value.trim(),
      asesor: asesorNombre,
      asesorId: asesorUid, // ✅ UID REAL
      gc,
      cargo: cargoSel.value,
      cliente: {
        dni: cliDniInput.value.trim(),
        nombre: cliNombreInput.value.trim(),
        tel: cliTelInput.value.trim(),
      },
      tipificacion: cliTipifInput.value.trim(),
      observacionCliente: cliObsInput.value.trim(),
      resumen: resumenInput.value.trim(),
      items,
      nota,
      imagenes: imageURLs,
      fecha: new Date().toISOString(),
      registradoPor: registradoPorSel.value,
      estado: "PENDIENTE",
    };

    await addDoc(collection(db, "registros"), data);

    msgEl.style.color = "#15803d";
    msgEl.textContent = `✔ Guardado correctamente · Nota final: ${nota}`;

    // limpiar
    itemsContainer.innerHTML = "";
    imgsInput.value = "";
    imgPreviewContainer.innerHTML = "";
    recalcularNotaPreview();
  } catch (err) {
    console.error(err);
    msgEl.style.color = "#b91c1c";
    msgEl.textContent = "❌ Error al guardar: " + err.message;
  }
}

/* ---------------- EVENTOS ---------------- */
function inicializarEventos() {
  if (idLlamadaInput) {
    idLlamadaInput.addEventListener("input", actualizarTipoDetectado);
  }
  if (idContactoInput) {
    idContactoInput.addEventListener("input", actualizarTipoDetectado);
  }

  if (btnAddItem) {
    btnAddItem.addEventListener("click", () => {
      itemsContainer.appendChild(crearItemBlock());
      recalcularNotaPreview();
    });
  }

  if (btnClearItems) {
    btnClearItems.addEventListener("click", () => {
      itemsContainer.innerHTML = "";
      recalcularNotaPreview();
    });
  }

  if (imgsInput) {
    imgsInput.addEventListener("change", manejarPreviewImagenes);
  }

  if (btnSubmit) {
    btnSubmit.addEventListener("click", manejarSubmit);
  }
}
