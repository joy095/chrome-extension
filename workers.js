// Cloudflare Worker for D1 Database Access
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    // Health check endpoint
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Database query endpoint
    if (path === "/query" && request.method === "POST") {
      return handleQuery(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// Handle CORS preflight
function handleOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// Handle database queries
async function handleQuery(request, env) {
  try {
    const { sql, params, userId } = await request.json();

    // Validate user ID
    if (!userId || !userId.startsWith("user_")) {
      return new Response(JSON.stringify({ error: "Invalid user ID" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Execute query
    const { results } = await env.DB.prepare(sql)
      .bind(...params)
      .all();

    return new Response(JSON.stringify({ results }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Database query error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
