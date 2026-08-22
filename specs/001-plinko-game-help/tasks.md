# Tasks: Fantasy Football Plinko Draft Assistant

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-21 | **Plan**: [plan.md](./plan.md)

All tasks follow the Red-Green-Refactor cycle (constitution §II). Write the failing test first, then the minimum implementation to pass it, then refactor. No implementation task is considered complete until its tests pass and coverage gates are met.

## User Story Traceability

Tasks are organized by technical layer to enforce the test-first dependency order (backend before frontend, models before routes). The table below maps each phase to the spec user story it primarily delivers.

| Phase(s) | Delivers | User Story | Priority |
|---|---|---|---|
| A, B, E, F | Backend + frontend scaffold, ORM, DB init | Foundational — blocks all US | — |
| C-1, C-2, D-1, D-2, H-2 | Sleeper client, session creation, SetupScene | **US4** — Configurable Roster | P2 |
| D-3, D-4, D-7, D-8, G-1–G-5, H-3 | `/positions` + `/position-pick` + physics + PositionBoardScene + SC-001 timing | **US1** — Position Board Drop | P1 |
| D-5, D-6, D-9–D-12, H-4, H-5 | `/players/{pos}` + `/player-pick` + `/sync` + PlayerBoardScene + CongratsScene | **US2** — Player Selection | P1 |
| B-3, B-4, D-3, D-4, H-1 | DB init, session-state endpoint, BootScene restore | **US3** — Persistent State | P2 |
| I, J | Docker, CI | Infrastructure | — |
| K | E2E tests | US1, US2, US3, FR-013 | P1/P2 |

**MVP path (P1 stories only)**: A → B → C → D-1–D-12 → E → F → G → H-1–H-6.

---

## Phase A — Backend: Project Scaffold

### A-1 — Initialize backend project with `uv`

**Acceptance**: `backend/pyproject.toml` exists, `uv sync` succeeds, `uv run python -c "import fastapi"` exits 0.

- [ ] Create `backend/` directory.
- [ ] Create `backend/pyproject.toml` declaring `[project]` metadata and dependencies: `fastapi`, `uvicorn[standard]`, `sqlalchemy[asyncio]`, `aiosqlite`, `httpx`.
- [ ] Add dev dependencies: `pytest`, `pytest-asyncio`, `httpx` (for `AsyncClient`), `respx`, `coverage`.
- [ ] Configure `[tool.pytest.ini_options]` with `asyncio_mode = "auto"` and `testpaths = ["app"]` so co-located `__tests__/` directories are collected.
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

**Acceptance**: `pytest app/models/__tests__/test_orm.py` collects tests and all fail with `ImportError` or `ModuleNotFoundError`.

- [ ] Create `backend/app/models/__tests__/__init__.py`.
- [ ] Create `backend/app/models/__tests__/test_orm.py` with tests asserting:
  - Each model (`Player`, `PlayerCacheMeta`, `PlinkoSession`, `RosterSlot`, `DraftPicksCache`, `PlinkoRun`) is importable from `app.models.orm`.
  - `Player` has columns: `id`, `sleeper_id`, `first_name`, `last_name`, `position`, `team`, `active`, `synced_at`.
  - `RosterSlot` has a composite unique constraint on `(session_id, slot_order)`.
  - `DraftPicksCache` has a composite unique constraint on `(session_id, sleeper_player_id)`.

### B-2 — Implement ORM models (green)

**Acceptance**: `pytest app/models/__tests__/test_orm.py` passes; `uv run python -c "from app.models.orm import Player"` exits 0.

- [ ] Create `backend/app/models/__init__.py`.
- [ ] Create `backend/app/models/orm.py` with `DeclarativeBase` and all six SQLAlchemy models matching the data model in `data-model.md`.
- [ ] Add `(position, active)` index on `Player`.
- [ ] Add `(session_id, filled_at)` index on `RosterSlot`.

### B-3 — Write failing tests for `db.py` (DB init)

**Acceptance**: Test file collected, tests fail.

- [ ] Create `backend/app/__tests__/test_db.py` asserting:
  - `init_db()` is callable and creates all tables in a fresh in-memory SQLite database.
  - `get_session()` is an async context manager that yields a live `AsyncSession`.

### B-4 — Implement `db.py` (green)

**Acceptance**: `pytest app/__tests__/test_db.py` passes.

- [ ] Create `backend/app/db.py` with:
  - Async engine configured from `DATABASE_URL` env var (default `sqlite+aiosqlite:///./data/plinko.db`).
  - `PRAGMA foreign_keys = ON` on every connection via an `@event.listens_for(engine.sync_engine, "connect")` hook.
  - `init_db()` async function calling `metadata.create_all`.
  - `get_session()` async generator for use as a FastAPI dependency.
- [ ] Wire `init_db()` call into `app.main` lifespan handler.

---

## Phase C — Backend: Sleeper Service (test-first) · US4

### C-1 — Write failing tests for `sleeper.py` [US4]

**Acceptance**: Test file collected; all tests fail.

- [ ] Create `backend/app/services/__tests__/test_sleeper_service.py` with tests using `httpx` mock transport (or `respx`) to assert:
  - `fetch_draft(draft_id)` calls `GET https://api.sleeper.app/v1/draft/{draft_id}` and returns a parsed dict.
  - `fetch_picks(draft_id)` calls `GET https://api.sleeper.app/v1/draft/{draft_id}/picks` and returns a list.
  - `fetch_players()` calls `GET https://api.sleeper.app/v1/players/nfl` and returns a dict keyed by `player_id`.
  - `fetch_draft` raises `httpx.HTTPStatusError` on 404; the caller receives a FastAPI `404` response.
  - `fetch_draft` raises a `502`-equivalent on connection error.

### C-2 — Implement `sleeper.py` (green) [US4]

**Acceptance**: `pytest app/services/__tests__/test_sleeper_service.py` passes.

- [ ] Create `backend/app/services/__init__.py`.
- [ ] Create `backend/app/services/sleeper.py` with an `httpx.AsyncClient` (base URL `https://api.sleeper.app/v1`) and three async functions: `fetch_draft`, `fetch_picks`, `fetch_players`.
- [ ] Map HTTP 404 → FastAPI `HTTPException(404)` and connection errors → `HTTPException(502)`.

### C-3 — Write failing tests for `availability.py` [US1, US2]

**Acceptance**: Test file collected; tests fail.

- [ ] Create `backend/app/services/__tests__/test_availability.py` asserting:
  - `get_available_players(session, session_id, position)` returns only players matching the position (or FLEX union) whose `sleeper_id` is not in `draft_picks_cache` for that session.
  - FLEX position correctly queries `position IN ("RB", "WR", "TE")`.
  - Results are sorted `last_name ASC, first_name ASC`.
  - The query reads only from local tables and does not call Sleeper directly.

### C-4 — Implement `availability.py` (green) [US1, US2]

**Acceptance**: `pytest app/services/__tests__/test_availability.py` passes.

- [ ] Create `backend/app/services/availability.py` implementing the SQL query from `data-model.md § Availability Query Logic`.
- [ ] Define `FLEX_POSITIONS = ("RB", "WR", "TE")` and `VALID_POSITIONS` constants.

---

## Phase D — Backend: API Routes (test-first) · US1, US2, US3, US4

### D-1 — Write failing tests for `POST /api/sessions` [US4]

**Acceptance**: Test file collected; tests fail (route does not exist).

- [ ] Create `backend/app/api/__tests__/test_sessions.py` with `httpx.AsyncClient(app=app)` tests for `POST /api/sessions`:
  - `201` with valid `sleeper_draft_id` — response body matches contract shape (session + roster_slots).
  - `400` when `sleeper_draft_id` is missing.
  - `404` when Sleeper returns 404 (mock the sleeper service).
  - `502` when Sleeper is unreachable.
- [ ] Mock `sleeper.fetch_draft` to return a fixture with `settings.slots_qb: 1`, `slots_rb: 2`, `slots_wr: 2`, `slots_te: 1`, `slots_flex: 1`, `slots_k: 1`, `slots_def: 1`.
- [ ] Mock `sleeper.fetch_picks` to return an empty list.
- [ ] Mock `sleeper.fetch_players` to return a minimal player dict.

### D-2 — Implement `POST /api/sessions` (green) [US4]

**Acceptance**: `pytest app/api/__tests__/test_sessions.py::test_create_session*` passes.

- [ ] Create `backend/app/api/__init__.py`.
- [ ] Create `backend/app/api/sessions.py` with the `POST /api/sessions` route implementing all five behavior steps from `contracts/api.md`.
- [ ] Register the router in `app/main.py` under `/api`.

### D-3 — Write failing tests for `GET /api/sessions/{id}` and `GET /api/sessions/{id}/positions` [US1, US3]

- [ ] Add tests to `app/api/__tests__/test_sessions.py`:
  - `GET /api/sessions/1` → `200` with full session + roster_slots (mix of filled/unfilled).
  - `GET /api/sessions/999` → `404`.
  - `GET /api/sessions/1/positions` → `200` array of only open slots.
  - `GET /api/sessions/1/positions` → `[]` when all slots are filled.

### D-4 — Implement `GET /api/sessions/{id}` and `GET /api/sessions/{id}/positions` (green) [US1, US3]

**Acceptance**: All new tests pass.

- [ ] Add both routes to `backend/app/api/sessions.py`.

### D-5 — Write failing tests for `GET /api/sessions/{id}/players/{pos}` [US2]

- [ ] Create `backend/app/api/__tests__/test_players.py` with tests for:
  - `200` returns player list filtered by position and excluding locally cached draft picks.
  - FLEX returns union of RB, WR, TE.
  - `400` on unknown position.
  - `404` on unknown session.
  - `409` when no open slot exists for that position.

### D-6 — Implement `GET /api/sessions/{id}/players/{pos}` (green) [US2]

**Acceptance**: `pytest app/api/__tests__/test_players.py` passes.

- [ ] Create `backend/app/api/players.py` and register under `/api`.

### D-7 — Write failing tests for `POST /api/sessions/{id}/position-pick` [US1]

- [ ] Add tests to `app/api/__tests__/test_sessions.py`:
  - `200` returns `{run_id, position}` for a valid open slot.
  - `409` when slot is already filled.
  - `404` when slot ID does not belong to session.

### D-8 — Implement `POST /api/sessions/{id}/position-pick` (green) [US1]

**Acceptance**: All new tests pass.

- [ ] Add route to `backend/app/api/sessions.py`.

### D-9 — Write failing tests for `POST /api/sessions/{id}/player-pick` [US2]

- [ ] Add tests:
  - `200` returns `{run_id, player, session_complete: false}` for a valid pick.
  - `session_complete: true` when this pick fills the last open slot.
  - `409` when player already in `draft_picks_cache` for this session.
  - `409` when slot already filled.

### D-10 — Implement `POST /api/sessions/{id}/player-pick` (green) [US2]

**Acceptance**: All new tests pass.

- [ ] Add route; set `filled_at`, `player_id` on `RosterSlot`; set `completed_at` on session when all slots are filled.

### D-11 — Write failing tests for `POST /api/sessions/{id}/sync` [US2]

- [ ] Add tests:
  - `200` returns `{picks_synced, synced_at}`.
  - On Sleeper 502, returns `200` with cached count (non-fatal).
  - A subsequent `GET /api/sessions/{id}/players/{pos}` reads from the refreshed cache without calling Sleeper again.

### D-12 — Implement `POST /api/sessions/{id}/sync` (green) [US2]

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
- [ ] Create `frontend/vite.config.ts` with `/api` proxy pointing to `http://localhost:8000` and Vitest `coverage.thresholds` set to `{ "src/entities/**": { branches: 100, functions: 100 } }` (constitution §III).

---

## Phase F — Frontend: Types and API Service Layer (test-first)

### F-1 — Write failing tests for `api.ts`

**Acceptance**: `npm test` collects tests; all fail (module not found).

- [ ] Create `frontend/src/services/__tests__/api.test.ts` using Vitest `vi.spyOn(globalThis, "fetch")` to mock HTTP calls, asserting:
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

## Phase G — Frontend: Plinko Physics Entities (test-first) · US1, US2

### G-1 — Write failing tests for `PlinkoBoard` [US1, US2]

**Acceptance**: Tests collected; all fail.

- [ ] Create `frontend/src/entities/__tests__/PlinkoBoard.test.ts` asserting:
  - `PlinkoBoard` constructor accepts a slot count and returns an object.
  - `getPegPositions()` returns `n` rows of staggered pegs within board bounds.
  - `getSlotBounds(index)` returns `{x, y, width}` for each bottom slot.
  - Slot count matches the number of openings (e.g., 6 positions → 6 slots).
  - Board width and height are configurable via constructor options.

### G-2 — Implement `PlinkoBoard` entity (green) [US1, US2]

**Acceptance**: `npm test` — all PlinkoBoard tests pass.

- [ ] Create `frontend/src/entities/PlinkoBoard.ts`.
- [ ] Implement peg layout algorithm: triangular grid, alternating row offsets, configurable `rows`, `pegsPerRow`, `pegRadius`.
- [ ] Implement `getSlotBounds(index)` for even slot distribution across board width.

### G-3 — Write failing tests for `PlinkoBall` [US1, US2]

**Acceptance**: Tests collected; all fail.

- [ ] Create `frontend/src/entities/__tests__/PlinkoBall.test.ts` asserting:
  - `PlinkoBall` accepts a seed and deterministically resolves to the same slot index on repeated runs with the same seed.
  - `drop(board)` returns a slot index within `[0, slotCount - 1]`.
  - Fallback resolver fires if the ball has not exited before exceeding the per-frame physics/update budget (≤ 16 ms).
  - Physics/update timing for the drop loop is recorded and stays within budget.

### G-4 — Implement `PlinkoBall` entity (green) [US1, US2]

**Acceptance**: `npm test` — all PlinkoBall tests pass; simulation budget verified.

- [ ] Create `frontend/src/entities/PlinkoBall.ts`.
- [ ] Use Phaser's Matter.js integration (or a standalone deterministic physics simulation) seeded by the provided integer.
- [ ] Implement the fallback resolver: if no exit is detected before exceeding the 16 ms per-frame physics/update budget, resolve to `Math.floor(seededRandom() * slotCount)`.

---

### G-5 — Write performance tests for SC-001 API budget [SC-001]

**Acceptance**: All new tests pass; combined mocked-API + physics path completes within 500 ms.

- [ ] Add a test to `frontend/src/services/__tests__/api.test.ts` asserting:
  - A full pick cycle (`recordPositionPick` mock → `recordPlayerPick` mock) measured with `performance.now()` completes within 500 ms.
- [ ] Add a backend pytest test to `app/api/__tests__/test_sessions.py` asserting:
  - `POST /api/sessions/{id}/position-pick` responds within 200 ms under in-process `AsyncClient` (in-memory SQLite, no Sleeper calls).
  - `POST /api/sessions/{id}/player-pick` responds within 200 ms under the same conditions.

---

## Phase H — Frontend: Phaser Scenes · US1, US2, US3, US4

### H-1 — `BootScene` — load assets and restore session [US3]

**Acceptance**: Manual smoke test: app loads in browser; existing `session_id` from `localStorage` is forwarded to `SetupScene` or skipped.

- [ ] Create `frontend/src/scenes/BootScene.ts`.
- [ ] Preload any graphic/audio assets (placeholder sprites acceptable at this stage).
- [ ] Read `session_id` from `localStorage`; pass to next scene via `scene.start("Setup", { session_id })`.

### H-2 — `SetupScene` — draft ID entry form [US4]

**Acceptance**: User can type a Sleeper draft ID, submit the form, and the app calls `POST /api/sessions`.

- [ ] Create `frontend/src/scenes/SetupScene.ts`.
- [ ] Render a DOM input and submit button using Phaser's DOM layer (`this.add.dom`).
- [ ] On submit, call `api.createSession(draft_id)`, store `session.id` in `localStorage`, then start `PositionBoardScene`.
- [ ] Show an error message if the API returns `404` or `502`.

### H-3 — `PositionBoardScene` — first plinko board [US1]

**Acceptance**: Position board renders with correct number of slots matching open roster positions; ball drop resolves and transitions to player board.

- [ ] Create `frontend/src/scenes/PositionBoardScene.ts`.
- [ ] On `create`, call `api.getOpenPositions(session_id)` and construct a `PlinkoBoard` with `slotCount = openSlots.length`.
- [ ] Render pegs (circles) and slot labels (position names) using Phaser graphics.
- [ ] On user click/tap, instantiate `PlinkoBall`, call `drop(board)`, animate ball falling through pegs.
- [ ] On ball exit, call `api.recordPositionPick(session_id, openSlots[slotIndex].id)`.
- [ ] Transition to `PlayerBoardScene` passing `{session_id, roster_slot_id, position}`.
- [ ] If `getOpenPositions` returns `[]`, show draft-complete state (FR-012).

### H-4 — `PlayerBoardScene` — second plinko board [US2]

**Acceptance**: Player board renders with available players; ball drop shows `CongratsScene` with correct player name.

- [ ] Create `frontend/src/scenes/PlayerBoardScene.ts`.
- [ ] On `create`, call `api.syncPicks(session_id)` as the explicit freshness step, then `api.getPlayers(session_id, position)`.
- [ ] Construct `PlinkoBoard` with `slotCount = players.length` (cap display at a configurable max if many players).
- [ ] Render player name labels on slots.
- [ ] On ball exit, call `api.recordPlayerPick(session_id, roster_slot_id, players[slotIndex].id)`.
- [ ] Transition to `CongratsScene` passing player data and `session_complete` flag.
- [ ] Handle edge case: if `players.length === 0`, show error and return to `PositionBoardScene` (FR spec: invalid state guard).

### H-5 — `CongratsScene` — draft confirmation overlay [US2]

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
  4. `uv run pytest --cov=app --cov-fail-under=80`
  5. `uv run pytest app/api/ app/services/ --cov=app/api --cov=app/services --cov-branch --cov-fail-under=100` (constitution §III: 100% branch coverage on pick-resolution paths).
  6. Upload coverage report as artifact.

### J-2 — Create frontend CI job

**Acceptance**: `npm test` runs in CI; coverage gate enforced.

- [ ] Add `frontend` job to CI:
  1. Set up Node 20.
  2. `npm ci`.
  3. `npm run typecheck` (`tsc --noEmit`).
  4. `npm test -- --coverage --reporter=verbose` (Vitest `coverageThreshold` for `src/entities/**` set to 100% branches — configured in E-1).
  5. Upload coverage report.

### J-3 — Add lint and type-check steps

**Acceptance**: CI fails on type errors or lint violations.

- [ ] Backend: add `ruff check app/` and `pyright` (or `mypy`) steps.
- [ ] Frontend: `npm run typecheck` already included in J-2; add `eslint` if configured.

### J-4 — Add Docker build step to CI

**Acceptance**: CI builds the Docker image and runs the smoke test on every push.

- [ ] Add `docker` job to CI depending on `backend` and `frontend` jobs:
  1. `docker compose build`.
  2. Run `smoke_test.sh`.

---

## Phase K — End-to-End Tests · US1, US2, US3, FR-013

### K-1 — Set up Playwright

**Acceptance**: `npm run e2e` runs against the Docker stack at `http://localhost:8000` and exits 0.

- [ ] Add `@playwright/test` as a dev dependency in `frontend/package.json`.
- [ ] Create `e2e/playwright.config.ts` with `baseURL: "http://localhost:8000"` and a `webServer` block that starts `docker compose up`.
- [ ] Add `"e2e": "playwright test"` to `frontend/package.json` scripts.

### K-2 — E2E: Happy path — position pick + player pick [US1, US2]

**Acceptance**: Test navigates the app end-to-end; CongratsScene displays a player name without error.

- [ ] Create `e2e/happy-path.spec.ts`:
  - Given: backend running with a seeded test session (fixture `draft_id` backed by a stubbed Sleeper response or pre-seeded in-memory SQLite).
  - Navigate to app; enter `draft_id`; submit SetupScene form.
  - Click drop on position board; assert transition to player board.
  - Click drop on player board; assert CongratsScene contains "Draft " text.

### K-3 — E2E: Multi-round state persistence [US3]

**Acceptance**: After two rounds, the position used in round 1 is absent from the position board in round 2.

- [ ] Create `e2e/multi-round.spec.ts`:
  - Complete one full pick cycle (position + player).
  - On the next position board render, assert the previously filled position slot is absent or visually closed.
  - Complete a second full pick cycle for a different position.
  - Assert two positions are filled and two players are absent from future boards.

### K-4 — E2E: Page-refresh session recovery [FR-013]

**Acceptance**: After a hard page refresh mid-draft, the app resumes from the same draft state without data loss.

- [ ] Create `e2e/refresh-recovery.spec.ts`:
  - Complete one full pick cycle.
  - Call `page.reload()`.
  - Assert the app reconnects (SetupScene is not shown) and the previously filled position remains absent from the board.

### K-5 — Add E2E job to CI

**Acceptance**: The `e2e` CI job runs after the `docker` job and fails the pipeline on any E2E test failure.

- [ ] Add `e2e` job to `.github/workflows/ci.yml` with `needs: [docker]`:
  1. `docker compose up -d`.
  2. Poll `GET /healthz` until 200 (reuse `smoke_test.sh` logic or inline).
  3. `npm run e2e`.
  4. `docker compose down`.

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
