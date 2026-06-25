"""
Apply migration 0002 via Supabase Management API.
Uses the service role key as the auth token.
Run: python run_migration.py
"""
import httpx
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from app.config import get_settings

s = get_settings()
project_ref = s.supabase_url.split('.')[0].replace('https://', '')

SQL = """
alter table settings add column if not exists bf_brand_name text;
alter table settings add column if not exists content_language text not null default 'hi';
"""

# Supabase Management API: POST /v1/projects/{ref}/database/query
mgmt_url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"

# This endpoint requires a Personal Access Token (PAT), not service role key.
# If you have a PAT set in env as SUPABASE_PAT, we'll use it.
pat = os.environ.get("SUPABASE_PAT", "")

if pat:
    resp = httpx.post(
        mgmt_url,
        headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
        json={"query": SQL},
        timeout=30,
    )
    print(f"Status: {resp.status_code}")
    print(resp.text)
else:
    print("No SUPABASE_PAT env var found.")
    print()
    print("Please run this SQL in your Supabase Dashboard > SQL Editor:")
    print("=" * 60)
    print(SQL.strip())
    print("=" * 60)
    print()
    print("Or set SUPABASE_PAT=<your-personal-access-token> and re-run this script.")
    print("Get your PAT from: https://supabase.com/dashboard/account/tokens")
