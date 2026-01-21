/* Clinicon Stellenplan - Frontend (D1 via /api/*)
   Erwartete Elemente:
   - select#deptSelect, select#dienstartSelect, input#yearInput
   - button#btnSaveDb, button#btnAddRow, button#btnAddExtra
   - table#planTable, table#extrasTable
   - div/span#saveStatus, #sumYear, #avgMonth, #peakMonth
*/

(() => {
  const $ = (sel) => document.querySelector(sel);
  const API_BASE = (document.body?.dataset?.apiBase || "").trim();
  const apiUrl = (path) => (API_BASE ? `${API_BASE.replace(/\/$/, "")}${path}` : path);
  const fmt = (n) => (Number(n || 0)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clamp2 = (v) => {
    const normalized = Math.max(0, Math.min(1, Number(v || 0)));
    return Math.round((normalized + Number.EPSILON) * 100) / 100;
  };

  const API = {
    async getOrgUnits() {
      const r = await fetch(apiUrl("/api/org-units"), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Organisationseinheiten laden fehlgeschlagen");
      return r.json();
    },
    async getQualifikationen() {
      const r = await fetch(apiUrl("/api/qualifikationen"), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Qualifikationen laden fehlgeschlagen");
      return r.json();
    },
    async loadPlan(orgCode, year, dienstart) {
      const params = new URLSearchParams({
        org: String(orgCode || ""),
        year: String(year || ""),
        dienstart: String(dienstart || ""),
      });
      const r = await fetch(apiUrl(`/api/stellenplan?${params.toString()}`), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Stellenplan laden fehlgeschlagen");
      return r.json();
    },
    async savePlan(payload) {
      const r = await fetch(apiUrl("/api/stellenplan/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  };

  const els = {
    deptSelect: $("#deptSelect"),
    dienstartSelect: $("#dienstartSelect"),
    yearInput: $("#yearInput"),
    planTable: $("#planTable"),
    extrasTable: $("#extrasTable"),
    btnSaveDb: $("#btnSaveDb"),
    btnAddRow: $("#btnAddRow"),
    btnAddExtra: $("#btnAddExtra"),
    saveStatus: $("#saveStatus"),
    sumYear: $("#sumYear"),
    avgMonth: $("#avgMonth"),
    peakMonth: $("#peakMonth"),
  };

  const STORAGE_KEY = "clinicon_stellenplan_v1";
  const FALLBACK_ORG_UNITS = [
    { code: "STA1", name: "Station 1" },
    { code: "STA2", name: "Station 2" },
    { code: "STA3", name: "Station 3" },
    { code: "STA4", name: "Station 4" },
    { code: "STA5", name: "Station 5" },
    { code: "OPS", name: "OP / Endoskopie" },
    { code: "PDL", name: "Pflegedienstleitung" },
  ];
  const FALLBACK_QUAL_OPTIONS = [
    "Pflegefachkraft",
    "Pflegefachassistenz",
    "Notfallpflege",
    "Intensivpflege",
    "Hygiene",
    "Praxisanleitung",
    "OP",
    "Endoskopie",
    "Onkologie",
    "Palliativ",
    "Wundmanagement",
    "Dialyse",
  ];
  const state = {
    orgUnits: [],
    qualOptions: [],
    dept: "",
    dienstart: "01",
    deptDienstart: {},  // Maps dept code to default Dienstart
    year: new Date().getFullYear(),
    data: {},
  };
  let lastFocus = null;

  function setStatus(msg, isError = false) {
    if (!els.saveStatus) return;
    els.saveStatus.textContent = msg || "";
    els.saveStatus.style.opacity = msg ? "1" : "0";
    els.saveStatus.style.color = isError ? "#b91c1c" : "";
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state.data = parsed.data || {};
        state.dept = parsed.dept || state.dept;
        state.dienstart = parsed.dienstart || state.dienstart;
        state.deptDienstart = parsed.deptDienstart || {};
        state.year = parsed.year || state.year;
      }
    } catch (_) { }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        dept: state.dept,
        dienstart: state.dienstart,
        deptDienstart: state.deptDienstart,
        year: state.year,
        data: state.data,
      }));
    } catch (_) { }
  }

  function key() {
    return `${state.dept}-${state.dienstart}-${state.year}`;
  }

  function ensurePlan() {
    const k = key();
    if (!state.data[k]) {
      state.data[k] = { employees: [], extras: [] };
    }
    for (const r of state.data[k].employees) {
      if (!Array.isArray(r.values) || r.values.length !== 12) r.values = Array(12).fill(0);
      if (typeof r.include !== "boolean") r.include = true;
      if (typeof r.hiddenRow !== "boolean") r.hiddenRow = false;
      r.qual = r.qual || "";
      r.personalNumber = (r.personalNumber ?? "").toString();
      r.name = (r.name ?? "").toString();
      ensureNameParts(r);
      r.values = r.values.map(v => clamp2(v));
    }
    for (const x of state.data[k].extras) {
      if (!Array.isArray(x.values) || x.values.length !== 12) x.values = Array(12).fill(0);
      if (typeof x.include !== "boolean") x.include = true;
      if (typeof x.hiddenRow !== "boolean") x.hiddenRow = false;
      x.qual = x.qual || "";
      x.personalNumber = (x.personalNumber ?? "").toString();
      x.category = (x.category ?? "Zusatz").toString();
      x.values = x.values.map(v => clamp2(v));
    }
    return state.data[k];
  }

  function ensureNameParts(row) {
    const raw = (row.name || "").trim();
    const parts = raw ? raw.split(/\s+/) : [];
    row.firstName = (row.firstName ?? parts.shift() ?? "").trim();
    row.lastName = (row.lastName ?? parts.join(" ") ?? "").trim();
    row.name = `${row.firstName} ${row.lastName}`.trim();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  function syncName(row) {
    row.name = `${row.firstName || ""} ${row.lastName || ""}`.trim();
  }

  function qualSelectHTML(value, idx, kind) {
    const vals = (String(value || "").split(",").map(v => v.trim()).filter(Boolean));
    const opts = state.qualOptions.map(q => {
      const escaped = escapeHtml(q);
      const selected = vals.includes(q) ? " selected" : "";
      return `<option value="${escaped}"${selected}>${escaped}</option>`;
    });
    return `<select multiple size="3" class="sp-qual qual-select" data-kind="${kind}" data-idx="${idx}">${opts.join("")}</select>`;
  }

  function renderPlanTable() {
    const plan = ensurePlan();
    const table = els.planTable;
    if (!table) return;
    const tbody = table.querySelector("tbody") || table.appendChild(document.createElement("tbody"));
    tbody.innerHTML = "";

    plan.employees.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.kind = "emp";
      tr.dataset.idx = String(idx);
      if (r.hiddenRow) {
        tr.style.opacity = "0.5";
        tr.style.pointerEvents = "auto";
        tr.classList.add("row-hidden");
      }
      const tds = [];
      const hiddenLabel = r.hiddenRow ? '<span class="hidden-label">ausgeblendet</span>' : '';
      tds.push(`
        <td class="pnr-col">
          ${hiddenLabel}
          <input class="pnr-input sp-pnr" data-kind="emp" data-idx="${idx}" value="${escapeHtml(r.personalNumber)}" placeholder="Personalnr.">
        </td>
      `);
      tds.push(`
        <td class="name-col">
          <div class="name-pair">
            <input class="name-input sp-name-first" data-kind="emp" data-idx="${idx}" value="${escapeHtml(r.firstName)}" placeholder="Vorname">
            <input class="name-input sp-name-last" data-kind="emp" data-idx="${idx}" value="${escapeHtml(r.lastName)}" placeholder="Nachname">
          </div>
        </td>
      `);
      for (let m = 0; m < 12; m++) {
        tds.push(`
          <td class="month-col">
            <input type="number" step="0.01" min="0" max="1"
              class="vk-input sp-vk"
              data-kind="emp" data-idx="${idx}" data-month="${m}"
              value="${String(clamp2(r.values[m] || 0))}">
          </td>
        `);
      }
      const rowAvg = (r.values || []).reduce((a, b) => a + Number(b || 0), 0) / 12;
      tds.push(`<td data-row-sum>${fmt(rowAvg)}</td>`);
      tds.push(`<td class="qual-col">${qualSelectHTML(r.qual, idx, "emp")}</td>`);
      tds.push(`
        <td class="actions-cell">
          <div class="action-buttons">
            <button class="icon-btn icon-btn-lg" data-action="copy" data-kind="emp" data-idx="${idx}" type="button" title="Werte bis Jahresende fortführen">&#10230;</button>
            <button class="icon-btn icon-btn-lg" data-action="extend" data-kind="emp" data-idx="${idx}" type="button" title="Werte für 3 Jahre fortführen">&#8649;</button>
            <button class="icon-btn icon-btn-lg" data-action="hide" data-kind="emp" data-idx="${idx}" title="${r.hiddenRow ? 'Zeile einblenden' : 'Zeile ausblenden'}">${r.hiddenRow ? '&#128064;' : '&#128065;'}</button>
            <button class="icon-btn icon-btn-lg" data-action="delete" data-kind="emp" data-idx="${idx}" title="Zeile löschen">&#128465;</button>
          </div>
        </td>
      `);
      tr.innerHTML = tds.join("");
      tbody.appendChild(tr);
      const sel = tr.querySelector("select.sp-qual");
      if (sel) sel.value = r.qual || "";
    });
  }

  function renderExtrasTable() {
    const plan = ensurePlan();
    const table = els.extrasTable;
    if (!table) return;
    const tbody = table.querySelector("tbody") || table.appendChild(document.createElement("tbody"));
    tbody.innerHTML = "";

    plan.extras.forEach((x, idx) => {
      // Ensure extras have firstName/lastName like main employees
      if (!x.firstName && !x.lastName && x.category) {
        x.firstName = x.category;
        x.lastName = "";
      }
      if (!x.firstName) x.firstName = "";
      if (!x.lastName) x.lastName = "";

      const tr = document.createElement("tr");
      tr.dataset.kind = "extra";
      tr.dataset.idx = String(idx);
      if (x.hiddenRow) {
        tr.style.opacity = "0.5";
        tr.style.pointerEvents = "auto";
        tr.classList.add("row-hidden");
      }
      const tds = [];
      const hiddenLabel = x.hiddenRow ? '<span class="hidden-label">ausgeblendet</span>' : '';
      tds.push(`
        <td class="pnr-col">
          ${hiddenLabel}
          <input class="pnr-input sp-pnr" data-kind="extra" data-idx="${idx}" value="${escapeHtml(x.personalNumber)}" placeholder="Personalnr.">
        </td>
      `);
      tds.push(`
        <td class="name-col">
          <div class="name-pair">
            <input class="name-input sp-name-first" data-kind="extra" data-idx="${idx}" value="${escapeHtml(x.firstName)}" placeholder="Vorname">
            <input class="name-input sp-name-last" data-kind="extra" data-idx="${idx}" value="${escapeHtml(x.lastName)}" placeholder="Nachname">
          </div>
        </td>
      `);
      for (let m = 0; m < 12; m++) {
        tds.push(`
          <td class="month-col">
            <input type="number" step="0.01" min="0" max="2"
              class="vk-input sp-vk"
              data-kind="extra" data-idx="${idx}" data-month="${m}"
              value="${String(clamp2(x.values[m] || 0))}">
          </td>
        `);
      }
      const rowAvg = (x.values || []).reduce((a, b) => a + Number(b || 0), 0) / 12;
      tds.push(`<td data-row-sum>${fmt(rowAvg)}</td>`);
      tds.push(`<td class="qual-col">${qualSelectHTML(x.qual, idx, "extra")}</td>`);
      tds.push(`
        <td class="actions-cell">
          <div class="action-buttons">
            <button class="icon-btn icon-btn-lg" data-action="copy" data-kind="extra" data-idx="${idx}" type="button" title="Werte bis Jahresende fortführen">&#10230;</button>
            <button class="icon-btn icon-btn-lg" data-action="extend" data-kind="extra" data-idx="${idx}" type="button" title="Werte für 3 Jahre fortführen">&#8649;</button>
            <button class="icon-btn icon-btn-lg" data-action="hide" data-kind="extra" data-idx="${idx}" title="${x.hiddenRow ? 'Zeile einblenden' : 'Zeile ausblenden'}">${x.hiddenRow ? '&#128064;' : '&#128065;'}</button>
            <button class="icon-btn icon-btn-lg" data-action="delete" data-kind="extra" data-idx="${idx}" title="Zeile löschen">&#128465;</button>
          </div>
        </td>
      `);
      tr.innerHTML = tds.join("");
      tbody.appendChild(tr);
      const sel = tr.querySelector("select.sp-qual");
      if (sel) sel.value = x.qual || "";
    });
  }

  function recalcTotals() {
    const plan = ensurePlan();
    const monthSum = Array(12).fill(0);
    const addRow = (row) => {
      if (!row.include || row.hiddenRow) return;
      for (let m = 0; m < 12; m++) monthSum[m] += Number(row.values[m] || 0);
    };
    plan.employees.forEach(addRow);
    plan.extras.forEach(addRow);
    const table = els.planTable;
    if (table) {
      for (let m = 0; m < 12; m++) {
        const cell = table.querySelector(`[data-sum-month="${m}"]`);
        if (cell) cell.textContent = fmt(monthSum[m]);
      }
      const totalYearCell = table.querySelector("[data-total-year]");
      if (totalYearCell) totalYearCell.textContent = fmt(monthSum.reduce((a, b) => a + b, 0) / 12);
    }
    const sumYear = monthSum.reduce((a, b) => a + b, 0);
    const avg = sumYear / 12;
    const peak = Math.max(...monthSum);
    if (els.sumYear) els.sumYear.textContent = fmt(sumYear);
    if (els.avgMonth) els.avgMonth.textContent = fmt(avg);
    if (els.peakMonth) els.peakMonth.textContent = fmt(peak);
  }

  function renderAll() {
    renderPlanTable();
    renderExtrasTable();
    recalcTotals();
  }

  async function loadLookups() {
    try {
      const units = await API.getOrgUnits();
      state.orgUnits = Array.isArray(units) && units.length ? units : FALLBACK_ORG_UNITS;
      const quals = await API.getQualifikationen();
      state.qualOptions = (Array.isArray(quals) ? quals.map(q => q.bezeichnung) : []).filter(Boolean);
      if (!state.qualOptions.length) state.qualOptions = FALLBACK_QUAL_OPTIONS;
    } catch (error) {
      console.warn("Lookups fehlgeschlagen, verwende Fallback", error);
      state.orgUnits = FALLBACK_ORG_UNITS;
      state.qualOptions = FALLBACK_QUAL_OPTIONS;
    }
  }

  function populateOrgSelect() {
    if (!els.deptSelect) return;
    els.deptSelect.innerHTML = state.orgUnits.map(u => `<option value="${escapeHtml(u.code)}">${escapeHtml(u.name)}</option>`).join("");
    if (!state.dept && state.orgUnits[0]) state.dept = state.orgUnits[0].code;
    els.deptSelect.value = state.dept;
  }

  function populateDienstartSelect() {
    if (!els.dienstartSelect) return;
    const options = ["01", "02", "03", "04", "05", "06", "07"];
    els.dienstartSelect.innerHTML = options
      .map(v => `<option value="${v}">Dienstart ${v}</option>`)
      .join("");
    els.dienstartSelect.value = state.dienstart || "01";
  }

  function populateYear() {
    if (!els.yearInput) return;
    els.yearInput.value = String(state.year);
  }

  async function loadFromDb() {
    ensurePlan();
    setStatus("Lade ...");
    try {
      const remote = await API.loadPlan(state.dept, state.year, state.dienstart);
      const k = key();
      state.data[k] = {
        employees: Array.isArray(remote.employees) ? remote.employees : [],
        extras: Array.isArray(remote.extras) ? remote.extras : [],
      };
      ensurePlan();
      saveStorage();
      renderAll();
      setStatus("Geladen");
    } catch (e) {
      console.warn(e);
      renderAll();
      setStatus("DB-Laden fehlgeschlagen - lokale Daten genutzt", true);
    }
  }

  async function saveToDb() {
    const plan = ensurePlan();
    setStatus("Speichere ...");
    try {
      const payload = {
        orgCode: state.dept,
        dienstart: state.dienstart,
        year: Number(state.year),
        employees: plan.employees.map(r => ({
          personalNumber: String(r.personalNumber || "").trim(),
          name: String(r.name || "").trim(),
          qual: String(r.qual || ""),
          include: !!r.include,
          hiddenRow: !!r.hiddenRow,
          values: (r.values || []).map(v => clamp2(v)),
        })),
        extras: plan.extras.map(x => ({
          personalNumber: String(x.personalNumber || "").trim(),
          category: String(x.category || "Zusatz").trim(),
          qual: String(x.qual || ""),
          include: !!x.include,
          hiddenRow: !!x.hiddenRow,
          values: (x.values || []).map(v => clamp2(v)),
        })),
      };
      await API.savePlan(payload);
      saveStorage();
      const ts = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      setStatus(`Gespeichert (${ts})`);
    } catch (e) {
      console.error(e);
      setStatus(`Speichern fehlgeschlagen: ${e?.message || e}`, true);
    }
  }

  function setLastFocus(kind, idx, month) {
    lastFocus = { kind, idx, month };
  }

  function wireEvents() {
    if (els.deptSelect) {
      els.deptSelect.addEventListener("change", async () => {
        state.dept = els.deptSelect.value;
        // Load saved Dienstart for this department
        const savedDienstart = state.deptDienstart[state.dept];
        if (savedDienstart && els.dienstartSelect) {
          state.dienstart = savedDienstart;
          els.dienstartSelect.value = savedDienstart;
        }
        saveStorage();
        await loadFromDb();
      });
    }
    if (els.dienstartSelect) {
      els.dienstartSelect.addEventListener("change", async () => {
        state.dienstart = els.dienstartSelect.value;
        // Save Dienstart for current department
        if (state.dept) {
          state.deptDienstart[state.dept] = state.dienstart;
        }
        saveStorage();
        await loadFromDb();
      });
    }
    if (els.yearInput) {
      els.yearInput.addEventListener("change", async () => {
        const y = Number(els.yearInput.value || state.year);
        state.year = Number.isFinite(y) && y > 1990 ? y : state.year;
        els.yearInput.value = String(state.year);
        saveStorage();
        await loadFromDb();
      });
    }
    if (els.btnSaveDb) els.btnSaveDb.addEventListener("click", saveToDb);
    if (els.btnAddRow) {
      els.btnAddRow.addEventListener("click", () => {
        const plan = ensurePlan();
        plan.employees.push({
          personalNumber: "",
          name: "Neu",
          qual: "",
          include: true,
          hiddenRow: false,
          values: Array(12).fill(0),
        });
        saveStorage();
        renderAll();
      });
    }
    if (els.btnAddExtra) {
      els.btnAddExtra.addEventListener("click", () => {
        const plan = ensurePlan();
        plan.extras.push({
          personalNumber: "",
          category: "Zusatz",
          qual: "",
          include: true,
          hiddenRow: false,
          values: Array(12).fill(0),
        });
        saveStorage();
        renderAll();
      });
    }
    const onTableInput = (ev) => {
      const t = ev.target;
      if (!t) return;
      const kind = t.dataset.kind;
      const idx = Number(t.dataset.idx);
      if (!Number.isFinite(idx)) return;
      const plan = ensurePlan();
      const row = kind === "extra" ? plan.extras[idx] : plan.employees[idx];
      if (!row) return;
      if (t.classList.contains("sp-pnr")) {
        row.personalNumber = String(t.value || "");
      } else if (t.classList.contains("sp-name-first")) {
        row.firstName = String(t.value || "");
        syncName(row);
      } else if (t.classList.contains("sp-name-last")) {
        row.lastName = String(t.value || "");
        syncName(row);
      } else if (t.classList.contains("sp-category")) {
        row.category = String(t.value || "");
      } else if (t.classList.contains("sp-vk")) {
        const m = Number(t.dataset.month);
        const v = clamp2(t.value);
        if (m >= 0 && m < 12) row.values[m] = v;
        setLastFocus(kind, idx, m);
      } else if (t.classList.contains("sp-qual")) {
        const opts = Array.from(t.selectedOptions || []);
        const values = opts.map(o => String(o.value || "").trim()).filter(Boolean);
        row.qual = values.join(", ");
      }
      saveStorage();
      recalcTotals();
      setStatus("Ungespeichert");
    };
    const onTableClick = (ev) => {
      const t = ev.target;
      if (!t || !(t instanceof HTMLElement)) return;
      const kind = t.dataset.kind;
      const idx = Number(t.dataset.idx);
      if (!Number.isFinite(idx)) return;
      const plan = ensurePlan();
      const list = kind === 'extra' ? plan.extras : plan.employees;
      const action = t.dataset.action;
      if (action) {
        const row = list[idx];
        if (!row) return;
        if (action === 'copy') {
          const startMonth = lastFocus && lastFocus.kind === kind && lastFocus.idx === idx && Number.isFinite(lastFocus.month)
            ? lastFocus.month
            : 0;
          const sourceVal = row.values[startMonth] || 0;
          for (let m = startMonth; m < 12; m++) {
            row.values[m] = sourceVal;
          }
          saveStorage();
          renderAll();
          setStatus('Zeile fortgefuehrt');
          return;
        }
        if (action === 'extend') {
          // Extend values for 3 years (current + next 2 years)
          const currentYear = state.year;
          const lastMonthVal = row.values[11] || row.values.find(v => v > 0) || 0;
          // Fill remaining months of current year
          for (let m = 0; m < 12; m++) {
            if (row.values[m] === 0 || row.values[m] === undefined) {
              row.values[m] = lastMonthVal;
            }
          }
          // Store extended data for next 2 years in state.data
          for (let y = 1; y <= 2; y++) {
            const futureYear = currentYear + y;
            const futureKey = `${state.dept}|${state.dienstart}|${futureYear}`;
            if (!state.data[futureKey]) {
              state.data[futureKey] = { employees: [], extras: [] };
            }
            const futureList = kind === 'extra' ? state.data[futureKey].extras : state.data[futureKey].employees;
            const existing = futureList.find(r => r.personalNumber === row.personalNumber);
            if (existing) {
              existing.values = Array(12).fill(lastMonthVal);
            } else {
              futureList.push({
                ...row,
                values: Array(12).fill(lastMonthVal),
              });
            }
          }
          saveStorage();
          renderAll();
          setStatus(`Werte für ${currentYear}-${currentYear + 2} fortgeführt`);
          return;
        }
        if (action === 'hide') {
          row.hiddenRow = !row.hiddenRow;
          row.include = !row.hiddenRow;
          saveStorage();
          renderAll();
          setStatus('Zeile ein-/ausgeblendet');
          return;
        }
        if (action === 'delete') {
          list.splice(idx, 1);
          saveStorage();
          renderAll();
          setStatus('Zeile geloescht');
          return;
        }
      }
    };
    if (els.planTable) {
      els.planTable.addEventListener("input", onTableInput);
      els.planTable.addEventListener("change", onTableInput);
      els.planTable.addEventListener("click", onTableClick);
    }
    if (els.extrasTable) {
      els.extrasTable.addEventListener("input", onTableInput);
      els.extrasTable.addEventListener("change", onTableInput);
      els.extrasTable.addEventListener("click", onTableClick);
    }
  }

  async function boot() {
    loadStorage();
    if (els.yearInput && els.yearInput.value) {
      const y = Number(els.yearInput.value);
      if (Number.isFinite(y) && y > 1990) state.year = y;
    }
    try {
      await loadLookups();
      populateOrgSelect();
      populateDienstartSelect();
      populateYear();
      state.dept = els.deptSelect?.value || state.dept;
      state.dienstart = els.dienstartSelect?.value || state.dienstart;
      wireEvents();
      await loadFromDb();
    } catch (e) {
      console.error(e);
      wireEvents();
      ensurePlan();
      renderAll();
      setStatus("Initialisierung fehlgeschlagen (Lookups/API).", true);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
