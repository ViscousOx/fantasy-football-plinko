# Tasks: Fantasy Football Plinko Draft Assistant

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-21 | **Plan**: [plan.md](./plan.md)

All tasks follow the Red-Green-Refactor cycle (constitution §II). Write the failing test first, then the minimum implementation to pass it, then refactor. No implementation task is considered complete until its tests pass and coverage gates are met.

---

## Phase A — Backend: Project Scaffold

### A-1 — Initialize backend project with `uv`

**Acceptance**: `backend/pyproject.toml` exists, `uv sync` succeeds, `uv run python -c "import fastapi"` exits 0.

- [ ] Create `backend/` directory.
- [ ] Create `backend/pyproject.toml` declaring `[project]` metadata and dependencies: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `httpx`.
- [ ] Add dev dependencies: `pytest`, `pytest-asyncio`, `httpx` (for `AsyncClient`), `coverage`.
- [ ] Configure `[tool.pytest.ini_options]` with `asyncio_mode = "auto"` and `testpaths = ["tests"]`.
- [ ] Run `uv sync` and confirm lock file is generated.

---

### A-2 — Create backend application skeleton

**Acceptance**: `uvicorn app.main:app --port 8000` starts without errors and `GET /healthz` returns `200`.

- [ ] Create `backend/app/__init__.py`.
- [ ] Create `backend/app/main.py` with a bare `FastAPI()` instance and a `GET /healthz` route returning `{"status": "ok"}`.
- [ ] Mount a placeholder `APIRouter` for `/api`.
- [ ] Verify the server starts with `uv run uvicorn app.main:app --port 8000`.

---

## Phase B — Backend: ORM Models and DB Init (test-first)

### B-1 — Write failing tests for ORM models

**Acceptance**: `pytest tests/test_orm.py` collects tests and all fail with `ImportError` or `ModuleNotFoundError`.

- [ ] Create `backend/tests/__init__.py`.
- [ ] Create `backend/tests/test_orm.py` with tests asserting:
  - Each model (`Player`, `PlayerCacheMeta`, `PlinkoSession`, `RosterSlot`, `DraftPicksCache`, `PlinkoRun`) is importable from `app.models.orm`.
  - `Player` has columns: `id`, `sleeper_id`, `first_name`, `last_name`, `position`, `team`, `active`, `synced_at`.
  - `RosterSlot` has a composite unique constraint on `(session_id, slot_order)`.
  - `DraftPicksCache` has a composite unique constraint on `(session_id, sleeper_player_id)`.

### B-2 — Implement ORM models (green)

**Acceptance**: `pytest tests/test_orm.py` passes; `uv run python -c "from app.models.orm import Player"` exits 0.

- [ ] Create `backend/app/models/__init__.py`.
- [ ] Create `backend/app/models/orm.py` with `DeclarativeBase` and all six SQLAlchemy models matching the data model in `data-model.md`.
- [ ] Add `(position, active)` index on `Player`.
- [ ] Add `(session_id, filled_at)` index on `RosterSlot`.

### B-3 — Write failing tests for `db.py` (DB init)

**Acceptance**: Test file collected, tests fail.

- [ ] Create `backend/tests/test_db.py` asserting:
  - `init_db()` is callable and creates all tables in a fresh in-memory SQLite database.
  - `get_session()` is an async context manager that yields a live `AsyncSession`.

### B-4 — Implement `db.py` (green)

**Acceptance**: `pytest tests/test_db.py` passes.

- [ ] Create `backend/app/db.py` with:
  - Async engine configured from `DATABASE_URL` env var (default `sqlite+aiosqlite:///./data/plinko.db`).
  - `PRAGMA foreign_keys = ON` on every connection via an `@event.listens_for(engine.sync_engine, "connect")` hook.
  - `init_db()` async function calling `metadata.create_all`.
  - `get_session()` async generator for use as a FastAPI dependency.
- [ ] Wire `init_db()` call into `app.main` lifespan handler.

---

## Phase C — Backend: Sleeper Service (test-first)

### C-1 — Write failing tests for `sleeper.py`

**Acceptance**: Test file collected; all tests fail.

- [ ] Create `backend/tests/test_sleeper_service.py` with tests using `httpx` mock transport (or `respx`) to assert:
  - `fetch_draft(draft_id)` calls `GET https://api.sleeper.app/v1/draft/{draft_id}` and returns a parsed dict.
  - `fetch_picks(draft_id)` calls `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` and returns a list.
  - `fetch_players()` calls `GET https://api.sleeper.app/v1/players/nfl` and returns a dict keyed by `player_id`.
  - `fetch_draft` raises `httpx.HTTPStatusError` on 404; the caller receives a FastAPI `404` response.
  - `fetch_draft` raises a `502`-equivalent on connection error.

### C-2 — Implement `sleeper.py` (green)

**Acceptance**: `pytest tests/test_sleeper_service.py` passes.

- [ ] Create `backend/app/services/__init__.py`.
- [ ] Create `backend/app/services/sleeper.py` with an `httpx.AsyncClient` (base URL `https://api.sleeper.app/v1`) and three async functions: `fetch_draft`, `fetch_picks`, `fetch_players`.
- [ ] Map HTTP 404 → FastAPI `HTTPException(404)` and connection errors → `HTTPException(502)`.

### C-3 — Write failing tests for `availability.py`

**Acceptance**: Test file collected; tests fail.

- [ ] Create `backend/tests/test_availability.py` asserting:
  - `get_available_players(session, session_id, position)` returns only players matching the position (or FLEX union) whose `sleeper_id` is not in `draft_picks_cache` for that session.
  - FLEX position correctly queries `position IN ("RB", "WR", "TE")`.
  - Results are sorted `last_name ASC, first_name ASC`.

### C-4 — Implement `availability.py` (green)

**Acceptance**: `pytest tests/test_availability.py` passes.

- [ ] Create `backend/app/services/availability.py` implementing the SQL query from `data-model.md § Availability Query Logic`.
- [ ] Define `FLEX_POSITIONS = ("RB", "WR", "TE")` and `VALID_POSITIONS` constants.

---

## Phase D — Backend: API Routes (test-first)

### D-1 — Write failing tests for `POST /api/sessions`

**Acceptance**: Test file collected; tests fail (route does not exist).

- [ ] Create `backend/tests/test_sessions.py` with `httpx.AsyncClient(app=app)` tests for `POST /api/sessions`:
  - `201` with valid `sleeper_draft_id` — response body matches contract shape (session + roster_slots).
  - `400` when `sleeper_draft_id` is missing.
  - `404` when Sleeper returns 404 (mock the sleeper service).
  - `502` when Sleeper is unreachable.
- [ ] Mock `sleeper.fetch_draft` to return a fixture with `settings.slots_qb: 1`, `slots_rb: 2`, `slots_wr: 2`, `slots_te: 1`, `slots_k: 1`, `slots_def: 1`.
- [ ] Mock `sleeper.fetch_picks` to return an empty list.
- [ ] Mock `sleeper.fetch_players` to return a minimal player dict.

### D-2 — Implement `POST /api/sessions` (green)

**Acceptance**: `pytest tests/test_sessions.py::test_create_session*` passes.

- [ ] Create `backend/app/api/__init__.py`.
- [ ] Create `backend/app/api/sessions.py` with the `POST /api/sessions` route implementing all five behavior steps from `contracts/api.md`.
- [ ] Register the router in `app/main.py` under `/api`.

### D-3 — Write failing tests for `GET /api/sessions/{id}` and `GET /api/sessions/{id}/positions`

- [ ] Add tests to `test_sessions.py`:
  - `GET /api/sessions/1` → `200` with full session + roster_slots (mix of filled/unfilled).
  - `GET /api/sessions/999` → `404`.
  - `GET /api/sessions/1/positions` → `200` array of only open slots.
  - `GET /api/sessions/1/positions` → `[]` when all slots are filled.

### D-4 — Implement `GET /api/sessions/{id}` and `GET /api/sessions/{id}/positions` (green)

**Acceptance**: All new tests pass.

- [ ] Add both routes to `backend/app/api/sessions.py`.

### D-5 — Write failing tests for `GET /api/sessions/{id}/players/{pos}`

- [ ] Create `backend/tests/test_players.py` with tests for:
  - `200` returns player list filtered by position and excluding draft picks.
  - FLEX returns union of RB, WR, TE.
  - `400` on unknown position.
  - `404` on unknown session.
  - `409` when no open slot exists for that position.

### D-6 — Implement `GET /api/sessions/{id}/players/{pos}` (green)

**Acceptance**: `pytest tests/test_players.py` passes.

- [ ] Create `backend/app/api/players.py` and register under `/api`.

### D-7 — Write failing tests for `POST /api/sessions/{id}/position-pick`

- [ ] Add tests to `test_sessions.py`:
  - `200` returns `{run_id, position}` for a valid open slot.
  - `409` when slot is already filled.
  - `404` when slot ID does not belong to session.

### D-8 — Implement `POST /api/sessions/{id}/position-pick` (green)

**Acceptance**: All new tests pass.

- [ ] Add route to `backend/app/api/sessions.py`.

### D-9 — Write failing tests for `POST /api/sessions/{id}/player-pick`

- [ ] Add tests:
  - `200` returns `{run_id, player, session_complete: false}` for a valid pick.
  - `session_complete: true` when this pick fills the last open slot.
  - `409` when player already in `draft_picks_cache` for this session.
  - `409` when slot already filled.

### D-10 — Implement `POST /api/sessions/{id}/player-pick` (green)

**Acceptance**: All new tests pass.

- [ ] Add route; set `filled_at`, `player_id` on `RosterSlot`; set `completed_at` on session when all slots are filled.

### D-11 — Write failing tests for `POST /api/sessions/{id}/sync`

- [ ] Add tests:
  - `200` returns `{picks_synced, synced_at}`.
  - On Sleeper 502, returns `200` with cached count (non-fatal).

### D-12 — Implement `POST /api/sessions/{id}/sync` (green)

**Acceptance**: All new tests pass.

- [ ] Add route; upsert `draft_picks_cache` rows; update `picks_last_synced_at` on session.

---

## Phase E — Frontend: Project Scaffold

### E-1 — Initialize frontend project with Vite + TypeScript

**Acceptance**: `npm run dev` starts Vite dev server; `npm run build` produces `dist/`.

- [ ] Create `frontend/` directory.
- [ ] Run `npm create vite@latest frontend -- --template vanilla-ts` (or create `package.json` manually).
- [ ] Add dependencies: `phaser` (verify latest stable 4.x tag per research.md risk note before pinning).
- [ ] Add dev dependencies: `vitest`, `@vitest/browser`, `typescript`, `vite`.
- [ ] Create `frontend/tsconfig.json` (strict mode, `"lib": ["dom", "esnext"]`).
- [ ] Create `frontend/vite.config.ts` with `/api` proxy pointing to `http://localhost:8000`.

---

## Phase F — Frontend: Types and API Service Layer (test-first)

### F-1 — Write failing tests for `api.ts`

**Acceptance**: `npm test` collects tests; all fail (module not found).

- [ ] Create `frontend/tests/services/api.test.ts` using Vitest `vi.spyOn(globalThis, "fetch")` to mock HTTP calls, asserting:
  - `createSession(draft_id)` posts to `POST /api/sessions` and returns a `Session`.
  - `getSession(id)` fetches `GET /api/sessions/{id}` and returns a `Session`.
  - `getOpenPositions(id)` fetches `GET /api/sessions/{id}/positions` and returns `RosterSlot[]`.
  - `getPlayers(id, pos)` fetches the correct URL and returns `Player[]`.
  - `recordPositionPick(id, slot_id)` posts to `position-pick` and returns `{run_id, position}`.
  - `recordPlayerPick(id, slot_id, player_id)` posts to `player-pick`.
  - `syncPicks(id)` posts to `sync`.
  - All functions throw on non-2xx responses.

### F-2 — Implement `types/index.ts` and `services/api.ts` (green)

**Acceptance**: `npm test` — all api.test.ts tests pass.

- [ ] Create `frontend/src/types/index.ts` with all interfaces and the `Position` type from `data-model.md § Frontend`.
- [ ] Create `frontend/src/services/api.ts` with typed `fetch` wrappers for all seven endpoints.

---

## Phase G — Frontend: Plinko Physics Entities (test-first)

### G-1 — Write failing tests for `PlinkoBoard`

**Acceptance**: Tests collected; all fail.

- [ ] Create `frontend/tests/entities/PlinkoBoard.test.ts` asserting:
  - `PlinkoBoard` constructor accepts a slot count and returns an object.
  - `getPegPositions()` returns `n` rows of staggered pegs within board bounds.
  - `getSlotBounds(index)` returns `{x, y, width}` for each bottom slot.
  - Slot count matches the number of openings (e.g., 6 positions → 6 slots).
  - Board width and height are configurable via constructor options.

### G-2 — Implement `PlinkoBoard` entity (green)

**Acceptance**: `npm test` — all PlinkoBoard tests pass.

- [ ] Create `frontend/src/entities/PlinkoBoard.ts`.
- [ ] Implement peg layout algorithm: triangular grid, alternating row offsets, configurable `rows`, `pegsPerRow`, `pegRadius`.
- [ ] Implement `getSlotBounds(index)` for even slot distribution across board width.

### G-3 — Write failing tests for `PlinkoBall`

**Acceptance**: Tests collected; all fail.

- [ ] Create `frontend/tests/entities/PlinkoBall.test.ts` asserting:
  - `PlinkoBall` accepts a seed and deterministically resolves to the same slot index on repeated runs with the same seed.
  - `drop(board)` returns a slot index within `[0, slotCount - 1]`.
  - Fallback resolver fires if the ball has not exited within the physics timeout (≤ 16 ms simulation time).
  - Simulation time for a single drop is recorded and is within budget.

### G-4 — Implement `PlinkoBall` entity (green)

**Acceptance**: `npm test` — all PlinkoBall tests pass; simulation budget verified.

- [ ] Create `frontend/src/entities/PlinkoBall.ts`.
- [ ] Use Phaser's Matter.js integration (or a standalone deterministic physics simulation) seeded by the provided integer.
- [ ] Implement the fallback resolver: if no exit is detected within 16 ms of simulation time, resolve to `Math.floor(seededRandom() * slotCount)`.

---

## Phase H — Frontend: Phaser Scenes

### H-1 — `BootScene` — load assets and restore session

**Acceptance**: Manual smoke test: app loads in browser; existing `session_id` from `localStorage` is forwarded to `SetupScene` or skipped.

- [ ] Create `frontend/src/scenes/BootScene.ts`.
- [ ] Preload any graphic/audio assets (placeholder sprites acceptable at this stage).
- [ ] Read `session_id` from `localStorage`; pass to next scene via `scene.start("Setup", { session_id })`.

### H-2 — `SetupScene` — draft ID entry form

**Acceptance**: User can type a Sleeper draft ID, submit the form, and the app calls `POST /api/sessions`.

- [ ] Create `frontend/src/scenes/SetupScene.ts`.
- [ ] Render a DOM input and submit button using Phaser's DOM layer (`this.add.dom`).
- [ ] On submit, call `api.createSession(draft_id)`, store `session.id` in `localStorage`, then start `PositionBoardScene`.
- [ ] Show an error message if the API returns `404` or `502`.

### H-3 — `PositionBoardScene` — first plinko board

**Acceptance**: Position board renders with correct number of slots matching open roster positions; ball drop resolves and transitions to player board.

- [ ] Create `frontend/src/scenes/PositionBoardScene.ts`.
- [ ] On `create`, call `api.getOpenPositions(session_id)` and construct a `PlinkoBoard` with `slotCount = openSlots.length`.
- [ ] Render pegs (circles) and slot labels (position names) using Phaser graphics.
- [ ] On user click/tap, instantiate `PlinkoBall`, call `drop(board)`, animate ball falling through pegs.
- [ ] On ball exit, call `api.recordPositionPick(session_id, openSlots[slotIndex].id)`.
- [ ] Transition to `PlayerBoardScene` passing `{session_id, roster_slot_id, position}`.
- [ ] If `getOpenPositions` returns `[]`, show draft-complete state (FR-012).

### H-4 — `PlayerBoardScene` — second plinko board

**Acceptance**: Player board renders with available players; ball drop shows `CongratsScene` with correct player name.

- [ ] Create `frontend/src/scenes/PlayerBoardScene.ts`.
- [ ] On `create`, call `api.syncPicks(session_id)` then `api.getPlayers(session_id, position)`.
- [ ] Construct `PlinkoBoard` with `slotCount = players.length` (cap display at a configurable max if many players).
- [ ] Render player name labels on slots.
- [ ] On ball exit, call `api.recordPlayerPick(session_id, roster_slot_id, players[slotIndex].id)`.
- [ ] Transition to `CongratsScene` passing player data and `session_complete` flag.
- [ ] Handle edge case: if `players.length === 0`, show error and return to `PositionBoardScene` (FR spec: invalid state guard).

### H-5 — `CongratsScene` — draft confirmation overlay

**Acceptance**: Player name is displayed; dismissing returns to `PositionBoardScene` or shows draft-complete message.

- [ ] Create `frontend/src/scenes/CongratsScene.ts`.
- [ ] Display "Draft [First Last]!" text prominently.
- [ ] Show "Draft Complete!" variant when `session_complete === true`.
- [ ] Provide a dismiss button; on dismiss start `PositionBoardScene` (unless complete).

### H-6 — `main.ts` — Phaser bootstrap

**Acceptance**: `npm run dev` renders the game in Chrome/Firefox without console errors.

- [ ] Create `frontend/src/main.ts` instantiating `Phaser.Game` with `Matter` physics, all scenes registered, and responsive canvas sizing.
- [ ] Create `frontend/index.html` loading the Vite entry point.

---

## Phase I — Docker Integration

### I-1 — Write failing Docker smoke test

**Acceptance**: Test script exists and fails because `Dockerfile` does not yet exist.

- [ ] Create `.github/scripts/smoke_test.sh` that:
  1. Runs `docker compose up --build -d`.
  2. Polls `http://localhost:8000/healthz` until `200` or 30-second timeout.
  3. Exits non-zero on timeout.

### I-2 — Create multi-stage `Dockerfile` (green)

**Acceptance**: `docker compose up --build` succeeds; smoke test passes; `GET /healthz` returns `200`; `GET /` returns the Vite index.html.

- [ ] Create `Dockerfile` with two stages:
  - **Stage 1** `frontend-build`: `node:20-slim`, runs `npm ci && npm run build` in `frontend/`, outputs `dist/`.
  - **Stage 2** `backend`: `python:3.12-slim`, installs `uv`, runs `uv sync --no-dev`, copies `frontend/dist/` to `backend/static/`.
- [ ] Mount `backend/static/` via `StaticFiles` in `app/main.py` (serve frontend bundle and catch-all for SPA routing).
- [ ] Set `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.

### I-3 — Create `docker-compose.yml`

**Acceptance**: `docker compose up` starts the service; named volume persists SQLite across `docker compose restart`.

- [ ] Create `docker-compose.yml` with one service `plinko` exposing port `8000`.
- [ ] Mount a named volume `plinko_data` at `/data/` inside the container.
- [ ] Set `DATABASE_URL=sqlite+aiosqlite:////data/plinko.db` as an environment variable.

---

## Phase J — CI Pipeline

### J-1 — Create backend CI job

**Acceptance**: `.github/workflows/ci.yml` exists; `pytest` step runs and coverage gate ≥ 100% for physics and pick-resolution code paths.

- [ ] Create `.github/workflows/ci.yml` with a `backend` job:
  1. Checkout.
  2. Set up Python 3.12 + `uv`.
  3. `uv sync`.
  4. `uv run pytest --cov=app --cov-fail-under=80` (adjust threshold per constitution §III; physics and pick paths at 100%).
  5. Upload coverage report as artifact.

### J-2 — Create frontend CI job

**Acceptance**: `npm test` runs in CI; coverage gate enforced.

- [ ] Add `frontend` job to CI:
  1. Set up Node 20.
  2. `npm ci`.
  3. `npm run typecheck` (`tsc --noEmit`).
  4. `npm test -- --coverage --reporter=verbose`.
  5. Upload coverage report.

### J-3 — Add lint and type-check steps

**Acceptance**: CI fails on type errors or lint violations.

- [ ] Backend: add `ruff check app/ tests/` and `pyright` (or `mypy`) steps.
- [ ] Frontend: `npm run typecheck` already included in J-2; add `eslint` if configured.

### J-4 — Add Docker build step to CI

**Acceptance**: CI builds the Docker image and runs the smoke test on every push.

- [ ] Add `docker` job to CI depending on `backend` and `frontend` jobs:
  1. `docker compose build`.
  2. Run `smoke_test.sh`.

---

## Refactor Milestones (do after each phase's tests are green)

| After phase | Refactor target |
|---|---|
| B | Extract `Base = DeclarativeBase()` to `app/models/base.py` if models grow |
| C | Extract Sleeper base URL to a config module |
| D | Consolidate common 404/409 guard logic into a shared `get_or_404` helper |
| G | Extract physics constants (`PEG_RADIUS`, `BALL_RADIUS`, `GRAVITY`) to a `constants.ts` |
| H | Extract scene-transition helpers to a `SceneManager` utility |

---

## Task Completion Checklist

Before marking any task group done, verify:

- [ ] All tests for that group pass (`pytest` or `npm test`).
- [ ] No `console.log` / `print` statements in production paths.
- [ ] TypeScript: `tsc --noEmit` exits 0.
- [ ] Python: `ruff check` exits 0.
- [ ] Coverage gate not regressed.
