/* index.js - Dashboard Supervisión (INBOUND) + FILTRO SEMANAL GLOBAL + Ranking ítems con detalle completo
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

import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

/* ------------------------------
   CONFIG: Este dashboard SOLO INBOUND
   (Luego clonamos para REDES y CORREOS)
------------------------------ */
const DASHBOARD_CARGO = "ASESOR INBOUND"; // <-- este dashboard

/* ------------------------------
   AUTH: PROTEGER EL DASHBOARD
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
  if (fecha.toDate) return fecha.toDate(); // Timestamp Firestore
  if (fecha instanceof Date) return fecha;

  if (typeof fecha === "string") {
    // ISO
    if (fecha.includes("T")) return new Date(fecha);

    // "dd/mm/yyyy hh:mm"
    if (fecha.includes("/")) {
      const [d, m, yRest] = fecha.split("/");
      const [y, hhmm = "00:00"] = (yRest || "").split(" ");
      // hhmm puede venir "11:22" o "11:22:33"
      return new Date(`${y}-${m}-${d}T${hhmm}`);
    }
    return new Date(fecha);
  }
  return new Date(fecha);
}

function getWeeksOfMonth(year, monthIndex) {
  // monthIndex: 0-11
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

async function loadAsesores() {
  const snap = await getDocs(collection(db, "asesores"));
  const mapa = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d?.nombre) mapa[d.nombre.trim()] = d.GC || "SIN GC";
  });
  return mapa;
}

async function getMergedData() {
  const [registros, asesores] = await Promise.all([loadRegistros(), loadAsesores()]);
  return registros.map((r) => ({
    ...r,
    gc: asesores[r.asesor?.trim()] || r.gc || "SIN GC",
    registradoPor: r.registradoPor || r.registrado_por || "",
    cargo: (r.cargo || "").toString(), // para separar INBOUND/REDES/CORREOS
  }));
}

/* ------------------------------
   ESTADO GLOBAL
------------------------------ */
let rawData = [];
let filteredData = [];
let allYears = [];
let currentWeeks = [];
let itemsModalAsesor = null;   // si está seteado, ranking por asesor
let chart = null;

/* ------------------------------
   CHART (crear cuando el DOM está listo)
------------------------------ */
function ensureChart() {
  if (chart) return chart;
  const canvas = document.getElementById("chartMonth");
  if (!canvas || typeof Chart === "undefined") return null;

  chart = new Chart(canvas, {
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
  return chart;
}

/* ------------------------------
   FILTRO AÑOS
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
   FILTRO SEMANAL GLOBAL (dependiente de año/mes)
------------------------------ */
function setupWeekFilterOptions() {
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const selSemana = document.getElementById("filterSemana");
  if (!selSemana) return;

  // Si no hay mes seleccionado, no forzamos semanas (se queda "Todas")
  const mesVal = selMes?.value ?? "";
  const anioVal = selAnio?.value ?? "";

  // Base: mes actual si no se eligió
  const now = new Date();
  const year = anioVal !== "" ? Number(anioVal) : now.getFullYear();
  const month = mesVal !== "" ? Number(mesVal) : now.getMonth();

  currentWeeks = getWeeksOfMonth(year, month);

  const prev = selSemana.value; // conservar si se puede
  selSemana.innerHTML = `<option value="">Todas</option>` +
    currentWeeks
      .map(
        (w, i) => `<option value="${i}">Semana ${i + 1} (${w.startDay}-${w.endDay})</option>`
      )
      .join("");

  // Restaurar si existe
  if (prev !== "" && currentWeeks[Number(prev)]) selSemana.value = prev;
}

/* ------------------------------
   APLICAR FILTROS (INBOUND + Año/Mes/Semana/Registrado)
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

  // ✅ SOLO CARGO DEL DASHBOARD (INBOUND)
  data = data.filter((r) => normalize(r.cargo).toUpperCase() === DASHBOARD_CARGO);

  if (anio !== "") {
    data = data.filter((r) => parseFecha(r.fecha).getFullYear() == anio);
  }
  if (mes !== "") {
    data = data.filter((r) => parseFecha(r.fecha).getMonth() == mes);
  }
  if (reg) {
    data = data.filter((r) => normalize(r.registradoPor) === reg);
  }

  // ✅ Semana (usa currentWeeks calculado por setupWeekFilterOptions)
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
   VISTA EJECUTIVA POR ASESOR (tarjetas clickeables)
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
   CONTADORES POR TIPO
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
   ÚLTIMOS REGISTROS
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
        .map(
          (r) => `
          <tr>
            <td>${escapeHTML(parseFecha(r.fecha).toLocaleString("es-PE"))}</td>
            <td>${escapeHTML(r.asesor)} — ${escapeHTML(r.gc)}</td>
            <td>${Number(r.nota || 0)}%</td>
            <td>${escapeHTML(r.tipo || "—")}</td>
            <td>${escapeHTML(r.registradoPor || "—")}</td>
          </tr>
        `
        )
        .join("")
    : `<tr><td colspan="5">Sin registros</td></tr>`;
}

/* ------------------------------
   TABLA SEMANAL + GRÁFICO
------------------------------ */
function renderWeeklyAndChart(data) {
  const head = document.getElementById("weeklyHead");
  const body = document.getElementById("weeklyBody");
  const ch = ensureChart();

  if (!head || !body) return;

  // Las semanas ya están en currentWeeks (dependen de año/mes seleccionados)
  head.innerHTML =
    `<tr><th>ASESOR</th>` +
    currentWeeks
      .map((_, i) => `<th>S${i + 1} C1</th><th>S${i + 1} C2</th>`)
      .join("") +
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
            .slice(0, 2); // C1 y C2

          row += `<td>${escapeHTML(recs[0]?.tipo || "-")}</td>`;
          row += `<td>${escapeHTML(recs[1]?.tipo || "-")}</td>`;
        }
        return row + `</tr>`;
      })
      .join("") || `<tr><td colspan="20">Sin datos</td></tr>`;

  // Gráfico promedio semanal (según data filtrada)
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
   RANKING ÍTEMS (Modal)
   - filtro por semana dentro del modal sigue funcionando
   - ahora al hacer CLICK en un ítem: muestra TODOS los detalles
------------------------------ */
function aggregateItems(records) {
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
          // guardamos TODOS los detalles con contexto
          details: [],
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

  return Object.values(mapa)
    .map((o) => ({
      ...o,
      avgPerc: o.count ? Math.round((o.sumPerc / o.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function ensureItemDetailPanel() {
  const modalBody = document.querySelector("#itemsModal .modal-body");
  if (!modalBody) return null;

  let panel = document.getElementById("itemDetailPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "itemDetailPanel";
    panel.style.marginTop = "12px";
    panel.innerHTML = `
      <div class="card" style="background:transparent;border:1px solid rgba(148,163,184,.25)">
        <h3 style="margin:0 0 6px;font-size:14px">Detalle del ítem</h3>
        <div class="small" id="itemDetailSubtitle">Haz clic en un ítem para ver todos los motivos.</div>
        <div id="itemDetailList" style="margin-top:10px"></div>
      </div>
    `;
    modalBody.appendChild(panel);
  }
  return panel;
}

function fillItemsPeriodSelect() {
  const sel = document.getElementById("itemsPeriodSelect");
  if (!sel) return;

  sel.innerHTML = `<option value="mes">Mes completo</option>` +
    currentWeeks
      .map((w, i) => `<option value="week-${i}">Semana S${i + 1} (${w.startDay}-${w.endDay})</option>`)
      .join("");
}

function renderItemsModalTable() {
  const selVal = document.getElementById("itemsPeriodSelect")?.value || "mes";
  let data = filteredData.slice();

  // Si abrimos modal desde tarjeta asesor, filtramos por asesor
  if (itemsModalAsesor) {
    data = data.filter((r) => r.asesor === itemsModalAsesor);
  }

  // Filtro semanal dentro del modal
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
  const tbody = document.getElementById("itemsTableBody");
  if (!tbody) return;

  tbody.innerHTML = agg.length
    ? agg
        .map(
          (it) => `
          <tr class="item-row" data-item="${escapeHTML(it.name)}">
            <td><b>${escapeHTML(it.name)}</b></td>
            <td>${escapeHTML(it.tipo)}</td>
            <td>${it.count}</td>
            <td>${it.avgPerc}%</td>
            <td class="small">Clic para ver todos los motivos</td>
          </tr>
        `
        )
        .join("")
    : `<tr><td colspan="5">Sin ítems debitados.</td></tr>`;

  // Panel de detalle
  ensureItemDetailPanel();
  const sub = document.getElementById("itemDetailSubtitle");
  const list = document.getElementById("itemDetailList");
  if (sub) sub.textContent = "Haz clic en un ítem para ver todos los motivos.";
  if (list) list.innerHTML = "";

  // Click por fila -> lista completa de detalles
  tbody.querySelectorAll(".item-row").forEach((row) => {
    row.addEventListener("click", () => {
      const itemName = row.dataset.item || "";
      const found = agg.find((x) => x.name === itemName);
      if (!found) return;

      const subtitle = document.getElementById("itemDetailSubtitle");
      const detailList = document.getElementById("itemDetailList");

      if (subtitle) {
        subtitle.textContent = `${found.name} · ${found.count} ocurrencias · Promedio débito: ${found.avgPerc}%`;
      }
      if (detailList) {
        const detalles = (found.details || [])
          .slice()
          .sort((a, b) => b.fecha - a.fecha);

        detailList.innerHTML = detalles.length
          ? `
            <div style="display:grid;gap:8px">
              ${detalles
                .map(
                  (d) => `
                  <div class="box" style="background:rgba(148,163,184,.10);border-color:rgba(148,163,184,.20)">
                    <div style="font-size:12px;margin-bottom:6px">
                      <b>${escapeHTML(d.asesor)}</b> · GC ${escapeHTML(d.gc)} ·
                      ${escapeHTML(d.fecha.toLocaleString("es-PE"))} ·
                      Nota ${d.nota}% · Tipo ${escapeHTML(d.tipo)}
                    </div>
                    <div>${escapeHTML(d.detail)}</div>
                  </div>
                `
                )
                .join("")}
            </div>
          `
          : `<div class="small">No hay detalles registrados para este ítem.</div>`;
      }
    });
  });
}

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

  // Resumen
  const selReg = document.getElementById("filterRegistrado");
  const selMes = document.getElementById("filterMes");
  const selAnio = document.getElementById("filterAnio");
  const selSemana = document.getElementById("filterSemana");
  const summary = document.getElementById("filterSummary");

  let resumen = `Mostrando ${data.length} registros`;
  if (selMes?.value !== "") resumen += ` del mes ${selMes.options[selMes.selectedIndex].text}`;
  if (selAnio?.value !== "") resumen += ` del año ${selAnio.value}`;
  if (selSemana?.value !== "") {
    const w = currentWeeks[Number(selSemana.value)];
    if (w) resumen += ` · Semana ${Number(selSemana.value) + 1} (${w.startDay}-${w.endDay})`;
  }
  if (selReg?.value) resumen += ` · registrados por ${selReg.value}`;

  if (summary) summary.textContent = resumen;

  // Vista ejecutiva
  renderExecView(data);

  // Contadores
  renderCounters(data);

  // Últimos registros
  renderRecent(data);

  // Tabla semanal + Gráfico
  renderWeeklyAndChart(data);
}

/* ------------------------------
   TEMA CLARO / OSCURO
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
   INIT
------------------------------ */
async function refreshDashboard() {
  const data = await getMergedData();

  // Orden base por fecha
  rawData = data.sort((a, b) => parseFecha(a.fecha) - parseFecha(b.fecha));

  // Años disponibles (ya filtrados por cargo? -> NO, se calcula global, ok)
  allYears = [...new Set(rawData.map((r) => parseFecha(r.fecha).getFullYear()))];
  setupYearFilter();

  // Default mes actual si no está seteado
  const selMes = document.getElementById("filterMes");
  if (selMes && selMes.value === "") {
    selMes.value = new Date().getMonth().toString();
  }

  // Semanas dependientes de Año/Mes
  setupWeekFilterOptions();

  // Render con filtros
  applyFilters();
}

function wireEvents() {
  // Filtros
  const ids = ["filterRegistrado", "filterMes", "filterAnio", "filterSemana"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", () => {
      // si cambian año/mes, recalculamos semanas
      if (id === "filterMes" || id === "filterAnio") {
        setupWeekFilterOptions();
      }
      applyFilters();
    });
  });

  // Modal ítems
  document.getElementById("btnOpenItemsModal")?.addEventListener("click", () => openItemsModal());
  document.getElementById("btnCloseItemsModal")?.addEventListener("click", closeItemsModal);
  document.getElementById("itemsModal")?.addEventListener("click", (e) => {
    if (e.target?.id === "itemsModal") closeItemsModal();
  });
  document.getElementById("itemsPeriodSelect")?.addEventListener("change", renderItemsModalTable);

  // Tema
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);

  document.getElementById("btnTheme")?.addEventListener("click", () => {
    const next = document.body.classList.contains("light") ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // Accesos rápidos
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

  // Logout
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
   START
------------------------------ */
wireEvents();

refreshDashboard().catch((err) => {
  console.error("Error cargando dashboard:", err);
});
