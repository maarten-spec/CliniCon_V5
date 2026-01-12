export async function onRequestGet({ env }) {
  const rs = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
  ).all();
  return Response.json(rs.results ?? []);
}
