# SETUP — Run ExamBro IG Automation Locally

Step-by-step from a fresh clone to a working dashboard. Order matters — follow top to bottom.

---

## 0. Prerequisites

| Tool | Check | Install |
|---|---|---|
| Python 3.12+ | `python --version` | python.org |
| uv | `uv --version` | https://docs.astral.sh/uv/ |
| Node 20+ / npm | `node --version` | nodejs.org |
| Supabase account | — | https://supabase.com (free tier is fine) |

API keys needed (client-provided — ask the owner, never commit them):
- **Anthropic** (critic + news search) — required for the pipeline
- **OpenAI** (`gpt-image-2` images) — required for image posts
- **Google** (Gemini writer, current default) — required until the bake-off changes it
- **Resend** (email notifications) — optional; backend logs instead of sending when missing

---

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard → **New project**.
2. Name it (e.g. `exambro`), set a strong database password, pick a region close to India (e.g. Mumbai).
3. Wait until the project finishes provisioning.

## 2. Run the schema migration (SQL)

1. In the Supabase dashboard: **SQL Editor → New query**.
2. Open [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql), copy the **entire file**, paste it into the editor.
3. Click **Run**. It should finish without errors.

This creates all 12 tables + enums, enables RLS everywhere, seeds the settings row + 5 starter content pillars, and creates the public `media` storage bucket.

**Verify:** Table Editor → you should see `settings`, `pillars` (5 rows), `topics`, `posts`, etc. Storage → bucket `media` exists.

## 3. Create the login user

Start with a **mock user** for development — the real owner login comes later.

1. Dashboard → **Authentication → Users → Add user → Create new user**.
2. Enter a mock email + password (e.g. `dev@exambro.test` / a throwaway password). Check **Auto confirm email**.

The app treats any authenticated user as the owner (single-user product), so the mock user can drive everything during development.

**Before handover:** create the real owner's email + password the same way, then delete the mock user (Authentication → Users → ⋯ → Delete user).

## 4. Collect the Supabase keys

Dashboard → **Project Settings → API**:

| Value | Goes into |
|---|---|
| Project URL | `SUPABASE_URL` (backend) + `VITE_SUPABASE_URL` (frontend) |
| `anon` public key | `SUPABASE_ANON_KEY` (backend) + `VITE_SUPABASE_ANON_KEY` (frontend) |
| `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` (backend **only** — bypasses RLS, never put in frontend) |

## 5. Backend — configure and run

```powershell
cd backend
uv sync                        # creates .venv and installs everything
copy .env.example .env         # then fill the values (see below)
```

Fill `backend/.env`:

```
SUPABASE_URL=            ← from step 4
SUPABASE_ANON_KEY=       ← from step 4
SUPABASE_SERVICE_ROLE_KEY= ← from step 4

ANTHROPIC_API_KEY=       ← client-provided
OPENAI_API_KEY=          ← client-provided
GOOGLE_API_KEY=          ← client-provided

WRITER_PROVIDER=google   ← leave defaults until the Phase-0 bake-off decides
CRITIC_PROVIDER=anthropic  (writer and critic must stay different families)

TRIGGER_TOKEN=           ← any long random string, e.g. from:
                           powershell: -join ((65..90)+(97..122)+(48..57) | Get-Random -Count 48 | % {[char]$_})
ENABLE_APSCHEDULER=true

RESEND_API_KEY=          ← optional (emails are skipped + logged if empty)
NOTIFY_EMAIL_FROM=
NOTIFY_EMAIL_TO=
DASHBOARD_BASE_URL=http://localhost:5173
```

Run it:

```powershell
uv run uvicorn app.main:app --reload
```

**Verify:**
- http://localhost:8000/health → `{"status":"ok"}`
- http://localhost:8000/docs → interactive API docs
- Boot fails with a `critic ≠ writer` error if both providers are the same — that's intentional.

## 6. Frontend — configure and run

Open a **second terminal**:

```powershell
cd frontend
npm install
copy .env.example .env         # then fill the values
```

Fill `frontend/.env`:

```
VITE_SUPABASE_URL=        ← same Project URL
VITE_SUPABASE_ANON_KEY=   ← same anon key (NOT service_role)
VITE_API_BASE_URL=http://localhost:8000
```

Run it:

```powershell
npm run dev
```

**Verify:** http://localhost:5173 → login screen → sign in with the owner user from step 3 → you land on the **Today** screen (empty until a topic round runs).

## 7. Run the first topic round

The scheduler fires daily at 09:00 IST. To test **right now**, trigger it manually (backend must be running):

```powershell
$token = "<your TRIGGER_TOKEN from backend/.env>"
Invoke-RestMethod -Method Post -Uri http://localhost:8000/trigger -Headers @{ Authorization = "Bearer $token" }
```

Returns `{"status":"accepted"}` immediately; the round runs in the background (news search → 3 topics). Watch the backend logs, then refresh the **Today** screen — 3 topic cards appear.

Full loop test:
1. **Today** → pick a topic (Tap 1) → app jumps to **Review**.
2. Wait for writer ⇄ critic (+ images for a post) — the Review page auto-refreshes; takes a few minutes.
3. **Review** → Approve / Tweak / Reject (Tap 2). Approved → status `saved` (no publishing in Phase 1 — by design).

## 8. Optional — Phase-0 Critic Accuracy Test

Seed the 50 sample posts (via http://localhost:8000/docs → `POST /calibration/seed`, body `{"contents": ["post 1 text", "post 2 text", ...]}`), then use the **Calibration** tab in the dashboard. The owner labels each post blind; the critic's verdict is revealed only after saving. Gate: ≥40/50 agreement.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Backend exits at boot: "critic ≠ writer rule violated" | `WRITER_PROVIDER` equals `CRITIC_PROVIDER` in `backend/.env` — make them different families. |
| 401 on every dashboard action | Frontend using wrong anon key, or you're logged out — sign in again. |
| CORS error in browser console | `DASHBOARD_BASE_URL` in `backend/.env` doesn't match the Vite URL (default `http://localhost:5173`). |
| `/trigger` → 503 | `TRIGGER_TOKEN` empty in `backend/.env`. |
| `/trigger` → `{"skipped": "..."}` in logs | By design: round already exists today, topics still waiting for Tap 1, or a post is in flight. |
| Topics appear but generation hangs | Check backend logs — usually a missing/invalid AI key (Anthropic/Google/OpenAI). |
| No emails | Resend vars empty — backend logs "Email disabled" and continues; fill `RESEND_*` to enable. |
| Images fail | `OPENAI_API_KEY` missing/invalid, or `gpt-image-2` not enabled on the account. |
