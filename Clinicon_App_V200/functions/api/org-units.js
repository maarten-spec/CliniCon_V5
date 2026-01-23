export async function onRequestGet({ env }) {
  try {
    const rs = await env.DB.prepare(
      `SELECT id, code, name, einheitstyp, aktiv
       FROM organisationseinheit
       WHERE aktiv = 1
       ORDER BY name`
    ).all();

    return Response.json(rs.results ?? []);
  } catch (error) {
    console.error("org-units error", error);
    return new Response(JSON.stringify({
      message: "Organisationseinheiten konnten nicht geladen werden",
      detail: String(error?.message ?? error),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
