import os
from datetime import UTC, datetime

import pytest
import respx

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from app.db import async_session_factory, engine  # noqa: E402
from app.models.orm import Base, DraftPicksCache, PlinkoSession, Player  # noqa: E402
from app.services.availability import (  # noqa: E402
    FLEX_POSITIONS,
    VALID_POSITIONS,
    get_available_players,
)


@pytest.fixture(autouse=True)
async def fresh_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


async def _seed_availability_fixtures() -> int:
    now = datetime.now(UTC)
    session = PlinkoSession(sleeper_draft_id="test-draft", created_at=now)
    players = [
        Player(
            sleeper_id="qb1",
            first_name="Aaron",
            last_name="Rodgers",
            position="QB",
            team="NYJ",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="rb1",
            first_name="Saquon",
            last_name="Barkley",
            position="RB",
            team="PHI",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="rb2",
            first_name="Christian",
            last_name="McCaffrey",
            position="RB",
            team="SF",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="wr1",
            first_name="Justin",
            last_name="Jefferson",
            position="WR",
            team="MIN",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="te1",
            first_name="Travis",
            last_name="Kelce",
            position="TE",
            team="KC",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="k1",
            first_name="Justin",
            last_name="Tucker",
            position="K",
            team="BAL",
            active=True,
            synced_at=now,
        ),
        Player(
            sleeper_id="rb3",
            first_name="Zach",
            last_name="Charbonnet",
            position="RB",
            team="SEA",
            active=False,
            synced_at=now,
        ),
    ]

    async with async_session_factory() as db:
        db.add(session)
        db.add_all(players)
        await db.flush()
        db.add(
            DraftPicksCache(
                session_id=session.id,
                sleeper_player_id="rb1",
                pick_no=1,
            )
        )
        await db.commit()
        return session.id


async def test_get_available_players_filters_by_position_and_excludes_drafted() -> None:
    session_id = await _seed_availability_fixtures()

    async with async_session_factory() as db:
        available = await get_available_players(db, session_id, "RB")

    sleeper_ids = {player.sleeper_id for player in available}
    assert sleeper_ids == {"rb2"}
    assert all(player.position == "RB" for player in available)


async def test_get_available_players_flex_includes_rb_wr_te_union() -> None:
    session_id = await _seed_availability_fixtures()

    async with async_session_factory() as db:
        available = await get_available_players(db, session_id, "FLEX")

    positions = {player.position for player in available}
    sleeper_ids = {player.sleeper_id for player in available}

    assert positions.issubset(set(FLEX_POSITIONS))
    assert sleeper_ids == {"rb2", "wr1", "te1"}
    assert "rb1" not in sleeper_ids


async def test_get_available_players_sorted_by_last_name_then_first_name() -> None:
    now = datetime.now(UTC)

    async with async_session_factory() as db:
        session = PlinkoSession(sleeper_draft_id="sort-draft", created_at=now)
        db.add(session)
        db.add_all(
            [
                Player(
                    sleeper_id="wr-a",
                    first_name="Tyreek",
                    last_name="Hill",
                    position="WR",
                    active=True,
                    synced_at=now,
                ),
                Player(
                    sleeper_id="wr-b",
                    first_name="Stefon",
                    last_name="Diggs",
                    position="WR",
                    active=True,
                    synced_at=now,
                ),
                Player(
                    sleeper_id="wr-c",
                    first_name="Amon-Ra",
                    last_name="St. Brown",
                    position="WR",
                    active=True,
                    synced_at=now,
                ),
            ]
        )
        await db.commit()
        await db.refresh(session)

        available = await get_available_players(db, session.id, "WR")

    names = [(player.last_name, player.first_name) for player in available]
    assert names == sorted(names)


@respx.mock
async def test_get_available_players_reads_only_local_tables() -> None:
    session_id = await _seed_availability_fixtures()

    async with async_session_factory() as db:
        available = await get_available_players(db, session_id, "QB")

    assert len(available) == 1
    assert available[0].sleeper_id == "qb1"
    assert respx.calls == []


def test_valid_positions_constant() -> None:
    assert "FLEX" in VALID_POSITIONS
    assert "QB" in VALID_POSITIONS
