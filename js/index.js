/* =========================================================
   index.js – Dashboard Supervisión (INBOUND/REDES/CORREOS)
   Filtro semanal GLOBAL (dependiente de Año/Mes)
   Vista ejecutiva (tarjetas clic)
   Modal ranking ítems + filtro semanal dentro del modal
   Modal limpio para "Motivo/Detalle" (popup + volver)
   Tema claro/oscuro + Logout + Accesos rápidos
   Requiere:
   - js/firebase.js exportando { db }
   - Chart.js cargado en index.html
========================================================= */
"use strict";

/* ------------------------------
   FIREBASE IMPORTS
------------------------------ */
import { getAuth, onAuthStateChanged, signOut } from
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { db } from "./firebase.js";
import { collection, getDocs } from
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ------------------------------
   CONFIG: vista por cargo
   - Por defecto INBOUND
   - Puedes reutilizar el mismo index.html con:
     index.html?view=inbound
     index.html?view=redes
     index.html?view=correos
------------------------------ */
const CARGO_MAP = {
  inbound: "ASESOR INBOUND",
  redes: "ASESOR REDES",
  correos: "ASESOR CORREOS",
};

function getDashboardCargo() {
  const params = new URLSearchParams(location.search);
  const view = (params.get("view") || "inbound").toLowerCase();
  return CARGO_MAP[view] || CARGO_MAP.inbound;
}

const DASHBOARD_CARGO = getDashboardCargo();

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
  if (el) el.textContent = user.displayName || user.email || "Usuario";
});

/* ------------------------------
   HELPERS
------------------------------ */
function escapeHTML(str) {
  return (str ?? "")
    .toString()
    .replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c] || c));
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
  if (fecha.toDate) return fecha.toDate(); // Firestore Timestamp
  if (fecha instanceof Date) return fecha;

  if (typeof fecha === "string") {
    // ISO
    if (fecha.includes("T")) return new Date(fecha);

    // dd/mm/yyyy hh:mm(:ss)
    if (fecha.includes("/")) {
      const [d, m, yRest] = fecha.split("/");
      const [y, hhmm = "00:00"] = (yRest || "").split(" ");
      return new Date(`${y}-${m}-${d}T${hhmm}`);
    }
    return new Date(fecha);
  }
  return new Date(fecha);
}

function getWeeksOfMonth(year, monthIndex) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = [];
  let d = 1;
  while (d <= lastDay) {
    weeks.push({ startDay: d, endDay: Math.min(d + 6, lastDay) });
    d += 7;
  }
  return weeks;
}

/* ------------------------------
   FIREBASE LOAD
------------------------------ */
async function loadRegistros() {
  const snap = await getDocs(collection(db, "registros"));
  const arr = [];
  snap.forEach((doc) => arr.push({ id: doc.id, ...doc.data() }));
  return arr;
}

async function loadUsuariosAgentes() {
  const snap = await getDocs(collection(db, "usuarios"));
  const mapa = {};

  snap.forEach(doc => {
    const d = doc.data();
    if (
      d.rol === "agente" &&
      d.activo !== false &&
      d.nombreAsesor
    ) {
      mapa[d.nombreAsesor.trim()] = {
        gc: d.GC || "SIN GC",
        cargo: d.cargo || ""
      };
    }
  });

  return mapa;
}

async function getMergedData() {
  const [registros, usuarios] = await Promise.all([
    loadRegistros(),
    loadUsuariosAgentes()
  ]);

  return registros.map((r) => {
    const asesorKey = r.asesor?.trim();
    const u = usuarios[asesorKey] || {};

    return {
      ...r,
      gc: u.gc || r.gc || "SIN GC",
      cargo: u.cargo || r.cargo || "",
      registradoPor: r.registradoPor || r.registrado_por || ""
    };
  });
}

/* ------------------------------
   STATE
------------------------------ */
let rawData = [];
let filteredData = [];
let allYears = [];
let currentWeeks = [];
let itemsModalAsesor = null; // null=ranking general, string=ranking por asesor
let chart = null;

// cache del último agregado del modal para abrir detalle por ítem
let lastItemsAgg = [];
let lastItemsAggMap = new Map();

/* ------------------------------
   CHART
------------------------------ */
function ensureChart() {
  if (chart) return chart;
  const canvas = document.getElementById("chartMonth");
  if (!canvas || typeof Chart === "undefined") return null;

  chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        label: "Promedio %",
        data: [],
        backgroundColor: "#0f4c81",
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } },
    },
  });

  return chart;
}

/* ------------------------------
   UI: YEAR FILTER
------------------------------ */
function setupYearFilter() {
  const sel = document.getElementById("filterAnio");
  if (!sel) return;

  sel.innerHTML = `<option value="">Todos</option>`;
  allYears
    .slice()
    .sort((a, b) => a - b)
    .forEach((y) => {
      sel.innerHTML += `<option value="${y}">${y}</option>`;
    });
}

/* ------------------------------
   UI: WEEK FILTER OPTIONS (GLOBAL)
   depende de Año/Mes seleccionados
------------------------------ */
function setupWeekFilterOptions() {
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const selSemana = document.getElementById("filterSemana");
  if (!selSemana) return;

  const mesVal = selMes?.value ?? "";
  const anioVal = selAnio?.value ?? "";

  const now = new Date();
  const year = anioVal !== "" ? Number(anioVal) : now.getFullYear();
  const month = mesVal !== "" ? Number(mesVal) : now.getMonth();

  currentWeeks = getWeeksOfMonth(year, month);

  const prev = selSemana.value;
  selSemana.innerHTML =
    `<option value="">Todas</option>` +
    currentWeeks
      .map((w, i) => `<option value="${i}">Semana ${i + 1} (${w.startDay}-${w.endDay})</option>`)
      .join("");

  if (prev !== "" && currentWeeks[Number(prev)]) selSemana.value = prev;
}

/* ------------------------------
   APPLY FILTERS
------------------------------ */
function applyFilters() {
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const selSemana = document.getElementById("filterSemana");

  const reg = normalize(selReg?.value || "");
  const mes = selMes?.value ?? "";
  const anio = selAnio?.value ?? "";
  const semana = selSemana?.value ?? "";

  let data = rawData.slice();

  // ✅ separar vista por cargo (INBOUND/REDES/CORREOS)
  data = data.filter((r) => (r.cargo || "").toString().toUpperCase() === DASHBOARD_CARGO);

  if (anio !== "") data = data.filter((r) => parseFecha(r.fecha).getFullYear() == anio);
  if (mes !== "") data = data.filter((r) => parseFecha(r.fecha).getMonth() == mes);
  if (reg) data = data.filter((r) => normalize(r.registradoPor) === reg);

  // ✅ semana global
  if (semana !== "") {
    const w = currentWeeks[Number(semana)];
    if (w) {
      data = data.filter((r) => {
        const d = parseFecha(r.fecha).getDate();
        return d >= w.startDay && d <= w.endDay;
      });
    }
  }

  filteredData = data;
  renderFromFilteredData();
}

/* ------------------------------
   EXEC VIEW (tarjetas)
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
    .map((a) => ({ ...a, promedio: a.total ? a.sumaNota / a.total : 0 }))
    .sort((a, b) => b.promedio - a.promedio);

  const cont = document.getElementById("execGrid");
  if (!cont) return;

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
              <div><b>Mejor</b>: ${a.max ?? 0}%</div>
              <div><b>Peor</b>: ${a.min ?? 0}%</div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  cont.querySelectorAll(".exec-card").forEach((card) => {
    card.addEventListener("click", () => openItemsModal(card.dataset.asesor));
  });
}

/* ------------------------------
   COUNTERS
------------------------------ */
function renderCounters(data) {
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

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.innerText = String(v);
  };

  set("cntEfectiva", counts.EFECTIVA);
  set("cntEfectivank", counts.EFECTIVANK);
  set("cntXperto", counts.XPERTO);
  set("cntFb", counts.FACEBOOK);
  set("cntIg", counts.INSTAGRAM);
  set("cntMail", counts.CORREO);
}

/* ------------------------------
   RECENT
------------------------------ */
function renderRecent(data) {
  const tbody = document.querySelector("#recentTable tbody");
  if (!tbody) return;

  const recent = data
    .slice()
    .sort((a, b) => parseFecha(b.fecha) - parseFecha(a.fecha))
    .slice(0, 8);

  tbody.innerHTML = recent.length
    ? recent
      .map((r) => `
        <tr>
          <td>${escapeHTML(parseFecha(r.fecha).toLocaleString("es-PE"))}</td>
          <td>${escapeHTML(r.asesor)} — ${escapeHTML(r.gc)}</td>
          <td>${Number(r.nota || 0)}%</td>
          <td>${escapeHTML(r.tipo || "—")}</td>
          <td>${escapeHTML(r.registradoPor || "—")}</td>
        </tr>
      `)
      .join("")
    : `<tr><td colspan="5">Sin registros</td></tr>`;
}

/* ------------------------------
   WEEKLY TABLE + CHART
------------------------------ */
function renderWeeklyAndChart(data) {
  const head = document.getElementById("weeklyHead");
  const body = document.getElementById("weeklyBody");
  if (!head || !body) return;

  head.innerHTML =
    `<tr><th>ASESOR</th>` +
    currentWeeks.map((_, i) => `<th>S${i + 1} C1</th><th>S${i + 1} C2</th>`).join("") +
    `</tr>`;

  const asesoresUnicos = [...new Set(data.map((r) => r.asesor))].filter(Boolean);

  body.innerHTML =
    asesoresUnicos
      .map((asesor) => {
        let row = `<tr><td>${escapeHTML(asesor)}</td>`;
        for (let w = 0; w < currentWeeks.length; w++) {
          const { startDay, endDay } = currentWeeks[w];
          const recs = data
            .filter((r) => {
              const d = parseFecha(r.fecha).getDate();
              return r.asesor === asesor && d >= startDay && d <= endDay;
            })
            .slice(0, 2);
          row += `<td>${escapeHTML(recs[0]?.tipo || "-")}</td>`;
          row += `<td>${escapeHTML(recs[1]?.tipo || "-")}</td>`;
        }
        return row + `</tr>`;
      })
      .join("") || `<tr><td colspan="20">Sin datos</td></tr>`;

  const ch = ensureChart();
  if (ch) {
    const values = currentWeeks.map((w) => {
      const recs = data.filter((r) => {
        const d = parseFecha(r.fecha).getDate();
        return d >= w.startDay && d <= w.endDay;
      });
      if (!recs.length) return 0;
      const avg = recs.reduce((t, r) => t + (Number(r.nota) || 0), 0) / recs.length;
      return Math.round(avg);
    });

    ch.data.labels = currentWeeks.map((_, i) => `S${i + 1}`);
    ch.data.datasets[0].data = values;
    ch.update();
  }
}

/* ------------------------------
   ITEMS RANKING (MODAL) + NUEVO POPUP DETALLE
------------------------------ */
function aggregateItems(records, totalAuditorias) {
  const mapa = {};
   
  records.forEach((reg) => {
    (reg.items || []).forEach((it) => {
      const key = (it?.name || "Sin nombre").toString();
      if (!mapa[key]) {
        mapa[key] = {
          name: key,
          tipo: it?.tipo || "—",
          count: 0,
          sumPerc: 0,
          details: [], // todo el historial
        };
      }

      mapa[key].count++;
      mapa[key].sumPerc += Number(it?.perc || 0);

      if (it?.detail) {
        mapa[key].details.push({
          detail: String(it.detail),
          asesor: reg.asesor || "—",
          gc: reg.gc || "—",
          fecha: parseFecha(reg.fecha),
          tipo: reg.tipo || "—",
          nota: Number(reg.nota || 0),
        });
      }
    });
  });

  const list = Object.values(mapa)
    .map((o) => ({
      ...o,
      avgPerc: o.count ? Math.round((o.sumPerc / o.count) * 10) / 10 : 0,
// NUEVO CÁLCULO: Cantidad de incidencias / Total de auditorías (ej. 35 / 86)
      sharePorcentaje: totalAuditorias > 0 
        ? ((o.count / totalAuditorias) * 100).toFixed(1) 
        : 0
    }))
    .sort((a, b) => b.count - a.count);

  // cache para abrir detalle rápido
  lastItemsAgg = list;
  lastItemsAggMap = new Map(list.map((x) => [x.name, x]));

  return list;
}

function fillItemsPeriodSelect() {
  const sel = document.getElementById("itemsPeriodSelect");
  if (!sel) return;

  sel.innerHTML =
    `<option value="mes">Mes completo</option>` +
    currentWeeks
      .map((w, i) => `<option value="week-${i}">Semana S${i + 1} (${w.startDay}-${w.endDay})</option>`)
      .join("");
}

function renderItemsModalTable() {
  const selVal = document.getElementById("itemsPeriodSelect")?.value || "mes";

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
// 1. Guardamos el total de registros (auditorías) para el cálculo
  const totalRegistrosActuales = data.length; 

// 2. Pasamos ese total a la función de agrupamiento
  const agg = aggregateItems(data, totalRegistrosActuales);
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;

  tbody.innerHTML = agg.length
    ? agg
      .map((it) => `
        <tr class="item-row" data-item="${escapeHTML(it.name)}">
          <td><b>${escapeHTML(it.name)}</b></td>
          <td>${escapeHTML(it.tipo)}</td>
          <td>${it.count}</td>
          <td>${it.avgPerc}%</td>
          <td>${it.sharePorcentaje}%</td>
          <td class="small link">Ver detalles</td>
        </tr>
      `)
      .join("")
    : `<tr><td colspan="6">Sin ítems debitados.</td></tr>`;

  // Click en fila -> abrir POPUP de detalle
  tbody.querySelectorAll(".item-row").forEach((row) => {
    row.addEventListener("click", () => {
      const name = row.dataset.item || "";
      const item = lastItemsAggMap.get(name);
      if (item) openDetailModal(item);
    });
  });
}

/* -------- POPUP DETALLE (NUEVO) -------- */
function openDetailModal(item) {
  const modal = document.getElementById("detailModal");
  const title = document.getElementById("detailModalTitle");
  const body = document.getElementById("detailModalBody");
  const sub = document.getElementById("detailModalSubtitle");

  if (!modal || !title || !body) return;

  title.textContent = `Detalle del ítem — ${item.name}`;
  if (sub) sub.textContent = `${item.count} ocurrencias · Promedio débito: ${item.avgPerc}%`;

  const detalles = (item.details || []).slice().sort((a, b) => b.fecha - a.fecha);

  body.innerHTML = detalles.length
    ? detalles.map((d) => `
      <div class="detail-card">
        <div class="detail-meta">
          <b>${escapeHTML(d.asesor)}</b> · GC ${escapeHTML(d.gc)} ·
          ${escapeHTML(d.fecha.toLocaleString("es-PE"))} ·
          Nota ${d.nota}% · Tipo ${escapeHTML(d.tipo)}
        </div>
        <div class="detail-text">${escapeHTML(d.detail)}</div>
      </div>
    `).join("")
    : `<div class="small">No hay detalles registrados para este ítem.</div>`;

  modal.style.display = "flex";
}

function closeDetailModal() {
  const modal = document.getElementById("detailModal");
  if (modal) modal.style.display = "none";
}

/* -------- modal ranking -------- */
function openItemsModal(asesor = null) {
  itemsModalAsesor = asesor;

  const title = document.getElementById("itemsModalTitle");
  const subtitle = document.getElementById("itemsModalSubtitle");
  if (title) title.textContent = asesor ? `Ítems debitados – ${asesor}` : "Ranking general de ítems debitados";
  if (subtitle) subtitle.textContent = asesor ? "Ranking de ítems para este asesor." : "Basado en todos los registros filtrados.";

  fillItemsPeriodSelect();
  renderItemsModalTable();

  const modal = document.getElementById("itemsModal");
  if (modal) modal.style.display = "flex";
}

function closeItemsModal() {
  const modal = document.getElementById("itemsModal");
  if (modal) modal.style.display = "none";
}

/* ------------------------------
   RENDER GENERAL
------------------------------ */
function renderFromFilteredData() {
  const data = filteredData;

  // resumen
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const selSemana = document.getElementById("filterSemana");
  const summary = document.getElementById("filterSummary");

  let resumen = `Mostrando ${data.length} registros`;
  if (selMes?.value !== "") resumen += ` · Mes ${selMes.options[selMes.selectedIndex].text}`;
  if (selAnio?.value !== "") resumen += ` · Año ${selAnio.value}`;
  if (selSemana?.value !== "") {
    const w = currentWeeks[Number(selSemana.value)];
    if (w) resumen += ` · Semana ${Number(selSemana.value) + 1} (${w.startDay}-${w.endDay})`;
  }
  if (selReg?.value) resumen += ` · Registrado por ${selReg.value}`;
  if (summary) summary.textContent = resumen;

  renderExecView(data);
  renderCounters(data);
  renderRecent(data);
  renderWeeklyAndChart(data);
}

/* ------------------------------
   THEME
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
   EVENTS
------------------------------ */
function wireEvents() {
  // filtros
  ["filterRegistrado", "filterMes", "filterAnio", "filterSemana"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", () => {
      if (id === "filterMes" || id === "filterAnio") setupWeekFilterOptions();
      applyFilters();
    });
  });

  // modal ranking items
  document.getElementById("btnOpenItemsModal")?.addEventListener("click", () => openItemsModal());
  document.getElementById("btnCloseItemsModal")?.addEventListener("click", closeItemsModal);
  document.getElementById("itemsModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "itemsModal") closeItemsModal();
  });
  document.getElementById("itemsPeriodSelect")?.addEventListener("change", renderItemsModalTable);

  // modal detalle (popup nuevo)
  document.getElementById("btnCloseDetail")?.addEventListener("click", closeDetailModal);
  document.getElementById("detailModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "detailModal") closeDetailModal();
  });

  // theme
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);
  document.getElementById("btnTheme")?.addEventListener("click", () => {
    const next = document.body.classList.contains("light") ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // accesos rápidos (no rompe modales porque usa dataset)
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
      return;
    }
  });

  // logout
  document.getElementById("btnLogout")?.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
    location.href = "login.html";
  });
}

/* ------------------------------
   INIT
------------------------------ */
async function refreshDashboard() {
  const data = await getMergedData();

  rawData = data.sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));
  allYears = [...new Set(rawData.map((r) => parseFecha(r.fecha).getFullYear()))];

  setupYearFilter();

  const selMes = document.getElementById("filterMes");
  if (selMes && selMes.value === "") selMes.value = new Date().getMonth().toString();

  setupWeekFilterOptions();
  applyFilters();
}

/* ------------------------------
   START
------------------------------ */
wireEvents();
refreshDashboard().catch((err) => console.error("Error cargando dashboard:", err));
