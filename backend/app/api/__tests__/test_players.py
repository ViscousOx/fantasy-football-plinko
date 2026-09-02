from datetime import UTC, datetime

from app.models.orm import DraftPicksCache, Player, PlinkoSession, RosterSlot


async def _seed_session_with_players(session_factory, positions=("QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"), open_positions=None):
    async with session_factory() as db:
        for i in range(4):
            db.add(
                Player(
                    id=i + 1,
                    sleeper_id=str(2000 + i),
                    first_name=f"First{i + 1}",
                    last_name=f"Last{i + 1}",
                    position=("RB" if i < 2 else "WR"),
                    team="NYG",
                    active=True,
                    search_rank=(1 if i == 0 else None),
                )
            )
        session = PlinkoSession(sleeper_draft_id="x", created_at=datetime.now(UTC))
        db.add(session)
        await db.flush()
        open_positions = open_positions or positions
        for i, pos in enumerate(open_positions, start=1):
            db.add(
                RosterSlot(
                    session_id=session.id,
                    position=pos,
                    slot_order=i,
                    filled_at=None,
                )
            )
        await db.commit()
        return session.id


async def test_get_players_200_filtered_by_position(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/players/RB")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body) == 2
    assert all(p["position"] == "RB" for p in body)
    assert [p["last_name"] for p in body] == sorted(p["last_name"] for p in body)


async def test_get_players_flex_returns_union(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/players/FLEX")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    positions = {p["position"] for p in body}
    assert positions <= {"RB", "WR", "TE"}
    assert len(body) == 4


async def test_get_players_400_unknown_position(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/players/XX")

    assert resp.status_code == 400, resp.text


async def test_get_players_404_unknown_session(client, session_factory):
    resp = await client.get("/api/sessions/999/players/RB")
    assert resp.status_code == 404, resp.text


async def test_get_players_409_when_no_open_slot(client, session_factory):
    # only TE open, asking for RB should 409
    session_id = await _seed_session_with_players(
        session_factory, open_positions=["TE"]
    )

    resp = await client.get(f"/api/sessions/{session_id}/players/RB")

    assert resp.status_code == 409, resp.text


async def test_get_players_excludes_cached_draft_picks(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)
    async with session_factory() as db:
        db.add(
            DraftPicksCache(
                session_id=session_id,
                sleeper_player_id="2000",
                pick_no=1,
            )
        )
        await db.commit()

    resp = await client.get(f"/api/sessions/{session_id}/players/RB")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    sleeper_ids = {p["sleeper_id"] for p in body}
    assert "2000" not in sleeper_ids
    assert len(body) == 1


async def test_get_players_sorted_by_search_rank(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/players/RB")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    ranks = [p["search_rank"] for p in body]
    assert ranks == sorted(ranks, key=lambda r: (r is None, r or 0))
    assert body[0]["search_rank"] == 1
    assert body[-1]["search_rank"] is None


async def test_get_players_includes_search_rank_field(client, session_factory):
    session_id = await _seed_session_with_players(session_factory)

    resp = await client.get(f"/api/sessions/{session_id}/players/RB")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    for p in body:
        assert "search_rank" in p
