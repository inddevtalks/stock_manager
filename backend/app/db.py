import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        # Allow postgres:// shorthand used by some providers (Neon, Railway, etc.)
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/stockmanager.db"
    return f"sqlite:///{DATA_DIR / 'stockmanager.db'}"


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    # Managed providers (Neon, Aiven, Railway) require TLS.
    try:
        import ssl as _ssl
        _ctx = _ssl.create_default_context()
        _ctx.check_hostname = False
        _ctx.verify_mode = _ssl.CERT_NONE
        return {"ssl": _ctx}
    except Exception:
        return {}


def _engine_kwargs(url: str) -> dict:
    """Return extra engine kwargs tuned for the target database."""
    if url.startswith("sqlite"):
        # SQLite is embedded -- no pool tuning needed.
        return {}
    # For PostgreSQL / MySQL (Neon, Railway, PlanetScale ...) use a small pool
    # with pre-ping so stale connections are dropped instantly instead of
    # causing a 30-second timeout on the first request after idle.
    return {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,          # cheapest fix for "server closed connection"
        "pool_recycle": 1800,           # recycle connections every 30 min
    }


DB_PATH = None
_DATABASE_URL = _database_url()
engine = create_engine(
    _DATABASE_URL,
    connect_args=_connect_args(_DATABASE_URL),
    future=True,
    **_engine_kwargs(_DATABASE_URL),
)

# Enable WAL mode for SQLite -- dramatically speeds up concurrent reads.
if _DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA cache_size=-64000")   # 64 MB page cache
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
