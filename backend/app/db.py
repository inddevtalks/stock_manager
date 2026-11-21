import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _database_url() -> str:
    url = os.getenv("DATABASE_URL")
    if url:
        # Allow postgres:// shorthand used by some providers.
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url
    if os.getenv("VERCEL"):
        return "sqlite:////tmp/stockmanager.db"
    return f"sqlite:///{DATA_DIR / 'stockmanager.db'}"


def _connect_args(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"check_same_thread": False}
    # Managed providers (TiDB/Aiven) require TLS. Use an unverified context so the
    # connection works regardless of the CA bundle shipped in the runtime.
    try:
        import ssl as _ssl
        _ctx = _ssl.create_default_context()
        _ctx.check_hostname = False
        _ctx.verify_mode = _ssl.CERT_NONE
        return {"ssl": _ctx}
    except Exception:
        return {}


DB_PATH = None
_DATABASE_URL = _database_url()
engine = create_engine(
    _DATABASE_URL,
    connect_args=_connect_args(_DATABASE_URL),
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()