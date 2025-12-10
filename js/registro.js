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

/* --------------------- CONSTANTES / ÍTEMS ---------------------- */
/* name, perc (porcentaje), tipo (grupo) */
const ITEMS = [
  // ERROR INEXCUSABLE (nota 0 si aparece uno)
  { name:"Corte de Gestión", perc:100, tipo:"ERROR_INEXCUSABLE" },
  { name:"Insulto / Falta de Respeto", perc:100, tipo:"ERROR_INEXCUSABLE" },
  { name:"Normativa Regulatoria", perc:100, tipo:"ERROR_INEXCUSABLE" },
  { name:"Protección de datos", perc:100, tipo:"ERROR_INEXCUSABLE" },

  // PENCUF - Penalización acumulable hasta 25 puntos (según porcentaje)
  { name:"Contestación sin demora", perc:5, tipo:"PENCUF" },
  { name:"Optimización de esperas", perc:5, tipo:"PENCUF" },
  { name:"Empatía e implicación", perc:7, tipo:"PENCUF" },
  { name:"Escucha Activa", perc:7, tipo:"PENCUF" },
  { name:"Sondeo", perc:7, tipo:"PENCUF" },
  { name:"Solicita datos de forma correcta y oportuna", perc:7, tipo:"PENCUF" },
  { name:"Herramientas de Gestión", perc:10, tipo:"PENCUF" },
  { name:"Codificación y Registro inConcert", perc:7, tipo:"PENCUF" },
  { name:"Codificación y Registro en Monitor Logístico", perc:7, tipo:"PENCUF" },
  { name:"Codificación y Registro en SmartSheet", perc:7, tipo:"PENCUF" },
  { name:"Presentación", perc:7, tipo:"PENCUF" },
  { name:"Personalización", perc:7, tipo:"PENCUF" },
  { name:"Despedida", perc:7, tipo:"PENCUF" },
  { name:"Encuesta de satisfacción", perc:10, tipo:"PENCUF" },

  // PECNEG
  { name:"Lenguaje", perc:30, tipo:"PECNEG" },
  { name:"Voz", perc:30, tipo:"PECNEG" },
  { name:"Redacta de forma Correcta", perc:30, tipo:"PECNEG" },
  { name:"Imagen trasladada", perc:30, tipo:"PECNEG" },
  { name:"Actitud comercial", perc:30, tipo:"PECNEG" },
  { name:"Operativa", perc:30, tipo:"PECNEG" },
  { name:"Tramita la gestión correspondiente", perc:30, tipo:"PECNEG" },
  { name:"Transferencia", perc:30, tipo:"PECNEG" },

  // PECUF – un solo ítem → -35 pts
  { name:"Cumple con devolución de llamado", perc:35, tipo:"PECUF" },
  { name:"Actitud - Manejo de llamada", perc:35, tipo:"PECUF" },
  { name:"Conocimientos para resolver la consulta", perc:35, tipo:"PECUF" },
  { name:"Asesoramiento de Producto o Servicio (Pagina Web | Posible Compra | Servicios)", perc:35, tipo:"PECUF" },
  { name:"Solución al primer contacto", perc:35, tipo:"PECUF" },

  // PECCUMP – un solo ítem → -10 pts
  { name:"Verificación de datos", perc:10, tipo:"PECCUMP" },
  { name:"Damos el número de Ticket", perc:10, tipo:"PECCUMP" },

  // Ninguno
  { name:"Ninguno", perc:0, tipo:"NINGUNO" }
];

/* --------------------- HELPERS ---------------------- */
function escapeHTML(str) {
  return (str ?? "").toString().replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c] || c);
}

function detectarTipoTexto(text){
  if(!text) return "NO IDENTIFICADO";
  text = text.toLowerCase();
  if(text.includes("intefectivank") || text.includes("vank")) return "EFECTIVANK";
  if(text.includes("intefectiva")) return "EFECTIVA";
  if(text.includes("intxperto")) return "XPERTO";
  if(text.includes("facebook")) return "FACEBOOK";
  if(text.includes("instagram")) return "INSTAGRAM";
  if(text.includes("correo") || text.includes("mail")) return "CORREO";
  return "OTRO";
}

/*
  Reglas de nota:
  - Si hay ERROR_INEXCUSABLE → nota = 0
  - Nota base: 100
  - PENCUF → resta: 25 * (sumaPercPENCUF / 100)
  - PECNEG → si hay al menos uno: -30
  - PECUF → si hay al menos uno: -35
  - PECCUMP → si hay al menos uno: -10
*/
function calcularNota(items){
  if(items.some(i => i.tipo === "ERROR_INEXCUSABLE")){
    return 0;
  }
  let nota = 100;
  const totalPENCUF = items
    .filter(i => i.tipo === "PENCUF")
    .reduce((sum,i)=> sum + (i.perc || 0), 0);

  const dedPENCUF = 25 * (totalPENCUF / 100);
  const hasPECNEG   = items.some(i => i.tipo === "PECNEG");
  const hasPECUF    = items.some(i => i.tipo === "PECUF");
  const hasPECCUMP  = items.some(i => i.tipo === "PECCUMP");

  nota -= dedPENCUF;
  if(hasPECNEG)  nota -= 30;
  if(hasPECUF)   nota -= 35;
  if(hasPECCUMP) nota -= 10;

  if(nota < 0) nota = 0;
  if(nota > 100) nota = 100;
  return Math.round(nota * 10) / 10;
}

/* --------------------- MAIN (DOM READY) ---------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const idLlamada      = document.getElementById("idLlamada");
  const idContacto     = document.getElementById("idContacto");
  const tipoDetectado  = document.getElementById("tipoDetectado");
  const asesorSelect   = document.getElementById("asesor");
  const cargo          = document.getElementById("cargo");
  const cliDni         = document.getElementById("cliDni");
  const cliNombre      = document.getElementById("cliNombre");
  const cliTel         = document.getElementById("cliTel");
  const cliTipif       = document.getElementById("cliTipif");
  const cliObs         = document.getElementById("cliObs");
  const resumen        = document.getElementById("resumen");
  const registradoPor  = document.getElementById("registradoPor");
  const itemsContainer = document.getElementById("itemsContainer");
  const imgsInput      = document.getElementById("imgs");
  const imgPreview     = document.getElementById("imgPreview");
  const msgEl          = document.getElementById("msg");

  const notaEl         = document.getElementById("notaPreview");
  const scoreCircle    = document.getElementById("scoreCircle");
  const badgeCalidad   = document.getElementById("badgeCalidad");
  const infoPENCUF     = document.getElementById("infoPENCUF");
  const infoPECNEG     = document.getElementById("infoPECNEG");
  const infoPECUF      = document.getElementById("infoPECUF");
  const infoPECCUMP    = document.getElementById("infoPECCUMP");
  const infoEI         = document.getElementById("infoEI");

  const btnAddItem     = document.getElementById("btnAddItem");
  const btnClearItems  = document.getElementById("btnClearItems");
  const btnSubmit      = document.getElementById("btnSubmit");

  /* ---------- CARGAR ASESORES (nombre + GC + UID) ---------- */
  async function cargarAsesores() {
    try {
      const snap = await getDocs(collection(db, "asesores"));
      const lista = [];
      snap.forEach(d => {
        const data = d.data();
        lista.push({
          id: d.id, // aquí esperas guardar el UID real del asesor
          nombre: (data.nombre || "SIN NOMBRE").trim(),
          gc: (data.GC || "SIN GC").trim()
        });
      });
      lista.sort((a,b)=> a.nombre.localeCompare(b.nombre, "es"));

      asesorSelect.innerHTML = lista.map(a =>
        `<option value="${escapeHTML(a.nombre)}"
                 data-gc="${escapeHTML(a.gc)}"
                 data-uid="${escapeHTML(a.id)}">
           ${escapeHTML(a.nombre)} — ${escapeHTML(a.gc)}
         </option>`
      ).join("");
    } catch (err) {
      console.error("Error cargando asesores:", err);
      if (msgEl) {
        msgEl.textContent = "❌ Error cargando asesores";
        msgEl.className = "msg-status error";
      }
    }
  }

  cargarAsesores();

  /* ---------- DETECTAR TIPO SEGÚN ID ---------- */
  function updateDetected(){
    const v = (idLlamada.value || "") + " " + (idContacto.value || "");
    tipoDetectado.value = detectarTipoTexto(v);
  }
  idLlamada.addEventListener("input", updateDetected);
  idContacto.addEventListener("input", updateDetected);

  /* ---------- ÍTEMS EN UI ---------- */
  function obtenerItemsFormulario(){
    const blocks = Array.from(itemsContainer.querySelectorAll(".item-block"));
    const items = [];
    blocks.forEach(b => {
      const select = b.querySelector(".item-select");
      const detail = (b.querySelector(".item-detail")?.value || "").trim();
      const name = select?.value || "";
      if(!name) return;
      const meta = ITEMS.find(i => i.name === name) || { tipo:"NINGUNO", perc:0 };
      items.push({
        name,
        tipo: meta.tipo,
        perc: meta.perc,
        detail
      });
    });
    return items;
  }

  function recalcularNotaPreview(){
    const items = obtenerItemsFormulario();
    const nota = calcularNota(items);

    // círculo
    notaEl.textContent = nota.toFixed(1).replace(/\.0$/,"");
    if(nota >= 85){
      scoreCircle.classList.remove("bad");
      badgeCalidad.classList.remove("bad");
      badgeCalidad.classList.add("good");
      badgeCalidad.textContent = "🟢 Aprobado";
    } else {
      scoreCircle.classList.add("bad");
      badgeCalidad.classList.remove("good");
      badgeCalidad.classList.add("bad");
      badgeCalidad.textContent = "🔴 No aprobado";
    }

    // detalle grupos
    const totalPENCUF = items
      .filter(i=>i.tipo==="PENCUF")
      .reduce((s,i)=>s+(i.perc||0),0);
    const dedPENCUF = 25 * (totalPENCUF / 100);

    infoPENCUF.textContent = totalPENCUF
      ? `-${dedPENCUF.toFixed(1)} pts (suma ${totalPENCUF}%)`
      : "Sin descuentos";

    const hasPECNEG  = items.some(i=>i.tipo==="PECNEG");
    const hasPECUF   = items.some(i=>i.tipo==="PECUF");
    const hasPECCUMP = items.some(i=>i.tipo==="PECCUMP");
    const hasEI      = items.some(i=>i.tipo==="ERROR_INEXCUSABLE");

    infoPECNEG.textContent  = hasPECNEG  ? "-30 pts"  : "Sin descuentos";
    infoPECUF.textContent   = hasPECUF   ? "-35 pts"  : "Sin descuentos";
    infoPECCUMP.textContent = hasPECCUMP ? "-10 pts"  : "Sin descuentos";
    infoEI.textContent      = hasEI      ? "Aplica ⇒ nota 0" : "No aplicado";
  }

  function crearItemBlock(){
    const w = document.createElement("div");
    w.className = "item-block";
    w.innerHTML = `
      <div class="item-main">
        <select class="item-select">
          <option value="">-- Selecciona ítem --</option>
          ${ITEMS.map(it => `<option value="${escapeHTML(it.name)}">${escapeHTML(it.name)}</option>`).join("")}
        </select>
        <div class="item-meta small"></div>
        <textarea class="item-detail" placeholder="Detalle del ítem: contexto, frase del cliente/asesor, impacto, etc."></textarea>
      </div>
      <button class="btn ghost small item-remove" type="button">Eliminar</button>
    `;
    const select = w.querySelector(".item-select");
    const meta = w.querySelector(".item-meta");
    const removeBtn = w.querySelector(".item-remove");
    const detailArea = w.querySelector(".item-detail");

    select.addEventListener("change", () => {
      const it = ITEMS.find(x => x.name === select.value);
      if(it){
        const grupo = it.tipo.replace(/_/g," ");
        meta.textContent = `${it.perc}% · ${grupo}`;
      } else {
        meta.textContent = "";
      }
      recalcularNotaPreview();
    });

    detailArea.addEventListener("input", () => {
      // Podrías agregar validaciones de longitud si quieres.
    });

    removeBtn.addEventListener("click", () => {
      w.remove();
      recalcularNotaPreview();
    });

    itemsContainer.appendChild(w);
    recalcularNotaPreview();
  }

  btnAddItem.addEventListener("click", crearItemBlock);

  btnClearItems.addEventListener("click", () => {
    itemsContainer.innerHTML = "";
    recalcularNotaPreview();
  });

  /* ---------- PREVIEW IMÁGENES ---------- */
  imgsInput.addEventListener("change", function(){
    imgPreview.innerHTML = "";
    const files = Array.from(this.files || []);
    files.forEach(f => {
      const fr = new FileReader();
      fr.onload = e => {
        const img = document.createElement("img");
        img.src = e.target.result;
        img.className = "img-preview";
        img.style.maxWidth = "120px";
        img.alt = "Evidencia";
        imgPreview.appendChild(img);
      };
      fr.readAsDataURL(f);
    });
  });

  /* ---------- SUBMIT REGISTRO ---------- */
  async function submitRecord(){
    msgEl.textContent = "⏳ Subiendo...";
    msgEl.className = "msg-status";

    try{
      if(!registradoPor.value){
        msgEl.textContent = "Debes seleccionar quién registra el monitoreo.";
        msgEl.className = "msg-status error";
        return;
      }

      if(!asesorSelect.value){
        msgEl.textContent = "Debes seleccionar un asesor.";
        msgEl.className = "msg-status error";
        return;
      }

      const items = obtenerItemsFormulario();
      const nota = calcularNota(items);

      // subir imágenes
      const files = Array.from(imgsInput.files || []);
      const imageURLs = [];
      for(const f of files){
        // nombre simple para evitar caracteres raros, sin info sensible
        const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g,"_");
        const storageRef = ref(storage, `monitoreo_imagenes/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, f);
        const url = await getDownloadURL(storageRef);
        imageURLs.push({name: safeName, url, storagePath: storageRef.fullPath});
      }

      const asesorOption = asesorSelect.options[asesorSelect.selectedIndex];
      const gc      = asesorOption?.dataset.gc || "SIN GC";
      const asesorId = asesorOption?.dataset.uid || null; // UID real del asesor

      const data = {
        idLlamada: (idLlamada.value || "").trim(),
        idContacto: (idContacto.value || "").trim(),
        tipo: (tipoDetectado.value || "").trim(),
        asesor: asesorSelect.value,  // nombre
        asesorId,                    // UID
        gc,
        cargo: (cargo.value || "").trim(),
        cliente:{
          dni: (cliDni.value || "").trim(),
          nombre: (cliNombre.value || "").trim(),
          tel: (cliTel.value || "").trim()
        },
        tipificacion: (cliTipif.value || "").trim(),
        observacionCliente: (cliObs.value || "").trim(),
        resumen: (resumen.value || "").trim(),
        items,
        nota,
        imagenes: imageURLs,
        fecha: new Date().toISOString(),
        registradoPor: registradoPor.value,
        estado: "PENDIENTE"
      };

      await addDoc(collection(db, "registros"), data);

      msgEl.textContent = `✔ Guardado correctamente · Nota final: ${nota}`;
      msgEl.className = "msg-status ok";

      // limpiar formulario básico
      itemsContainer.innerHTML = "";
      imgPreview.innerHTML = "";
      imgsInput.value = "";
      recalcularNotaPreview();

    } catch(err){
      console.error(err);
      msgEl.textContent = "❌ Error: " + err.message;
      msgEl.className = "msg-status error";
    }
  }

  btnSubmit.addEventListener("click", () => {
    submitRecord();
  });

  /* ---------- inicializar preview en 100 ---------- */
  recalcularNotaPreview();
});
