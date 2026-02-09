# V69 Sandbox Configuration

**Created:** 2026-02-08
**Note:** This is George's testing sandbox — safe to modify freely.

## Supabase Project (NEW — Isolated)

- **Project:** FieldVoice-Pro-v69
- **ID:** bdqfpemylkqnmeqaoere
- **URL:** https://bdqfpemylkqnmeqaoere.supabase.co
- **Dashboard:** https://supabase.com/dashboard/project/bdqfpemylkqnmeqaoere
- **Anon Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcWZwZW15bGtxbm1lcWFvZXJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MDE1NjAsImV4cCI6MjA4NjE3NzU2MH0.Jj-f3dmZjAQRAC-6pLqGhb__U9XCxXQBwoGsJBYlLdw
- **Service Role Key:** eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcWZwZW15bGtxbm1lcWFvZXJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYwMTU2MCwiZXhwIjoyMDg2MTc3NTYwfQ.oN-mwTSrdM-ylvdwZfhG8s8TwICBc6r_5EsyMh5H4Bw
- **DB Password:** FV69sandbox2026!
- **Region:** us-east-1 (North Virginia)
- **Pooler:** aws-1-us-east-1.pooler.supabase.com:5432

⚠️ This is a completely separate project from production (wejwhplqnhciyxbinivx). No shared data.

## Tables (11 total — standard names, no prefix)

| # | Table | Notes |
|---|---|---|
| 1 | `user_profiles` | device_id UNIQUE |
| 2 | `projects` | Main projects table |
| 3 | `contractors` | FK → projects |
| 4 | `reports` | FK → projects |
| 5 | `report_submissions` | FK → projects, user_profiles |
| 6 | `ai_responses` | FK → reports |
| 7 | `final_reports` | FK → reports (UNIQUE) |
| 8 | `photos` | FK → reports |
| 9 | `report_activities` | FK → report_submissions, contractors |
| 10 | `report_operations` | FK → report_submissions, contractors |
| 11 | `report_equipment` | FK → report_submissions, contractors |

## Storage Buckets (3 total — standard names)

| Bucket | Public |
|---|---|
| `report-photos` | ✅ |
| `project-logos` | ✅ |
| `report-pdfs` | ✅ |

All buckets have full anon CRUD policies.

## n8n Workflows (ACTIVE — production webhooks)

| Workflow | ID | Webhook URL |
|---|---|---|
| Refine Report v6.9 | `s2SuH3Xklenn04Mq` | `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-report` |
| Project Extractor v6.9 | `tDsPjNQYfyUHno6y` | `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-project-extractor` |
| Refine Text v6.9 | `X1DozSLoGtQSYr91` | `https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-refine-text` |

## Local Repo

- **Path:** ~/projects/FieldVoice-Pro-v6.9/
- **Cloned from:** jacksonkoerner/FieldVoice-Pro-v6.9
- **Git remote:** REMOVED (local only, no push)
