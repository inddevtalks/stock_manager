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
    args = {}
    # Optional SSL CA cert (paste the PEM content into DATABASE_SSL_CA env var).
    ssl_ca = os.getenv("DATABASE_SSL_CA")
    if ssl_ca:
        ca_path = "/tmp/db_ca.pem" if os.getenv("VERCEL") else str(DATA_DIR / "db_ca.pem")
        try:
            with open(ca_path, "w", encoding="utf-8") as f:
                f.write(ssl_ca)
            args["ssl"] = {"ca": ca_path}
        except OSError:
            pass
    return args


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
