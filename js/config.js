// FieldVoice Pro - Shared Configuration
// This is the single source of truth for Supabase credentials and app constants

const SUPABASE_URL = 'https://bdqfpemylkqnmeqaoere.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcWZwZW15bGtxbm1lcWFvZXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDE1NjAsImV4cCI6MjA4NjE3NzU2MH0.Jj-f3dmZjAQRAC-6pLqGhb__U9XCxXQBwoGsJBYlLdw';

// n8n Webhook API Key (SEC-01: authenticate all webhook calls)
const N8N_WEBHOOK_API_KEY = 'fvp-n8n-webhook-key-2026';

// Initialize Supabase client (requires @supabase/supabase-js to be loaded first)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
