import httpx
import pytest
import respx
from fastapi import HTTPException

from app.services.sleeper import fetch_draft, fetch_picks, fetch_players

DRAFT_ID = "257270643320426496"
DRAFT_URL = f"https://api.sleeper.app/v1/draft/{DRAFT_ID}"
PICKS_URL = f"https://api.sleeper.app/v1/draft/{DRAFT_ID}/picks"
PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl"


@respx.mock
async def test_fetch_draft_calls_sleeper_and_returns_parsed_dict() -> None:
    draft_payload = {"draft_id": DRAFT_ID, "settings": {"slots_qb": 1}}
    route = respx.get(DRAFT_URL).mock(return_value=httpx.Response(200, json=draft_payload))

    result = await fetch_draft(DRAFT_ID)

    assert route.called
    assert result == draft_payload


@respx.mock
async def test_fetch_picks_calls_sleeper_and_returns_list() -> None:
    picks_payload = [{"pick_no": 1, "player_id": "4046"}]
    route = respx.get(PICKS_URL).mock(return_value=httpx.Response(200, json=picks_payload))

    result = await fetch_picks(DRAFT_ID)

    assert route.called
    assert result == picks_payload


@respx.mock
async def test_fetch_players_calls_sleeper_with_active_param() -> None:
    players_payload = {
        "4046": {"player_id": "4046", "first_name": "Saquon", "last_name": "Barkley"},
        "1408": {"player_id": "1408", "first_name": "Le'Veon", "last_name": "Bell"},
    }
    route = respx.get(PLAYERS_URL, params={"active": "true"}).mock(
        return_value=httpx.Response(200, json=players_payload)
    )

    result = await fetch_players()

    assert route.called
    assert result == players_payload
    assert "4046" in result
    assert "1408" in result


@respx.mock
async def test_fetch_draft_raises_404_for_missing_draft() -> None:
    respx.get(DRAFT_URL).mock(return_value=httpx.Response(404))

    with pytest.raises(HTTPException) as exc_info:
        await fetch_draft(DRAFT_ID)

    assert exc_info.value.status_code == 404


@respx.mock
async def test_fetch_draft_raises_502_on_connection_error() -> None:
    respx.get(DRAFT_URL).mock(side_effect=httpx.ConnectError("connection failed"))

    with pytest.raises(HTTPException) as exc_info:
        await fetch_draft(DRAFT_ID)

    assert exc_info.value.status_code == 502
