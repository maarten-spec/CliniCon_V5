function initStellenplan() {
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) =>
    Number.isFinite(Number(n || 0))
      ? Number(Number(n || 0)).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : "0,00";
  const clamp2 = (v) => Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100;
  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const createRowId = () =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const API = {
    async getOrgUnits() {
      const response = await fetch("/api/org-units", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Organisationseinheiten laden fehlgeschlagen");
      return response.json();
    },
    async getQualifikationen() {
      const response = await fetch("/api/qualifikationen", { credentials: "same-origin" });
      if (!response.ok) throw new Error("Qualifikationen laden fehlgeschlagen");
      return response.json();
    },
    async loadPlan(orgCode, year) {
      const response = await fetch(`/api/stellenplan?org=${encodeURIComponent(orgCode)}&year=${encodeURIComponent(year)}`, {
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Stellenplan laden fehlgeschlagen");
      return response.json();
    },
    async savePlan(payload) {
      const response = await fetch("/api/stellenplan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
  };

  const els = {
    deptSelect: $("#deptSelect"),
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
  const state = {
    orgUnits: [],
    qualOptions: [],
    dept: "",
    year: new Date().getFullYear(),
    data: {},
  };

  function setStatus(message, isError = false) {
    if (!els.saveStatus) return;
    if (!message) {
      els.saveStatus.textContent = "";
      els.saveStatus.style.display = "none";
      els.saveStatus.classList.remove("error");
      return;
    }
    els.saveStatus.textContent = message;
    els.saveStatus.style.display = "inline-flex";
    els.saveStatus.classList.toggle("error", Boolean(isError));
  }

  function loadStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      state.year = Number.isFinite(Number(parsed.year)) ? Number(parsed.year) : state.year;
      state.dept = parsed.dept || state.dept;
      state.data = typeof parsed.data === "object" && parsed.data !== null ? parsed.data : state.data;
    } catch (_error) {
      // ignore storage errors
    }
  }

  function saveStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ dept: state.dept, year: state.year, data: state.data }));
    } catch (_error) {
      // ignore storage errors
    }
  }

  function key() {
    return `${state.dept}-${state.year}`;
  }

  function normalizeRow(row, kind) {
    row = row || {};
    row.id = row.id || createRowId();
    row.personalNumber = String(row.personalNumber ?? "").trim();
    row.qual = String(row.qual ?? "");
    row.include = typeof row.include === "boolean" ? row.include : true;
    row.hiddenRow = typeof row.hiddenRow === "boolean" ? row.hiddenRow : false;
    const values = Array.isArray(row.values) ? row.values.map((v) => clamp2(v)) : Array(12).fill(0);
    row.values = values.length === 12 ? values : Array(12).fill(0);
    if (kind === "extra") {
      row.category = String(row.category ?? "Zusatz");
    } else {
      row.name = String(row.name ?? "");
    }
    return row;
  }

  function ensurePlan() {
    const planKey = key();
    if (!state.data[planKey]) {
      state.data[planKey] = { employees: [], extras: [] };
    }
    const plan = state.data[planKey];
    plan.employees = plan.employees.map((row) => normalizeRow(row, "emp"));
    plan.extras = plan.extras.map((row) => normalizeRow(row, "extra"));
    return plan;
  }

  function qualSelectHTML(value, idx, kind) {
    const options = ['<option value="">–</option>']
      .concat(
        state.qualOptions
          .filter((q) => Boolean(q))
          .map((q) => `<option value="${escapeHtml(q)}">${escapeHtml(q)}</option>`)
      )
      .join("");
    return `<select class="sp-qual" data-kind="${kind}" data-idx="${idx}">${options}</select>`;
  }

  function rowAverage(row) {
    const sum = (row.values || []).reduce((acc, value) => acc + Number(value || 0), 0);
    return sum / 12;
  }

  function updateRowAverageCell(rowTr, row) {
    if (!rowTr) return;
    const cell = rowTr.querySelector("[data-row-average]");
    if (cell) {
      cell.textContent = fmt(rowAverage(row));
    }
  }

  function renderPlanTable() {
    const plan = ensurePlan();
    const table = els.planTable;
    if (!table) return;
    const tbody = table.querySelector("tbody") || table.appendChild(document.createElement("tbody"));
    tbody.innerHTML = "";

    plan.employees.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.kind = "emp";
      tr.dataset.idx = String(idx);
      tr.classList.toggle("row-muted", row.hiddenRow);
      if (row.hiddenRow) {
        tr.setAttribute("aria-hidden", "true");
      } else {
        tr.removeAttribute("aria-hidden");
      }

      const monthCells = row.values
        .map(
          (value, monthIdx) => `
            <td class="month-col">
              <input type="number" step="0.01" min="0" max="2"
                class="vk-input sp-vk"
                data-kind="emp" data-idx="${idx}" data-month="${monthIdx}"
                value="${String(clamp2(value))}">
            </td>
          `
        )
        .join("");

      tr.innerHTML = `
        <td class="pnr-col">
          <input class="name-input sp-pnr" data-kind="emp" data-idx="${idx}" value="${escapeHtml(row.personalNumber)}" placeholder="Personalnr.">
        </td>
        <td class="name-col">
          <input class="name-input sp-name" data-kind="emp" data-idx="${idx}" value="${escapeHtml(row.name)}" placeholder="Name">
        </td>
        ${monthCells}
        <td data-row-average>${fmt(rowAverage(row))}</td>
        <td class="qual-col">
          ${qualSelectHTML(row.qual, idx, "emp")}
        </td>
        <td class="actions-col">
          <div class="action-buttons">
            <button class="icon-btn" type="button" data-kind="emp" data-idx="${idx}" data-action="toggle-hide" title="Zeile aus-/einblenden">
              ${row.hiddenRow ? "👁️" : "🙈"}
            </button>
            <button class="icon-btn" type="button" data-kind="emp" data-idx="${idx}" data-action="delete" title="Zeile löschen">
              🗑️
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
      const select = tr.querySelector("select.sp-qual");
      if (select) select.value = row.qual || "";
    });
  }

  function renderExtrasTable() {
    const plan = ensurePlan();
    const table = els.extrasTable;
    if (!table) return;
    const tbody = table.querySelector("tbody") || table.appendChild(document.createElement("tbody"));
    tbody.innerHTML = "";

    plan.extras.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.dataset.kind = "extra";
      tr.dataset.idx = String(idx);
      tr.classList.toggle("row-muted", row.hiddenRow);
      if (row.hiddenRow) {
        tr.setAttribute("aria-hidden", "true");
      } else {
        tr.removeAttribute("aria-hidden");
      }

      const monthCells = row.values
        .map(
          (value, monthIdx) => `
            <td class="month-col">
              <input type="number" step="0.01" min="0" max="2"
                class="vk-input sp-vk"
                data-kind="extra" data-idx="${idx}" data-month="${monthIdx}"
                value="${String(clamp2(value))}">
            </td>
          `
        )
        .join("");

      tr.innerHTML = `
        <td class="pnr-col">
          <input class="name-input sp-pnr" data-kind="extra" data-idx="${idx}" value="${escapeHtml(row.personalNumber)}" placeholder="Personalnr.">
        </td>
        <td class="name-col">
          <input class="name-input sp-category" data-kind="extra" data-idx="${idx}" value="${escapeHtml(row.category)}" placeholder="Kategorie">
        </td>
        ${monthCells}
        <td data-row-average>${fmt(rowAverage(row))}</td>
        <td class="qual-col">
          ${qualSelectHTML(row.qual, idx, "extra")}
        </td>
        <td class="actions-col">
          <div class="action-buttons">
            <button class="icon-btn" type="button" data-kind="extra" data-idx="${idx}" data-action="toggle-hide" title="Zeile aus-/einblenden">
              ${row.hiddenRow ? "👁️" : "🙈"}
            </button>
            <button class="icon-btn" type="button" data-kind="extra" data-idx="${idx}" data-action="delete" title="Zeile löschen">
              🗑️
            </button>
          </div>
        </td>
      `;

      tbody.appendChild(tr);
      const select = tr.querySelector("select.sp-qual");
      if (select) select.value = row.qual || "";
    });
  }

  function renderAll() {
    renderPlanTable();
    renderExtrasTable();
    recalcTotals();
  }

  function recalcTotals() {
    const plan = ensurePlan();
    const planMonths = Array(12).fill(0);
    const extraMonths = Array(12).fill(0);

    const accumulate = (row, target) => {
      if (!row.include || row.hiddenRow) return;
      row.values.forEach((value, idx) => {
        const amount = Number(value || 0);
        if (!Number.isFinite(amount)) return;
        target[idx] += amount;
      });
    };

    plan.employees.forEach((row) => accumulate(row, planMonths));
    plan.extras.forEach((row) => accumulate(row, extraMonths));

    const combinedMonths = planMonths.map((value, idx) => value + extraMonths[idx]);
    const planSum = planMonths.reduce((sum, value) => sum + value, 0);
    const extraSum = extraMonths.reduce((sum, value) => sum + value, 0);
    const combinedSum = combinedMonths.reduce((sum, value) => sum + value, 0);
    const average = combinedSum / 12;
    const peak = combinedMonths.length ? Math.max(...combinedMonths) : 0;

    if (els.planTable) {
      for (let i = 0; i < 12; i += 1) {
        const cell = els.planTable.querySelector(`[data-sum-month="${i}"]`);
        if (cell) cell.textContent = fmt(planMonths[i]);
      }
      const totalYear = els.planTable.querySelector("[data-total-year]");
      if (totalYear) totalYear.textContent = fmt(planSum);
    }

    if (els.extrasTable) {
      for (let i = 0; i < 12; i += 1) {
        const extraCell = els.extrasTable.querySelector(`[data-extra-month="${i}"]`);
        if (extraCell) extraCell.textContent = fmt(extraMonths[i]);
        const combinedCell = els.extrasTable.querySelector(`[data-combined-month="${i}"]`);
        if (combinedCell) combinedCell.textContent = fmt(combinedMonths[i]);
      }
      const totalExtra = els.extrasTable.querySelector("[data-total-extra]");
      if (totalExtra) totalExtra.textContent = fmt(extraSum);
      const totalCombined = els.extrasTable.querySelector("[data-total-combined]");
      if (totalCombined) totalCombined.textContent = fmt(combinedSum);
      const planTotal = els.extrasTable.querySelector("[data-plan-total]");
      if (planTotal) planTotal.textContent = fmt(combinedSum);
      const planDelta = els.extrasTable.querySelector("[data-plan-delta]");
      if (planDelta) planDelta.textContent = fmt(0);
    }

    if (els.sumYear) els.sumYear.textContent = fmt(combinedSum);
    if (els.avgMonth) els.avgMonth.textContent = fmt(average);
    if (els.peakMonth) els.peakMonth.textContent = fmt(peak);
  }

  async function loadLookups() {
    setStatus("Lookups laden …");
    const orgs = await API.getOrgUnits();
    const quals = await API.getQualifikationen();
    state.orgUnits = Array.isArray(orgs) ? orgs : [];
    state.qualOptions = Array.isArray(quals) ? quals.map((q) => q.bezeichnung).filter(Boolean) : [];
    setStatus("");
  }

  function populateOrgSelect() {
    if (!els.deptSelect) return;
    if (!state.orgUnits.length) {
      els.deptSelect.innerHTML = "<option value=''>Keine Abteilung</option>";
      return;
    }
    els.deptSelect.innerHTML = state.orgUnits
      .map((unit) => `<option value="${escapeHtml(unit.code)}">${escapeHtml(unit.name)}</option>`)
      .join("");
    if (!state.dept && state.orgUnits[0]) {
      state.dept = state.orgUnits[0].code;
    }
    els.deptSelect.value = state.dept;
  }

  function populateYear() {
    if (!els.yearInput) return;
    els.yearInput.value = String(state.year);
  }

  async function loadFromDb() {
    if (!state.dept || !state.year) {
      setStatus("Abteilung und Jahr wählen", true);
      return;
    }
    ensurePlan();
    setStatus("Lade …");
    try {
      const remote = await API.loadPlan(state.dept, state.year);
      state.data[key()] = {
        employees: Array.isArray(remote.employees) ? remote.employees : [],
        extras: Array.isArray(remote.extras) ? remote.extras : [],
      };
      ensurePlan();
      saveStorage();
      renderAll();
      setStatus("Geladen");
    } catch (error) {
      console.warn(error);
      renderAll();
      setStatus("DB-Laden fehlgeschlagen – lokale Daten genutzt", true);
    }
  }

  async function saveToDb() {
    if (!state.dept || !state.year) {
      setStatus("Abteilung und Jahr fehlen", true);
      return;
    }
    const plan = ensurePlan();
    setStatus("Speichere …");
    try {
      const payload = {
        orgCode: state.dept,
        year: state.year,
        employees: plan.employees.map((row) => ({
          personalNumber: String(row.personalNumber || ""),
          name: String(row.name || ""),
          qual: String(row.qual || ""),
          include: !!row.include,
          hiddenRow: !!row.hiddenRow,
          values: (row.values || []).map((value) => clamp2(value)),
        })),
        extras: plan.extras.map((row) => ({
          personalNumber: String(row.personalNumber || ""),
          category: String(row.category || "Zusatz"),
          qual: String(row.qual || ""),
          include: !!row.include,
          hiddenRow: !!row.hiddenRow,
          values: (row.values || []).map((value) => clamp2(value)),
        })),
      };
      await API.savePlan(payload);
      saveStorage();
      const timestamp = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
      setStatus(`Gespeichert (${timestamp})`);
    } catch (error) {
      console.error(error);
      setStatus(`Speichern fehlgeschlagen: ${error?.message || error}`, true);
    }
  }

  function wireEvents() {
    if (els.deptSelect) {
      els.deptSelect.addEventListener("change", async () => {
        state.dept = els.deptSelect.value;
        saveStorage();
        await loadFromDb();
      });
    }

    if (els.yearInput) {
      els.yearInput.addEventListener("change", async () => {
        const candidate = Number(els.yearInput.value);
        if (Number.isFinite(candidate) && candidate > 1900) {
          state.year = candidate;
        }
        els.yearInput.value = String(state.year);
        saveStorage();
        await loadFromDb();
      });
    }

    if (els.btnSaveDb) {
      els.btnSaveDb.addEventListener("click", saveToDb);
    }

    if (els.btnAddRow) {
      els.btnAddRow.addEventListener("click", () => {
        const plan = ensurePlan();
        plan.employees.push({
          id: createRowId(),
          personalNumber: "",
          name: "Neu",
          qual: "",
          include: true,
          hiddenRow: false,
          values: Array(12).fill(0),
        });
        saveStorage();
        renderAll();
        setStatus("Ungespeichert");
      });
    }

    if (els.btnAddExtra) {
      els.btnAddExtra.addEventListener("click", () => {
        const plan = ensurePlan();
        plan.extras.push({
          id: createRowId(),
          personalNumber: "",
          category: "Zusatz",
          qual: "",
          include: true,
          hiddenRow: false,
          values: Array(12).fill(0),
        });
        saveStorage();
        renderAll();
        setStatus("Ungespeichert");
      });
    }

    const onTableInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const idx = Number(target.dataset.idx);
      const kind = target.dataset.kind;
      if (!Number.isFinite(idx) || !kind) return;
      const plan = ensurePlan();
      const list = kind === "extra" ? plan.extras : plan.employees;
      const row = list[idx];
      if (!row) return;

      if (target.classList.contains("sp-pnr")) {
        row.personalNumber = target.value;
      } else if (target.classList.contains("sp-name")) {
        row.name = target.value;
      } else if (target.classList.contains("sp-category")) {
        row.category = target.value;
      } else if (target.classList.contains("sp-qual") && target instanceof HTMLSelectElement) {
        row.qual = target.value;
      } else if (target.classList.contains("sp-vk")) {
        const month = Number(target.dataset.month);
        if (Number.isFinite(month) && month >= 0 && month < 12) {
          row.values[month] = clamp2(target.value);
          updateRowAverageCell(target.closest("tr"), row);
        }
      }

      saveStorage();
      recalcTotals();
      setStatus("Ungespeichert");
    };

    const onTableClick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.dataset.action;
      if (!action) return;
      const kind = target.dataset.kind;
      const idx = Number(target.dataset.idx);
      if (!kind || !Number.isFinite(idx)) return;
      const plan = ensurePlan();
      const list = kind === "extra" ? plan.extras : plan.employees;
      const row = list[idx];
      if (!row) return;

      if (action === "delete") {
        list.splice(idx, 1);
        saveStorage();
        renderAll();
        setStatus("Ungespeichert");
        return;
      }

      if (action === "toggle-hide") {
        row.hiddenRow = !row.hiddenRow;
        row.include = !row.hiddenRow;
        saveStorage();
        renderAll();
        setStatus("Ungespeichert");
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

  async function start() {
    loadStorage();
    if (els.yearInput && els.yearInput.value) {
      const candidate = Number(els.yearInput.value);
      if (Number.isFinite(candidate) && candidate > 1900) {
        state.year = candidate;
      }
    }

    try {
      await loadLookups();
      populateOrgSelect();
      populateYear();
      state.dept = els.deptSelect?.value || state.dept;
      wireEvents();
      await loadFromDb();
    } catch (error) {
      console.error(error);
      wireEvents();
      ensurePlan();
      renderAll();
      setStatus("Initialisierung fehlgeschlagen (Lookups/API).", true);
    }
  }

  start();
}

function waitForEl(selector, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(selector);
    if (found) return resolve(found);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeoutMs);
  });
}

async function boot() {
  try {
    await waitForEl("#btnAddRow");
    await waitForEl("#deptSelect");
    initStellenplan();
  } catch (error) {
    console.error("Stellenplan boot failed:", error);
  }
}

boot();
