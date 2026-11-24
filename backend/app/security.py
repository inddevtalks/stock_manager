import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import DATA_DIR, get_db
from .models import User

TOKEN_TTL_HOURS = int(os.getenv("TOKEN_TTL_HOURS", "72"))
ALGORITHM = "HS256"


def _load_secret() -> str:
    env_secret = os.getenv("SECRET_KEY")
    if env_secret:
        return env_secret
    secret_file = Path(DATA_DIR) / ".secret"
    if secret_file.exists():
        return secret_file.read_text().strip()
    secret = secrets.token_hex(32)
    secret_file.write_text(secret)
    return secret


SECRET_KEY = _load_secret()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 150_000).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 150_000).hex()
    return hmac.compare_digest(candidate, digest)


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub":   str(user.id),
        "email": user.email,
        "name":  user.name,
        "role":  user.role,
        "iat":   now,
        "exp":   now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode_token_payload(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        raise unauthorized


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    """
    Validate the JWT and return the User ORM object (fetched from DB).

    The DB lookup is kept here for correctness -- routes that mutate the user
    (update_me, change_password) need a session-managed object.  Read-only
    routes that only need user.id / user.name / user.role benefit from the
    indexed PK lookup which is essentially free on any DB.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or not credentials.credentials:
        raise unauthorized

    payload = _decode_token_payload(credentials.credentials)
    user_id = int(payload.get("sub", 0))
    if not user_id:
        raise unauthorized

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized
    return user
