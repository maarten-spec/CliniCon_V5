function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function getOrgByCode(env, orgCode) {
  const org = await env.DB.prepare(
    `SELECT id, code
     FROM organisationseinheit
     WHERE code = ?
     LIMIT 1`
  ).bind(orgCode).first();

  if (!org) throw new Error("Org not found");
  return org;
}

async function getOrCreatePlan(env, orgId, year) {
  const existing = await env.DB.prepare(
    `SELECT id
     FROM stellenplan
     WHERE organisationseinheit_id = ? AND jahr = ?
     LIMIT 1`
  ).bind(orgId, year).first();

  if (existing?.id) return existing.id;

  const ins = await env.DB.prepare(
    `INSERT INTO stellenplan (organisationseinheit_id, jahr, status)
     VALUES (?, ?, 'ENTWURF')`
  ).bind(orgId, year).run();

  return ins.meta.last_row_id;
}

async function getOrCreateMitarbeiter(env, personalnummer, vorname, nachname) {
  const existing = await env.DB.prepare(
    `SELECT id
     FROM mitarbeiter
     WHERE personalnummer = ?
     LIMIT 1`
  ).bind(personalnummer).first();

  if (existing?.id) {
    // optional: update names to latest
    await env.DB.prepare(
      `UPDATE mitarbeiter
       SET vorname = ?, nachname = ?, aktualisiert_am = datetime('now')
       WHERE id = ?`
    ).bind(vorname, nachname, existing.id).run();
    return existing.id;
  }

  const ins = await env.DB.prepare(
    `INSERT INTO mitarbeiter (personalnummer, vorname, nachname)
     VALUES (?, ?, ?)`
  ).bind(personalnummer, vorname, nachname).run();

  return ins.meta.last_row_id;
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null);
  if (!body) return new Response("Invalid JSON", { status: 400 });

  const orgCode = String(body.orgCode || "").trim();
  const year = Number(body.year || 0);
  const employees = Array.isArray(body.employees) ? body.employees : [];
  const extras = Array.isArray(body.extras) ? body.extras : [];

  if (!orgCode || !year) return new Response("Missing orgCode/year", { status: 400 });

  try {
    const org = await getOrgByCode(env, orgCode);
    const planId = await getOrCreatePlan(env, org.id, year);

    // Einfach & robust: alles fuer den Plan neu schreiben
    await env.DB.prepare(
      `DELETE FROM stellenplan_monat WHERE stellenplan_id = ?`
    ).bind(planId).run();

    // Mitarbeitende
    for (const emp of employees) {
      const pnr = String(emp.personalNumber || "").trim();
      const fullName = String(emp.name || "").trim();

      // Falls Personalnummer fehlt: skip
      if (!pnr) continue;

      // sehr pragmatisches Splitten
      const parts = fullName.split(/\s+/).filter(Boolean);
      const vorname = parts.slice(0, 1).join(" ");
      const nachname = parts.slice(1).join(" ") || "";

      const empId = await getOrCreateMitarbeiter(env, pnr, vorname, nachname);

      const values = Array.isArray(emp.values) ? emp.values : Array(12).fill(0);
      for (let i = 0; i < 12; i++) {
        const vk = toNum(values[i]);
        await env.DB.prepare(
          `INSERT INTO stellenplan_monat (stellenplan_id, mitarbeiter_id, monat, dienstart, vk)
           VALUES (?, ?, ?, '01', ?)`
        ).bind(planId, empId, i + 1, vk).run();
      }
    }

    // Extras (Pseudo-Mitarbeiter)
    for (const ex of extras) {
      const raw = String(ex.personalNumber || "").trim();
      const category = String(ex.category || "Zusatz").trim();

      // stabile EX-Nummer – wenn leer, random key erzeugen
      const key = raw ? raw : (globalThis.crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      const pnr = raw.startsWith("EX-") ? raw : `EX-${key}`;

      const exId = await getOrCreateMitarbeiter(env, pnr, "", category);

      const values = Array.isArray(ex.values) ? ex.values : Array(12).fill(0);
      for (let i = 0; i < 12; i++) {
        const vk = toNum(values[i]);
        await env.DB.prepare(
          `INSERT INTO stellenplan_monat (stellenplan_id, mitarbeiter_id, monat, dienstart, vk)
           VALUES (?, ?, ?, '01', ?)`
        ).bind(planId, exId, i + 1, vk).run();
      }
    }

    return Response.json({ ok: true });
  } catch (e) {
    console.error(e);
    return new Response(String(e?.message || e), { status: 500 });
  }
}
