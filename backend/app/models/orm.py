from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sleeper_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    first_name: Mapped[str | None] = mapped_column(Text)
    last_name: Mapped[str | None] = mapped_column(Text)
    position: Mapped[str | None] = mapped_column(Text)
    team: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime)

    __table_args__ = (Index("ix_players_position_active", "position", "active"),)


class PlayerCacheMeta(Base):
    __tablename__ = "player_cache_meta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)


class PlinkoSession(Base):
    __tablename__ = "plinko_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sleeper_draft_id: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    picks_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    roster_slots: Mapped[list["RosterSlot"]] = relationship(back_populates="session")
    draft_picks: Mapped[list["DraftPicksCache"]] = relationship(back_populates="session")
    runs: Mapped[list["PlinkoRun"]] = relationship(back_populates="session")


class RosterSlot(Base):
    __tablename__ = "roster_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plinko_sessions.id"), nullable=False
    )
    position: Mapped[str] = mapped_column(Text, nullable=False)
    slot_order: Mapped[int] = mapped_column(Integer, nullable=False)
    filled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    player_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("players.id"), nullable=True
    )

    session: Mapped["PlinkoSession"] = relationship(back_populates="roster_slots")
    player: Mapped["Player | None"] = relationship()

    __table_args__ = (
        UniqueConstraint("session_id", "slot_order", name="uq_roster_slots_session_slot_order"),
        Index("ix_roster_slots_session_filled_at", "session_id", "filled_at"),
    )


class DraftPicksCache(Base):
    __tablename__ = "draft_picks_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plinko_sessions.id"), nullable=False
    )
    sleeper_player_id: Mapped[str] = mapped_column(Text, nullable=False)
    pick_no: Mapped[int] = mapped_column(Integer, nullable=False)

    session: Mapped["PlinkoSession"] = relationship(back_populates="draft_picks")

    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "sleeper_player_id",
            name="uq_draft_picks_cache_session_player",
        ),
    )


class PlinkoRun(Base):
    __tablename__ = "plinko_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("plinko_sessions.id"), nullable=False
    )
    board: Mapped[str] = mapped_column(Text, nullable=False)
    outcome_position: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome_player_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("players.id"), nullable=True
    )
    slot_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("roster_slots.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    session: Mapped["PlinkoSession"] = relationship(back_populates="runs")
    outcome_player: Mapped["Player | None"] = relationship()
