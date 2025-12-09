/* index.js - Dashboard Supervisión
   Requiere:
   - js/firebase.js exportando { db }
   - Chart.js cargado en index.html
*/

"use strict";

import { db } from "./firebase.js";
import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ------------------------------
   Helpers básicos
------------------------------ */

// Escapar HTML para reducir riesgo XSS
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c] || c));
}

// Normalizar texto para comparaciones
function normalize(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Parsear fecha desde distintos formatos
function parseFecha(fecha) {
  if (!fecha) return new Date();
  if (fecha.toDate) return fecha.toDate(); // Timestamp Firestore
  if (typeof fecha === "string") {
    if (fecha.includes("T")) return new Date(fecha);
    if (fecha.includes("/")) {
      const [d, m, yRest] = fecha.split("/");
      const [y, h] = yRest.split(" ");
      return new Date(`${y}-${m}-${d}T${h}`);
    }
    return new Date(fecha);
  }
  return new Date(fecha);
}

// Semanas de un mes (S1, S2,...)
function getWeeksOfMonth(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const weeks = [];
  let d = 1;
  while (d <= last) {
    weeks.push({ startDay: d, endDay: Math.min(d + 6, last) });
    d += 7;
  }
  return weeks;
}

/* ------------------------------
   Firebase: cargar datos
------------------------------ */

async function loadRegistros() {
  const snap = await getDocs(collection(db, "registros"));
  const arr = [];
  snap.forEach(doc => arr.push({ id: doc.id, ...doc.data() }));
  return arr;
}

async function loadAsesores() {
  const snap = await getDocs(collection(db, "asesores"));
  const mapa = {};
  snap.forEach(doc => {
    const d = doc.data();
    if (d.nombre) {
      mapa[d.nombre.trim()] = d.GC || "SIN GC";
    }
  });
  return mapa;
}

// Cruza registros + GC de asesores
async function getMergedData() {
  const registros = await loadRegistros();
  const asesores = await loadAsesores();
  return registros.map(r => ({
    ...r,
    gc: asesores[r.asesor?.trim()] || "SIN GC",
    registradoPor: r.registradoPor || ""
  }));
}

/* ------------------------------
   Estado global
------------------------------ */

let rawData = [];      // todos los registros
let filteredData = []; // registros tras filtros
let allYears = [];     // años detectados
let currentWeeks = []; // semanas del mes actual del filtro

// Estado del modal de ítems
let itemsModalAsesor = null; // null = general, string = nombre asesor

/* ------------------------------
   Chart semanal
------------------------------ */

const chart = new Chart(document.getElementById("chartMonth"), {
  type: "bar",
  data: {
    labels: [],
    datasets: [{
      label: "Promedio %",
      data: [],
      backgroundColor: "#0f4c81"
    }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, max: 100 } }
  }
});

/* ------------------------------
   Vista ejecutiva por asesor
------------------------------ */

function renderExecView(data) {
  const porAsesor = {};
  data.forEach(r => {
    if (!r.asesor) return;
    const key = r.asesor;
    const nota = Number(r.nota || 0);
    if (!porAsesor[key]) {
      porAsesor[key] = {
        asesor: key,
        gc: r.gc || "SIN GC",
        total: 0,
        sumaNota: 0,
        max: null,
        min: null,
        ok: 0,
        bad: 0
      };
    }
    const a = porAsesor[key];
    a.total += 1;
    a.sumaNota += nota;
    if (a.max === null || nota > a.max) a.max = nota;
    if (a.min === null || nota < a.min) a.min = nota;
    if (nota >= 85) a.ok += 1;
    else a.bad += 1;
  });

  const lista = Object.values(porAsesor)
    .map(a => ({
      ...a,
      promedio: a.total ? a.sumaNota / a.total : 0
    }))
    .sort((a, b) => b.promedio - a.promedio);

  const cont = document.getElementById("execGrid");
  if (!lista.length) {
    cont.innerHTML = `<div class="small">Sin datos para el filtro seleccionado.</div>`;
    return;
  }

  cont.innerHTML = lista.map(a => {
    const prom = Math.round(a.promedio * 10) / 10;
    const esVerde = prom >= 85;
    const pillClass = esVerde ? "green" : "red";
    const label = esVerde ? "🟢 85 – 100" : "🔴 0 – 84";
    const maxTxt = a.max !== null ? `${a.max}%` : "-";
    const minTxt = a.min !== null ? `${a.min}%` : "-";
    return `
      <div class="exec-card" data-asesor="${escapeHTML(a.asesor)}">
        <div class="exec-header">
          <div>
            <div class="exec-name">${escapeHTML(a.asesor)}</div>
            <div class="exec-gc">GC: ${escapeHTML(a.gc)}</div>
          </div>
          <div class="pill ${pillClass}">
            ${label}
          </div>
        </div>
        <div class="exec-main">
          <div>
            <div class="exec-score">${prom}%</div>
            <div class="exec-meta">
              <div><b>${a.total}</b> feedback(s)</div>
              <div>🟢 ${a.ok} · 🔴 ${a.bad}</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Mejor</b>: ${maxTxt}</div>
            <div><b>Peor</b>: ${minTxt}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  // Delegar click en tarjetas para abrir modal por asesor
  cont.querySelectorAll(".exec-card").forEach(card => {
    card.addEventListener("click", () => {
      const asesor = card.getAttribute("data-asesor") || "";
      openItemsModal(asesor || null);
    });
  });
}

/* ------------------------------
   Render global desde filteredData
------------------------------ */

function renderFromFilteredData() {
  const data = filteredData;

  // Resumen filtro
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const summary = document.getElementById("filterSummary");

  const valueReg = selReg.value;
  const valueMes = selMes.value;
  const valueAnio = selAnio.value;
  let resumen = `Mostrando ${data.length} registros`;
  if (valueMes !== "") {
    const mesTexto = selMes.options[selMes.selectedIndex].text;
    resumen += ` del mes ${mesTexto}`;
  } else {
    resumen += ` de todos los meses`;
  }
  if (valueAnio !== "") {
    resumen += ` del año ${valueAnio}`;
  } else {
    resumen += ` de todos los años`;
  }
  if (valueReg) {
    resumen += ` registrados por: ${valueReg}.`;
  } else {
    resumen += ` y todos los usuarios.`;
  }
  summary.textContent = resumen;

  // Vista ejecutiva
  renderExecView(data);

  // Contadores por tipo
  const counts = {
    EFECTIVA: 0, EFECTIVANK: 0, XPERTO: 0,
    FACEBOOK: 0, INSTAGRAM: 0, CORREO: 0, OTRO: 0
  };
  data.forEach(r => {
    const tipo = (r.tipo || "OTRO").toUpperCase();
    if (!Object.prototype.hasOwnProperty.call(counts, tipo)) counts.OTRO++;
    else counts[tipo]++;
  });
  document.getElementById("cntEfectiva").innerText = counts.EFECTIVA;
  document.getElementById("cntEfectivank").innerText = counts.EFECTIVANK;
  document.getElementById("cntXperto").innerText = counts.XPERTO;
  document.getElementById("cntFb").innerText = counts.FACEBOOK;
  document.getElementById("cntIg").innerText = counts.INSTAGRAM;
  document.getElementById("cntMail").innerText = counts.CORREO;

  // Últimos registros
  const recent = data
    .slice()
    .sort((a, b) => parseFecha(b.fecha) - parseFecha(a.fecha))
    .slice(0, 8);
  const tbodyRecent = document.querySelector("#recentTable tbody");
  if (!recent.length) {
    tbodyRecent.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
  } else {
    tbodyRecent.innerHTML = recent.map(r => `
      <tr>
        <td>${escapeHTML(parseFecha(r.fecha).toLocaleString("es-PE"))}</td>
        <td>${escapeHTML(r.asesor)} — ${escapeHTML(r.gc)}</td>
        <td>${escapeHTML((r.nota || 0).toString())}%</td>
        <td>${escapeHTML(r.tipo || "-")}</td>
        <td>${escapeHTML(r.registradoPor || "-")}</td>
      </tr>
    `).join("");
  }

  // Tabla semanal + gráfico
  const baseDate = data.length ? parseFecha(data[0].fecha) : new Date();
  currentWeeks = getWeeksOfMonth(baseDate);

  const asesoresUnicos = [...new Set(data.map(r => r.asesor))].filter(Boolean);
  const head = `<tr><th>ASESOR</th>` +
    currentWeeks.map((_, i) => `<th>S${i + 1} C1</th><th>S${i + 1} C2</th>`).join("") +
    `</tr>`;
  document.getElementById("weeklyHead").innerHTML = head;

  const cuerpo = asesoresUnicos.map(a => {
    const reg = data.find(r => r.asesor === a);
    const gc = reg?.gc || "SIN GC";
    let row = `<tr><td>${escapeHTML(a)} — ${escapeHTML(gc)}</td>`;
    for (let w = 0; w < currentWeeks.length; w++) {
      const recs = data.filter(r => {
        const f = parseFecha(r.fecha);
        const d = f.getDate();
        return r.asesor === a &&
          d >= currentWeeks[w].startDay &&
          d <= currentWeeks[w].endDay;
      });
      row += `<td>${escapeHTML(recs[0]?.tipo || "-")}</td>`;
      row += `<td>${escapeHTML(recs[1]?.tipo || "-")}</td>`;
    }
    return row + "</tr>";
  }).join("");

  document.getElementById("weeklyBody").innerHTML =
    cuerpo || `<tr><td colspan="${1 + currentWeeks.length * 2}">Sin registros</td></tr>`;

  // Datos para gráfico semanal
  const values = currentWeeks.map(w => {
    const recs = data.filter(r => {
      const f = parseFecha(r.fecha);
      const d = f.getDate();
      return d >= w.startDay && d <= w.endDay;
    });
    if (!recs.length) return 0;
    const avg = recs.reduce((t, r) => t + (parseFloat(r.nota) || 0), 0) / recs.length;
    return Math.round(avg);
  });
  chart.data.labels = currentWeeks.map((_, i) => `S${i + 1}`);
  chart.data.datasets[0].data = values;
  chart.update();
}

/* ------------------------------
   Aplicar filtros
------------------------------ */

function applyFilters() {
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");

  const filterValueReg = normalize(selReg.value);
  const filterMes = selMes.value === "" ? null : Number(selMes.value);
  const filterAnio = selAnio.value === "" ? null : Number(selAnio.value);

  let data = rawData.slice();

  if (filterAnio !== null) {
    data = data.filter(r => {
      const f = parseFecha(r.fecha);
      return f.getFullYear() === filterAnio;
    });
  }

  if (filterMes !== null) {
    data = data.filter(r => {
      const f = parseFecha(r.fecha);
      return f.getMonth() === filterMes;
    });
  }

  if (filterValueReg) {
    data = data.filter(r => normalize(r.registradoPor) === filterValueReg);
  }

  filteredData = data;
  renderFromFilteredData();
}

/* ------------------------------
   Filtro de años
------------------------------ */

function setupYearFilter() {
  const selAnio = document.getElementById("filterAnio");
  selAnio.innerHTML = "";

  const optionAll = document.createElement("option");
  optionAll.value = "";
  optionAll.textContent = "Todos";
  selAnio.appendChild(optionAll);

  allYears.sort((a, b) => a - b);
  allYears.forEach(y => {
    const op = document.createElement("option");
    op.value = y;
    op.textContent = y;
    selAnio.appendChild(op);
  });

  const currentYear = new Date().getFullYear();
  if (allYears.includes(currentYear)) {
    selAnio.value = currentYear.toString();
  }
}

/* ------------------------------
   Modal de ítems debitados
------------------------------ */

// Construye agregación de ítems a partir de un arreglo de registros
function aggregateItems(records) {
  const mapa = {};
  records.forEach(reg => {
    const items = Array.isArray(reg.items) ? reg.items : [];
    items.forEach(it => {
      const name = it.name || "Sin nombre";
      const key = name;
      const tipo = it.tipo || "—";
      const perc = Number(it.perc || 0);
      const detail = it.detail || "";

      if (!mapa[key]) {
        mapa[key] = {
          name,
          tipo,
          count: 0,
          sumPerc: 0,
          maxPerc: 0,
          sampleDetail: ""
        };
      }
      const o = mapa[key];
      o.count += 1;
      o.sumPerc += perc;
      if (perc > o.maxPerc) o.maxPerc = perc;
      if (!o.sampleDetail && detail) o.sampleDetail = detail;
    });
  });

  return Object.values(mapa)
    .map(o => ({
      ...o,
      avgPerc: o.count ? Math.round((o.sumPerc / o.count) * 10) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);
}

// Rellena select de periodo (mes + semanas)
function fillItemsPeriodSelect() {
  const sel = document.getElementById("itemsPeriodSelect");
  sel.innerHTML = "";

  const optMes = document.createElement("option");
  optMes.value = "mes";
  optMes.textContent = "Mes completo";
  sel.appendChild(optMes);

  currentWeeks.forEach((w, idx) => {
    const op = document.createElement("option");
    op.value = `week-${idx}`;
    op.textContent = `Semana S${idx + 1} (${w.startDay}-${w.endDay})`;
    sel.appendChild(op);
  });

  sel.value = "mes";
}

// Renderiza tabla del modal según periodo y asesor
function renderItemsModalTable() {
  const sel = document.getElementById("itemsPeriodSelect");
  const value = sel.value || "mes";

  let data = filteredData.slice();

  if (itemsModalAsesor) {
    data = data.filter(r => r.asesor === itemsModalAsesor);
  }

  if (value.startsWith("week-")) {
    const idx = Number(value.split("-")[1] || "0");
    const w = currentWeeks[idx];
    if (w) {
      data = data.filter(r => {
        const f = parseFecha(r.fecha);
        const d = f.getDate();
        return d >= w.startDay && d <= w.endDay;
      });
    }
  }

  const agg = aggregateItems(data);
  const tbody = document.getElementById("itemsTableBody");

  if (!agg.length) {
    tbody.innerHTML = `<tr><td colspan="5">Sin ítems debitados para este periodo.</td></tr>`;
    return;
  }

  tbody.innerHTML = agg.map(it => `
    <tr>
      <td>${escapeHTML(it.name)}</td>
      <td>${escapeHTML(it.tipo)}</td>
      <td>${it.count}</td>
      <td>${it.avgPerc}%</td>
      <td>${escapeHTML(it.sampleDetail || "Sin detalle")}</td>
    </tr>
  `).join("");
}

// Abre modal general o por asesor
function openItemsModal(asesor = null) {
  itemsModalAsesor = asesor;

  const titulo = document.getElementById("itemsModalTitle");
  const subtitulo = document.getElementById("itemsModalSubtitle");

  if (asesor) {
    titulo.textContent = `Ítems debitados – ${asesor}`;
    subtitulo.textContent = "Ranking de ítems más debitados para este asesor, según los filtros seleccionados.";
  } else {
    titulo.textContent = "Ranking general de ítems debitados";
    subtitulo.textContent = "Basado en todos los registros filtrados (Mes / Año / Registrado por).";
  }

  fillItemsPeriodSelect();
  renderItemsModalTable();

  document.getElementById("itemsModal").style.display = "flex";
}

function closeItemsModal() {
  document.getElementById("itemsModal").style.display = "none";
}

/* ------------------------------
   Tema claro / oscuro
------------------------------ */

const THEME_KEY = "dash_theme";

function applyTheme(theme) {
  const body = document.body;
  const btn = document.getElementById("btnTheme");
  if (theme === "light") {
    body.classList.add("light");
    if (btn) btn.textContent = "🌙 Modo oscuro";
  } else {
    body.classList.remove("light");
    if (btn) btn.textContent = "☀️ Modo claro";
  }
}

/* ------------------------------
   Inicialización dashboard
------------------------------ */

async function refreshDashboard() {
  let data = await getMergedData();

  data = data.sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));
  rawData = data;

  // años detectados
  const yearsSet = new Set();
  data.forEach(r => {
    const f = parseFecha(r.fecha);
    yearsSet.add(f.getFullYear());
  });
  allYears = Array.from(yearsSet);

  setupYearFilter();

  // mes actual como default
  const hoy = new Date();
  document.getElementById("filterMes").value = hoy.getMonth().toString();

  applyFilters();
}

/* ------------------------------
   Listeners
------------------------------ */

document.getElementById("filterRegistrado").addEventListener("change", applyFilters);
document.getElementById("filterMes").addEventListener("change", applyFilters);
document.getElementById("filterAnio").addEventListener("change", applyFilters);

document.getElementById("btnOpenItemsModal").addEventListener("click", () => {
  openItemsModal(null);
});

document.getElementById("btnCloseItemsModal").addEventListener("click", closeItemsModal);

document.getElementById("itemsPeriodSelect").addEventListener("change", renderItemsModalTable);

// cerrar modal al hacer click fuera
document.getElementById("itemsModal").addEventListener("click", (e) => {
  if (e.target.id === "itemsModal") {
    closeItemsModal();
  }
});

// tema
const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(savedTheme);

const btnTheme = document.getElementById("btnTheme");
btnTheme.addEventListener("click", () => {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ------------------------------
   Start
------------------------------ */
refreshDashboard().catch(err => {
  console.error("Error al cargar dashboard:", err);
});
