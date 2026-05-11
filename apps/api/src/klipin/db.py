from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from klipin.config import settings

engine = create_async_engine(settings.database_url, echo=False)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# SQLite tuning untuk VPS dengan RAM besar. Listener jalan setiap kali pool
# bikin koneksi baru — sekali per connection, gak per query.
# - journal_mode=WAL: concurrent reader + 1 writer tanpa lock-the-world
# - synchronous=NORMAL: fsync tiap commit batch (WAL safe), bukan tiap write
# - cache_size=-524288: 512MB page cache (negative = KB), hot data di RAM
# - mmap_size=2GB: mmap DB file biar OS page cache + zero-copy reads
# - temp_store=MEMORY: temp tables di RAM (sort, group by)
# - foreign_keys=ON: SQLite default OFF, app pakai FK constraints jadi enforce
if settings.database_url.startswith("sqlite"):

    @event.listens_for(engine.sync_engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA cache_size=-524288")
        cursor.execute("PRAGMA mmap_size=2147483648")
        cursor.execute("PRAGMA temp_store=MEMORY")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
