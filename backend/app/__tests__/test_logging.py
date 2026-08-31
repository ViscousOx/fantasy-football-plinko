import logging
import os
from datetime import UTC, datetime

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from app.db import async_session_factory, init_db
from app.main import app
from app.models.orm import Player, PlinkoSession, RosterSlot


async def _seed_session(db: AsyncSession) -> tuple[int, int, int]:
    now = datetime.now(UTC)
    plinko_session = PlinkoSession(
        sleeper_draft_id="test-draft",
        created_at=now,
    )
    player = Player(
        sleeper_id="4046",
        first_name="Saquon",
        last_name="Barkley",
        position="RB",
        team="NYG",
        active=True,
        synced_at=now,
    )
    db.add(plinko_session)
    db.add(player)
    await db.flush()

    slot = RosterSlot(
        session_id=plinko_session.id,
        position="RB",
        slot_order=1,
    )
    db.add(slot)
    await db.commit()
    await db.refresh(plinko_session)
    await db.refresh(player)
    await db.refresh(slot)
    return plinko_session.id, slot.id, player.id


async def test_position_pick_emits_structured_log(caplog: pytest.LogCaptureFixture) -> None:
    await init_db()

    async with async_session_factory() as db:
        session_id, slot_id, _ = await _seed_session(db)

    caplog.set_level(logging.INFO, logger="app.api.picks")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/sessions/{session_id}/position-pick",
            json={"roster_slot_id": slot_id},
        )

    assert response.status_code == 200
    pick_logs = [r for r in caplog.records if r.getMessage() == "position_pick"]
    assert len(pick_logs) == 1
    record = pick_logs[0]
    assert record.session_id == session_id
    assert isinstance(record.duration_ms, float)
    assert record.outcome == "RB"


async def test_healthz_emits_request_log(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.INFO, logger="app.main")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/healthz")

    assert response.status_code == 200
    request_logs = [r for r in caplog.records if r.getMessage() == "request"]
    assert len(request_logs) >= 1
    assert request_logs[0].path == "/healthz"
