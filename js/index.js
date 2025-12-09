/* ------------------------------
   IMPORTAR FIREBASE (CONFIG TUYA)
------------------------------ */
import { db } from "./js/firebase.js"; // ajusta ruta si tu firebase.js está en otro sitio
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ------------------------------
   SEGURIDAD: SANITIZAR TEXTO (anti-XSS)
------------------------------ */
function sanitizeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ------------------------------
   HELPER: FECHAS
------------------------------ */
function parseFecha(fecha) {
  if (!fecha) return new Date();
  if (fecha.toDate) return fecha.toDate(); // Timestamp Firestore
  if (typeof fecha === "string") {
    if (fecha.includes("T")) return new Date(fecha);
    if (fecha.includes("/")) {
      const [d, m, yRest] = fecha.split("/");
      const [y, h] = (yRest || "").split(" ");
      return new Date(`${y}-${m}-${d}T${h || "00:00"}`);
    }
    return new Date(fecha);
  }
  return new Date(fecha);
}

/* ------------------------------
   HELPER: NORMALIZAR TEXTO
------------------------------ */
function normalize(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/* ------------------------------
   CARGAR REGISTROS
------------------------------ */
async function loadRegistros() {
  const snap = await getDocs(collection(db, "registros"));
  const arr = [];
  snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
  return arr;
}

/* ------------------------------
   CARGAR ASESORES (CON GC)
------------------------------ */
async function loadAsesores() {
  const snap = await getDocs(collection(db, "asesores"));
  const mapa = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.nombre) {
      mapa[d.nombre.trim()] = d.GC || "SIN GC";
    }
  });
  return mapa;
}

/* ------------------------------
   CRUZAR REGISTROS + ASESORES
   (se asume que cada registro puede tener:
   - itemDebitado: string (ítem debitado)
   - detalleDebito: string (detalle / descripción)
   Si tus campos se llaman diferente, cámbialos aquí.
------------------------------ */
async function getMergedData() {
  const registros = await loadRegistros();
  const asesores = await loadAsesores();
  return registros.map((r) => ({
    ...r,
    gc: asesores[r.asesor?.trim()] || "SIN GC",
    registradoPor: r.registradoPor || "",
    itemDebitado: r.itemDebitado || "", // 🔁 ajústalo si usas otro nombre
    detalleDebito: r.detalleDebito || "", // 🔁 ajústalo si usas otro nombre
  }));
}

/* ------------------------------
   SEMANAS DE UN MES
------------------------------ */
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
   CHART
------------------------------ */
const chart = new Chart(document.getElementById("chartMonth"), {
  type: "bar",
  data: {
    labels: [],
    datasets: [
      {
        label: "Promedio %",
        data: [],
        backgroundColor: "#0f4c81",
      },
    ],
  },
  options: {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, max: 100 } },
  },
});

/* ------------------------------
   ESTADO GLOBAL
------------------------------ */
let rawData = []; // todos los registros (cruzados con GC)
let filteredData = []; // registros tras aplicar filtros
let allYears = []; // años detectados en los registros

/* ------------------------------
   MODAL ÍTEMS DEBITADOS
------------------------------ */
const itemsModal = document.getElementById("itemsModal");
const itemsModalTitle = document.getElementById("itemsModalTitle");
const itemsModalContent = document.getElementById("itemsModalContent");
const btnItemsModal = document.getElementById("btnItemsModal");
const btnCloseItemsModal = document.getElementById("btnCloseItemsModal");

function openItemsModal(agentName = null) {
  const data = filteredData.slice();

  // Si no hay datos con el filtro actual
  if (!data.length) {
    itemsModalTitle.textContent = "Ítems debitados";
    itemsModalContent.innerHTML =
      "<p class='small'>No hay registros para el filtro seleccionado.</p>";
    itemsModal.classList.add("show");
    itemsModal.setAttribute("aria-hidden", "false");
    return;
  }

  // Usamos el primer registro para obtener el mes actual de referencia
  const baseDate = parseFecha(data[0].fecha || data[0].fechaMonitoreo);
  const weeks = getWeeksOfMonth(baseDate);

  // Obtener estadísticas por ítem
  const generalStats = computeItemStats(data, null);
  const scopedStats = agentName ? computeItemStats(data, agentName) : generalStats;

  // Construir HTML
  let html = "";

  if (agentName) {
    itemsModalTitle.textContent = `Ítems debitados – ${agentName}`;
    const topItem = scopedStats[0];

    html += `<p class="small">Detalle solo para el asesor <b>${sanitizeText(
      agentName
    )}</b>, respetando los filtros de mes/año/registrado por.</p>`;

    if (!scopedStats.length) {
      html += `<p class="small">Este asesor no tiene ítems debitados en el período filtrado.</p>`;
    } else {
      html += `<div class="items-section-title">Ítem más debitado</div>`;
      html += `<p><span class="badge-soft">${
        topItem ? sanitizeText(topItem.item) : "-"
      }</span> &nbsp; (${topItem.total} vez/veces)</p>`;

      html += `<div class="items-section-title">Top ítems debitados (asesor)</div>`;
      html += `<ul class="items-list">`;
      scopedStats.slice(0, 10).forEach((it) => {
        html += `<li><b>${sanitizeText(it.item)}</b> — ${it.total} vez/veces</li>`;
      });
      html += `</ul>`;
    }

    // Detalle de registros recientes del asesor
    const registrosAsesor = data
      .filter((r) => r.asesor === agentName)
      .sort((a, b) => parseFecha(b.fecha) - parseFecha(a.fecha))
      .slice(0, 30);

    html += `<div class="items-section-title">Registros recientes del asesor (máx. 30)</div>`;
    if (!registrosAsesor.length) {
      html += `<p class="small">Sin registros para mostrar.</p>`;
    } else {
      html += `<div class="weekly"><table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Nota</th>
            <th>Ítem debitado</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>`;
      registrosAsesor.forEach((r) => {
        const f = parseFecha(r.fecha).toLocaleString("es-PE");
        html += `<tr>
          <td>${sanitizeText(f)}</td>
          <td>${sanitizeText(r.nota ?? 0)}%</td>
          <td>${sanitizeText(r.itemDebitado || "-")}</td>
          <td>${sanitizeText(r.detalleDebito || "-")}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }
  } else {
    itemsModalTitle.textContent = "Ítems debitados – Vista general";
    html += `<p class="small">Resumen con los filtros actuales (mes, año, registrado por).</p>`;

    // Top general del mes
    html += `<div class="items-section-title">Top ítems debitados (mes actual filtrado)</div>`;
    if (!generalStats.length) {
      html += `<p class="small">No hay ítems debitados para el período seleccionado.</p>`;
    } else {
      html += `<ul class="items-list">`;
      generalStats.slice(0, 10).forEach((it) => {
        html += `<li><b>${sanitizeText(it.item)}</b> — ${it.total} vez/veces</li>`;
      });
      html += `</ul>`;
    }

    // Resumen semanal
    html += `<div class="items-section-title">Detalle semanal (Top ítems por semana)</div>`;
    html += `<div class="weekly"><table>
      <thead>
        <tr>
          <th>Semana</th>
          <th>Top ítems (nombre · cantidad)</th>
        </tr>
      </thead>
      <tbody>`;

    weeks.forEach((w, index) => {
      const semanaData = data.filter((r) => {
        const f = parseFecha(r.fecha);
        const d = f.getDate();
        return d >= w.startDay && d <= w.endDay;
      });

      const statsSemana = computeItemStats(semanaData, null);
      html += `<tr>
        <td>S${index + 1} (${w.startDay}–${w.endDay})</td>
        <td>`;

      if (!statsSemana.length) {
        html += `<span class="small">Sin registros</span>`;
      } else {
        statsSemana.slice(0, 5).forEach((it, idx) => {
          html += `<div>${idx + 1}. ${sanitizeText(it.item)} · ${
            it.total
          }</div>`;
        });
      }
      html += `</td></tr>`;
    });

    html += `</tbody></table></div>`;
  }

  itemsModalContent.innerHTML = html;
  itemsModal.classList.add("show");
  itemsModal.setAttribute("aria-hidden", "false");
}

function closeItemsModal() {
  itemsModal.classList.remove("show");
  itemsModal.setAttribute("aria-hidden", "true");
}

/* Stats de ítems (general o por asesor) */
function computeItemStats(data, agentName = null) {
  const map = new Map();

  data.forEach((r) => {
    if (agentName && r.asesor !== agentName) return;
    const rawItem = (r.itemDebitado || "").trim();
    if (!rawItem) return;
    const key = rawItem;
    map.set(key, (map.get(key) || 0) + 1);
  });

  const arr = Array.from(map.entries()).map(([item, total]) => ({ item, total }));
  arr.sort((a, b) => b.total - a.total || a.item.localeCompare(b.item));
  return arr;
}

/* ------------------------------
   VISTA EJECUTIVA B2 (CÁLCULO COMPLETO POR ASESOR)
------------------------------ */
function renderExecView(data) {
  const porAsesor = {};

  data.forEach((r) => {
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
        ok: 0, // >=85
        bad: 0, // <85
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
    .map((a) => ({
      ...a,
      promedio: a.total ? a.sumaNota / a.total : 0,
    }))
    .sort((a, b) => b.promedio - a.promedio);

  const cont = document.getElementById("execGrid");
  if (!lista.length) {
    cont.innerHTML = `<div class="small">Sin datos para el filtro seleccionado.</div>`;
    return;
  }

  let html = "";
  lista.forEach((a) => {
    const prom = Math.round(a.promedio * 10) / 10;
    const esVerde = prom >= 85;
    const pillClass = esVerde ? "green" : "red";
    const label = esVerde ? "🟢 85 – 100" : "🔴 0 – 84";
    const maxTxt = a.max !== null ? `${a.max}%` : "-";
    const minTxt = a.min !== null ? `${a.min}%` : "-";

    html += `
      <div class="exec-card">
        <div class="exec-header">
          <div>
            <div class="exec-name">${sanitizeText(a.asesor)}</div>
            <div class="exec-gc">GC: ${sanitizeText(a.gc)}</div>
          </div>
          <div class="pill ${pillClass}">
            ${label}
          </div>
        </div>
        <div class="exec-main">
          <div>
            <div class="exec-score">${sanitizeText(prom)}</div>
            <div class="exec-meta">
              <div><b>${sanitizeText(a.total)}</b> feedback(s)</div>
              <div>🟢 ${sanitizeText(a.ok)} · 🔴 ${sanitizeText(a.bad)}</div>
            </div>
          </div>
          <div class="exec-meta">
            <div><b>Mejor</b>: ${sanitizeText(maxTxt)}</div>
            <div><b>Peor</b>: ${sanitizeText(minTxt)}</div>
          </div>
        </div>
      </div>
    `;
  });

  cont.innerHTML = html;

  // Añadimos evento click para abrir modal por asesor
  const cards = cont.querySelectorAll(".exec-card");
  cards.forEach((card) => {
    const nameEl = card.querySelector(".exec-name");
    const nombreAsesor = nameEl ? nameEl.textContent.trim() : "";
    card.addEventListener("click", () => {
      if (nombreAsesor) {
        openItemsModal(nombreAsesor);
      }
    });
  });
}

/* ------------------------------
   RENDER KPIs, TABLAS Y GRÁFICO DESDE filteredData
------------------------------ */
function renderFromFilteredData() {
  const data = filteredData;

  // Resumen del filtro
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

  // Vista ejecutiva por asesor
  renderExecView(data);

  // Contadores por tipo
  const counts = {
    EFECTIVA: 0,
    EFECTIVANK: 0,
    XPERTO: 0,
    FACEBOOK: 0,
    INSTAGRAM: 0,
    CORREO: 0,
    OTRO: 0,
  };
  data.forEach((r) => {
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
  const recentBody = document.querySelector("#recentTable tbody");

  if (!recent.length) {
    recentBody.innerHTML = `<tr><td colspan="5">Sin registros</td></tr>`;
  } else {
    recentBody.innerHTML = recent
      .map((r) => {
        const fechaTxt = parseFecha(r.fecha).toLocaleString("es-PE");
        return `
        <tr>
          <td>${sanitizeText(fechaTxt)}</td>
          <td>${sanitizeText(r.asesor)} — ${sanitizeText(r.gc)}</td>
          <td>${sanitizeText(r.nota || 0)}%</td>
          <td>${sanitizeText(r.tipo || "-")}</td>
          <td>${sanitizeText(r.registradoPor || "-")}</td>
        </tr>`;
      })
      .join("");
  }

  // Tabla semanal
  const weeks = getWeeksOfMonth(
    data.length ? parseFecha(data[0].fecha) : new Date()
  );
  const asesoresUnicos = [...new Set(data.map((r) => r.asesor))].filter(Boolean);

  const head = document.getElementById("weeklyHead");
  const body = document.getElementById("weeklyBody");

  head.innerHTML =
    `<tr><th>ASESOR</th>` +
    weeks.map((_, i) => `<th>S${i + 1} C1</th><th>S${i + 1} C2</th>`).join("") +
    `</tr>`;

  if (!asesoresUnicos.length) {
    body.innerHTML = `<tr><td colspan="${
      1 + weeks.length * 2
    }">Sin registros</td></tr>`;
  } else {
    body.innerHTML = asesoresUnicos
      .map((a) => {
        const reg = data.find((r) => r.asesor === a);
        const gc = reg?.gc || "SIN GC";
        let row = `<tr><td>${sanitizeText(a)} — ${sanitizeText(gc)}</td>`;

        for (let w = 0; w < weeks.length; w++) {
          const recs = data.filter((r) => {
            const f = parseFecha(r.fecha);
            const d = f.getDate();
            return (
              r.asesor === a &&
              d >= weeks[w].startDay &&
              d <= weeks[w].endDay
            );
          });
          row += `<td>${sanitizeText(recs[0]?.tipo || "-")}</td>`;
          row += `<td>${sanitizeText(recs[1]?.tipo || "-")}</td>`;
        }

        row += "</tr>";
        return row;
      })
      .join("");
  }

  // Gráfico semanal
  const values = weeks.map((w) => {
    const recs = data.filter((r) => {
      const f = parseFecha(r.fecha);
      const d = f.getDate();
      return d >= w.startDay && d <= w.endDay;
    });
    if (!recs.length) return 0;
    const avg =
      recs.reduce((t, r) => t + (parseFloat(r.nota) || 0), 0) / recs.length;
    return Math.round(avg);
  });

  chart.data.labels = weeks.map((_, i) => `S${i + 1}`);
  chart.data.datasets[0].data = values;
  chart.update();
}

/* ------------------------------
   APLICAR FILTROS
------------------------------ */
function applyFilters() {
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");

  const filterValueReg = normalize(selReg.value);
  const filterMes = selMes.value === "" ? null : Number(selMes.value);
  const filterAnio = selAnio.value === "" ? null : Number(selAnio.value);

  let data = rawData.slice();

  // Año
  if (filterAnio !== null) {
    data = data.filter((r) => {
      const f = parseFecha(r.fecha);
      return f.getFullYear() === filterAnio;
    });
  }

  // Mes
  if (filterMes !== null) {
    data = data.filter((r) => {
      const f = parseFecha(r.fecha);
      return f.getMonth() === filterMes;
    });
  }

  // Registrado por
  if (filterValueReg) {
    data = data.filter((r) => normalize(r.registradoPor) === filterValueReg);
  }

  filteredData = data;
  renderFromFilteredData();
}

/* ------------------------------
   CARGAR AÑOS DISPONIBLES EN SELECT
------------------------------ */
function setupYearFilter() {
  const selAnio = document.getElementById("filterAnio");
  selAnio.innerHTML = "";

  const optionAll = document.createElement("option");
  optionAll.value = "";
  optionAll.textContent = "Todos";
  selAnio.appendChild(optionAll);

  allYears.sort((a, b) => a - b);
  allYears.forEach((y) => {
    const op = document.createElement("option");
    op.value = y;
    op.textContent = y;
    selAnio.appendChild(op);
  });

  const currentYear = new Date().getFullYear();
  if (allYears.includes(currentYear)) {
    selAnio.value = String(currentYear);
  }
}

/* ------------------------------
   GENERAR DASHBOARD COMPLETO
------------------------------ */
async function refreshDashboard() {
  let data = await getMergedData();

  // Ordenar por fecha ascendente
  data = data.sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));
  rawData = data;

  // Años
  const yearsSet = new Set();
  data.forEach((r) => {
    const f = parseFecha(r.fecha);
    yearsSet.add(f.getFullYear());
  });
  allYears = Array.from(yearsSet);

  // Configurar años
  setupYearFilter();

  // Preseleccionar mes actual
  const hoy = new Date();
  document.getElementById("filterMes").value = hoy.getMonth().toString();

  // Aplicar filtros iniciales
  applyFilters();
}

/* ------------------------------
   EVENTOS
------------------------------ */
document
  .getElementById("filterRegistrado")
  .addEventListener("change", applyFilters);
document
  .getElementById("filterMes")
  .addEventListener("change", applyFilters);
document
  .getElementById("filterAnio")
  .addEventListener("change", applyFilters);

btnItemsModal.addEventListener("click", () => openItemsModal());
btnCloseItemsModal.addEventListener("click", closeItemsModal);

// Cerrar modal haciendo clic fuera
itemsModal.addEventListener("click", (e) => {
  if (e.target === itemsModal) {
    closeItemsModal();
  }
});

/* INICIO */
refreshDashboard().catch((err) => {
  console.error("Error al cargar dashboard:", err);
  alert("Error al cargar dashboard: " + (err?.message || err));
});
