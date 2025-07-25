// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    // Health check endpoint
    if (path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Database query endpoint
    if (path === "/query" && request.method === "POST") {
      return handleQuery(request, env);
    }

    // Default response
    return new Response("Website Blocker API", {
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
};

// Handle CORS preflight
function handleOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// Handle database queries
async function handleQuery(request, env) {
  try {
    const { sql, params = [], userId } = await request.json();

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

    // Execute query with D1 database
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
