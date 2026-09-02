# Data Model: Fantasy Football Plinko

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-19

## Backend — SQLAlchemy / SQLite

All tables use integer primary keys. Foreign key enforcement is enabled via `PRAGMA foreign_keys = ON` at connection time.

---

### `players` — Sleeper player cache

Populated once per day from `GET /v1/players/nfl?active=true`. Never modified by the app — this is a read-only mirror of Sleeper data.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `sleeper_id` | TEXT UNIQUE NOT NULL | Sleeper's `player_id` field (e.g. `"3086"`, `"CAR"`) |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `position` | TEXT | Primary position (`QB`, `RB`, `WR`, `TE`, `K`, `DEF`) |
| `team` | TEXT NULLABLE | NFL team abbreviation |
| `active` | BOOLEAN | `true` = Sleeper `status == "Active"` |
| `search_rank` | INTEGER NULLABLE | Sleeper's `search_rank` field — overall draft desirability rank across all players (lower = more draftable). `NULL` when Sleeper omits it (e.g. unranked/rookie-not-yet-ranked players). |
| `synced_at` | DATETIME | Timestamp of last Sleeper sync |

**Index**: `(position, active)` — used on every player-board query.

---

### `player_cache_meta` — sync control

Single-row table that tracks the last full player-dictionary sync so the app never calls the 5MB endpoint more than once per day.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Always 1 |
| `last_synced_at` | DATETIME | UTC timestamp of last successful sync |

---

### `plinko_sessions` — one per draft run

Created when the user provides a `draft_id` and starts the app.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `sleeper_draft_id` | TEXT NOT NULL | Sleeper `draft_id` provided by the user |
| `created_at` | DATETIME | UTC |
| `completed_at` | DATETIME NULLABLE | Set when all roster slots are filled |
| `picks_last_synced_at` | DATETIME NULLABLE | Last time Sleeper picks were polled |

---

### `roster_slots` — per-session position requirements

Seeded from `draft.settings` (e.g. `slots_rb: 2` → two rows with `position = "RB"`). One row per individual slot, not per position type.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `session_id` | INTEGER FK → `plinko_sessions.id` | |
| `position` | TEXT NOT NULL | `QB`, `RB`, `WR`, `TE`, `FLEX`, `BN`, `K`, `DEF` |
| `slot_order` | INTEGER | Display order on the position board (1-indexed) |
| `filled_at` | DATETIME NULLABLE | NULL = still open |
| `player_id` | INTEGER FK → `players.id` NULLABLE | Set when the slot is filled |

**Index**: `(session_id, filled_at)` — used to list remaining open slots.

**Constraint**: `(session_id, slot_order)` UNIQUE — prevents duplicate slot assignments.

> **Bench seats** (`slots_bn`) are included as `BN` roster slots and appear on the plinko boards. Like `FLEX`, a `BN` slot is not locked to a single position — its available-player pool is the union of all startable positions (`QB`, `RB`, `WR`, `TE`, `K`, `DEF`), since a bench spot can hold any drafted player.

---

### `draft_picks_cache` — Sleeper picks mirror

A local copy of `GET /draft/{draft_id}/picks`, refreshed on each sync. Used to subtract already-drafted players from the available pool without hitting Sleeper on every single query.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `session_id` | INTEGER FK → `plinko_sessions.id` | |
| `sleeper_player_id` | TEXT NOT NULL | |
| `pick_no` | INTEGER | Ordered pick number |

**Constraint**: `(session_id, sleeper_player_id)` UNIQUE — idempotent on re-sync.

---

### `plinko_runs` — audit log of each ball drop

One row per ball drop (both position-board drops and player-board drops).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `session_id` | INTEGER FK → `plinko_sessions.id` | |
| `board` | TEXT | `"position"` or `"player"` |
| `outcome_position` | TEXT NULLABLE | Resolved position (position-board drops) |
| `outcome_player_id` | INTEGER FK → `players.id` NULLABLE | Resolved player (player-board drops) |
| `slot_id` | INTEGER FK → `roster_slots.id` NULLABLE | The slot filled by this run |
| `created_at` | DATETIME | UTC |

---

## Entity Relationships

```
plinko_sessions ──< roster_slots
plinko_sessions ──< draft_picks_cache
plinko_sessions ──< plinko_runs
roster_slots    >── players  (filled_by)
plinko_runs     >── players  (outcome_player)
plinko_runs     >── roster_slots
```

---

## Frontend — TypeScript Interfaces

These interfaces mirror the JSON shapes returned by the API and are defined in `frontend/src/types/`.

```typescript
// Session overview returned by GET /api/sessions/{id}
interface Session {
  id: number;
  sleeper_draft_id: string;
  created_at: string;      // ISO-8601
  completed_at: string | null;
}

// A single open or filled roster slot
interface RosterSlot {
  id: number;
  position: Position;
  slot_order: number;
  filled_at: string | null;
  player: Player | null;
}

// A draftable player (available in the current league draft)
interface Player {
  id: number;
  sleeper_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  team: string | null;
  search_rank: number | null;
}

// Position enum — must match backend values exactly
type Position = "QB" | "RB" | "WR" | "TE" | "FLEX" | "BN" | "K" | "DEF";

// Plinko run payload sent by the frontend
interface PositionPickPayload {
  roster_slot_id: number;
}

interface PlayerPickPayload {
  roster_slot_id: number;
  player_id: number;
}
```

---

## Availability Query Logic

The core query for "available players at a given position" (used by `GET /api/sessions/{id}/players/{pos}`):

```sql
SELECT p.*
FROM players p
WHERE p.position IN :positions          -- ["RB"] or ["RB","WR","TE"] for FLEX
  AND p.active = 1
  AND p.sleeper_id NOT IN (
      SELECT dpc.sleeper_player_id
      FROM draft_picks_cache dpc
      WHERE dpc.session_id = :session_id
  )
ORDER BY p.search_rank IS NULL, p.search_rank ASC, p.last_name, p.first_name;
```

`positions` is a list to support FLEX expansion. All other position queries pass a single-element list.

Players are ordered by Sleeper's `search_rank` ascending (lower = higher overall draft rank), with `NULL` ranks sorted last (e.g. `NULLS LAST` in Postgres/SQLite dialects that support it). `last_name, first_name` remains the tiebreaker for players sharing a rank or both having `NULL`.
