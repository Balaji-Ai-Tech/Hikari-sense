from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


engine: Engine
SessionLocal: sessionmaker[Session]


def _make_engine(url: str) -> Engine:
    parsed_url = make_url(url)
    if parsed_url.get_backend_name() != "postgresql":
        raise ValueError("HIKARI SENSE requires PostgreSQL; SQLite is not supported.")
    if parsed_url.drivername in {"postgres", "postgresql"}:
        parsed_url = parsed_url.set(drivername="postgresql+psycopg")
    eng = create_engine(parsed_url, pool_pre_ping=True)
    if eng.dialect.name == "postgresql":

        @event.listens_for(eng, "connect")
        def _enable_postgis(dbapi_conn, _connection_record):  # type: ignore[no-untyped-def]
            try:
                with dbapi_conn.cursor() as cur:
                    cur.execute("CREATE EXTENSION IF NOT EXISTS postgis")
            except Exception:
                try:
                    dbapi_conn.rollback()
                except Exception:
                    pass

    return eng


def configure_engine(url: str | None = None) -> Engine:
    global engine, SessionLocal
    engine = _make_engine(url or get_settings().database_url)
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)
    return engine


configure_engine()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ping_db() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
