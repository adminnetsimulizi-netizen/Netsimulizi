export async function onRequestGet(context) {
  try {
    const db = context.env.DB;

    if (!db) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "D1 binding DB haipatikani"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const result = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all();

    return new Response(
      JSON.stringify({
        success: true,
        message: "D1 connection successful",
        tables: result.results || []
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}

