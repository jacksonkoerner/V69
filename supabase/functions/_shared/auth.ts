// FieldVoice Pro — Shared Edge Function Auth & Utilities
// Uses getClaims() for local JWT verification (no Auth API round-trip)
// Compatible with Supabase JWT Signing Keys (ES256)

import { createClient } from "npm:@supabase/supabase-js@2"

// --- CORS Headers ---
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// --- JSON Error Response ---
export function jsonError(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
}

// --- JSON Success Response ---
export function jsonResponse(data: string, status: number, contentType?: string): Response {
  return new Response(data, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": contentType || "application/json",
    },
  })
}

// --- Auth Result Type ---
export interface AuthResult {
  userId: string
  email?: string
  claims: Record<string, unknown>
}

// --- Validate JWT via getClaims() ---
// Returns user claims or throws — call inside try/catch
export async function validateAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw { status: 401, message: "Missing or invalid Authorization header" }
  }

  const token = authHeader.replace("Bearer ", "")
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!
  )

  const { data, error } = await supabase.auth.getClaims(token)
  if (error || !data?.claims) {
    throw { status: 401, message: "Invalid or expired token" }
  }

  const claims = data.claims as Record<string, unknown>
  return {
    userId: claims.sub as string,
    email: claims.email as string | undefined,
    claims,
  }
}

// --- n8n Proxy Fetch with Timeout ---
export async function fetchN8n(
  webhookPath: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: BodyInit
    timeoutMs?: number
  } = {}
): Promise<Response> {
  const n8nBaseUrl = Deno.env.get("N8N_BASE_URL")!
  const n8nSecret = Deno.env.get("N8N_WEBHOOK_SECRET")!
  const timeoutMs = options.timeoutMs ?? 120000 // 2 min default

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${n8nBaseUrl}/webhook/${webhookPath}`,
      {
        method: options.method || "POST",
        headers: {
          "X-API-Key": n8nSecret,
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      }
    )
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof DOMException && error.name === "AbortError") {
      throw { status: 504, message: "Upstream timeout — n8n did not respond in time" }
    }
    throw error
  }
}
