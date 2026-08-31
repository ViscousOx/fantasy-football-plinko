import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.serializers import serialize_player
from app.db import get_session as get_db_session
from app.models.orm import PlinkoSession, RosterSlot
from app.services.availability import (
    VALID_POSITIONS,
    get_available_players,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/sessions/{session_id}/players/{position}")
async def get_players(
    session_id: int,
    position: str,
    db: AsyncSession = Depends(get_db_session),
) -> list:
    position = position.upper()
    if position not in VALID_POSITIONS:
        raise HTTPException(status_code=400, detail="Unknown position")

    session_result = await db.execute(
        select(PlinkoSession).where(PlinkoSession.id == session_id)
    )
    if session_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session not found")

    open_slot = await db.execute(
        select(RosterSlot)
        .where(RosterSlot.session_id == session_id)
        .where(RosterSlot.position == position)
        .where(RosterSlot.filled_at.is_(None))
    )
    if open_slot.scalars().first() is None:
        raise HTTPException(
            status_code=409, detail="No open slot for this position"
        )

    players = await get_available_players(db, session_id, position)
    return [serialize_player(player) for player in players]
