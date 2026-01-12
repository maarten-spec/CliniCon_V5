export async function onRequestGet({ env }) {
  const rs = await env.DB.prepare(
    `SELECT id, code, name, einheitstyp, aktiv
     FROM organisationseinheit
     WHERE aktiv = 1
     ORDER BY name`
  ).all();

  return Response.json(rs.results ?? []);
}
