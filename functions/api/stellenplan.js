function monthRowToValues(rows) {
  const values = Array(12).fill(0);
  for (const r of rows) {
    const idx = Number(r.monat) - 1;
    if (idx >= 0 && idx < 12) values[idx] = Number(r.vk || 0);
  }
  return values;
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const orgCode = (url.searchParams.get("org") || "").trim();
  const year = Number(url.searchParams.get("year") || 0);

  if (!orgCode || !year) {
    return new Response("Missing org/year", { status: 400 });
  }

  const org = await env.DB.prepare(
    `SELECT id, code, name
     FROM organisationseinheit
     WHERE code = ?
     LIMIT 1`
  ).bind(orgCode).first();

  if (!org) return new Response("Org not found", { status: 404 });

  const plan = await env.DB.prepare(
    `SELECT id
     FROM stellenplan
     WHERE organisationseinheit_id = ? AND jahr = ?
     LIMIT 1`
  ).bind(org.id, year).first();

  if (!plan) {
    return Response.json({ employees: [], extras: [] });
  }

  // Alle Mitarbeitenden, die im Plan vorkommen
  const empRows = await env.DB.prepare(
    `SELECT DISTINCT
       m.id AS mitarbeiter_id,
       m.personalnummer,
       m.vorname,
       m.nachname
     FROM stellenplan_monat sm
     JOIN mitarbeiter m ON m.id = sm.mitarbeiter_id
     WHERE sm.stellenplan_id = ?
     ORDER BY m.personalnummer`
  ).bind(plan.id).all();

  const employees = [];
  const extras = [];

  for (const e of (empRows.results ?? [])) {
    const rows = await env.DB.prepare(
      `SELECT monat, vk
       FROM stellenplan_monat
       WHERE stellenplan_id = ? AND mitarbeiter_id = ? AND dienstart = '01'
       ORDER BY monat`
    ).bind(plan.id, e.mitarbeiter_id).all();

    const personalNumber = String(e.personalnummer || "");
    const isExtra = personalNumber.startsWith("EX-");

    const values = monthRowToValues(rows.results ?? []);

    if (isExtra) {
      extras.push({
        id: String(e.mitarbeiter_id),
        personalNumber,
        category: String(e.nachname || "").trim() || "Zusatz",
        qual: "",
        include: true,
        hiddenRow: false,
        values
      });
    } else {
      const name = `${(e.vorname || "").trim()} ${(e.nachname || "").trim()}`.trim() || "Neu";
      employees.push({
        id: String(e.mitarbeiter_id),
        personalNumber,
        name,
        qual: "",
        include: true,
        hiddenRow: false,
        values
      });
    }
  }

  return Response.json({ employees, extras });
}
