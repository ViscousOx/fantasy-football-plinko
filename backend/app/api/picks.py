import logging
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models.orm import PlinkoRun, PlinkoSession, Player, RosterSlot

logger = logging.getLogger(__name__)

router = APIRouter()


class PositionPickPayload(BaseModel):
    roster_slot_id: int


class PlayerPickPayload(BaseModel):
    roster_slot_id: int
    player_id: int


@router.post("/sessions/{session_id}/position-pick")
async def position_pick(
    session_id: int,
    payload: PositionPickPayload,
    db: AsyncSession = Depends(get_session),
) -> dict:
    start = time.perf_counter()
    outcome: str | None = None

    try:
        session_result = await db.execute(
            select(PlinkoSession).where(PlinkoSession.id == session_id)
        )
        if session_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Session not found")

        slot_result = await db.execute(
            select(RosterSlot).where(
                RosterSlot.id == payload.roster_slot_id,
                RosterSlot.session_id == session_id,
            )
        )
        slot = slot_result.scalar_one_or_none()
        if slot is None:
            raise HTTPException(status_code=404, detail="Roster slot not found")
        if slot.filled_at is not None:
            raise HTTPException(status_code=409, detail="Slot already filled")

        outcome = slot.position
        run = PlinkoRun(
            session_id=session_id,
            board="position",
            outcome_position=slot.position,
            slot_id=slot.id,
            created_at=datetime.now(UTC),
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        return {"run_id": run.id, "position": slot.position}
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "position_pick",
            extra={
                "session_id": session_id,
                "duration_ms": duration_ms,
                "outcome": outcome,
            },
        )


@router.post("/sessions/{session_id}/player-pick")
async def player_pick(
    session_id: int,
    payload: PlayerPickPayload,
    db: AsyncSession = Depends(get_session),
) -> dict:
    start = time.perf_counter()
    outcome: str | None = None

    try:
        session_result = await db.execute(
            select(PlinkoSession).where(PlinkoSession.id == session_id)
        )
        plinko_session = session_result.scalar_one_or_none()
        if plinko_session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        slot_result = await db.execute(
            select(RosterSlot).where(
                RosterSlot.id == payload.roster_slot_id,
                RosterSlot.session_id == session_id,
            )
        )
        slot = slot_result.scalar_one_or_none()
        if slot is None:
            raise HTTPException(status_code=404, detail="Roster slot not found")
        if slot.filled_at is not None:
            raise HTTPException(status_code=409, detail="Slot already filled")

        player_result = await db.execute(
            select(Player).where(Player.id == payload.player_id)
        )
        player = player_result.scalar_one_or_none()
        if player is None:
            raise HTTPException(status_code=404, detail="Player not found")

        now = datetime.now(UTC)
        slot.filled_at = now
        slot.player_id = player.id

        run = PlinkoRun(
            session_id=session_id,
            board="player",
            outcome_player_id=player.id,
            slot_id=slot.id,
            created_at=now,
        )
        db.add(run)
        await db.commit()
        await db.refresh(run)

        outcome = f"{player.first_name} {player.last_name}"
        return {
            "run_id": run.id,
            "player": {
                "id": player.id,
                "sleeper_id": player.sleeper_id,
                "first_name": player.first_name,
                "last_name": player.last_name,
                "position": player.position,
                "team": player.team,
            },
            "session_complete": False,
        }
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "player_pick",
            extra={
                "session_id": session_id,
                "duration_ms": duration_ms,
                "outcome": outcome,
            },
        )
