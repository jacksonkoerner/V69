// FieldVoice Pro — ai-chat Edge Function
// Proxies AI assistant requests to n8n with server-side auth
// Browser → Edge Function (JWT) → n8n (X-API-Key)

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

    // --- 2. Read request body ---
    const body = await req.json()

    // Basic payload validation
    if (!body.message) {
      return new Response(
        JSON.stringify({ error: "Missing required field: message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // --- 3. Forward to n8n ---
    const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!
    const n8nSecret = Deno.env.get("N8N_WEBHOOK_SECRET")!

    const n8nResponse = await fetch(
      `${n8nBaseUrl}/webhook/fieldvoice-v69-ai-chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": n8nSecret,
        },
        body: JSON.stringify(body),
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
    console.error("ai-chat error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
