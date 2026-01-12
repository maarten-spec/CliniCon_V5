export async function onRequestGet({ env }) {
  const rs = await env.DB.prepare(
    `SELECT id, code, bezeichnung, pflicht, sortierung, aktiv
     FROM qualifikation
     WHERE aktiv = 1
     ORDER BY sortierung, bezeichnung`
  ).all();

  return Response.json(rs.results ?? []);
}
