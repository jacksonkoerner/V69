// FieldVoice Pro — extract-project Edge Function
// Proxies document extraction (PDF/DOCX uploads) to n8n with server-side auth
// Browser → Edge Function (JWT + FormData) → n8n (X-API-Key + FormData)
// Note: Handles multipart/form-data file forwarding through Deno

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

    // --- 2. Read incoming FormData and forward as-is ---
    const incomingFormData = await req.formData()

    // Validate that files were provided
    const documents = incomingFormData.getAll("documents")
    if (!documents || documents.length === 0) {
      return jsonError("No documents provided", 400)
    }

    // Reconstruct FormData for outbound request to n8n
    const outboundFormData = new FormData()
    for (const [key, value] of incomingFormData.entries()) {
      outboundFormData.append(key, value)
    }

    // --- 3. Forward to n8n ---
    // Do NOT set Content-Type header — let fetch set it with the correct multipart boundary
    const n8nResponse = await fetchN8n("fieldvoice-v69-project-extractor", {
      headers: {
        "X-User-Id": auth.userId,
      },
      body: outboundFormData,
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
    console.error("extract-project error:", error)
    return jsonError("Internal server error", 500)
  }
})
