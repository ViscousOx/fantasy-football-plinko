# Tasks: Fantasy Football Plinko Draft Assistant

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-19 | **Plan**: [plan.md](./plan.md)

All tasks follow the Red-Green-Refactor cycle mandated by constitution §II.
Write the failing test first, make it pass with the minimal implementation, then refactor.

---

## Phase 1 — Backend: Project Scaffold & ORM

### T-001 — Backend project scaffold
- Create `backend/` directory with `pyproject.toml` (uv-managed).
- Declare dependencies: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `httpx`.
- Declare dev-dependencies: `pytest`, `pytest-asyncio`, `httpx` (for `AsyncClient`), `coverage`.
- Create `backend/app/__init__.py`, `backend/app/main.py` (empty FastAPI app), `backend/app/db.py` (stub).
- **Verify**: `uv run uvicorn app.main:app --port 8000` starts without error.

### T-002 — ORM models (RED)
- Write `backend/tests/test_orm.py`:
  - Import all five SQLAlchemy models (`Player`, `PlayerCacheMeta`, `PlinkoSession`, `RosterSlot`, `DraftPicksCache`, `PlinkoRun`).
  - Assert each model maps to its expected table name.
  - Assert column names, types, and nullable constraints match `data-model.md`.
- Run tests → all fail (models not yet defined).

### T-003 — ORM models (GREEN)
- Create `backend/app/models/orm.py` with all six SQLAlchemy declarative models per `data-model.md`:
  - `players`, `player_cache_meta`, `plinko_sessions`, `roster_slots`, `draft_picks_cache`, `plinko_runs`.
  - Add composite indexes: `(position, active)` on `players`; `(session_id, filled_at)` on `roster_slots`.
  - Add unique constraints: `(session_id, slot_order)` on `roster_slots`; `(session_id, sleeper_player_id)` on `draft_picks_cache`.
- Run `test_orm.py` → all pass.

### T-004 — DB init & async session factory (RED)
- Extend `test_orm.py` (or add `test_db.py`):
  - Call `init_db()` and assert all tables exist in an in-memory SQLite database.
  - Assert `PRAGMA foreign_keys` is ON for every new connection.
- Run → fail.

### T-005 — DB init & async session factory (GREEN)
- Implement `backend/app/db.py`:
  - `create_async_engine` with `aiosqlite`, database URL from env var `DATABASE_URL` (default `sqlite+aiosqlite:///./plinko.db`).
  - `async_sessionmaker` factory.
  - `init_db()` coroutine that runs `CREATE TABLE IF NOT EXISTS` via `metadata.create_all`.
  - Event listener to emit `PRAGMA foreign_keys = ON` on each new connection.
- Run tests → pass.

---

## Phase 2 — Backend: Sleeper Service

### T-006 — Sleeper client interface (RED)
- Create `backend/tests/test_sleeper_service.py`.
- Using `httpx` respx mock (or `unittest.mock`), write tests for:
  - `get_draft(draft_id)` → parses `settings.slots_*`, returns a dict of `{position: count}` excluding bench.
  - `get_draft_picks(draft_id)` → returns list of `sleeper_player_id` strings.
  - `get_players()` → returns a dict of player objects keyed by `player_id`.
  - `get_draft` raises `SleeperNotFoundError` when Sleeper returns 404.
  - `get_draft` raises `SleeperUnavailableError` when connection fails.
- Run → fail.

### T-007 — Sleeper client (GREEN)
- Create `backend/app/services/sleeper.py`:
  - `httpx.AsyncClient` with base URL `https://api.sleeper.app/v1`.
  - Implement `get_draft`, `get_draft_picks`, `get_players` as async functions.
  - Define `SleeperNotFoundError` and `SleeperUnavailableError` custom exceptions.
  - Map `slots_bn` (bench) to exclusion list so bench slots are stripped from `get_draft` output.
- Run `test_sleeper_service.py` → all pass.

### T-008 — Player cache sync logic (RED)
- Add tests to `test_sleeper_service.py` (or new `test_availability.py`):
  - `sync_players(db)` inserts new players and upserts existing ones; `player_cache_meta.last_synced_at` is updated.
  - `ensure_players_fresh(db)` calls `sync_players` when `last_synced_at` is NULL or > 24 hours ago; skips otherwise.
- Run → fail.

### T-009 — Player cache sync logic (GREEN)
- Implement `sync_players` and `ensure_players_fresh` in `backend/app/services/sleeper.py` (or a new `cache.py`).
- Use SQLAlchemy upsert (`INSERT OR REPLACE` for SQLite).
- Run tests → pass.

---

## Phase 3 — Backend: API Routes

### T-010 — `POST /api/sessions` (RED)
- Create `backend/tests/test_sessions.py` with an `AsyncClient` fixture pointing at the FastAPI app.
- Test: valid `sleeper_draft_id` → 201, response body matches contract shape (id, roster_slots array).
- Test: missing `sleeper_draft_id` → 400.
- Test: Sleeper 404 → 404.
- Test: Sleeper unreachable → 502.
- Run → fail.

### T-011 — `POST /api/sessions` (GREEN)
- Create `backend/app/api/sessions.py` with the `POST /api/sessions` route.
- Wire `sleeper.get_draft` → create `plinko_sessions` row → seed `roster_slots` → call `get_draft_picks` → seed `draft_picks_cache` → call `ensure_players_fresh`.
- Mount router in `backend/app/main.py`.
- Run tests → pass.

### T-012 — `GET /api/sessions/{id}` (RED)
- Add test: existing session → 200, full slot list with player objects.
- Add test: unknown session → 404.
- Run → fail.

### T-013 — `GET /api/sessions/{id}` (GREEN)
- Add route handler; eager-load `roster_slots` → `player`.
- Run tests → pass.

### T-014 — `GET /api/sessions/{id}/positions` (RED)
- Add test: returns only unfilled slots.
- Add test: returns `[]` when all slots filled.
- Run → fail.

### T-015 — `GET /api/sessions/{id}/positions` (GREEN)
- Add route; filter `roster_slots` where `filled_at IS NULL`.
- Run tests → pass.

### T-016 — `GET /api/sessions/{id}/players/{position}` (RED)
- Create `backend/tests/test_players.py`.
- Test: known position returns players not in `draft_picks_cache`, sorted by last/first name.
- Test: FLEX returns union of RB + WR + TE.
- Test: unknown position → 400.
- Test: no open slot for position → 409.
- Run → fail.

### T-017 — `GET /api/sessions/{id}/players/{position}` (GREEN)
- Create `backend/app/api/players.py`.
- Implement availability query per `data-model.md` (parameterized IN clause, FLEX expansion).
- Run tests → pass.

### T-018 — `POST /api/sessions/{id}/position-pick` (RED)
- Add tests to `test_sessions.py`:
  - Valid slot → 200, returns `{run_id, position}`.
  - Slot from different session → 404.
  - Already-filled slot → 409.
- Run → fail.

### T-019 — `POST /api/sessions/{id}/position-pick` (GREEN)
- Add route; validate slot ownership and open state; insert `plinko_runs` row with `board="position"`.
- Run tests → pass.

### T-020 — `POST /api/sessions/{id}/player-pick` (RED)
- Add tests:
  - Valid pick → 200, fills slot, returns player and `session_complete: false`.
  - Last slot filled → `session_complete: true`, `completed_at` set on session.
  - Player already in another slot → 409.
  - Player in `draft_picks_cache` → 409.
- Run → fail.

### T-021 — `POST /api/sessions/{id}/player-pick` (GREEN)
- Add route; validate slot + player availability; set `filled_at` + `player_id`; insert `plinko_runs`; check if all slots filled.
- Run tests → pass.

### T-022 — `POST /api/sessions/{id}/sync` (RED)
- Add tests:
  - Successful sync → 200, `{picks_synced, synced_at}`.
  - Sleeper unreachable → 502 with last-known cache data.
- Run → fail.

### T-023 — `POST /api/sessions/{id}/sync` (GREEN)
- Add route; call `get_draft_picks`; upsert `draft_picks_cache`; update `picks_last_synced_at`.
- Run tests → pass.

### T-024 — Backend coverage gate
- Configure `pytest-cov` in `pyproject.toml` with `--cov=app --cov-fail-under=90`.
- Confirm all tests pass and coverage gate is met.
- Add structured JSON logging to FastAPI app (replace any `print`/`console.log` equivalents with Python `logging`).

---

## Phase 4 — Frontend: Project Scaffold & Types

### T-025 — Frontend project scaffold
- Create `frontend/` with `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`.
- Add dependencies: `phaser` (latest stable 4.x — verify release tag per research.md risk note).
- Add dev-dependencies: `vite`, `typescript`, `vitest`, `@vitest/browser`.
- Configure Vite dev-server proxy: `/api` → `http://localhost:8000`.
- **Verify**: `npm run dev` starts; `npm run build` produces `dist/`.

### T-026 — TypeScript type definitions
- Create `frontend/src/types/index.ts` with all interfaces and the `Position` union type per `data-model.md`:
  - `Session`, `RosterSlot`, `Player`, `Position`, `PositionPickPayload`, `PlayerPickPayload`.
- No tests required; types are validated at compile time (`tsc --noEmit`).

### T-027 — API service layer (RED)
- Create `frontend/tests/services/api.test.ts`.
- Mock `globalThis.fetch`; write tests for every function in `api.ts`:
  - `createSession(draft_id)` → calls `POST /api/sessions`, returns `Session`.
  - `getSession(id)` → `GET /api/sessions/{id}`.
  - `getPositions(id)` → `GET /api/sessions/{id}/positions`, returns `RosterSlot[]`.
  - `getPlayers(id, pos)` → `GET /api/sessions/{id}/players/{pos}`, returns `Player[]`.
  - `postPositionPick(id, payload)` → `POST /api/sessions/{id}/position-pick`.
  - `postPlayerPick(id, payload)` → `POST /api/sessions/{id}/player-pick`.
  - `syncPicks(id)` → `POST /api/sessions/{id}/sync`.
  - Each function throws a typed error on non-2xx responses.
- Run (`npx vitest`) → fail.

### T-028 — API service layer (GREEN)
- Create `frontend/src/services/api.ts` implementing all seven typed fetch wrappers.
- Run tests → pass.

---

## Phase 5 — Frontend: Plinko Physics Entities

### T-029 — `PlinkoBoard` unit tests (RED)
- Create `frontend/tests/entities/PlinkoBoard.test.ts`.
- Tests (headless, no Phaser renderer):
  - `PlinkoBoard` constructor accepts a `slots: string[]` array and a `pegRows` count.
  - `getPegPositions()` returns a grid of `{x, y}` objects; count = `pegRows * pegsPerRow` (verify formula).
  - `getSlotBounds()` returns one bounding box per slot entry, evenly distributed across board width.
  - All slot labels from `slots` are present in `getSlotBounds()` results.
- Run → fail.

### T-030 — `PlinkoBoard` (GREEN)
- Create `frontend/src/entities/PlinkoBoard.ts`.
- Implement pure layout math (no Phaser dependency) for `getPegPositions` and `getSlotBounds`.
- Run tests → pass.

### T-031 — `PlinkoBall` unit tests (RED)
- Create `frontend/tests/entities/PlinkoBall.test.ts`.
- Tests:
  - `PlinkoBall` constructor stores a deterministic seed.
  - `simulate(board: PlinkoBoard): string` returns a slot label present in `board.getSlotBounds()`.
  - Same seed always returns the same slot label (determinism guarantee for SC-002 + tests).
  - Simulation completes in ≤ 16 ms (performance budget SC-002) — measure with `performance.now()`.
  - With no valid slot found before timeout, `simulate` still returns a slot label (fallback, FR-014).
- Run → fail.

### T-032 — `PlinkoBall` (GREEN)
- Create `frontend/src/entities/PlinkoBall.ts`.
- Implement a seeded pseudo-random physics simulation (no full Matter.js integration yet — use a lightweight deterministic path-tracing model that satisfies the ≤ 16 ms budget).
- Run tests → pass.

### T-033 — `PlinkoBoard` + `PlinkoBall` refactor
- Extract shared constants (board width, peg radius, slot height) to `frontend/src/entities/constants.ts`.
- Ensure 100% branch coverage on physics/pick-resolution paths per constitution §III.
- Run tests → pass; coverage report shows 100% on `entities/`.

---

## Phase 6 — Frontend: Phaser Scenes

### T-034 — `BootScene`
- Create `frontend/src/scenes/BootScene.ts`.
- On `create()`: read `session_id` from `localStorage`; if present, transition to `PositionBoardScene`; otherwise transition to `SetupScene`.
- No Phaser renderer test needed; scene logic is trivially unit-testable via a mock `this.scene.start`.

### T-035 — `SetupScene`
- Create `frontend/src/scenes/SetupScene.ts`.
- Render a DOM overlay (Phaser DOM element) with a `<input>` for `sleeper_draft_id` and a submit button.
- On submit: call `api.createSession(draft_id)`, store `session.id` in `localStorage`, transition to `PositionBoardScene`.
- Handle 400/404/502 errors with on-screen error text.

### T-036 — `PositionBoardScene` (RED)
- Add `frontend/tests/scenes/PositionBoardScene.test.ts` (Vitest browser mode or lightweight mock).
- Test: given mocked `getPositions` returning 3 open slots, scene creates a `PlinkoBoard` with 3 slot labels.
- Test: after `simulate()` resolves, `postPositionPick` is called with the correct `roster_slot_id`.
- Test: scene transitions to `PlayerBoardScene` with the resolved position and slot id.
- Test: if `getPositions` returns `[]`, scene displays draft-complete message (FR-012).
- Run → fail.

### T-037 — `PositionBoardScene` (GREEN)
- Create `frontend/src/scenes/PositionBoardScene.ts`.
- `preload()`: load peg and ball assets.
- `create()`: fetch `getPositions`, build `PlinkoBoard` with position labels, render pegs + slot labels with Phaser GameObjects.
- On user click/tap: instantiate `PlinkoBall`, animate drop (Phaser tween or Matter.js world), on outcome call `postPositionPick`, transition.
- Run tests → pass.

### T-038 — `PlayerBoardScene` (RED)
- Add `frontend/tests/scenes/PlayerBoardScene.test.ts`.
- Test: given mocked `getPlayers` for a position, scene creates a `PlinkoBoard` with player full-name labels.
- Test: after `simulate()` resolves, `postPlayerPick` is called with correct `roster_slot_id` + `player_id`.
- Test: scene transitions to `CongratsScene` with the resolved player object.
- Run → fail.

### T-039 — `PlayerBoardScene` (GREEN)
- Create `frontend/src/scenes/PlayerBoardScene.ts`.
- On enter: call `api.syncPicks(session_id)` then `api.getPlayers(session_id, position)`.
- Build `PlinkoBoard` from player list, animate ball, on outcome call `postPlayerPick`, pass player to `CongratsScene`.
- Run tests → pass.

### T-040 — `CongratsScene`
- Create `frontend/src/scenes/CongratsScene.ts`.
- Display "Draft [first_name] [last_name]!" in large text centered on screen.
- Provide a "Next Pick" button that returns to `PositionBoardScene`.
- If `session_complete` flag is true, replace button with "Draft Complete!" message and clear `localStorage`.

### T-041 — `main.ts` bootstrap
- Create `frontend/src/main.ts`:
  - Configure `Phaser.Game` with Matter.js physics, all five scenes registered, canvas dimensions.
  - Import `BootScene` as the first scene.
- Run `npm run build` → zero TypeScript errors, bundle produced in `dist/`.

---

## Phase 7 — Docker Integration

### T-042 — `Dockerfile` (multi-stage)
- Create `Dockerfile` at repo root.
- Stage 1 `frontend-build`: `node:20-slim`, `COPY frontend/ .`, `npm ci && npm run build`.
- Stage 2 `backend`: `python:3.12-slim`, install `uv`, `COPY backend/ .`, `uv sync --no-dev`, `COPY --from=frontend-build /app/dist ./static/`.
- Configure `backend/app/main.py` to serve `static/` via `StaticFiles` mounted at `/`.
- Expose port 8000; `CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`.

### T-043 — `docker-compose.yml`
- Create `docker-compose.yml` at repo root.
- Single service `plinko` using the `Dockerfile`.
- Mount named volume `plinko_data` → `/data/`; set `DATABASE_URL=sqlite+aiosqlite:////data/plinko.db`.
- Expose `8000:8000`.
- **Verify**: `docker compose up --build` → app reachable at `http://localhost:8000`, SQLite file persists across `docker compose restart`.

### T-044 — `.gitignore` and repo hygiene
- Ensure `.gitignore` excludes: `frontend/node_modules/`, `frontend/dist/`, `backend/.venv/`, `backend/uv.lock` (if generated), `*.db`, `__pycache__/`, `.pytest_cache/`, `coverage/`.

---

## Phase 8 — CI Pipeline

### T-045 — GitHub Actions workflow
- Create `.github/workflows/ci.yml`.
- Jobs (run in order, each depends on the prior):
  1. **lint-backend**: `ruff check app/ tests/` (add `ruff` to dev dependencies).
  2. **typecheck-frontend**: `npm run build` (tsc strict mode catches all type errors).
  3. **test-backend**: `uv run pytest --cov=app --cov-fail-under=90`.
  4. **test-frontend**: `npx vitest run --coverage` with coverage threshold ≥ 90%; physics/pick-resolution paths must show 100%.
  5. **docker-build**: `docker compose build` (no push).
- Trigger: `push` and `pull_request` on `001-plinko-game-help` and `main`.

### T-046 — Performance regression guard
- Add a Vitest test in `frontend/tests/entities/PlinkoBall.test.ts` (already started in T-031) that asserts simulation time ≤ 16 ms over 1000 runs.
- Add a pytest benchmark (or timing assertion) in `test_players.py` that the availability query returns in ≤ 100 ms against a 5,000-player fixture.

---

## Task Summary

| Phase | Tasks | Focus |
|---|---|---|
| 1 — Backend Scaffold & ORM | T-001 – T-005 | Project setup, models, DB init |
| 2 — Sleeper Service | T-006 – T-009 | HTTP client, player cache |
| 3 — Backend API Routes | T-010 – T-024 | All 7 endpoints + coverage gate |
| 4 — Frontend Scaffold & Types | T-025 – T-028 | Vite, types, API service layer |
| 5 — Physics Entities | T-029 – T-033 | `PlinkoBoard`, `PlinkoBall`, 100% coverage |
| 6 — Phaser Scenes | T-034 – T-041 | All 5 scenes, full wiring |
| 7 — Docker | T-042 – T-044 | Multi-stage image, compose, gitignore |
| 8 — CI | T-045 – T-046 | GitHub Actions, perf regression guard |

**Total tasks**: 46
