from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import select

from app.models.orm import Player, PlinkoSession, RosterSlot

DRAFT_FIXTURE = {
    "draft_id": "257270643320426496",
    "settings": {
        "slots_qb": 1,
        "slots_rb": 2,
        "slots_wr": 2,
        "slots_te": 1,
        "slots_flex": 1,
        "slots_bn": 2,
        "slots_k": 1,
        "slots_def": 1,
    },
}
PICKS_FIXTURE = [
    {"pick_no": 1, "player_id": "4046"},
    {"pick_no": 2, "player_id": "1408"},
]
PLAYERS_FIXTURE = {
    "4046": {"player_id": "4046", "first_name": "Saquon", "last_name": "Barkley", "position": "RB", "team": "NYG", "status": "Active", "search_rank": 1},
    "1408": {"player_id": "1408", "first_name": "Le'Veon", "last_name": "Bell", "position": "RB", "team": "PIT", "status": "Active", "search_rank": 3},
}


async def _seed_session(session_factory, positions=("QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "K", "DEF"), filled=None):
    async with session_factory() as db:
        existing = (await db.execute(select(Player).limit(1))).scalar_one_or_none()
        if existing is None:
            for i in range(len(positions)):
                db.add(
                    Player(
                        id=i + 1,
                        sleeper_id=str(1000 + i),
                        first_name=f"Player{i + 1}",
                        last_name=f"Test{i + 1}",
                        position="RB",
                        team="NYG",
                        active=True,
                    )
                )
        session = PlinkoSession(
            sleeper_draft_id="257270643320426496",
            created_at=datetime.now(UTC),
        )
        db.add(session)
        await db.flush()
        slots = []
        for i, pos in enumerate(positions, start=1):
            slot = RosterSlot(
                session_id=session.id,
                position=pos,
                slot_order=i,
                filled_at=None,
            )
            db.add(slot)
            slots.append(slot)
        await db.flush()
        if filled:
            for slot_id, player_id in filled.items():
                slot = next(s for s in slots if s.id == slot_id)
                slot.filled_at = datetime.now(UTC)
                slot.player_id = player_id
        await db.commit()
        return session.id, [s.id for s in slots]


async def _fill_slot(session_factory, slot_id, player_id=1):
    async with session_factory() as db:
        slot = (
            await db.execute(select(RosterSlot).where(RosterSlot.id == slot_id))
        ).scalar_one()
        slot.filled_at = datetime.now(UTC)
        slot.player_id = player_id
        await db.commit()


# --- D-1: POST /api/sessions ---


@patch("app.api.sessions.fetch_players", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_draft", new_callable=AsyncMock)
async def test_create_session_201(mock_draft, mock_picks, mock_players, client):
    mock_draft.return_value = DRAFT_FIXTURE
    mock_picks.return_value = PICKS_FIXTURE
    mock_players.return_value = PLAYERS_FIXTURE

    resp = await client.post("/api/sessions", json={"sleeper_draft_id": "257270643320426496"})

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["sleeper_draft_id"] == "257270643320426496"
    assert body["completed_at"] is None
    positions = [s["position"] for s in body["roster_slots"]]
    assert positions == ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "BN", "BN", "K", "DEF"]
    assert all(s["filled_at"] is None for s in body["roster_slots"])


@patch("app.api.sessions.fetch_players", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_draft", new_callable=AsyncMock)
async def test_create_session_400_missing_draft_id(mock_draft, mock_picks, mock_players, client):
    resp = await client.post("/api/sessions", json={})
    assert resp.status_code == 400, resp.text
    mock_draft.assert_not_called()


@patch("app.api.sessions.fetch_players", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_draft", new_callable=AsyncMock)
async def test_create_session_404_when_sleeper_404(mock_draft, mock_picks, mock_players, client):
    mock_draft.side_effect = HTTPException(status_code=404, detail="Draft not found")

    resp = await client.post("/api/sessions", json={"sleeper_draft_id": "does-not-exist"})

    assert resp.status_code == 404, resp.text


@patch("app.api.sessions.fetch_players", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
@patch("app.api.sessions.fetch_draft", new_callable=AsyncMock)
async def test_create_session_502_when_sleeper_unreachable(mock_draft, mock_picks, mock_players, client):
    mock_draft.side_effect = HTTPException(status_code=502, detail="Sleeper API unreachable")

    resp = await client.post("/api/sessions", json={"sleeper_draft_id": "x"})

    assert resp.status_code == 502, resp.text


# --- D-3/D-4: GET /api/sessions/{id} and /positions ---


async def test_get_session_200(client, session_factory):
    session_id, _ = await _seed_session(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == session_id
    assert len(body["roster_slots"]) == 11
    assert all(s["filled_at"] is None for s in body["roster_slots"])


async def test_get_session_404(client, session_factory):
    resp = await client.get("/api/sessions/999")
    assert resp.status_code == 404, resp.text


async def test_get_positions_returns_only_open(client, session_factory):
    session_id, _ = await _seed_session(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/positions")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 11
    assert all(s["filled_at"] is None for s in body)


async def test_get_positions_empty_when_all_filled(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)
    async with session_factory() as db:
        for sid in slot_ids:
            slot = (
                await db.execute(select(RosterSlot).where(RosterSlot.id == sid))
            ).scalar_one()
            slot.filled_at = datetime.now(UTC)
            slot.player_id = 1
        await db.commit()

    resp = await client.get(f"/api/sessions/{session_id}/positions")

    assert resp.status_code == 200, resp.text
    assert resp.json() == []


# --- D-7/D-8: POST /api/sessions/{id}/position-pick ---


async def test_position_pick_200(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)
    target = slot_ids[1]  # an RB slot

    resp = await client.post(
        f"/api/sessions/{session_id}/position-pick",
        json={"roster_slot_id": target},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["run_id"] is not None
    assert body["position"] == "RB"


async def test_position_pick_409_when_slot_filled(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)
    await _fill_slot(session_factory, slot_ids[0])

    resp = await client.post(
        f"/api/sessions/{session_id}/position-pick",
        json={"roster_slot_id": slot_ids[0]},
    )

    assert resp.status_code == 409, resp.text


async def test_position_pick_404_when_slot_not_in_session(client, session_factory):
    session_id, _ = await _seed_session(session_factory)
    await _seed_session(session_factory)

    resp = await client.post(
        f"/api/sessions/{session_id}/position-pick",
        json={"roster_slot_id": 99999},
    )

    assert resp.status_code == 404, resp.text


# --- D-9/D-10: POST /api/sessions/{id}/player-pick ---


async def test_player_pick_200_not_complete(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)

    resp = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[0], "player_id": 1},
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["run_id"] is not None
    assert body["session_complete"] is False


async def test_player_pick_200_session_complete_on_last_slot(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)
    # fill all but the last slot up front via the API with distinct players
    for idx, sid in enumerate(slot_ids[:-1]):
        r = await client.post(
            f"/api/sessions/{session_id}/player-pick",
            json={"roster_slot_id": sid, "player_id": idx + 2},
        )
        assert r.status_code == 200, r.text

    r = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[-1], "player_id": 1},
    )
    assert r.status_code == 200, r.text
    assert r.json()["session_complete"] is True


async def test_player_pick_409_when_player_already_taken(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)

    r1 = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[0], "player_id": 1},
    )
    assert r1.status_code == 200, r1.text

    r2 = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[1], "player_id": 1},
    )
    assert r2.status_code == 409, r2.text


async def test_player_pick_409_when_slot_already_filled(client, session_factory):
    session_id, slot_ids = await _seed_session(session_factory)
    await _fill_slot(session_factory, slot_ids[0])

    resp = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[0], "player_id": 5},
    )

    assert resp.status_code == 409, resp.text


# --- D-11/D-12: POST /api/sessions/{id}/sync ---


@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
async def test_sync_200_returns_synced_count(mock_picks, client, session_factory):
    session_id, _ = await _seed_session(session_factory)
    mock_picks.return_value = [
        {"pick_no": 1, "player_id": "4046"},
        {"pick_no": 2, "player_id": "1408"},
    ]

    resp = await client.post(f"/api/sessions/{session_id}/sync", json={})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["picks_synced"] == 2
    assert body["synced_at"] is not None


@patch("app.api.sessions.fetch_picks", new_callable=AsyncMock)
async def test_sync_200_degraded_when_sleeper_502(mock_picks, client, session_factory):
    session_id, _ = await _seed_session(session_factory)
    mock_picks.side_effect = HTTPException(status_code=502, detail="Sleeper API unreachable")

    resp = await client.post(f"/api/sessions/{session_id}/sync", json={})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "picks_synced" in body


async def test_sync_404_when_session_missing(client, session_factory):
    resp = await client.post("/api/sessions/999/sync", json={})
    assert resp.status_code == 404, resp.text


# --- G-5: performance budget for pick endpoints ---


async def test_position_pick_within_200ms(client, session_factory):
    import time

    session_id, slot_ids = await _seed_session(session_factory)
    start = time.perf_counter()
    resp = await client.post(
        f"/api/sessions/{session_id}/position-pick",
        json={"roster_slot_id": slot_ids[0]},
    )
    elapsed = (time.perf_counter() - start) * 1000
    assert resp.status_code == 200
    assert elapsed < 200, f"took {elapsed} ms"


async def test_player_pick_within_200ms(client, session_factory):
    import time

    session_id, slot_ids = await _seed_session(session_factory)
    start = time.perf_counter()
    resp = await client.post(
        f"/api/sessions/{session_id}/player-pick",
        json={"roster_slot_id": slot_ids[0], "player_id": 1},
    )
    elapsed = (time.perf_counter() - start) * 1000
    assert resp.status_code == 200
    assert elapsed < 200, f"took {elapsed} ms"
