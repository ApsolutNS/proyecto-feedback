import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:"AIzaSyD4cFHDbSfJNAhTuuP01N5JZQd-FOYB2LM",
  authDomain:"feedback-app-ac30e.firebaseapp.com",
  projectId:"feedback-app-ac30e",
  storageBucket:"feedback-app-ac30e.firebasestorage.app"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let registros = [];

/* -------------------- CARGAR REGISTROS -------------------- */
async function cargarRegistros(){
  const snap = await getDocs(collection(db, "registros"));
  registros = [];

  snap.forEach(doc=>{
    const r = doc.data();

    registros.push({
      id: doc.id,
      ...r,
      fechaObj: new Date(r.fecha),
      estado: r.estado || "PENDIENTE",
      registradoPor: r.registradoPor || "",
      firmaUrl: r.firmaUrl || "",
    });
  });

  registros.sort((a,b)=> b.fechaObj - a.fechaObj);
}

/* -------------------- LLENAR SELECT DE ASESORES -------------------- */
function cargarAsesoresFiltro(){
  const asesores = [...new Set(registros.map(r=>r.asesor))].sort();
  const sel = document.getElementById("filtroAsesor");

  sel.innerHTML = `<option value="">— Selecciona un asesor —</option>`;
  asesores.forEach(a=>{
    sel.innerHTML += `<option value="${a}">${a}</option>`;
  });
}

/* -------------------- RENDER TABLA -------------------- */
function renderTabla(){
  const fa = filtroAsesor.value;
  const fr = filtroRegistrado.value;

  const table = document.getElementById("tablaFeedback");
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";

  if(!fa){ table.style.display="none"; return; }
  table.style.display = "table";

  registros
    .filter(r => r.asesor === fa)
    .filter(r => !fr || r.registradoPor === fr)
    .forEach(r=>{
      tbody.innerHTML += `
        <tr>
          <td>${r.id}</td>
          <td>${r.fechaObj.toLocaleString("es-PE")}</td>
          <td>${r.nota}%</td>
          <td>${r.estado}</td>
          <td>${r.registradoPor}</td>
          <td><button class="m3-btn primary" onclick="verDetalle('${r.id}')">Ver</button></td>
        </tr>
      `;
    });
}

/* -------------------- DETALLE -------------------- */
window.verDetalle = function(id){
  const r = registros.find(x => x.id === id);
  if(!r) return;

  const detailBox = document.getElementById("detailBox");
  const titulo = document.getElementById("tituloRetro");

  // REAFIRMACIÓN cuando nota = 100
  titulo.textContent = (Number(r.nota) === 100) ? "REAFIRMACIÓN" : "RETROALIMENTACIÓN";

  // DNI desde GC
  const dni = (r.gc || "").replace(/GC/gi, "");

  const itemsHtml = (r.items || [])
    .map(it => `
      <div class="item-block">
        <b>${it.name}</b> (${it.perc}%)
        <div>${it.detail || ""}</div>
      </div>
    `).join("");

  const evidenciasHtml = (r.imagenes || [])
    .map(img => `<img class="evidence-img" src="${img.url}">`)
    .join("");

  const firmaHtml = r.firmaUrl
    ? `<div class="firma-box"><img src="${r.firmaUrl}"></div>`
    : `<div class="firma-box">Sin firma</div>`;

  document.getElementById("detailContent").innerHTML = `
    <p><b>Estado:</b> ${r.estado}</p>
    <p><b>Registrado por:</b> ${r.registradoPor}</p>
    <p>Retroalimentación para <b>${r.asesor}</b> — GC: ${r.gc}</p>

    <h4 class="section-title">Datos del cliente</h4>
    <p>DNI: ${r.cliente?.dni}</p>
    <p>Nombre: ${r.cliente?.nombre}</p>
    <p>Teléfono: ${r.cliente?.tel}</p>

    <h4 class="section-title">Resumen</h4>
    <p>${r.resumen}</p>

    <h4 class="section-title">Ítems</h4>
    ${itemsHtml || "Sin ítems observados"}

    <h4 class="section-title">Nota final</h4>
    <p style="font-size:20px;font-weight:bold">${r.nota}%</p>

    <h4 class="section-title">Compromiso del agente</h4>
    <p>${r.compromiso || "Sin compromiso"}</p>

    <h4 class="section-title">Firma</h4>
    ${firmaHtml}

    <h4 class="section-title">Evidencias</h4>
    ${evidenciasHtml || "Sin evidencias"}
  `;

  detailBox.style.display = "block";
};

/* -------------------- PDF -------------------- */
document.getElementById("pdfBtn").onclick = async ()=>{
  const box = document.getElementById("detailBox");

  const canvas = await html2canvas(box, {
    scale: 2,
    useCORS: true,
  });

  const pdf = new jspdf.jsPDF("p","mm","a4");
  const img = canvas.toDataURL("image/png");

  const width = pdf.internal.pageSize.getWidth() - 20;
  const height = (canvas.height * width) / canvas.width;

  pdf.addImage(img, "PNG", 10, 10, width, height);
  pdf.save("feedback.pdf");
};

/* -------------------- INICIO -------------------- */
window.onload = async ()=>{
  await cargarRegistros();
  cargarAsesoresFiltro();
  renderTabla();

  filtroAsesor.onchange = renderTabla;
  filtroRegistrado.onchange = renderTabla;
};
