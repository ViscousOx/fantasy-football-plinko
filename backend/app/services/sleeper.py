import httpx
from fastapi import HTTPException

SLEEPER_BASE_URL = "https://api.sleeper.app/v1"


async def fetch_draft(draft_id: str) -> dict:
    async with httpx.AsyncClient(base_url=SLEEPER_BASE_URL) as client:
        try:
            response = await client.get(f"/draft/{draft_id}")
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise HTTPException(status_code=404, detail="Draft not found") from exc
            raise HTTPException(status_code=502, detail="Sleeper API error") from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail="Sleeper API unreachable") from exc
        return response.json()


async def fetch_picks(draft_id: str) -> list:
    async with httpx.AsyncClient(base_url=SLEEPER_BASE_URL) as client:
        try:
            response = await client.get(f"/draft/{draft_id}/picks")
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                raise HTTPException(status_code=404, detail="Draft not found") from exc
            raise HTTPException(status_code=502, detail="Sleeper API error") from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail="Sleeper API unreachable") from exc
        return response.json()


async def fetch_players() -> dict:
    async with httpx.AsyncClient(base_url=SLEEPER_BASE_URL) as client:
        try:
            response = await client.get("/players/nfl", params={"active": "true"})
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=502, detail="Sleeper API error") from exc
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail="Sleeper API unreachable") from exc
        return response.json()
