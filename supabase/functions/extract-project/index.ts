// FieldVoice Pro — extract-project Edge Function
// Proxies document extraction (PDF/DOCX uploads) to n8n with server-side auth
// Browser → Edge Function (JWT + FormData) → n8n (X-API-Key + FormData)
// Note: Handles multipart/form-data file forwarding through Deno

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // --- 1. Validate JWT ---
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const token = authHeader.replace("Bearer ", "")
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // --- 2. Read incoming FormData and forward as-is ---
    const incomingFormData = await req.formData()

    // Validate that files were provided
    const documents = incomingFormData.getAll("documents")
    if (!documents || documents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No documents provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Reconstruct FormData for outbound request to n8n
    const outboundFormData = new FormData()
    for (const [key, value] of incomingFormData.entries()) {
      outboundFormData.append(key, value)
    }

    // --- 3. Forward to n8n ---
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!
    const n8nSecret = Deno.env.get("N8N_WEBHOOK_SECRET")!

    const n8nResponse = await fetch(
      `${n8nBaseUrl}/webhook/fieldvoice-v69-project-extractor`,
      {
        method: "POST",
        headers: {
          "X-API-Key": n8nSecret,
          // Do NOT set Content-Type — let fetch set it with the correct boundary
        },
        body: outboundFormData,
      }
    )

    // --- 4. Return n8n response ---
    const responseData = await n8nResponse.text()

    return new Response(responseData, {
      status: n8nResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": n8nResponse.headers.get("Content-Type") || "application/json",
      },
    })

  } catch (error) {
    console.error("extract-project error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
