export async function onRequestGet({ env }) {
  try {
    const rs = await env.DB.prepare(
      `SELECT id, code, bezeichnung, pflicht, sortierung, aktiv
       FROM qualifikation
       WHERE aktiv = 1
       ORDER BY sortierung, bezeichnung`
    ).all();

    return Response.json(rs.results ?? []);
  } catch (error) {
    console.error("qualifikationen error", error);
    return new Response(JSON.stringify({
      message: "Qualifikationen konnten nicht geladen werden",
      detail: String(error?.message ?? error),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
