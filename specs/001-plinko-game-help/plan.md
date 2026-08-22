# Implementation Plan: Fantasy Football Plinko Draft Assistant

**Branch**: `001-plinko-game-help` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-plinko-game-help/spec.md`

## Summary

Build a browser-based plinko game that helps a user navigate their fantasy football draft. A first plinko board determines which roster position to fill; a second board selects the specific player from the live pool of undrafted players in the user's Sleeper league draft. State is persisted in a SQLite database via a FastAPI backend, and available players are derived from a locally cached active-player dictionary plus live Sleeper draft-pick syncs.

## Technical Context

**Language/Version**: TypeScript 5.x (frontend) | Python 3.12 (backend)

**Primary Dependencies**:
- Frontend: Phaser 3, Vite
- Backend: FastAPI, SQLAlchemy (async), aiosqlite, httpx, uvicorn

**Storage**: SQLite (single-file, volume-mounted in Docker)

**Testing**:
- Frontend: Vitest + `@vitest/browser` for physics/scene unit tests
- Backend: pytest + pytest-asyncio + httpx `AsyncClient`

**Target Platform**: Docker container (Linux), browser (Chrome/Firefox desktop primary)

**Project Type**: Web application — SPA frontend served by the backend

**Performance Goals**:
- Plinko physics/update step: ≤ 16 ms per frame (constitution IV)
- Time-to-Interactive: ≤ 3 s on median mobile (constitution IV)
- Sleeper pick sync: ≤ 30-second TTL
- API pick endpoints: ≤ 200 ms each under in-process load (SC-001 decomposition; see task G-5)

**Constraints**:
- Single-user, single-container, no auth
- Sleeper API is read-only (no token needed)
- Sleeper active-player dictionary: ≤ 1 full sync per 24 hours
- Docker image must build and run with `docker compose up`
- Minimal dependencies (no extra frameworks, no message queues, no caches)

**Scale/Scope**: 1 user, 1 draft session at a time, ~15 roster slots, ~200 active players per position

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. Code Quality | PASS | Monorepo enforces single-responsibility; Phaser scenes map to discrete boards |
| II. Test-First (NON-NEGOTIABLE) | PASS | All phases specify tests-first before implementation; E2E coverage in Phase K |
| III. Coverage Gates | PASS | Vitest + pytest coverage enforced in CI; baseline coverage stays at constitution minimums, while 100% branch coverage is intentionally scoped only to plinko physics and pick-resolution paths because those flows directly determine draft outcomes and are the least tolerant of ambiguous behavior |
| IV. Performance Budgets | PASS | Plinko physics/update step ≤ 16 ms per frame, TTI ≤ 3 s documented above; tracked in CI. IV.b Scoring Budget (≤ 50 ms) — N/A: no lineup scoring calculation in this feature. |
| V. Observability | PASS | FastAPI structured JSON logging; no `console.log` in production builds |

## Project Structure

### Documentation (this feature)

```text
specs/001-plinko-game-help/
├── plan.md              ← this file (Quickstart section embedded; no separate quickstart.md)
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── contracts/
│   └── api.md           ← Phase 1 output
└── tasks.md             ← Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
fantasy-football-plinko/
├── frontend/
│   ├── src/
│   │   ├── scenes/
│   │   │   ├── BootScene.ts          # load assets, read session_id from localStorage
│   │   │   ├── SetupScene.ts         # draft_id entry form (rendered in Phaser DOM layer)
│   │   │   ├── PositionBoardScene.ts # first plinko board
│   │   │   ├── PlayerBoardScene.ts   # second plinko board
│   │   │   └── CongratsScene.ts      # "Draft [Player]!" overlay
│   │   ├── entities/
│   │   │   ├── __tests__/
│   │   │   │   ├── PlinkoBoard.test.ts
│   │   │   │   └── PlinkoBall.test.ts
│   │   │   ├── PlinkoBoard.ts        # peg layout, slot definitions, physics world
│   │   │   └── PlinkoBall.ts         # Matter.js body wrapper, drop + outcome detection
│   │   ├── services/
│   │   │   ├── __tests__/
│   │   │   │   └── api.test.ts
│   │   │   └── api.ts                # typed fetch wrappers for all backend endpoints
│   │   ├── types/
│   │   │   └── index.ts              # Session, RosterSlot, Player, Position interfaces
│   │   └── main.ts                   # Phaser.Game bootstrap
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __tests__/
│   │   │   │   ├── test_players.py
│   │   │   │   └── test_sessions.py
│   │   │   ├── sessions.py           # POST/GET /api/sessions, position-pick, player-pick, sync
│   │   │   └── players.py            # GET /api/sessions/{id}/players/{pos}
│   │   ├── models/
│   │   │   ├── __tests__/
│   │   │   │   └── test_orm.py
│   │   │   └── orm.py                # SQLAlchemy declarative models
│   │   ├── services/
│   │   │   ├── __tests__/
│   │   │   │   ├── test_availability.py
│   │   │   │   └── test_sleeper_service.py
│   │   │   ├── sleeper.py            # httpx client: draft metadata, picks, player dict
│   │   │   └── availability.py       # available-player query logic
│   │   ├── __tests__/
│   │   │   └── test_db.py
│   │   ├── db.py                     # async engine, session factory, init_db()
│   │   └── main.py                   # FastAPI app, router mount, StaticFiles
│   ├── pyproject.toml                # uv-managed; defines [project] + [tool.pytest]
│   └── uv.lock
│
├── Dockerfile                        # multi-stage: frontend-build → backend
├── docker-compose.yml
└── .gitignore
```

**Structure Decision**: Option 2 (Web application). The frontend is a Phaser 3 SPA with no server-side rendering; the backend is a FastAPI service that serves the static bundle and owns all data persistence and Sleeper integration. The two sub-projects share no source code, communicating only via the HTTP contract in `contracts/api.md`.

## Complexity Tracking

No constitution violations. The two-project structure (frontend + backend) is the minimum necessary because:
- The Sleeper active-player dictionary must be cached server-side — downloading it in the browser on every session would violate the ≤ 3 s TTI budget and Sleeper's usage guidelines.
- SQLite persistence is required for FR-009 (state across rounds) and FR-013 (refresh recovery), while `localStorage` stores only the reconnecting `session_id`.

---

## Phase 0 — Research (complete)

See [research.md](./research.md).

Key findings:
- Sleeper REST API is public, read-only, no token required.
- The user enters a Sleeper `draft_id`; roster slot configuration is read directly from `draft.settings.slots_*`.
- Available draftable players are active NFL players absent from the locally cached results of `GET /draft/{draft_id}/picks`, refreshed explicitly through `POST /api/sessions/{id}/sync`.
- FLEX requires a union query over RB + WR + TE.
- Phaser 3 is the implementation target because it is stable and supports the required Matter.js plinko flow without introducing Phaser 4 release-risk.

---

## Phase 1 — Design (complete)

### Data Model

See [data-model.md](./data-model.md).

Six SQLite tables:
| Table | Purpose |
|---|---|
| `players` | Sleeper active-player dictionary cache |
| `player_cache_meta` | Last-sync timestamp for the daily refresh gate |
| `plinko_sessions` | One row per draft session |
| `roster_slots` | Per-session open/filled position requirements |
| `draft_picks_cache` | Mirror of Sleeper picks for availability subtraction |
| `plinko_runs` | Audit log of every ball drop and its outcome |

### API Contract

See [contracts/api.md](./contracts/api.md).

Seven endpoints:
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/sessions` | Create session from Sleeper draft_id |
| `GET` | `/api/sessions/{id}` | Full session state |
| `GET` | `/api/sessions/{id}/positions` | Open roster slots for position board |
| `GET` | `/api/sessions/{id}/players/{pos}` | Available players for player board |
| `POST` | `/api/sessions/{id}/position-pick` | Record position-board outcome |
| `POST` | `/api/sessions/{id}/player-pick` | Record player-board outcome + fill slot |
| `POST` | `/api/sessions/{id}/sync` | Re-poll Sleeper picks |

### Quickstart

#### Local development (without Docker)

**Backend**:
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev   # Vite dev server on :5173, proxies /api → :8000
```

Open `http://localhost:5173`.

#### Docker (production-equivalent):
```bash
docker compose up --build
```

Open `http://localhost:8000`.

The Dockerfile:
1. **Stage 1** (`frontend-build`): `node:20-slim` → `npm ci && npm run build` → outputs `frontend/dist/`.
2. **Stage 2** (`backend`): `python:3.12-slim` → `uv sync --no-dev` → copies `frontend/dist/` to `backend/static/` → `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

`docker-compose.yml` mounts a named volume at `/data/plinko.db` (the SQLite file path) so session state persists across `docker compose restart`.

---

## Phase 2 — Tasks

> **Generated** — see [`tasks.md`](./tasks.md) (created 2026-08-21 via `/speckit.tasks`).

Tasks follow the Red-Green-Refactor cycle mandated by constitution §II, ordered:
1. Backend ORM models + DB init
2. Sleeper service (httpx client + mocks)
3. Backend API routes + contract tests
4. Frontend scaffold + type definitions + API service layer
5. `PlinkoBoard` + `PlinkoBall` entities (physics, tests first)
6. Phaser scenes wired to API
7. Docker integration
8. CI pipeline (backend tests → frontend tests → lint + type-check → Docker build)
