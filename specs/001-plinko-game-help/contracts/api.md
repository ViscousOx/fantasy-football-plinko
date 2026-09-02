# API Contract: Fantasy Football Plinko

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-19

Base URL (local dev): `http://localhost:8000`  
All API routes are prefixed with `/api`.  
All request/response bodies are `application/json`.

---

## Sessions

### `POST /api/sessions`

Create a new plinko session by syncing an existing Sleeper draft.

**Request body**:
```json
{
  "sleeper_draft_id": "257270643320426496"
}
```

**Behavior**:
1. Calls `GET https://api.sleeper.app/v1/draft/{draft_id}` to read roster slot counts.
2. Creates `plinko_sessions` row.
3. Creates `roster_slots` rows from `settings.slots_*`, including bench (`slots_bn` → `BN` slots).
4. Calls `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` and seeds `draft_picks_cache`.
5. Ensures player dictionary is fresh (triggers sync if `last_synced_at` > 24 hours ago).

**Response `201 Created`**:
```json
{
  "id": 1,
  "sleeper_draft_id": "257270643320426496",
  "created_at": "2026-08-19T14:00:00Z",
  "completed_at": null,
  "roster_slots": [
    { "id": 1, "position": "QB", "slot_order": 1, "filled_at": null, "player": null },
    { "id": 2, "position": "RB", "slot_order": 2, "filled_at": null, "player": null },
    { "id": 3, "position": "RB", "slot_order": 3, "filled_at": null, "player": null }
  ]
}
```

**Errors**:
- `400` — `sleeper_draft_id` missing or not a string.
- `404` — Sleeper returns 404 for the given `draft_id`.
- `502` — Sleeper API unreachable.

---

### `GET /api/sessions/{session_id}`

Retrieve full session state including all roster slots and their fill status.

**Response `200 OK`**:
```json
{
  "id": 1,
  "sleeper_draft_id": "257270643320426496",
  "created_at": "2026-08-19T14:00:00Z",
  "completed_at": null,
  "roster_slots": [
    { "id": 1, "position": "QB", "slot_order": 1, "filled_at": null, "player": null },
    { "id": 2, "position": "RB", "slot_order": 2, "filled_at": "2026-08-19T14:05:00Z",
      "player": { "id": 42, "sleeper_id": "2391", "first_name": "David", "last_name": "Johnson",
                  "position": "RB", "team": "ARI" } }
  ]
}
```

**Errors**:
- `404` — Session not found.

---

### `GET /api/sessions/{session_id}/positions`

List only the **open** (unfilled) roster slots, used to populate the position plinko board.

**Response `200 OK`**:
```json
[
  { "id": 1, "position": "QB", "slot_order": 1, "filled_at": null, "player": null },
  { "id": 3, "position": "RB", "slot_order": 3, "filled_at": null, "player": null }
]
```

Returns `[]` when the draft is complete (triggers draft-complete state on the frontend).

---

### `GET /api/sessions/{session_id}/players/{position}`

List all players available for drafting at a given position, cross-referenced against the locally cached Sleeper draft picks.

**Path parameters**:
- `position` — one of `QB`, `RB`, `WR`, `TE`, `FLEX`, `K`, `DEF` (case-insensitive).

**Behavior**:
- For `FLEX`, queries `position IN ("RB", "WR", "TE")`.
- Subtracts all `sleeper_id` values present in `draft_picks_cache` for this session.
- Returns players sorted by `last_name ASC, first_name ASC`.
- Reads only from the local cache; callers should invoke `POST /api/sessions/{session_id}/sync` before rendering a player board when fresh Sleeper data is required.

**Response `200 OK`**:
```json
[
  { "id": 10, "sleeper_id": "4046", "first_name": "Saquon", "last_name": "Barkley",
    "position": "RB", "team": "NYG" },
  { "id": 11, "sleeper_id": "1408", "first_name": "Le'Veon", "last_name": "Bell",
    "position": "RB", "team": "PIT" }
]
```

**Errors**:
- `400` — Unknown position value.
- `404` — Session not found.
- `409` — No open slot for this position (frontend should not reach this state if it follows the position-board flow).

---

### `POST /api/sessions/{session_id}/position-pick`

Record the result of a position-board plinko drop (a roster slot was selected).

**Request body**:
```json
{
  "roster_slot_id": 1
}
```

**Behavior**:
- Validates the slot belongs to this session and is currently open.
- Creates a `plinko_runs` row with `board = "position"`, `outcome_position = slot.position`.
- Does **not** fill the slot yet — the slot is filled by `player-pick`.

**Response `200 OK`**:
```json
{
  "run_id": 5,
  "position": "QB"
}
```

**Errors**:
- `400` — `roster_slot_id` missing.
- `404` — Session or slot not found.
- `409` — Slot already filled.

---

### `POST /api/sessions/{session_id}/player-pick`

Record the result of a player-board plinko drop (a specific player was selected). Fills the roster slot.

**Request body**:
```json
{
  "roster_slot_id": 1,
  "player_id": 10
}
```

**Behavior**:
- Validates the slot is open and the player is available (not in `draft_picks_cache`, not already in another `roster_slots.player_id` for this session).
- Sets `roster_slots.filled_at`, `roster_slots.player_id`.
- Creates a `plinko_runs` row with `board = "player"`, `outcome_player_id`, `slot_id`.
- If all roster slots are now filled, sets `plinko_sessions.completed_at`.

**Response `200 OK`**:
```json
{
  "run_id": 6,
  "player": {
    "id": 10, "sleeper_id": "4046", "first_name": "Saquon", "last_name": "Barkley",
    "position": "RB", "team": "NYG"
  },
  "session_complete": false
}
```

**Errors**:
- `400` — Missing fields.
- `404` — Session, slot, or player not found.
- `409` — Slot already filled, or player already taken (league-wide or in this session).

---

### `POST /api/sessions/{session_id}/sync`

Re-poll Sleeper for the latest draft picks and update `draft_picks_cache`. This endpoint is the explicit freshness boundary for player availability and should be called before each player-board render.

**Request body**: empty (`{}` acceptable)

**Behavior**:
- Re-polls `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` and upserts rows in `draft_picks_cache`.
- Updates `picks_last_synced_at` on the session.
- If Sleeper is unreachable, responds **HTTP 200** with the last-known cached pick count (`picks_synced` = cached count, `synced_at` = last successful sync timestamp). This is a **non-fatal degraded path** — the client continues normally.
- Note: the `502` in `POST /api/sessions` and other GET routes refers to an actual HTTP 502 propagated to the caller; this endpoint deliberately absorbs the Sleeper error to preserve draft continuity.

**Response `200 OK`**:
```json
{
  "picks_synced": 14,
  "synced_at": "2026-08-19T14:10:00Z"
}
```

**Errors**:
- `404` — Session not found.

---

## Static Files

`GET /` and all non-`/api/*` paths → served from `backend/static/` (the Vite build output copied during Docker build).

---

## Error Shape

All error responses use a consistent envelope:

```json
{
  "detail": "Human-readable error message"
}
```

This matches FastAPI's default `HTTPException` response shape.
