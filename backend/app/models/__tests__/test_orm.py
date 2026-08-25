import pytest
from sqlalchemy import inspect


@pytest.mark.parametrize(
    "model_name",
    [
        "Player",
        "PlayerCacheMeta",
        "PlinkoSession",
        "RosterSlot",
        "DraftPicksCache",
        "PlinkoRun",
    ],
)
def test_model_importable(model_name: str) -> None:
    from app.models import orm

    assert hasattr(orm, model_name)


def test_player_columns() -> None:
    from app.models.orm import Player

    mapper = inspect(Player)
    column_names = {col.key for col in mapper.columns}
    expected = {
        "id",
        "sleeper_id",
        "first_name",
        "last_name",
        "position",
        "team",
        "active",
        "synced_at",
    }
    assert expected.issubset(column_names)


def test_roster_slot_unique_constraint() -> None:
    from app.models.orm import RosterSlot

    table = RosterSlot.__table__
    unique_constraints = {
        tuple(sorted(c.columns.keys())) for c in table.constraints if c.__class__.__name__ == "UniqueConstraint"
    }
    assert ("session_id", "slot_order") in unique_constraints


def test_draft_picks_cache_unique_constraint() -> None:
    from app.models.orm import DraftPicksCache

    table = DraftPicksCache.__table__
    unique_constraints = {
        tuple(sorted(c.columns.keys())) for c in table.constraints if c.__class__.__name__ == "UniqueConstraint"
    }
    assert ("session_id", "sleeper_player_id") in unique_constraints
