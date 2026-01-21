// worker.js
// Endpunkte:
//  - POST /login
//  - GET  /api/audit?site=...&limit=...
//  - POST /api/ai-command          (nur KI-Parsing)
//  - POST /api/command             (KI-Parsing + DB-Aktion)
//  - POST /api/rollover            (Stellenanteile in Jahres-Spalten vorwaerts kopieren)
//  - POST /api/roster/save         (D1: Stellenplan speichern + Validierung)
//  - POST /api/roster/history      (D1: Historie pro Mitarbeiter)
//  - POST /api/roster/list         (D1: Stellenplan laden)
//  - POST /api/roster/rollover     (D1: Folgejahr kopieren)
//  - POST /assistant/query         (Clinicon-Assistent: Analyse/Antwort)
//  - POST /assistant/commit        (Clinicon-Assistent: Aenderung schreiben)
//
// Erwartete Secrets/Vars:
//  - OPENAI_API_KEY (Secret)
//  - ASSISTANT_TOKEN_SECRET (Secret, optional)
//  - SUPABASE_SERVICE_ROLE_KEY (Secret)
//  - SUPABASE_URL (Plaintext)
//  - DB (D1 Binding)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------- KI-Prompt ----------
const SYSTEM_PROMPT = `
Du bist ein Assistent fuer das Stellenplan- und Personalplanungssystem "Clinicon" in einem Krankenhaus.

AUFGABE:
- Du erhaeltst deutschsprachige Texte (Befehle oder Fragen).
- Du interpretierst diese Texte und gibst IMMER eine JSON-Struktur zurueck.
- Du fuehrst KEINE Aktionen selbst aus, du PARST nur.
- Wenn etwas unklar ist, schlage eine Rueckfrage vor und setze "needs_clarification" auf true.

ERLAUBTE INTENTS:
- "adjust_person_fte_rel"
- "adjust_person_fte_abs"
- "move_employee_unit"
- "check_employee_exists"
- "get_employee_unit"
- "list_unit_employees"
- "get_employee_fte_year"
- "help"
- "unknown"

AUSGABEFORMAT (immer JSON):
{
  "intent": "<intent>",
  "fields": {
    "employee_name": string | null,
    "personal_number": string | null,
    "month": string | null,
    "year": number | null,
    "dienstart": string | null,
    "delta_fte": number | null,
    "target_fte": number | null,
    "unit": string | null,
    "site": string | null
  },
  "confidence": number,
  "needs_clarification": boolean,
  "clarification_question": string | null,
  "notes": string | null
}

BESONDERE REGELN:
- "delta_fte" ist fuer relative Aenderungen, z.B. -0.5 fuer "um 0,5 VK reduzieren".
- "target_fte" ist fuer absolute Zielwerte, z.B. 0.8 fuer "auf 0,8 VK setzen".
- "unit" ist die Abteilung (z.B. Stationscode). "dienstart" ist zweistellig (01-07).
- Monate als deutschen Text.
- Fehlende Pflichtinfos -> needs_clarification=true + passende Rueckfrage.
- Immer nur JSON, kein Fliesstext.
`;

// ---------- KI-Aufruf ----------
async function callOpenAI(env, prompt) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY/Clinicon-Assistent fehlt");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error("OpenAI-Antwort nicht als JSON lesbar");
  }
}

// ---------- D1 Audit Helpers ----------
async function ensureAuditTableD1(db) {
  await db.prepare(\`
    CREATE TABLE IF NOT EXISTS assistant_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT DEFAULT (datetime('now')),
      site TEXT,
      command TEXT,
      action TEXT,
      target_table TEXT,
      plan_year INTEGER,
      status TEXT,
      result TEXT
    )
  \`).run();
}

async function logAuditD1(db, payload) {
  try {
    await ensureAuditTableD1(db);
    await db.prepare(\`
      INSERT INTO assistant_audit (site, command, action, target_table, plan_year, status, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    \`).bind(
      payload.site || "unknown",
      payload.command || "",
      payload.action || "",
      payload.target_table || "",
      payload.plan_year || null,
      payload.status || "ok",
      JSON.stringify(payload.result || {})
    ).run();
  } catch (e) {
    console.error("Audit Log Error:", e);
  }
}

// ---------- D1 Roster Helpers ----------
async function getEmployeeColumns(db) {
  try {
    const res = await db.prepare("PRAGMA table_info(employees)").all();
    const cols = new Set((res.results || []).map((row) => row.name));
    return {
      hasQual: cols.has("qual"),
      hasInclude: cols.has("include"),
    };
  } catch (err) {
    return { hasQual: false, hasInclude: false };
  }
}

async function saveRosterMonthly(payload, db) {
  const siteId = must(payload.siteId, "siteId");
  const departmentId = must(payload.departmentId, "departmentId");
  const year = mustInt(payload.year, "year");
  const updatedByUserId = payload.updatedByUserId || null;

  const employees = Array.isArray(payload.employees) ? payload.employees : [];
  const extras = Array.isArray(payload.extras) ? payload.extras : [];
  const cols = await getEmployeeColumns(db);

  const insertCols = ["id", "site_id", "personnel_no", "display_name", "is_active", "updated_at"];
  const insertValues = ["?", "?", "?", "?", "1", "datetime('now')"];
  const updateCols = ["site_id", "personnel_no", "display_name", "updated_at"];
  if (cols.hasQual) {
    insertCols.push("qual");
    insertValues.push("?");
    updateCols.push("qual");
  }
  if (cols.hasInclude) {
    insertCols.push("include");
    insertValues.push("?");
    updateCols.push("include");
  }
  const employeeSql = `
    INSERT INTO employees(${ insertCols.join(", ") })
    VALUES(${ insertValues.join(", ") })
    ON CONFLICT(id) DO UPDATE SET
      ${ updateCols.map((c) => `${c} = excluded.${c}`).join(", ") }
    `;

  const employeeUpserts = [];
  const addEmployee = (row, isExtra) => {
    const employeeId = row.employeeId || row.id;
    if (!employeeId) return;
    const personalRaw = String(row.personalNumber || "").trim();
    const personalNo = isExtra
      ? (personalRaw.startsWith("EX-") ? personalRaw : `EX - ${ personalRaw }`)
      : personalRaw.replace(/^EX-/, "");
    const displayName = isExtra ? String(row.category || row.name || "Zusatz") : String(row.name || "");
    const params = [employeeId, siteId, personalNo, displayName];
    if (cols.hasQual) params.push(String(row.qual || ""));
    if (cols.hasInclude) params.push(row.include === false ? 0 : 1);
    employeeUpserts.push(db.prepare(employeeSql).bind(...params));
  };

  employees.forEach((e) => addEmployee(e, false));
  extras.forEach((e) => addEmployee(e, true));
  if (employeeUpserts.length) {
    await db.batch(employeeUpserts);
  }

  const rosterStmts = [];
  const addRosterRows = (arr) => {
    for (const row of arr) {
      const employeeId = row.employeeId || row.id;
      if (!employeeId) continue;
      const values = Array.isArray(row.values) ? row.values : Array(12).fill(0);
      const include = row.include !== false;
      const v = include ? values : values;
      for (let m = 1; m <= 12; m++) {
        const fteRaw = Number(v[m - 1] || 0);
        const fte = Number.isFinite(fteRaw) ? (fteRaw < 0 ? 0 : fteRaw) : 0;
        const id = crypto.randomUUID();
        rosterStmts.push(
          db.prepare(`
            INSERT INTO roster_monthly
    (id, site_id, department_id, employee_id, year, month, fte, updated_at, updated_by_user_id)
            VALUES
      (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
            ON CONFLICT(employee_id, department_id, year, month)
            DO UPDATE SET
              site_id = excluded.site_id,
    fte = excluded.fte,
    updated_at = datetime('now'),
    updated_by_user_id = excluded.updated_by_user_id
      `).bind(
            id,
            siteId,
            departmentId,
            employeeId,
            year,
            m,
            fte,
            updatedByUserId
          )
        );
      }
    }
  };

  addRosterRows(employees);
  addRosterRows(extras);
  if (rosterStmts.length) {
    await db.batch(rosterStmts);
  }

  const employeeIds = [...new Set([...employees, ...extras].map((r) => r.employeeId || r.id).filter(Boolean))];
  const warnings = await getFteWarnings(db, siteId, year, employeeIds);
  return { ok: true, warnings };
}

async function getFteWarnings(db, siteId, year, employeeIds) {
  if (!employeeIds.length) return [];
  const placeholders = employeeIds.map(() => "?").join(",");
  const q = `
    SELECT employee_id, year, month, ROUND(SUM(fte), 4) AS total_fte
    FROM roster_monthly
    WHERE site_id = ?
    AND year = ?
      AND employee_id IN(${ placeholders })
    GROUP BY employee_id, year, month
    HAVING SUM(fte) > 1.0
    ORDER BY employee_id, month
    `;
  const res = await db.prepare(q).bind(siteId, year, ...employeeIds).all();
  const rows = res.results || [];
  return rows.map((r) => ({
    employeeId: r.employee_id,
    year: r.year,
    month: r.month,
    totalFte: r.total_fte,
    message: `Warnung: VK - Summe > 1, 0(ist ${ r.total_fte })`,
  }));
}

// ---------- Assistenz: Token ----------
const encoder = new TextEncoder();
const b64url = (input) =>
  btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64urlStr = (str) => b64url(encoder.encode(str));
const b64urlParse = (str) => {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  const safe = (str + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(safe);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

async function signToken(env, payload) {
  const jsonPayload = JSON.stringify(payload);
  const body = b64urlStr(jsonPayload);
  const secret = env.ASSISTANT_TOKEN_SECRET;
  if (!secret) {
    return body;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${ body }.${ b64url(sig) }`;
}

async function verifyToken(env, token) {
  if (!token) throw new Error("commit_token fehlt");
  const secret = env.ASSISTANT_TOKEN_SECRET;
  const parts = token.split(".");
  if (!secret) {
    const raw = b64urlParse(parts[0]);
    return JSON.parse(raw);
  }
  if (parts.length !== 2) throw new Error("commit_token ungueltig");
  const [body, sig] = parts;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigPad = "=".repeat((4 - (sig.length % 4)) % 4);
  const sigBin = atob(sig.replace(/-/g, "+").replace(/_/g, "/") + sigPad);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    Uint8Array.from(sigBin, (c) => c.charCodeAt(0)),
    encoder.encode(body)
  );
  if (!ok) throw new Error("commit_token ungueltig");
  const raw = b64urlParse(body);
  return JSON.parse(raw);
}

// ---------- Assistenz: D1 Stellenplan ----------
const MONTH_MAP = {
  "januar": "jan", "jan": "jan",
  "februar": "feb", "feb": "feb",
  "maerz": "mrz", "maerz": "mrz", "mrz": "mrz",
  "april": "apr", "apr": "apr",
  "mai": "mai",
  "juni": "jun", "jun": "jun",
  "juli": "jul", "jul": "jul",
  "august": "aug", "aug": "aug",
  "september": "sep", "sep": "sep",
  "oktober": "okt", "okt": "okt",
  "november": "nov", "nov": "nov",
  "dezember": "dez", "dez": "dez",
};
const MONTHS = ["jan","feb","mrz","apr","mai","jun","jul","aug","sep","okt","nov","dez"];

const monthIndexFromName = (label) => {
  if (!label) return null;
  const key = String(label).toLowerCase().trim();
  const base = MONTH_MAP[key] || key.slice(0, 3);
  const idx = MONTHS.indexOf(base);
  return idx >= 0 ? idx + 1 : null;
};
const normalizeDienstart = (value) => {
  const raw = String(value || "01").trim();
  const padded = raw.padStart(2, "0");
  return /^\d{2}$/.test(padded) ? padded : "01";
};

async function getOrgByCodeD1(db, code) {
  return db.prepare(
    `SELECT id, code, name
     FROM organisationseinheit
     WHERE code = ? LIMIT 1`
  ).bind(code).first();
}

async function getOrCreatePlanD1(db, orgId, year) {
  const existing = await db.prepare(
    `SELECT id
     FROM stellenplan
     WHERE organisationseinheit_id = ? AND jahr = ?
    LIMIT 1`
  ).bind(orgId, year).first();
  if (existing?.id) return existing.id;
  const ins = await db.prepare(
    `INSERT INTO stellenplan(organisationseinheit_id, jahr, status)
     VALUES(?, ?, 'ENTWURF')`
  ).bind(orgId, year).run();
  return ins.meta.last_row_id;
}

async function findEmployeeD1(db, name, personalNumber) {
  const pnr = String(personalNumber || "").trim();
  if (pnr) {
    const row = await db.prepare(
      `SELECT id, personalnummer, vorname, nachname
       FROM mitarbeiter
       WHERE personalnummer = ?
    LIMIT 1`
    ).bind(pnr).first();
    if (row) return row;
  }
  const cleaned = String(name || "").trim();
  if (!cleaned) return null;
  const like = `% ${ cleaned } % `;
  return db.prepare(
    `SELECT id, personalnummer, vorname, nachname
     FROM mitarbeiter
     WHERE(vorname || ' ' || nachname) LIKE ?
    OR nachname LIKE ?
    OR vorname LIKE ?
    LIMIT 1`
  ).bind(like, like, like).first();
}

async function upsertPlanMonthD1(db, planId, employeeId, month, dienstart, fte) {
  await db.prepare(
    `INSERT INTO stellenplan_monat(stellenplan_id, mitarbeiter_id, monat, dienstart, vk)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(stellenplan_id, mitarbeiter_id, monat, dienstart)
     DO UPDATE SET vk = excluded.vk`
  ).bind(planId, employeeId, month, dienstart, fte).run();
}

async function getEmployeeFteYearD1(db, planId, employeeId, dienstart) {
  const rows = await db.prepare(
    `SELECT monat, vk
     FROM stellenplan_monat
     WHERE stellenplan_id = ? AND mitarbeiter_id = ? AND dienstart = ?
    ORDER BY monat`
  ).bind(planId, employeeId, dienstart).all();
  const values = Array(12).fill(0);
  (rows.results || []).forEach((row) => {
    const idx = Number(row.monat) - 1;
    if (idx >= 0 && idx < 12) values[idx] = Number(row.vk || 0);
  });
  const avg = values.reduce((a, b) => a + b, 0) / 12;
  return { values, avg };
}

async function executeAssistantActionD1(env, parsed, ctx) {
  if (!env.DB) throw new Error("DB binding fehlt");
  const f = parsed.fields || {};
  const year = Number(f.year || ctx.year || 0);
  const dept = String(ctx.dept || f.unit || "").trim();
  const dienstart = normalizeDienstart(f.dienstart || ctx.dienstart || "01");
  if (!year) throw new Error("Jahr fehlt");
  if (!dept) throw new Error("Abteilung fehlt");

  const org = await getOrgByCodeD1(env.DB, dept);
  if (!org) throw new Error(`Abteilung ${ dept } nicht gefunden`);
  const planId = await getOrCreatePlanD1(env.DB, org.id, year);

  const employee = await findEmployeeD1(env.DB, f.employee_name, f.personal_number);
  if (!employee) throw new Error("Mitarbeiter:in nicht gefunden");

  switch (parsed.intent) {
    case "adjust_person_fte_rel": {
      const month = monthIndexFromName(f.month);
      if (!month) throw new Error("Monat fehlt/ungueltig");
      const delta = num(f.delta_fte);
      const current = await env.DB.prepare(
        `SELECT vk FROM stellenplan_monat
         WHERE stellenplan_id = ? AND mitarbeiter_id = ? AND monat = ? AND dienstart = ? `
      ).bind(planId, employee.id, month, dienstart).first();
      const curVal = Number(current?.vk || 0);
      const nextVal = curVal + delta;
      await upsertPlanMonthD1(env.DB, planId, employee.id, month, dienstart, nextVal);
      return { ok: true, employeeId: employee.id, month, year, dienstart, oldValue: curVal, newValue: nextVal };
    }
    case "adjust_person_fte_abs": {
      const month = monthIndexFromName(f.month);
      if (!month) throw new Error("Monat fehlt/ungueltig");
      const target = num(f.target_fte);
      await upsertPlanMonthD1(env.DB, planId, employee.id, month, dienstart, target);
      return { ok: true, employeeId: employee.id, month, year, dienstart, newValue: target };
    }
    case "get_employee_fte_year": {
      const { values, avg } = await getEmployeeFteYearD1(env.DB, planId, employee.id, dienstart);
      let monthValue = null;
      let month = null;
      if (f.month) {
        month = monthIndexFromName(f.month);
        if (month) monthValue = values[month - 1];
      }
      return { ok: true, employeeId: employee.id, year, dienstart, avg, month, monthValue, values };
    }
    case "check_employee_exists": {
      return { ok: true, exists: true, employeeId: employee.id };
    }
    case "list_unit_employees": {
      const rows = await env.DB.prepare(
        `SELECT DISTINCT m.id, m.personalnummer, m.vorname, m.nachname
         FROM stellenplan_monat sm
         JOIN mitarbeiter m ON m.id = sm.mitarbeiter_id
         WHERE sm.stellenplan_id = ? AND sm.dienstart = ?
    ORDER BY m.nachname, m.vorname`
      ).bind(planId, dienstart).all();
      const employees = (rows.results || []).map((row) => ({
        id: row.id,
        personalNumber: row.personalnummer,
        name: `${ row.vorname || "" } ${ row.nachname || "" }`.trim(),
      }));
      return { ok: true, dept, year, dienstart, employees };
    }
    case "get_employee_unit": {
      const rows = await env.DB.prepare(
        `SELECT DISTINCT o.code, o.name
         FROM stellenplan_monat sm
         JOIN stellenplan s ON s.id = sm.stellenplan_id
         JOIN organisationseinheit o ON o.id = s.organisationseinheit_id
         WHERE sm.mitarbeiter_id = ? AND s.jahr = ? AND sm.dienstart = ?
    ORDER BY o.name`
      ).bind(employee.id, year, dienstart).all();
      return { ok: true, employeeId: employee.id, year, dienstart, units: rows.results || [] };
    }
    case "move_employee_unit":
      throw new Error("Verschieben zwischen Abteilungen ist im D1-Plan nicht implementiert.");
    default:
      throw new Error(`Intent '${parsed.intent}' nicht implementiert.`);
  }
}

function summarizeProposal(parsed, ctx) {
  const f = parsed.fields || {};
  const year = f.year || ctx.year || "-";
  const dept = ctx.dept || f.unit || "-";
  const dienstart = f.dienstart || ctx.dienstart || "01";
  const emp = f.employee_name || f.personal_number || "Unbekannt";
  const month = f.month || "-";
  if (parsed.intent === "adjust_person_fte_rel") {
    return `Aenderung: ${ emp } ${ month } ${ year } in ${ dept }(DA ${ dienstart }) um ${ f.delta_fte } VK anpassen.`;
  }
  if (parsed.intent === "adjust_person_fte_abs") {
    return `Aenderung: ${ emp } ${ month } ${ year } in ${ dept }(DA ${ dienstart }) auf ${ f.target_fte } VK setzen.`;
  }
  return `Aenderung: ${ parsed.intent } fuer ${ emp }(${ dept }, ${ year }, DA ${ dienstart }).`;
}

async function getRosterHistory(payload, db) {
  const employeeId = must(payload.employeeId, "employeeId");
  const year = payload.year ? Number(payload.year) : null;

  let q = `
    SELECT changed_at, action, changed_by_user_id,
    department_id, year, month, old_fte, new_fte
    FROM roster_monthly_audit
    WHERE employee_id = ?
    `;
  const params = [employeeId];

  if (year) {
    q += " AND year = ? ";
    params.push(year);
  }
  q += " ORDER BY changed_at DESC LIMIT 200";

  const res = await db.prepare(q).bind(...params).all();
  return { ok: true, history: res.results || [] };
}

async function getRosterList(payload, db) {
  const siteId = must(payload.siteId, "siteId");
  const year = mustInt(payload.year, "year");
  const departmentId = payload.departmentId ? String(payload.departmentId) : null;
  const cols = await getEmployeeColumns(db);

  const selectExtra = [];
  if (cols.hasQual) selectExtra.push("e.qual AS qual");
  if (cols.hasInclude) selectExtra.push("e.include AS include");

  let q = `
    SELECT r.employee_id, r.department_id, r.year, r.month, r.fte,
    e.personnel_no, e.display_name
           ${ selectExtra.length ? ", " + selectExtra.join(", ") : "" }
    FROM roster_monthly r
    JOIN employees e ON e.id = r.employee_id
    WHERE r.site_id = ?
    AND r.year = ?
      `;
  const params = [siteId, year];
  if (departmentId) {
    q += " AND r.department_id = ? ";
    params.push(departmentId);
  }
  q += " ORDER BY e.display_name, r.department_id, r.month";

  const res = await db.prepare(q).bind(...params).all();
  const items = res.results || [];
  const map = new Map();
  items.forEach((row) => {
    const key = `${ row.employee_id } | ${ row.department_id }`;
    if (!map.has(key)) {
      map.set(key, {
        employeeId: row.employee_id,
        departmentId: row.department_id,
        personalNumber: row.personnel_no || "",
        name: row.display_name || "",
        qual: row.qual || "",
        include: row.include === 0 ? false : true,
        months: Array(12).fill(0),
      });
    }
    const entry = map.get(key);
    const idx = Number(row.month) - 1;
    if (idx >= 0 && idx < 12) {
      entry.months[idx] += Number(row.fte) || 0;
    }
  });
  return { ok: true, rows: Array.from(map.values()) };
}

async function rolloverRosterMonthly(payload, db) {
  const siteId = must(payload.siteId, "siteId");
  const departmentId = must(payload.departmentId, "departmentId");
  const employeeId = must(payload.employeeId, "employeeId");
  const fromYear = mustInt(payload.fromYear, "fromYear");
  const toYear = mustInt(payload.toYear, "toYear");
  const mode = payload.mode === "fill" ? "fill" : "overwrite";
  const updatedByUserId = payload.updatedByUserId || null;

  if (fromYear >= toYear) {
    throw new Error("fromYear muss kleiner als toYear sein");
  }

  const src = await db.prepare(`
    SELECT month, fte
    FROM roster_monthly
    WHERE site_id = ? AND department_id = ? AND employee_id = ? AND year = ?
    `).bind(siteId, departmentId, employeeId, fromYear).all();
  const srcRows = src.results || [];
  if (!srcRows.length) {
    return { ok: true, copiedMonths: 0, mode };
  }
  const srcMap = new Map();
  srcRows.forEach((row) => srcMap.set(Number(row.month), Number(row.fte) || 0));

  const tgt = await db.prepare(`
    SELECT month
    FROM roster_monthly
    WHERE site_id = ? AND department_id = ? AND employee_id = ? AND year = ?
    `).bind(siteId, departmentId, employeeId, toYear).all();
  const existing = new Set((tgt.results || []).map((row) => Number(row.month)));

  const stmts = [];
  for (let m = 1; m <= 12; m++) {
    if (!srcMap.has(m)) continue;
    if (mode === "fill" && existing.has(m)) continue;
    const id = crypto.randomUUID();
    const fte = srcMap.get(m);
    stmts.push(
      db.prepare(`
        INSERT INTO roster_monthly
    (id, site_id, department_id, employee_id, year, month, fte, updated_at, updated_by_user_id)
        VALUES
      (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(employee_id, department_id, year, month)
        DO UPDATE SET
          fte = excluded.fte,
    updated_at = datetime('now'),
    updated_by_user_id = excluded.updated_by_user_id
      `).bind(
        id,
        siteId,
        departmentId,
        employeeId,
        toYear,
        m,
        fte,
        updatedByUserId
      )
    );
  }
  if (stmts.length) {
    await db.batch(stmts);
  }
  return { ok: true, copiedMonths: stmts.length, mode };
}

// ---------- Login ----------
// Login entfernt (Supabase Dependency)

// ---------- Audit lesen ----------
// Audit Fetch entfernt (Supabase Dependency)

// ---------- DB-Aktionen ----------
// Legacy DB Actions (Supabase) entfernt

// ---------- KI-Parser + Aktion ----------
// Legacy AI Command (Removed)

// ---------- Clinicon Assistent (D1) ----------
const READ_INTENTS = new Set([
  "check_employee_exists",
  "get_employee_unit",
  "list_unit_employees",
  "get_employee_fte_year",
  "help",
]);
const WRITE_INTENTS = new Set([
  "adjust_person_fte_rel",
  "adjust_person_fte_abs",
  "move_employee_unit",
]);

async function handleAssistantQuery(body, env) {
  const { message, dept, dienstart, year } = body || {};
  if (!message) return json({ type: "message", message: "Nachricht fehlt." }, 400);

  const parsed = await callOpenAI(env, message);
  if (parsed.needs_clarification) {
    return json({ type: "message", message: parsed.clarification_question || "Bitte praezisieren." });
  }

  const ctx = {
    dept: String(dept || "").trim(),
    dienstart: normalizeDienstart(dienstart),
    year: Number(year || 0),
  };

  if (READ_INTENTS.has(parsed.intent)) {
    try {
      const result = await executeAssistantActionD1(env, parsed, ctx);
      return json({
        type: "message",
        message: `Ergebnis: ${ JSON.stringify(result) }`,
        parsed,
      });
    } catch (err) {
      return json({ type: "message", message: `Fehler: ${ err.message }`, parsed }, 500);
    }
  }

  if (WRITE_INTENTS.has(parsed.intent)) {
    const token = await signToken(env, {
      parsed,
      ctx,
      issuedAt: new Date().toISOString(),
    });
    return json({
      type: "proposal",
      proposal: {
        commit_token: token,
        summary: summarizeProposal(parsed, ctx),
      },
      parsed,
    });
  }

  return json({ type: "message", message: "Unbekannter Auftrag.", parsed });
}

async function handleAssistantCommit(body, env) {
  const { commit_token, dept, dienstart, year } = body || {};
  const tokenData = await verifyToken(env, commit_token);
  const parsed = tokenData.parsed || {};
  const ctx = {
    dept: String(dept || tokenData.ctx?.dept || "").trim(),
    dienstart: normalizeDienstart(dienstart || tokenData.ctx?.dienstart),
    year: Number(year || tokenData.ctx?.year || 0),
  };
  try {
    const result = await executeAssistantActionD1(env, parsed, ctx);
    return json({ message: "Gespeichert.", result });
  } catch (err) {
    return json({ message: `Fehler: ${ err.message }` }, 500);
  }
}

// ---------- Rollover Handler ----------
// Legacy Rollover Handler (Removed)

function must(v, name) {
  if (v === undefined || v === null || String(v).trim() === "") {
    throw new Error(`Missing field: ${ name }`);
  }
  return v;
}
function mustInt(v, name) {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`Invalid integer: ${ name }`);
  return n;
}

// ---------- Router ----------
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);

    // Root - Status Page
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(\`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Clinicon API (D1)</title>
          <style>body{font-family:sans-serif;padding:2rem;line-height:1.5;max-width:600px;margin:0 auto;color:#333;}</style>
        </head>
        <body>
          <h1>Clinicon API is Running 🟢</h1>
          <p>This backend is powered by Cloudflare Workers and D1.</p>
          <p>Version: ${new Date().toISOString()}</p>
        </body>
        </html>
      \`, { headers: { "Content-Type": "text/html" } });
    }

    // D1: Stellenplan speichern
    if (url.pathname === "/api/roster/save" && request.method === "POST") {
      if (!env.DB) return json({ ok: false, error: "DB binding fehlt" }, 500);
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:"Invalid JSON" },400); }
      try { return json(await saveRosterMonthly(body, env.DB), 200); }
      catch (err) { return json({ ok:false, error: err.message }, 500); }
    }

    // D1: Stellenplan laden
    if (url.pathname === "/api/roster/list" && request.method === "POST") {
      if (!env.DB) return json({ ok: false, error: "DB binding fehlt" }, 500);
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:"Invalid JSON" },400); }
      try { return json(await getRosterList(body, env.DB), 200); }
      catch (err) { return json({ ok:false, error: err.message }, 500); }
    }

    // D1: Historie pro Mitarbeiter
    if (url.pathname === "/api/roster/history" && request.method === "POST") {
      if (!env.DB) return json({ ok: false, error: "DB binding fehlt" }, 500);
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:"Invalid JSON" },400); }
      try { return json(await getRosterHistory(body, env.DB), 200); }
      catch (err) { return json({ ok:false, error: err.message }, 500); }
    }

    // D1: Folgejahr kopieren
    if (url.pathname === "/api/roster/rollover" && request.method === "POST") {
      if (!env.DB) return json({ ok: false, error: "DB binding fehlt" }, 500);
      let body; try { body = await request.json(); } catch { return json({ ok:false, error:"Invalid JSON" },400); }
      try { return json(await rolloverRosterMonthly(body, env.DB), 200); }
      catch (err) { return json({ ok:false, error: err.message }, 500); }
    }

    // Clinicon Assistent (D1)
    if (url.pathname === "/assistant/query" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ type:"message", message:"Invalid JSON" },400); }
      return await handleAssistantQuery(body, env);
    }
    if (url.pathname === "/assistant/commit" && request.method === "POST") {
      let body; try { body = await request.json(); } catch { return json({ message:"Invalid JSON" },400); }
      return await handleAssistantCommit(body, env);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
