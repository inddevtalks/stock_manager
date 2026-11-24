import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent

# In Vercel serverless / AWS Lambda, only /tmp is writable
if os.getenv("VERCEL"):
    DATA_DIR = Path("/tmp/stockmanager_data")
else:
    DATA_DIR = BASE_DIR / "data"

try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    DATA_DIR = Path("/tmp/stockmanager_data")
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def _load_env_fallback():
    """Look for DATABASE_URL in .env.local or .env if not set in os.environ."""
    candidates = [
        BASE_DIR.parent / ".env.local",
        BASE_DIR.parent / ".env",
        BASE_DIR / ".env.local",
        BASE_DIR / ".env",
    ]
    for env_path in candidates:
        if env_path.exists():
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("DATABASE_URL="):
                            val = line.split("=", 1)[1].strip("'\"")
                            if val:
                                os.environ["DATABASE_URL"] = val
                                return val
            except Exception:
                pass
    return None


def _database_url() -> str:
    url = os.getenv("DATABASE_URL") or _load_env_fallback()
    if url:
        # Standardize postgres protocol
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)

        # In SQLAlchemy 2.0, if psycopg (v3) is available, postgresql:// works.
        # Otherwise fall back to psycopg2 driver (postgresql+psycopg2://).
        if url.startswith("postgresql://"):
            try:
                import psycopg  # noqa: F401
            except ImportError:
                url = url.replace("postgresql://", "postgresql+psycopg2://", 1)

        return url
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/stockmanager.db"
    return f"sqlite:///{DATA_DIR / 'stockmanager.db'}"


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    # MySQL (PyMySQL) needs an unverified SSL context for cloud providers
    if "mysql" in url:
        try:
            import ssl as _ssl
            _ctx = _ssl.create_default_context()
            _ctx.check_hostname = False
            _ctx.verify_mode = _ssl.CERT_NONE
            return {"ssl": _ctx}
        except Exception:
            return {}
    # PostgreSQL handles SSL via query parameters (e.g. ?sslmode=require)
    return {}


def _engine_kwargs(url: str) -> dict:
    """Return extra engine kwargs tuned for the target database."""
    if url.startswith("sqlite"):
        return {}
    # Connection pooling for PostgreSQL / MySQL
    return {
        "pool_size": 5,
        "max_overflow": 10,
        "pool_pre_ping": True,          # drops stale connections cleanly
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

# Enable WAL mode for SQLite
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
