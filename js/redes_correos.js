"use strict";

import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ===== Helpers ===== */
const CARGOS_VALIDOS = ["ASESOR REDES", "ASESOR CORREOS"];

function parseFecha(f) {
  if (!f) return new Date();
  if (f.toDate) return f.toDate();
  return new Date(f);
}

function getWeeks(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const weeks = [];
  let d = 1;
  while (d <= last) {
    weeks.push({ start: d, end: Math.min(d + 6, last) });
    d += 7;
  }
  return weeks;
}

/* ===== Estado ===== */
let rawData = [];
let filtered = [];
let weeks = [];
let chart;

/* ===== Auth ===== */
const auth = getAuth();
onAuthStateChanged(auth, (user) => {
  if (!user) location.href = "login.html";
  document.getElementById("userRoleName").textContent =
    user.displayName || user.email;
});

/* ===== Cargar datos ===== */
async function loadData() {
  const snap = await getDocs(collection(db, "registros"));
  rawData = [];
  snap.forEach((d) => {
    const r = d.data();
    if (!CARGOS_VALIDOS.includes(r.cargo)) return;
    rawData.push({
      ...r,
      fechaObj: parseFecha(r.fecha),
    });
  });
}

/* ===== Filtros ===== */
function applyFilters() {
  const mes = document.getElementById("filterMes").value;
  const anio = document.getElementById("filterAnio").value;
  const semana = document.getElementById("filterSemana").value;

  filtered = rawData.slice();

  if (anio)
    filtered = filtered.filter(
      (r) => r.fechaObj.getFullYear() == anio
    );
  if (mes !== "")
    filtered = filtered.filter(
      (r) => r.fechaObj.getMonth() == mes
    );
  if (semana !== "") {
    const w = weeks[Number(semana)];
    filtered = filtered.filter((r) => {
      const d = r.fechaObj.getDate();
      return d >= w.start && d <= w.end;
    });
  }

  renderExec();
  renderChart();
  document.getElementById(
    "filterSummary"
  ).textContent = `Mostrando ${filtered.length} registros`;
}

/* ===== Vista ejecutiva ===== */
function renderExec() {
  const map = {};
  filtered.forEach((r) => {
    if (!map[r.asesor]) {
      map[r.asesor] = { asesor: r.asesor, total: 0, suma: 0 };
    }
    map[r.asesor].total++;
    map[r.asesor].suma += Number(r.nota || 0);
  });

  const cont = document.getElementById("execGrid");
  cont.innerHTML = Object.values(map)
    .map((a) => {
      const prom = Math.round((a.suma / a.total) * 10) / 10;
      return `
      <div class="exec-card">
        <div class="exec-name">${a.asesor}</div>
        <div class="exec-score">${prom}%</div>
        <div class="small">${a.total} feedback(s)</div>
      </div>`;
    })
    .join("");
}

/* ===== Gráfico ===== */
function renderChart() {
  if (!chart) {
    chart = new Chart(document.getElementById("chartMonth"), {
      type: "bar",
      data: { labels: [], datasets: [{ data: [] }] },
    });
  }
  const values = weeks.map((w) => {
    const recs = filtered.filter((r) => {
      const d = r.fechaObj.getDate();
      return d >= w.start && d <= w.end;
    });
    if (!recs.length) return 0;
    return Math.round(
      recs.reduce((s, r) => s + Number(r.nota || 0), 0) /
        recs.length
    );
  });
  chart.data.labels = weeks.map((_, i) => `S${i + 1}`);
  chart.data.datasets[0].data = values;
  chart.update();
}

/* ===== Init ===== */
async function init() {
  await loadData();

  const years = [...new Set(rawData.map((r) => r.fechaObj.getFullYear()))];
  document.getElementById("filterAnio").innerHTML =
    `<option value="">Todos</option>` +
    years.map((y) => `<option>${y}</option>`).join("");

  weeks = getWeeks(new Date());
  document.getElementById("filterSemana").innerHTML =
    `<option value="">Todas</option>` +
    weeks
      .map(
        (w, i) =>
          `<option value="${i}">S${i + 1} (${w.start}-${w.end})</option>`
      )
      .join("");

  applyFilters();
}

/* Eventos */
["filterMes", "filterAnio", "filterSemana"].forEach((id) =>
  document.getElementById(id).addEventListener("change", applyFilters)
);

document.getElementById("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

init();
