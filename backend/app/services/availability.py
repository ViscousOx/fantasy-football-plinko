from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import DraftPicksCache, Player

FLEX_POSITIONS = ("RB", "WR", "TE")
VALID_POSITIONS = ("QB", "RB", "WR", "TE", "FLEX", "K", "DEF")


async def get_available_players(
    session: AsyncSession,
    session_id: int,
    position: str,
) -> list[Player]:
    positions = FLEX_POSITIONS if position == "FLEX" else (position,)

    drafted_subq = (
        select(DraftPicksCache.sleeper_player_id).where(
            DraftPicksCache.session_id == session_id
        )
    )

    stmt = (
        select(Player)
        .where(Player.position.in_(positions))
        .where(Player.active.is_(True))
        .where(Player.sleeper_id.not_in(drafted_subq))
        .order_by(Player.last_name, Player.first_name)
    )

    result = await session.execute(stmt)
    return list(result.scalars().all())
