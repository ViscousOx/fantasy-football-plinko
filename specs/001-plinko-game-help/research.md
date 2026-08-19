# Research: Fantasy Football Plinko — Phase 0

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-19

## Technology Decisions

### Frontend: Phaser 4 + TypeScript

**Decision**: Use Phaser 4 as the game engine and TypeScript for type safety.

**Rationale**:
- Phaser provides a battle-tested physics engine (Matter.js integration) suitable for the plinko ball simulation, collision detection against pegs, and entry into position/player slots.
- Phaser 4's Scene system maps cleanly onto the two-board flow: `PositionBoardScene` → `PlayerBoardScene` → `CongratsScene`.
- TypeScript enforces the strict-mode constraint in the constitution and catches entity shape mismatches at compile time.
- Vite is the minimal build tool: zero-config TypeScript + hot reload, tree-shakes Phaser modules, and produces a static bundle that can be served from the backend's `/static` directory.

**Risk — Phaser 4 Stability**: Verify the latest Phaser 4 release tag on npm (`phaser@4.x`) before implementation begins. If only a beta/RC is available, evaluate whether breaking API changes could block P1 delivery; Phaser 3 (`phaser@3.x`) is the fall-back with an identical integration surface for this use case.

**Minimal dependency list (frontend)**:
| Package | Role |
|---|---|
| `phaser` | Game engine + physics |
| `vite` | Build tool |
| `typescript` | Type checking |

No UI framework (React, Vue, etc.) is needed — Phaser's Canvas/WebGL renderer owns the entire display surface.

---

### Backend: FastAPI + SQLAlchemy + SQLite + uv

**Decision**: FastAPI for the HTTP layer, SQLAlchemy (ORM, async-compatible) for database access, SQLite for storage, and `uv` for dependency management and builds.

**Rationale**:
- FastAPI provides auto-generated OpenAPI docs and async request handling with minimal boilerplate.
- SQLAlchemy's declarative ORM maps directly onto the five key entities from the spec; async SQLAlchemy (`AsyncSession`) keeps the I/O loop unblocked during Sleeper API proxy calls.
- SQLite requires zero infrastructure — a single file on disk, ideal for single-user single-container deployment.
- `uv` resolves and locks dependencies faster than pip/poetry and supports `uv run` for zero-install script execution during Docker builds.

**Minimal dependency list (backend)**:
| Package | Role |
|---|---|
| `fastapi` | HTTP framework |
| `uvicorn[standard]` | ASGI server |
| `sqlalchemy[asyncio]` | ORM + async engine |
| `aiosqlite` | SQLite async driver |
| `httpx` | Async HTTP client for Sleeper API |
| `pydantic` | Request/response schema validation (bundled with FastAPI) |

No message queue, cache layer, or auth system is required for v1 single-user scope.

---

### Docker / Monorepo

**Decision**: Single repo, single multi-stage `Dockerfile`, one `docker-compose.yml` for local development.

**Build stages**:
1. **`frontend-build`** — Node.js image, runs `vite build`, outputs to `frontend/dist/`.
2. **`backend`** — Python 3.12-slim image, installs deps with `uv sync`, copies `frontend/dist/` into `backend/static/`, runs `uvicorn`.

The backend mounts `static/` and serves the frontend via FastAPI's `StaticFiles` mount, eliminating the need for a separate web server (Nginx, Caddy, etc.).

`docker-compose.yml` maps port 8000 and mounts a named volume for the SQLite database file so data survives container restarts.

---

## Sleeper API Integration

### Relevant Endpoints

| Purpose | Endpoint |
|---|---|
| Resolve user id from username | `GET https://api.sleeper.app/v1/user/{username}` |
| List drafts for a league | `GET https://api.sleeper.app/v1/league/{league_id}/drafts` |
| Draft metadata (settings, slot counts) | `GET https://api.sleeper.app/v1/draft/{draft_id}` |
| Picks already made in the draft | `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` |
| Full NFL player dictionary (cache daily) | `GET https://api.sleeper.app/v1/players/nfl` |
| Active players only (filtered, smaller) | `GET https://api.sleeper.app/v1/players/nfl?active=true` |

### "Available Draftable Players" — Definition

A player is **available** in the context of a live Sleeper draft when:
1. The player appears in the Sleeper active player list for the relevant positions.
2. The player's `player_id` does **not** appear in the `picks` array of `GET /draft/{draft_id}/picks`.

The backend computes this set on demand and serves it to the frontend so the plinko player boards only show genuinely undrafted players.

### Draft Roster Configuration

`GET /draft/{draft_id}` returns a `settings` object with slot counts:

```json
{
  "slots_qb": 1,
  "slots_rb": 2,
  "slots_wr": 2,
  "slots_te": 1,
  "slots_flex": 1,
  "slots_k": 1,
  "slots_def": 1,
  "slots_bn": 5,
  "rounds": 15
}
```

The backend maps these counts to `RosterSlot` rows in the session, directly satisfying FR-010 (configurable roster composition) without user-manual input.

### Polling Strategy

- **Player dictionary**: Fetched once per calendar day and stored in the DB (`players` table). Sleeper recommends no more than once-per-day; the 5MB payload is cached server-side and never sent to the browser.
- **Draft picks**: Polled on every `GET /sessions/{id}/players/{pos}` request and on explicit `POST /sessions/{id}/sync`. Because this is a single-user tool and drafts typically last 30–90 minutes, a short TTL (e.g., 30 seconds) is sufficient to avoid stale availability.
- **Rate limiting**: Sleeper's documented limit is 1000 calls/minute. With a 30-second pick TTL and one user, actual call rate is ~2 req/min — well within limits.

### FLEX Position Handling

The spec notes FLEX accepts RB, WR, or TE. When building the player board for a FLEX slot, the backend queries available players across all three positions and deduplicates by `player_id`.

---

## Architecture Diagram

```
Browser (Phaser 4 / TypeScript)
  │  Canvas game scenes (position board, player board, congrats)
  │  Stores session_id in localStorage for refresh recovery
  │
  │  HTTP/JSON REST
  ▼
FastAPI (Python 3.12 / uvicorn)
  ├── POST  /api/sessions              → create session, sync Sleeper draft
  ├── GET   /api/sessions/{id}         → session state
  ├── GET   /api/sessions/{id}/positions       → remaining roster slots
  ├── GET   /api/sessions/{id}/players/{pos}   → available players for position
  ├── POST  /api/sessions/{id}/position-pick   → record plinko position result
  ├── POST  /api/sessions/{id}/player-pick     → record plinko player result
  ├── POST  /api/sessions/{id}/sync            → re-poll Sleeper draft picks
  └── GET   /                          → serves frontend static bundle
  │
  │  httpx (async)
  ▼
Sleeper REST API (read-only, no auth)
  ├── GET /v1/draft/{draft_id}
  ├── GET /v1/draft/{draft_id}/picks
  └── GET /v1/players/nfl?active=true
  │
SQLite (single file, volume-mounted in Docker)
  ├── players           (Sleeper player cache)
  ├── plinko_sessions
  ├── roster_slots
  ├── session_picks
  └── player_cache_meta (last-synced timestamp)
```

---

## Spec Assumption Override

The original spec (SC-006) assumes the complete flow can run without a backend. The user has explicitly requested a FastAPI backend for this implementation. **SC-006 is superseded**: draft state is persisted in SQLite via the backend, and the frontend stores only a `session_id` in `localStorage` for reconnection. This is strictly more durable than `localStorage`-only state.
