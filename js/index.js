/* index.js - Dashboard Supervisión con FILTRO SEMANAL GLOBAL */
"use strict";

/* ------------------------------
   FIREBASE IMPORTS
------------------------------ */
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

/* ------------------------------
   AUTH
------------------------------ */
const auth = getAuth();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    location.href = "login.html";
    return;
  }
  const el = document.getElementById("userRoleName");
  if (el) el.textContent = user.displayName || user.email;
});

/* ------------------------------
   HELPERS
------------------------------ */
const escapeHTML = (s = "") =>
  s.toString().replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

const parseFecha = (f) => {
  if (!f) return new Date();
  if (f.toDate) return f.toDate();
  return new Date(f);
};

function getWeeksOfMonth(date) {
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

/* ------------------------------
   DATA LOAD
------------------------------ */
async function loadRegistros() {
  const snap = await getDocs(collection(db, "registros"));
  const arr = [];
  snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
  return arr;
}

/* ------------------------------
   STATE
------------------------------ */
let rawData = [];
let filteredData = [];
let weeks = [];

/* ------------------------------
   FILTERS
------------------------------ */
function applyFilters() {
  const mes = document.getElementById("filterMes").value;
  const anio = document.getElementById("filterAnio").value;
  const semana = document.getElementById("filterSemana").value;
  const registrado = document.getElementById("filterRegistrado").value;

  let data = rawData.slice();

  // ⚠️ SOLO INBOUND EN ESTE DASHBOARD
  data = data.filter(
    (r) => (r.cargo || "").toUpperCase() === "ASESOR INBOUND"
  );

  if (anio !== "") {
    data = data.filter(
      (r) => parseFecha(r.fecha).getFullYear() == anio
    );
  }

  if (mes !== "") {
    data = data.filter(
      (r) => parseFecha(r.fecha).getMonth() == mes
    );
  }

  if (registrado) {
    data = data.filter((r) => r.registradoPor === registrado);
  }

  if (semana !== "") {
    const w = weeks[Number(semana)];
    if (w) {
      data = data.filter((r) => {
        const d = parseFecha(r.fecha).getDate();
        return d >= w.start && d <= w.end;
      });
    }
  }

  filteredData = data;
  renderDashboard();
}

/* ------------------------------
   RENDER DASHBOARD
------------------------------ */
function renderDashboard() {
  renderExecView();
  renderRecent();
  renderItemRanking();
}

/* ------------------------------
   EXEC VIEW
------------------------------ */
function renderExecView() {
  const map = {};

  filteredData.forEach((r) => {
    if (!r.asesor) return;
    if (!map[r.asesor]) {
      map[r.asesor] = {
        asesor: r.asesor,
        gc: r.gc || "SIN GC",
        total: 0,
        suma: 0,
      };
    }
    map[r.asesor].total++;
    map[r.asesor].suma += Number(r.nota || 0);
  });

  const cont = document.getElementById("execGrid");
  cont.innerHTML = Object.values(map)
    .map((a) => {
      const prom = Math.round(a.suma / a.total);
      return `
        <div class="exec-card">
          <div class="exec-header">
            <div>
              <div class="exec-name">${escapeHTML(a.asesor)}</div>
              <div class="exec-gc">GC ${escapeHTML(a.gc)}</div>
            </div>
            <div class="pill ${prom >= 85 ? "green" : "red"}">
              ${prom}%
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

/* ------------------------------
   RECENT TABLE
------------------------------ */
function renderRecent() {
  const tbody = document.querySelector("#recentTable tbody");
  const rows = filteredData
    .slice()
    .sort((a, b) => parseFecha(b.fecha) - parseFecha(a.fecha))
    .slice(0, 10);

  tbody.innerHTML = rows.length
    ? rows
        .map(
          (r) => `
      <tr>
        <td>${parseFecha(r.fecha).toLocaleString("es-PE")}</td>
        <td>${escapeHTML(r.asesor)} — ${escapeHTML(r.gc)}</td>
        <td>${r.nota}%</td>
        <td>${escapeHTML(r.tipo || "-")}</td>
        <td>${escapeHTML(r.registradoPor || "-")}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="5">Sin registros</td></tr>`;
}

/* ------------------------------
   ITEM RANKING + DETALLE
------------------------------ */
function renderItemRanking() {
  const map = {};

  filteredData.forEach((r) => {
    (r.items || []).forEach((it) => {
      if (!map[it.name]) {
        map[it.name] = {
          name: it.name,
          count: 0,
          detalles: [],
        };
      }
      map[it.name].count++;
      if (it.detail) map[it.name].detalles.push(it.detail);
    });
  });

  const body = document.getElementById("itemsTableBody");
  body.innerHTML = Object.values(map)
    .sort((a, b) => b.count - a.count)
    .map(
      (i) => `
    <tr>
      <td><strong>${escapeHTML(i.name)}</strong></td>
      <td>${i.count}</td>
      <td>
        <details>
          <summary>Ver motivos</summary>
          <ul>
            ${i.detalles
              .map((d) => `<li>${escapeHTML(d)}</li>`)
              .join("")}
          </ul>
        </details>
      </td>
    </tr>`
    )
    .join("");
}

/* ------------------------------
   INIT
------------------------------ */
async function init() {
  rawData = await loadRegistros();

  // Inicializar semanas según el mes actual
  weeks = getWeeksOfMonth(new Date());

  const selSemana = document.getElementById("filterSemana");
  selSemana.innerHTML =
    `<option value="">Todas</option>` +
    weeks
      .map(
        (w, i) =>
          `<option value="${i}">Semana ${i + 1} (${w.start}-${w.end})</option>`
      )
      .join("");

  applyFilters();
}

/* ------------------------------
   EVENTS
------------------------------ */
["filterMes", "filterAnio", "filterSemana", "filterRegistrado"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", applyFilters);
});

document.getElementById("btnLogout")?.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "login.html";
});

/* ------------------------------
   START
------------------------------ */
init().catch(console.error);
