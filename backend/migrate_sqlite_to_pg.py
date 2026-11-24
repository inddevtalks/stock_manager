import sqlite3
import os
import sys
from pathlib import Path
from sqlalchemy import text
from app.db import engine, _DATABASE_URL

sqlite_path = Path(__file__).resolve().parent / "data" / "stockmanager.db"
if not sqlite_path.exists():
    print(f"SQLite DB not found at {sqlite_path}")
    sys.exit(1)

print(f"Reading from SQLite: {sqlite_path}")
print(f"Writing to PostgreSQL (Neon)")

sqlite_conn = sqlite3.connect(sqlite_path)
sqlite_conn.row_factory = sqlite3.Row
cur = sqlite_conn.cursor()

tables = [
    "settings",
    "users",
    "members",
    "items",
    "movements",
    "issues",
    "stationery_items",
    "stationery_fields",
    "stationery_out",
]

with engine.begin() as pg_conn:
    for table in tables:
        try:
            cur.execute(f"SELECT * FROM {table}")
            rows = [dict(r) for r in cur.fetchall()]
            if not rows:
                print(f"  {table}: 0 rows (skipped)")
                continue

            print(f"  Migrating {table} ({len(rows)} rows)...")

            cols = list(rows[0].keys())
            cols_str = ", ".join(f'"{c}"' for c in cols)
            vals_str = ", ".join(f":{c}" for c in cols)

            for row in rows:
                stmt = text(f"""
                    INSERT INTO "{table}" ({cols_str})
                    VALUES ({vals_str})
                    ON CONFLICT (id) DO UPDATE SET
                    {', '.join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c != 'id')}
                """)
                pg_conn.execute(stmt, row)

            try:
                pg_conn.execute(text(f"""
                    SELECT setval(
                        pg_get_serial_sequence('{table}', 'id'),
                        COALESCE((SELECT MAX(id) FROM "{table}"), 1),
                        true
                    );
                """))
            except Exception:
                pass

            print(f"  [OK] {table}: {len(rows)} rows migrated.")
        except Exception as e:
            print(f"  [ERROR] {table}: {e}")

sqlite_conn.close()
print("\nMigration completed successfully!")
