from sqlalchemy import nullslast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import DraftPicksCache, Player, RosterSlot

FLEX_POSITIONS = ("RB", "WR", "TE")
# Bench seats can hold a player of any startable position, so treat "BN"
# the same way "FLEX" is treated: expand it into the full pool instead of
# matching a single locked position.
BENCH_POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
VALID_POSITIONS = ("QB", "RB", "WR", "TE", "FLEX", "BN", "K", "DEF")

_MULTI_POSITION_SLOTS = {
    "FLEX": FLEX_POSITIONS,
    "BN": FLEX_POSITIONS,
}


async def get_available_players(
    session: AsyncSession,
    session_id: int,
    position: str,
) -> list[Player]:
    positions = _MULTI_POSITION_SLOTS.get(position, (position,))

    drafted_subq = (
        select(DraftPicksCache.sleeper_player_id).where(
            DraftPicksCache.session_id == session_id
        )
    )

    # Players already awarded to a roster slot in *this* plinko session (via
    # the player board) must also be excluded, otherwise the same player can
    # be selected again for a different slot, and once every remaining ball
    # drop can only land on already-filled/duplicate players the board
    # effectively softlocks (no valid new pick can ever be recorded).
    picked_subq = (
        select(RosterSlot.player_id)
        .where(RosterSlot.session_id == session_id)
        .where(RosterSlot.player_id.is_not(None))
    )

    stmt = (
        select(Player)
        .where(Player.position.in_(positions))
        .where(Player.active.is_(True))
        .where(Player.sleeper_id.not_in(drafted_subq))
        .where(Player.id.not_in(picked_subq))
        .order_by(
            nullslast(Player.search_rank.asc()),
            Player.last_name,
            Player.first_name,
        )
    )

    result = await session.execute(stmt)
    return list(result.scalars().all())
