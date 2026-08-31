from app.models.orm import Player, PlinkoSession, RosterSlot


def serialize_player(player: Player) -> dict:
    return {
        "id": player.id,
        "sleeper_id": player.sleeper_id,
        "first_name": player.first_name,
        "last_name": player.last_name,
        "position": player.position,
        "team": player.team,
    }


def serialize_slot(slot: RosterSlot) -> dict:
    return {
        "id": slot.id,
        "position": slot.position,
        "slot_order": slot.slot_order,
        "filled_at": slot.filled_at.isoformat() if slot.filled_at else None,
        "player": serialize_player(slot.player) if slot.player else None,
    }


def serialize_session(session: PlinkoSession) -> dict:
    return {
        "id": session.id,
        "sleeper_draft_id": session.sleeper_draft_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "roster_slots": [serialize_slot(slot) for slot in session.roster_slots],
    }
