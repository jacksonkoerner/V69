// FieldVoice Pro — refine-text Edge Function
// Proxies text refinement requests to n8n with server-side auth
// Browser → Edge Function (JWT) → n8n (X-API-Key)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { corsHeaders, jsonError, jsonResponse, validateAuth, fetchN8n } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Method guard
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405)
  }

  try {
    // --- 1. Validate JWT ---
    const auth = await validateAuth(req)

    // --- 2. Read request body ---
    const body = await req.json()

    // Basic payload validation
    if (!body.originalText || !body.section) {
      return jsonError("Missing required fields: originalText, section", 400)
    }

    // --- 3. Forward to n8n ---
    const n8nResponse = await fetchN8n("fieldvoice-v69-refine-text", {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": auth.userId,
      },
      body: JSON.stringify(body),
    })

    // --- 4. Return n8n response ---
    const responseData = await n8nResponse.text()
    return jsonResponse(
      responseData,
      n8nResponse.status,
      n8nResponse.headers.get("Content-Type") || "application/json"
    )

  } catch (error) {
    if (error?.status) {
      return jsonError(error.message, error.status)
    }
    console.error("refine-text error:", error)
    return jsonError("Internal server error", 500)
  }
})
