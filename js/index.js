/* index.js - Dashboard Supervisión
   Requiere:
   - js/firebase.js exportando { db }
   - Chart.js cargado en index.html
   - login.html usando Firebase Auth
*/
"use strict";

/* ------------------------------
   IMPORTS FIREBASE
------------------------------ */
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ------------------------------
   AUTH: PROTEGER EL DASHBOARD
------------------------------ */
const auth = getAuth();

// Redirigir si NO hay usuario logueado y mostrar nombre/email
onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  const el = document.getElementById("userRoleName");
  if (el) {
    el.textContent = user.displayName || user.email || "Usuario";
  }
});

/* ------------------------------
   Helpers básicos
------------------------------ */
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c));
}

function normalize(str) {
  return (str || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseFecha(fecha) {
  if (!fecha) return new Date();
  if (fecha.toDate) return fecha.toDate();
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
  snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
  return arr;
}

async function loadAsesores() {
  const snap = await getDocs(collection(db, "asesores"));
  const mapa = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.nombre) mapa[d.nombre.trim()] = d.GC || "SIN GC";
  });
  return mapa;
}

async function getMergedData() {
  const registros = await loadRegistros();
  const asesores = await loadAsesores();
  return registros.map((r) => ({
    ...r,
    gc: asesores[r.asesor?.trim()] || "SIN GC",
    registradoPor: r.registradoPor || "",
  }));
}

/* ------------------------------
   Estado global
------------------------------ */
let rawData = [];
let filteredData = [];
let allYears = [];
let currentWeeks = [];
let itemsModalAsesor = null;

/* ------------------------------
   Chart semanal
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
   Vista ejecutiva por asesor
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
        ok: 0,
        bad: 0,
      };
    }
    const a = porAsesor[key];
    a.total++;
    a.sumaNota += nota;
    if (a.max === null || nota > a.max) a.max = nota;
    if (a.min === null || nota < a.min) a.min = nota;
    if (nota >= 85) a.ok++;
    else a.bad++;
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

  cont.innerHTML = lista
    .map((a) => {
      const prom = Math.round(a.promedio * 10) / 10;
      const pillClass = prom >= 85 ? "green" : "red";
      const label = prom >= 85 ? "🟢 85–100" : "🔴 0–84";
      return `
      <div class="exec-card" data-asesor="${escapeHTML(a.asesor)}">
        <div class="exec-header">
          <div>
            <div class="exec-name">${escapeHTML(a.asesor)}</div>
            <div class="exec-gc">GC: ${escapeHTML(a.gc)}</div>
          </div>
          <div class="pill ${pillClass}">${label}</div>
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
            <div><b>Mejor</b>: ${a.max}%</div>
            <div><b>Peor</b>: ${a.min}%</div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");

  cont.querySelectorAll(".exec-card").forEach((card) => {
    card.addEventListener("click", () => {
      openItemsModal(card.dataset.asesor);
    });
  });
}

/* ------------------------------
   Render general
------------------------------ */
function renderFromFilteredData() {
  const data = filteredData;

  // Resumen texto
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const summary = document.getElementById("filterSummary");

  let resumen = `Mostrando ${data.length} registros`;
  if (selMes.value !== "") resumen += ` del mes ${selMes.options[selMes.selectedIndex].text}`;
  if (selAnio.value !== "") resumen += ` del año ${selAnio.value}`;
  if (selReg.value) resumen += ` registrados por ${selReg.value}`;
  summary.textContent = resumen;

  // Vista ejecutiva
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
    const t = (r.tipo || "OTRO").toUpperCase();
    if (counts[t] !== undefined) counts[t]++;
    else counts.OTRO++;
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

  document.querySelector("#recentTable tbody").innerHTML = recent.length
    ? recent
        .map(
          (r) => `
        <tr>
          <td>${escapeHTML(parseFecha(r.fecha).toLocaleString("es-PE"))}</td>
          <td>${escapeHTML(r.asesor)} — ${escapeHTML(r.gc)}</td>
          <td>${r.nota || 0}%</td>
          <td>${escapeHTML(r.tipo)}</td>
          <td>${escapeHTML(r.registradoPor)}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Sin registros</td></tr>`;

  // Semanas
  const baseDate = data.length ? parseFecha(data[0].fecha) : new Date();
  currentWeeks = getWeeksOfMonth(baseDate);

  const asesoresUnicos = [...new Set(data.map((r) => r.asesor))].filter(Boolean);

  document.getElementById("weeklyHead").innerHTML =
    `<tr><th>ASESOR</th>` +
    currentWeeks.map((_, i) => `<th>S${i + 1} C1</th><th>S${i + 1} C2</th>`).join("") +
    `</tr>`;

  document.getElementById("weeklyBody").innerHTML =
    asesoresUnicos
      .map((a) => {
        let row = `<tr><td>${escapeHTML(a)}</td>`;
        for (let w = 0; w < currentWeeks.length; w++) {
          const { startDay, endDay } = currentWeeks[w];
          const recs = data.filter((r) => {
            const d = parseFecha(r.fecha).getDate();
            return r.asesor === a && d >= startDay && d <= endDay;
          });
          row += `<td>${escapeHTML(recs[0]?.tipo || "-")}</td>`;
          row += `<td>${escapeHTML(recs[1]?.tipo || "-")}</td>`;
        }
        return row + "</tr>";
      })
      .join("") || `<tr><td colspan="20">Sin datos</td></tr>`;

  // Gráfico
  const values = currentWeeks.map((w) => {
    const recs = data.filter((r) => {
      const d = parseFecha(r.fecha).getDate();
      return d >= w.startDay && d <= w.endDay;
    });
    if (!recs.length) return 0;
    const avg = recs.reduce((t, r) => t + (Number(r.nota) || 0), 0) / recs.length;
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
  const reg = normalize(document.getElementById("filterRegistrado").value);
  const mes = document.getElementById("filterMes").value;
  const anio = document.getElementById("filterAnio").value;

  let data = rawData.slice();

  if (anio !== "") {
    data = data.filter((r) => parseFecha(r.fecha).getFullYear() == anio);
  }
  if (mes !== "") {
    data = data.filter((r) => parseFecha(r.fecha).getMonth() == mes);
  }
  if (reg) {
    data = data.filter((r) => normalize(r.registradoPor) == reg);
  }

  filteredData = data;
  renderFromFilteredData();
}

/* ------------------------------
   Filtro años
------------------------------ */
function setupYearFilter() {
  const sel = document.getElementById("filterAnio");
  sel.innerHTML = `<option value="">Todos</option>`;
  allYears.sort().forEach((y) => {
    sel.innerHTML += `<option value="${y}">${y}</option>`;
  });
}

/* ------------------------------
   Modal de items
------------------------------ */
function aggregateItems(records) {
  const mapa = {};
  records.forEach((reg) => {
    (reg.items || []).forEach((it) => {
      const key = it.name || "Sin nombre";
      if (!mapa[key])
        mapa[key] = {
          name: key,
          tipo: it.tipo || "—",
          count: 0,
          sumPerc: 0,
          sampleDetail: "",
        };
      mapa[key].count++;
      mapa[key].sumPerc += Number(it.perc || 0);
      if (!mapa[key].sampleDetail && it.detail) mapa[key].sampleDetail = it.detail;
    });
  });
  return Object.values(mapa)
    .map((o) => ({ ...o, avgPerc: Math.round((o.sumPerc / o.count) * 10) / 10 }))
    .sort((a, b) => b.count - a.count);
}

function fillItemsPeriodSelect() {
  const sel = document.getElementById("itemsPeriodSelect");
  sel.innerHTML = `<option value="mes">Mes completo</option>`;
  currentWeeks.forEach((w, i) => {
    sel.innerHTML += `<option value="week-${i}">Semana S${i + 1} (${w.startDay}-${w.endDay})</option>`;
  });
}

function renderItemsModalTable() {
  const selVal = document.getElementById("itemsPeriodSelect").value;
  let data = filteredData.slice();

  if (itemsModalAsesor) {
    data = data.filter((r) => r.asesor === itemsModalAsesor);
  }

  if (selVal.startsWith("week-")) {
    const index = Number(selVal.split("-")[1]);
    const w = currentWeeks[index];
    if (w) {
      data = data.filter((r) => {
        const d = parseFecha(r.fecha).getDate();
        return d >= w.startDay && d <= w.endDay;
      });
    }
  }

  const agg = aggregateItems(data);
  document.getElementById("itemsTableBody").innerHTML = agg.length
    ? agg
        .map(
          (it) => `
      <tr>
        <td>${escapeHTML(it.name)}</td>
        <td>${escapeHTML(it.tipo)}</td>
        <td>${it.count}</td>
        <td>${it.avgPerc}%</td>
        <td>${escapeHTML(it.sampleDetail || "Sin detalle")}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Sin ítems debitados.</td></tr>`;
}

function openItemsModal(asesor = null) {
  itemsModalAsesor = asesor;
  document.getElementById("itemsModalTitle").textContent = asesor
    ? `Ítems debitados – ${asesor}`
    : "Ranking general de ítems debitados";
  document.getElementById("itemsModalSubtitle").textContent = asesor
    ? "Ranking de ítems para este asesor."
    : "Basado en todos los registros filtrados.";
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
   Inicialización
------------------------------ */
async function refreshDashboard() {
  const data = await getMergedData();
  rawData = data.sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));
  allYears = [...new Set(rawData.map((r) => parseFecha(r.fecha).getFullYear()))];
  setupYearFilter();
  document.getElementById("filterMes").value = new Date().getMonth().toString();
  applyFilters();
}

/* Eventos de filtros */
document.getElementById("filterRegistrado").addEventListener("change", applyFilters);
document.getElementById("filterMes").addEventListener("change", applyFilters);
document.getElementById("filterAnio").addEventListener("change", applyFilters);

/* Modal ítems */
document
  .getElementById("btnOpenItemsModal")
  .addEventListener("click", () => openItemsModal());
document
  .getElementById("btnCloseItemsModal")
  .addEventListener("click", closeItemsModal);
document.getElementById("itemsModal").addEventListener("click", (e) => {
  if (e.target.id === "itemsModal") closeItemsModal();
});

/* Tema */
const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
applyTheme(savedTheme);
document.getElementById("btnTheme").addEventListener("click", () => {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* ------------------------------
   Accesos rápidos + Logout
------------------------------ */

// Accesos rápidos (data-nav, data-external) sin inline JS
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const nav = btn.dataset.nav;
  const ext = btn.dataset.external;

  if (nav) {
    location.href = nav;
    return;
  }

  if (ext) {
    window.open(ext, "_blank");
  }
});

// Cerrar sesión
document.getElementById("btnLogout").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error("Error al cerrar sesión:", e);
  }
  location.href = "login.html";
});

/* ------------------------------
   Start
------------------------------ */
refreshDashboard().catch((err) => {
  console.error("Error cargando dashboard:", err);
});
