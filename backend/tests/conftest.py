import os

os.environ.setdefault("ENVIRONMENT", "test")
from app.core.database_safety import (
    validated_test_database_system_identifier,
    validated_test_database_url,
    verify_test_database_identity,
)

test_database_url = validated_test_database_url()
test_database_system_identifier = validated_test_database_system_identifier()
verify_test_database_identity(test_database_url, test_database_system_identifier)
os.environ["DATABASE_URL"] = test_database_url
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("JWT_ISSUER", "hikari-sense")
os.environ.setdefault("JWT_AUDIENCE", "hikari-sense-api")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core import database as database_module
from app.core.config import get_settings
from app.core.database import Base, SessionLocal, configure_engine
from app.core.security import ROLES, issue_token
from app.main import app
from app.models.source import Source
from app.models.user import Role, User
from app.core.config import get_settings as _gs

get_settings.cache_clear()
engine = configure_engine(os.environ["DATABASE_URL"])
database_module.engine = engine
SessionLocal = database_module.SessionLocal
Base.metadata.create_all(bind=engine)


@pytest.fixture(autouse=True)
def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def seed_roles(db):
    for name in ROLES:
        if not db.execute(select(Role).where(Role.name == name)).scalar_one_or_none():
            db.add(Role(name=name))
    if not db.execute(select(Source).where(Source.code == "SRC-CITIZEN")).scalar_one_or_none():
        db.add(
            Source(
                code="SRC-CITIZEN",
                name="Citizen reports",
                kind="Citizen",
                source_type="citizen",
                category="citizen",
                reliability=0.45,
                is_live=True,
                health_label="CONNECTED",
            )
        )
    db.commit()


@pytest.fixture
def client():
    return TestClient(app)


def token_for(db, username: str, role: str) -> str:
    user = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not user:
        user = User(username=username, display_name=username)
        db.add(user)
        db.flush()
        r = db.execute(select(Role).where(Role.name == role)).scalar_one()
        user.roles.append(r)
        db.commit()
        db.refresh(user)
    return issue_token(str(user.id), username, [role])


def auth(client: TestClient, db, role: str, username: str | None = None):
    t = token_for(db, username or f"{role}.test", role)
    return {"Authorization": f"Bearer {t}"}
