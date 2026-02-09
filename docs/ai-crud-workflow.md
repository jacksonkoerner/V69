# AI CRUD Workflow — FieldVoice v69

## n8n Workflow: FieldVoice v69 AI Chat
- **ID:** t7vzrP6BWJC2Lm0r
- **Webhook:** https://advidere.app.n8n.cloud/webhook/fieldvoice-v69-ai-chat
- **Status:** Active

## Flow
```
Webhook → Prepare (intent detection) → Is CRUD?
  ├── true  → Supabase CRUD (direct DB via HTTP)
  └── false → Claude (Sonnet) → Format Chat Response
```

## Supported CRUD Commands
| Command Pattern | Action | Example |
|---|---|---|
| Create/add/new project called X | create_project | "Create a new project called Highway 90 Extension" |
| What/show/list projects | list_projects | "What projects do I have?" |
| Add contractor X to Y | add_contractor | "Add contractor ABC Concrete to Highway 90" |
| Show/get reports (today) | list_reports | "Show me today's reports" |
| Delete project X | delete_project | "Delete project Highway 90" |

## Supabase Connection
- **URL:** https://bdqfpemylkqnmeqaoere.supabase.co
- **Auth:** Service role key (stored in Code node)
- **Tables used:** projects, reports

## Test Results (2026-02-09)
- ✅ List projects — returns project names, numbers, contractor counts
- ✅ Create project — inserts with active status, empty contractors
- ✅ Add contractor — finds project by name, appends to contractors JSON array
- ✅ Show reports — lists with project name, date, status, inspector
- ✅ Delete project — finds by name match, removes
- ✅ Regular chat — routes to Claude Sonnet for conversational responses
