import logging
from datetime import UTC, datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.serializers import serialize_slot
from app.db import get_session as get_db_session
from app.models.orm import DraftPicksCache, Player, PlinkoSession, RosterSlot
from app.services.sleeper import fetch_draft, fetch_picks, fetch_players

logger = logging.getLogger(__name__)

router = APIRouter()

SLOT_SETTINGS_KEYS = {
    "QB": "slots_qb",
    "RB": "slots_rb",
    "WR": "slots_wr",
    "TE": "slots_te",
    "FLEX": "slots_flex",
    "BN": "slots_bn",
    "K": "slots_k",
    "DEF": "slots_def",
}


def _is_player_active(data: dict) -> bool:
    # Team defenses (DEF) are not individual players and never carry a
    # "status" field from Sleeper, so the plain status == "Active" check
    # would mark every defense inactive and make the DEF roster slot
    # permanently unfillable. Treat any DEF entry as active instead.
    if data.get("position") == "DEF":
        return True
    return data.get("status") == "Active"


async def _upsert_players(players: dict, db: AsyncSession) -> None:
    for sleeper_id, data in players.items():
        if not isinstance(data, dict):
            continue
        stmt = sqlite_insert(Player).values(
            sleeper_id=sleeper_id,
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            position=data.get("position"),
            team=data.get("team"),
            active=_is_player_active(data),
            search_rank=data.get("search_rank"),
            synced_at=datetime.now(UTC),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Player.sleeper_id],
            set_={
                "first_name": stmt.excluded.first_name,
                "last_name": stmt.excluded.last_name,
                "position": stmt.excluded.position,
                "team": stmt.excluded.team,
                "active": stmt.excluded.active,
                "search_rank": stmt.excluded.search_rank,
                "synced_at": stmt.excluded.synced_at,
            },
        )
        await db.execute(stmt)


@router.post("/sessions", status_code=201)
async def create_session(
    data: dict | None = Body(default=None),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    if (
        not data
        or "sleeper_draft_id" not in data
        or not isinstance(data["sleeper_draft_id"], str)
        or not data["sleeper_draft_id"]
    ):
        raise HTTPException(status_code=400, detail="sleeper_draft_id is required")

    draft_id = data["sleeper_draft_id"]
    draft = await fetch_draft(draft_id)
    settings = draft.get("settings", {})

    session = PlinkoSession(
        sleeper_draft_id=draft_id,
        created_at=datetime.now(UTC),
    )
    db.add(session)
    await db.flush()

    order = 1
    for position, setting_key in SLOT_SETTINGS_KEYS.items():
        count = int(settings.get(setting_key, 0) or 0)
        for _ in range(count):
            db.add(
                RosterSlot(
                    session_id=session.id,
                    position=position,
                    slot_order=order,
                    filled_at=None,
                )
            )
            order += 1

    picks = await fetch_picks(draft_id)
    for pick in picks:
        db.add(
            DraftPicksCache(
                session_id=session.id,
                sleeper_player_id=str(pick.get("player_id")),
                pick_no=int(pick.get("pick_no", 0)),
            )
        )

    players = await fetch_players()
    await _upsert_players(players, db)

    await db.commit()

    slots_result = await db.execute(
        select(RosterSlot)
        .where(RosterSlot.session_id == session.id)
        .order_by(RosterSlot.slot_order)
        .options(selectinload(RosterSlot.player))
    )
    slots = list(slots_result.scalars().all())
    return {
        "id": session.id,
        "sleeper_draft_id": session.sleeper_draft_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "roster_slots": [serialize_slot(slot) for slot in slots],
    }


async def _load_session(session_id: int, db: AsyncSession) -> PlinkoSession:
    result = await db.execute(
        select(PlinkoSession)
        .where(PlinkoSession.id == session_id)
        .execution_options(populate_existing=True)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.get("/sessions/{session_id}")
async def read_session(
    session_id: int, db: AsyncSession = Depends(get_db_session)
) -> dict:
    result = await db.execute(
        select(PlinkoSession)
        .where(PlinkoSession.id == session_id)
        .execution_options(populate_existing=True)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    slots_result = await db.execute(
        select(RosterSlot)
        .where(RosterSlot.session_id == session_id)
        .order_by(RosterSlot.slot_order)
        .options(selectinload(RosterSlot.player))
    )
    slots = list(slots_result.scalars().all())
    return {
        "id": session.id,
        "sleeper_draft_id": session.sleeper_draft_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "roster_slots": [serialize_slot(slot) for slot in slots],
    }


@router.get("/sessions/{session_id}/positions")
async def get_open_positions(
    session_id: int, db: AsyncSession = Depends(get_db_session)
) -> list:
    await _load_session(session_id, db)

    result = await db.execute(
        select(RosterSlot)
        .where(RosterSlot.session_id == session_id)
        .where(RosterSlot.filled_at.is_(None))
        .order_by(RosterSlot.slot_order)
        .options(selectinload(RosterSlot.player))
    )
    slots = list(result.scalars().all())
    return [serialize_slot(slot) for slot in slots]


@router.post("/sessions/{session_id}/sync")
async def sync_picks(
    session_id: int, db: AsyncSession = Depends(get_db_session)
) -> dict:
    session = await _load_session(session_id, db)

    synced_at = datetime.now(UTC)
    cached_count = 0
    try:
        # Must use the real Sleeper draft ID here, not our internal
        # session_id, otherwise every sync 404s against Sleeper's API.
        picks = await fetch_picks(session.sleeper_draft_id)
    except HTTPException as exc:
        if exc.status_code == 502:
            result = await db.execute(
                select(DraftPicksCache).where(
                    DraftPicksCache.session_id == session_id
                )
            )
            cached_count = len(result.scalars().all())
            session = await _load_session(session_id, db)
            session.picks_last_synced_at = synced_at
            await db.commit()
            return {
                "picks_synced": cached_count,
                "synced_at": synced_at.isoformat(),
            }
        raise

    await db.execute(
        delete(DraftPicksCache).where(DraftPicksCache.session_id == session_id)
    )
    for pick in picks:
        db.add(
            DraftPicksCache(
                session_id=session_id,
                sleeper_player_id=str(pick.get("player_id")),
                pick_no=int(pick.get("pick_no", 0)),
            )
        )

    session = await _load_session(session_id, db)
    session.picks_last_synced_at = synced_at
    await db.commit()
    return {"picks_synced": len(picks), "synced_at": synced_at.isoformat()}
