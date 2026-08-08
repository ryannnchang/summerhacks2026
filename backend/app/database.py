from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    # Supabase's session pooler allows 15 clients TOTAL, shared by every running
    # backend — each teammate's dev server counts against it. SQLAlchemy's
    # default (5 + 10 overflow) lets one process hog the whole budget; capping
    # at 5 lets three backends coexist. pre_ping recovers from pooler resets.
    **(
        {}
        if settings.database_url.startswith("sqlite")
        else {"pool_size": 3, "max_overflow": 2, "pool_pre_ping": True, "pool_recycle": 300}
    ),
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _backfill_sqlite_columns() -> None:
    """Poor-man's migration: ADD COLUMN for model columns missing from the db.

    `create_all()` only creates missing *tables* — it never alters existing ones,
    and there is no Alembic here. Nullable columns can always be added safely, so
    this keeps an existing grass.db working across additive schema changes.
    """
    if not settings.database_url.startswith("sqlite"):
        return
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            info = conn.exec_driver_sql(f"PRAGMA table_info('{table.name}')").fetchall()
            if not info:
                continue  # create_all is about to build it whole
            existing = {row[1] for row in info}
            for column in table.columns:
                if column.name in existing or not column.nullable:
                    continue
                col_type = column.type.compile(engine.dialect)
                conn.exec_driver_sql(
                    f"ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}"
                )


def init_db() -> None:
    from app import models  # noqa: F401  (register tables)

    _backfill_sqlite_columns()
    Base.metadata.create_all(bind=engine)
