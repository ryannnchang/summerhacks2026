from collections.abc import Iterator

from sqlalchemy import create_engine, inspect
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


def _backfill_missing_columns() -> None:
    """Poor-man's migration: ADD COLUMN for model columns missing from the db.

    `create_all()` only creates missing *tables* — it never alters existing ones,
    and there is no Alembic here. Nullable columns can always be added safely, so
    this keeps an existing database working across additive schema changes.

    Runs on Postgres as well as SQLite. It used to bail out on anything that
    wasn't SQLite, which meant a new nullable column reached a fresh clone but
    never reached the shared Supabase database — every query then failed with
    "column does not exist" until someone altered the table by hand.

    Still only additive: renames, type changes and non-nullable columns need a
    real migration.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue  # create_all is about to build it whole
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing or not column.nullable:
                    continue
                col_type = column.type.compile(engine.dialect)
                conn.exec_driver_sql(
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}'
                )


def init_db() -> None:
    from app import models  # noqa: F401  (register tables)

    _backfill_missing_columns()
    Base.metadata.create_all(bind=engine)
