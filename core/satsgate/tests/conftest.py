"""Shared test configuration — sets env vars BEFORE any app imports."""
import os
import tempfile

os.environ["SATSGATE_WALLET_MODE"] = "mock"
os.environ["SATSGATE_RL_ENABLED"] = "0"
os.environ["SATSGATE_DEV_MODE"] = "1"
os.environ["SATSGATE_ADMIN_TOKEN"] = "test-admin-token"
os.environ["FREE_CREDITS"] = "10"

# Create a temp directory for the shared SQLite database.
# This must be set at module level so test_e2e.py's module-level code
# (which runs during pytest collection) uses the correct path.
_TEST_DIR = tempfile.mkdtemp(prefix="satsgate_test_")
_DB_PATH = os.path.join(_TEST_DIR, "test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_PATH}"

import atexit
import shutil
atexit.register(lambda: shutil.rmtree(_TEST_DIR, ignore_errors=True))

import jwt as pyjwt
from app.config import JWT_SECRET

import pytest
from sqlalchemy import create_engine
from app.models import Base

# Import ALL model modules so they register on Base.metadata
# before we create tables with sync SQLAlchemy.
from app import webhooks  # noqa: F401  — registers WebhookConfig, WebhookDelivery
from app import alerts    # noqa: F401  — registers AlertConfig

# Create tables with sync SQLAlchemy at module load time
# (avoids aiosqlite + run_sync deadlock in async engine).
_sync_engine = create_engine(f"sqlite:///{_DB_PATH}")
Base.metadata.create_all(_sync_engine)
_sync_engine.dispose()


@pytest.fixture(autouse=True)
def _ensure_wallet():
    """Ensure WALLET is initialized before each test (other fixtures may reset it via lifespan shutdown)."""
    from app import main as _m
    from app.main import _get_wallet
    if _m.WALLET is None:
        _m.WALLET = _get_wallet()
    yield


@pytest.fixture(scope="session", autouse=True)
def _ensure_db():
    """Ensure tables exist (idempotent — tables already created at module level)."""
    from sqlalchemy import create_engine
    from app.models import Base
    engine = create_engine(f"sqlite:///{_DB_PATH}")
    Base.metadata.create_all(engine)
    engine.dispose()
    yield


def make_token(pubkey: str) -> str:
    return pyjwt.encode({"sub": pubkey, "exp": 9999999999}, JWT_SECRET, algorithm="HS256")
