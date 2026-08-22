# Fantasy Football Plinko Draft Assistant

A browser-based single-page application that gamifies the fantasy football draft process using a two-stage Plinko board mechanic.

## What It Does

Instead of agonizing over draft picks, you let physics decide. Each round of your draft plays out in two stages:

1. **Position Board** — Drop a Plinko ball through a board whose slots correspond to your unfilled roster positions (QB, RB, WR, TE, FLEX, K, DEF). Where the ball lands determines which position you're drafting for.
2. **Player Board** — A second Plinko board is shown with real, available NFL players at that position (pulled live from the [Sleeper](https://sleeper.com) fantasy football API). The ball selects your pick, and the app announces: *"Draft [Player Name]!"*

Filled positions and drafted players are removed from all future boards. The cycle repeats until your entire roster is complete.

### Features

- Integrates with the Sleeper API — just provide your `draft_id` and the app handles the rest
- Syncs live draft picks so already-drafted players are automatically excluded
- Session state persists across page refreshes via `localStorage` + a server-side SQLite database
- Roster slot counts are read directly from your Sleeper draft settings; no manual configuration required

## Architecture

```
Browser (Phaser 3 / TypeScript SPA)
  └── Phaser scenes: Boot → Setup → PositionBoard → PlayerBoard → Congrats
       │  REST /api/*
       ▼
FastAPI (Python 3.12 / uvicorn)
  └── Serves the frontend bundle
  └── 7 REST API endpoints
       │  httpx
       ▼
Sleeper REST API          SQLite (session + draft state)
```

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | TypeScript 5, Phaser 3, Matter.js physics, Vite |
| Backend | Python 3.12, FastAPI, SQLAlchemy (async), aiosqlite |
| Testing | Vitest, Playwright, pytest, pytest-asyncio |
| Infra | Docker, Docker Compose, GitHub Actions |

## Spec-Driven Design

This project is built using a **spec-driven development** workflow managed by [Speckit](https://speckit.dev). All design decisions — architecture, data models, API contracts, physics behavior, and test coverage requirements — are fully specified before any implementation begins.

The specifications live in the `specs/` directory and cover:

- System architecture and component boundaries
- REST API contract (`contracts/api.md`)
- Database schema and ORM models
- Frontend scene flow and physics entity behavior
- Test strategy and coverage gates (80% overall, 100% branch coverage on physics and pick-resolution paths)
- Performance budgets (≤ 16 ms/frame physics, ≤ 200 ms API pick endpoints, ≤ 3 s TTI)

Development follows **Test-First (TDD)** — no implementation task begins without a failing test. The implementation is broken into 11 ordered phases (A–K) tracked in `specs/tasks.md`.

## Development Status

The project is currently in the **specification and planning phase**. No application source code has been written yet. Implementation follows the phases defined in `specs/tasks.md`.

## License

[AGPL-3.0](LICENSE)
