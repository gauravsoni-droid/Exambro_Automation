"""Apply migration 0002 — add bf_brand_name and content_language to settings table."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.config import get_settings
from supabase import create_client

s = get_settings()
db = create_client(s.supabase_url, s.supabase_service_role_key)

sql = """
alter table settings add column if not exists bf_brand_name text;
alter table settings add column if not exists content_language text not null default 'hi';
"""

# Supabase Python client doesn't support raw DDL — use the REST API via rpc
# We'll use the postgrest client to run DDL through a postgres function
# Since there's no direct way, we check if columns exist by reading the row
rows = db.table("settings").select("*").limit(1).execute().data
if rows:
    row = rows[0]
    if "bf_brand_name" in row:
        print("bf_brand_name column already exists")
    else:
        print("bf_brand_name column MISSING — please run the SQL migration manually in Supabase dashboard:")
        print("  alter table settings add column if not exists bf_brand_name text;")

    if "content_language" in row:
        print("content_language column already exists")
        print(f"  current value: {row.get('content_language')}")
    else:
        print("content_language column MISSING — please run the SQL migration manually in Supabase dashboard:")
        print("  alter table settings add column if not exists content_language text not null default 'hi';")
else:
    print("No settings row found")

print("\nMigration SQL to run in Supabase Dashboard > SQL Editor:")
print(sql)
