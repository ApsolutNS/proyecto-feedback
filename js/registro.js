// registro.js
"use strict";

/* --------------------- FIREBASE IMPORTS ---------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";

/* --------------------- CONFIG ------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain: "feedback-app-ac30e.firebaseapp.com",
  projectId: "feedback-app-ac30e",
  storageBucket: "feedback-app-ac30e.firebasestorage.app",
  messagingSenderId: "512179147778",
  appId: "1:512179147778:web:795e4a8b177fe766d3431b",
  measurementId: "G-X6MP0FFH9P"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/* --------------------- ITEMS COMPLETOS ---------------------- */
/* name, perc (porcentaje), tipo (grupo) */
const ITEMS = [
  // ERROR INEXCUSABLE (nota 0 si aparece uno)
  { name: "Corte de Gestión", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Insulto / Falta de Respeto", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Normativa Regulatoria", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  { name: "Protección de datos", perc: 100, tipo: "ERROR_INEXCUSABLE" },
  // PENCUF - Penalización acumulable hasta 25 puntos (según porcentaje)
  { name: "Contestación sin demora", perc: 5, tipo: "PENCUF" },
  { name: "Optimización de esperas", perc: 5, tipo: "PENCUF" },
  { name: "Empatía e implicación", perc: 7, tipo: "PENCUF" },
  { name: "Escucha Activa", perc: 7, tipo: "PENCUF" },
  { name: "Sondeo", perc: 7, tipo: "PENCUF" },
  {
    name: "Solicita datos de forma correcta y oportuna",
    perc: 7,
    tipo: "PENCUF"
  },
  { name: "Herramientas de Gestión", perc: 10, tipo: "PENCUF" },
  { name: "Codificación y Registro inConcert", perc: 7, tipo: "PENCUF" },
  {
    name: "Codificación y Registro en Monitor Logístico",
    perc: 7,
    tipo: "PENCUF"
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
  // PECUF – un solo ítem → -35 pts (se acumula con PENCUF y otros grupos)
  { name: "Cumple con devolución de llamado", perc: 35, tipo: "PECUF" },
  { name: "Actitud - Manejo de llamada", perc: 35, tipo: "PECUF" },
  {
    name: "Conocimientos para resolver la consulta",
    perc: 35,
    tipo: "PECUF"
  },
  {
    name:
      "Asesoramiento de Producto o Servicio (Pagina Web | Posible Compra | Servicios)",
    perc: 35,
    tipo: "PECUF"
  },
  { name: "Solución al primer contacto", perc: 35, tipo: "PECUF" },
  // PECCUMP – un solo ítem → -10 pts
  { name: "Verificación de datos", perc: 10, tipo: "PECCUMP" },
  { name: "Damos el número de Ticket", perc: 10, tipo: "PECCUMP" },
  // Ninguno
  { name: "Ninguno", perc: 0, tipo: "NINGUNO" }
];

/* --------------------- DOM HELPERS ---------------------- */
const $ = (id) => document.getElementById(id);

const idLlamada = $("idLlamada");
const idContacto = $("idContacto");
const tipoDetectado = $("tipoDetectado");
const asesorSelect = $("asesor");
const cargoSelect = $("cargo");
const cliDni = $("cliDni");
const cliNombre = $("cliNombre");
const cliTel = $("cliTel");
const cliTipif = $("cliTipif");
const cliObs = $("cliObs");
const resumen = $("resumen");
const registradoPorSel = $("registradoPor");
const itemsContainer = $("itemsContainer");
const imgsInput = $("imgs");
const imgPreview = $("imgPreview");
const msgEl = $("msg");

const notaPreview = $("notaPreview");
const scoreCircle = $("scoreCircle");
const badgeCalidad = $("badgeCalidad");
const infoPENCUF = $("infoPENCUF");
const infoPECNEG = $("infoPECNEG");
const infoPECUF = $("infoPECUF");
const infoPECCUMP = $("infoPECCUMP");
const infoEI = $("infoEI");

/* --------------------- DETECTAR TIPO -------------------------- */
function detectarTipoTexto(text) {
  if (!text) return "NO IDENTIFICADO";
  const t = text.toLowerCase();
  if (t.includes("intefectivank") || t.includes("vank")) return "EFECTIVANK";
  if (t.includes("intefectiva")) return "EFECTIVA";
  if (t.includes("intxperto")) return "XPERTO";
  if (t.includes("facebook")) return "FACEBOOK";
  if (t.includes("instagram")) return "INSTAGRAM";
  if (t.includes("correo") || t.includes("mail")) return "CORREO";
  return "OTRO";
}

function updateDetected() {
  const v = `${idLlamada.value} ${idContacto.value}`;
  tipoDetectado.value = detectarTipoTexto(v);
}

idLlamada.addEventListener("input", updateDetected);
idContacto.addEventListener("input", updateDetected);

/* --------------------- CARGAR ASESORES ------------------------- */
/**
 * Carga asesores desde la colección "asesores".
 * Se asume:
 *   - doc.id === asesorId (UID real del asesor)
 *   - data.nombre, data.GC
 * En registros se guardará:
 *   asesorId, asesorNombre, gc y campo "asesor" (por compatibilidad)
 */
async function cargarAsesores() {
  try {
    const snap = await getDocs(collection(db, "asesores"));
    const lista = [];
    snap.forEach((d) => {
      const data = d.data();
      lista.push({
        id: d.id,
        nombre: (data.nombre || "SIN NOMBRE").trim(),
        gc: (data.GC || "SIN GC").trim()
      });
    });

    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));

    // Limpiamos el select de forma segura
    asesorSelect.innerHTML = "";
    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = "Selecciona asesor...";
    asesorSelect.appendChild(optPlaceholder);

    lista.forEach((a) => {
      const opt = document.createElement("option");
      opt.value = a.id; // UID real del asesor
      opt.dataset.nombre = a.nombre;
      opt.dataset.gc = a.gc;
      opt.textContent = `${a.nombre} — ${a.gc}`;
      asesorSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando asesores:", err);
  }
}

cargarAsesores();

/* --------------------- UI: ITEMS ---------------------- */
function addItemBlock() {
  const wrapper = document.createElement("div");
  wrapper.className = "item-block";

  const mainDiv = document.createElement("div");
  mainDiv.className = "item-main";

  const select = document.createElement("select");
  select.className = "item-select md3-field";
  const optDefault = document.createElement("option");
  optDefault.value = "";
  optDefault.textContent = "-- Selecciona ítem --";
  select.appendChild(optDefault);

  ITEMS.forEach((it) => {
    const opt = document.createElement("option");
    opt.value = it.name;
    opt.textContent = it.name;
    select.appendChild(opt);
  });

  const metaDiv = document.createElement("div");
  metaDiv.className = "item-meta small";

  const textarea = document.createElement("textarea");
  textarea.className = "item-detail md3-field md3-textarea";
  textarea.placeholder =
    "Detalle del ítem: contexto, frase del cliente/asesor, impacto, etc.";

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn ghost small item-remove";
  removeBtn.textContent = "Eliminar";

  mainDiv.appendChild(select);
  mainDiv.appendChild(metaDiv);
  mainDiv.appendChild(textarea);

  wrapper.appendChild(mainDiv);
  wrapper.appendChild(removeBtn);
  itemsContainer.appendChild(wrapper);

  select.addEventListener("change", () => {
    const it = ITEMS.find((x) => x.name === select.value);
    if (it) {
      const grupo = it.tipo.replace(/_/g, " ");
      metaDiv.textContent = `${it.perc}% · ${grupo}`;
    } else {
      metaDiv.textContent = "";
    }
    recalcularNotaPreview();
  });

  removeBtn.addEventListener("click", () => {
    wrapper.remove();
    recalcularNotaPreview();
  });

  // texto no afecta nota, pero podrías hacer validación si quieres
}

function clearItems() {
  itemsContainer.innerHTML = "";
  recalcularNotaPreview();
}

/* --------------------- PREVIEW IMÁGENES ---------------------- */
if (imgsInput) {
  imgsInput.addEventListener("change", () => {
    imgPreview.innerHTML = "";
    const files = Array.from(imgsInput.files || []);
    files.forEach((f) => {
      const fr = new FileReader();
      fr.onload = (e) => {
        const img = document.createElement("img");
        img.src = e.target.result;
        img.className = "img-preview";
        imgPreview.appendChild(img);
      };
      fr.readAsDataURL(f);
    });
  });
}

/* --------------------- CÁLCULO DE NOTA ---------------------- */
/*
  Reglas:
  - Si hay ERROR_INEXCUSABLE → nota = 0
  - Nota base: 100
  - PENCUF → resta: 25 * (sumaPercPENCUF / 100)
  - PECNEG → si hay al menos uno: -30
  - PECUF → si hay al menos uno: -35
  - PECCUMP → si hay al menos uno: -10
*/
function calcularNota(items) {
  if (items.some((i) => i.tipo === "ERROR_INEXCUSABLE")) {
    return 0;
  }
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

  return Math.round(nota * 10) / 10; // 1 decimal
}

/* --------------------- PREVIEW PANEL DERECHA ---------------------- */
function obtenerItemsFormulario() {
  const blocks = Array.from(document.querySelectorAll(".item-block"));
  const items = [];

  blocks.forEach((b) => {
    const select = b.querySelector(".item-select");
    const detail = b.querySelector(".item-detail")?.value || "";
    const name = select?.value || "";
    if (!name) return;

    const meta = ITEMS.find((i) => i.name === name) || {
      tipo: "NINGUNO",
      perc: 0
    };

    items.push({
      name,
      tipo: meta.tipo,
      perc: meta.perc,
      detail
    });
  });

  return items;
}

function recalcularNotaPreview() {
  const items = obtenerItemsFormulario();
  const nota = calcularNota(items);

  if (notaPreview) {
    notaPreview.textContent = nota.toFixed(1).replace(/\.0$/, "");
  }

  if (nota >= 85) {
    scoreCircle?.classList.remove("bad");
    badgeCalidad?.classList.remove("bad");
    badgeCalidad?.classList.add("good");
    if (badgeCalidad) badgeCalidad.textContent = "🟢 Aprobado";
  } else {
    scoreCircle?.classList.add("bad");
    badgeCalidad?.classList.remove("good");
    badgeCalidad?.classList.add("bad");
    if (badgeCalidad) badgeCalidad.textContent = "🔴 No aprobado";
  }

  const totalPENCUF = items
    .filter((i) => i.tipo === "PENCUF")
    .reduce((s, i) => s + (i.perc || 0), 0);
  const dedPENCUF = 25 * (totalPENCUF / 100);
  if (infoPENCUF) {
    infoPENCUF.textContent = totalPENCUF
      ? `-${dedPENCUF.toFixed(1)} pts (suma ${totalPENCUF}%)`
      : "Sin descuentos";
  }

  const hasPECNEG = items.some((i) => i.tipo === "PECNEG");
  const hasPECUF = items.some((i) => i.tipo === "PECUF");
  const hasPECCUMP = items.some((i) => i.tipo === "PECCUMP");
  const hasEI = items.some((i) => i.tipo === "ERROR_INEXCUSABLE");

  if (infoPECNEG) infoPECNEG.textContent = hasPECNEG ? "-30 pts" : "Sin descuentos";
  if (infoPECUF) infoPECUF.textContent = hasPECUF ? "-35 pts" : "Sin descuentos";
  if (infoPECCUMP)
    infoPECCUMP.textContent = hasPECCUMP ? "-10 pts" : "Sin descuentos";
  if (infoEI)
    infoEI.textContent = hasEI ? "Aplica ⇒ nota 0" : "No aplicado";
}

/* --------------------- GUARDAR REGISTRO ---------------------- */
async function submitRecord() {
  msgEl.style.color = "var(--md3-color-text)";
  msgEl.textContent = "⏳ Subiendo...";

  try {
    const registradoPor = registradoPorSel.value;
    if (!registradoPor) {
      msgEl.style.color = "#dc2626";
      msgEl.textContent = "Debes seleccionar quién registra el monitoreo.";
      return;
    }

    if (!asesorSelect.value) {
      msgEl.style.color = "#dc2626";
      msgEl.textContent = "Debes seleccionar un asesor.";
      return;
    }

    const items = obtenerItemsFormulario();
    const nota = calcularNota(items);

    // subir imágenes
    const files = Array.from(imgsInput.files || []);
    const imageURLs = [];

    for (const f of files) {
      const storageRef = ref(
        storage,
        `monitoreo_imagenes/${Date.now()}_${f.name}`
      );
      await uploadBytes(storageRef, f);
      const url = await getDownloadURL(storageRef);
      imageURLs.push({
        name: f.name,
        url,
        storagePath: storageRef.fullPath
      });
    }

    // Asesor: guardamos UID + nombre + gc
    const selectedOption =
      asesorSelect.options[asesorSelect.selectedIndex] || null;
    const asesorId = selectedOption?.value || null; // UID
    const asesorNombre = selectedOption?.dataset.nombre || "";
    const gc = selectedOption?.dataset.gc || "SIN GC";

    const data = {
      idLlamada: idLlamada.value,
      idContacto: idContacto.value,
      tipo: tipoDetectado.value,
      asesorId, // UID real
      asesorNombre, // campo explícito
      asesor: asesorNombre, // compatibilidad con portal actual
      gc,
      cargo: cargoSelect.value,
      cliente: {
        dni: cliDni.value,
        nombre: cliNombre.value,
        tel: cliTel.value
      },
      tipificacion: cliTipif.value,
      observacionCliente: cliObs.value,
      resumen: resumen.value,
      items,
      nota,
      imagenes: imageURLs,
      fecha: new Date().toISOString(),
      registradoPor,
      estado: "PENDIENTE"
    };

    await addDoc(collection(db, "registros"), data);

    msgEl.style.color = "#16a34a";
    msgEl.textContent = `✔ Guardado correctamente · Nota final: ${nota}`;

    clearItems();
    imgPreview.innerHTML = "";
    imgsInput.value = "";
    recalcularNotaPreview();
  } catch (err) {
    console.error(err);
    msgEl.style.color = "#dc2626";
    msgEl.textContent = "❌ Error: " + err.message;
  }
}

/* --------------------- EVENT LISTENERS INIT ---------------------- */
const btnAddItem = document.getElementById("btnAddItem");
const btnClearItems = document.getElementById("btnClearItems");
const btnSubmit = document.getElementById("btnSubmit");

if (btnAddItem) {
  btnAddItem.addEventListener("click", addItemBlock);
}
if (btnClearItems) {
  btnClearItems.addEventListener("click", clearItems);
}
if (btnSubmit) {
  btnSubmit.addEventListener("click", submitRecord);
}

// inicializar preview en 100
recalcularNotaPreview();
