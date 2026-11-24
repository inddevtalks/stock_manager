from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect

from .db import Base, engine
from .routers import auth, dashboard, issues, items, members, settings, stationery
from .seed import seed


def _migrate_schema():
    """One-time migration: drop obsolete/wrong-schema tables so create_all recreates them."""
    try:
        _insp = inspect(engine)
        _tables = _insp.get_table_names()
        # Drop stationery_out if it lacks the approval columns.
        if "stationery_out" in _tables:
            try:
                _cols = {c["name"] for c in _insp.get_columns("stationery_out")}
                if "status" not in _cols or "approved_at" not in _cols:
                    with engine.connect() as _conn:
                        _conn.execute(text("DROP TABLE IF EXISTS stationery_out"))
                        _conn.commit()
            except Exception:
                pass
        # Drop obsolete members table (members are now users).
        if "members" in _tables:
            try:
                with engine.connect() as _conn:
                    _conn.execute(text("DROP TABLE IF EXISTS stationery_out"))
                    _conn.execute(text("DROP TABLE IF EXISTS members"))
                    _conn.commit()
            except Exception:
                pass
    except Exception:
        pass


def _init_db():
    """Run schema migration + table creation exactly once."""
    _migrate_schema()
    try:
        Base.metadata.create_all(bind=engine, checkfirst=True)
    except Exception:
        # Table may already exist (MySQL has_table quirk) -- safe to ignore.
        pass


# Serverless-safe: run at module-import time so Vercel functions are ready
# immediately after the module loads.
_init_db()

# Only seed when explicitly enabled or on first run (guarded inside seed()).
if not os.getenv("SKIP_SEED"):
    seed()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB already initialised above; nothing extra needed at lifespan start.
    yield


app = FastAPI(
    title="Stock Manager API",
    description="Stock and inventory management backend for the Stock Manager SaaS app.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(items.router)
app.include_router(issues.router)
app.include_router(dashboard.router)
app.include_router(settings.router)
app.include_router(members.router)
app.include_router(stationery.router)


@app.get("/api/health", tags=["system"])
def health():
    return {"status": "ok", "service": "stock-manager"}


# Serve the built React app (production) if it exists.
DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if DIST_DIR.exists() and not os.getenv("VERCEL"):
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        candidate = (DIST_DIR / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(DIST_DIR.resolve())):
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
