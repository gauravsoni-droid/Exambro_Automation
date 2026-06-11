# ExamBro Instagram Automation

In-house web platform that researches, plans, and writes Instagram content for ExamBro (@exambro.app) automatically. The owner gives two approvals per post (pick a topic → approve the finished post). Approved posts are saved to the database — no auto-publishing yet.

**Hindi-only content** (Devanagari), language kept as a parameter for future English. Image text is always English.

## Repo layout

```
backend/              FastAPI orchestrator (agents, pipeline, scheduler, API)
frontend/             React/TS dashboard (Vite + supabase-js auth)
supabase/migrations/  Versioned Postgres schema (never hand-edit the DB)
docs/                 Locked specs and plans (source of truth)
```

## Docs (source of truth)

| Doc | What |
|---|---|
| `docs/ExamBro_Final_Spec_and_Plan.md` | Locked decisions |
| `PRD.md` / `TRD.md` | Product / technical requirements |
| `Appflow.md` | State machine + flows |
| `Backend_Schema.md` | DB schema reference |
| `Implementation_Plan.md` | Build sequence + working agreement |

## Quick start (local dev)

> Full step-by-step (Supabase SQL → first post): **[SETUP.md](SETUP.md)**

### 1. Supabase
Create a project at supabase.com → run `supabase/migrations/0001_initial_schema.sql` in the SQL editor (or `supabase db push` with the CLI). Create the owner user under Authentication → email + password. Create a public storage bucket named `media`.

### 2. Backend (uv)
```powershell
cd backend
uv sync
copy .env.example .env         # fill values
uv run uvicorn app.main:app --reload
```
API on http://localhost:8000 — docs at `/docs`. Manual pipeline trigger: `POST /trigger` with `Authorization: Bearer <TRIGGER_TOKEN>`.

### 3. Frontend
```powershell
cd frontend
npm install
copy .env.example .env         # fill VITE_ values
npm run dev
```
Dashboard on http://localhost:5173.

## Working agreement (2-dev team)

GitHub Flow · `main` protected (1 PR review) · feature branches `feat/...`, `fix/...` · conventional commits · tasks live as GitHub Issues in build order, self-assigned · WIP pushed daily · no knowledge silos. See `Implementation_Plan.md`.

## Secrets

`.env` files are gitignored from the first commit. Each app owns its env: `backend/.env` (from `backend/.env.example`) and `frontend/.env` (from `frontend/.env.example`, `VITE_`-prefixed). Examples list key names only. Client-provided keys are shared privately — never via repo or issues.
