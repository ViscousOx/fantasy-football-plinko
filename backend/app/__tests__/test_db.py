import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from app.db import engine, get_session, init_db  # noqa: E402


async def test_init_db_creates_all_tables() -> None:
    from app.models.orm import Base

    await init_db()

    async with engine.connect() as conn:
        table_names = await conn.run_sync(
            lambda sync_conn: sync_conn.dialect.get_table_names(sync_conn)
        )

    expected = {table.name for table in Base.metadata.sorted_tables}
    assert expected.issubset(set(table_names))


async def test_get_session_yields_live_async_session() -> None:
    await init_db()

    @asynccontextmanager
    async def session_context() -> AsyncIterator[AsyncSession]:
        gen = get_session()
        session = await gen.__anext__()
        try:
            yield session
        finally:
            await gen.aclose()

    async with session_context() as session:
        assert isinstance(session, AsyncSession)
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
