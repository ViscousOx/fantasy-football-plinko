# Fantasy Football Plinko Constitution

## Core Principles

### I. Code Quality is Non-Negotiable
Every module must be readable, maintainable, and purposefully structured. Functions do one thing; files have one responsibility. Magic numbers, dead code, and copy-paste duplication are rejected at review. Complexity must be justified — if it needs a comment to explain *what* it does, refactor it; if it needs a comment to explain *why*, keep the comment.

### II. Test-First Development (NON-NEGOTIABLE)
TDD is mandatory: tests are written and reviewed before implementation begins. The Red-Green-Refactor cycle is strictly enforced. No feature is considered started until at least one failing test exists that defines the acceptance boundary. Tests are first-class code — they receive the same review rigor as production code.

### III. Coverage Gates Must Pass
Unit test coverage must not fall below **80%** on any new code path. Critical game-logic paths (plinko physics, scoring, draft pick resolution) require **100%** branch coverage. Coverage thresholds are enforced in CI; a failing gate blocks merge. Coverage targets are floors, not goals — aim higher.

### IV. Performance Budgets Are Hard Constraints
Performance requirements are defined per feature before implementation begins and documented in `plan.md`. Key budgets:
- **Plinko simulation**: single-drop resolution ≤ 16 ms (60 fps target)
- **Scoring calculation**: full lineup score ≤ 50 ms
- **Initial page load**: Time-to-Interactive ≤ 3 s on a median mobile connection
Exceeding a budget is a defect, not a known issue. Regressions caught in CI must be fixed before merge.

### V. Observability Built-In
Every significant operation emits a structured log event (JSON lines). Errors are never silently swallowed — they are either handled with a clear recovery path or propagated with context. Timing instrumentation is added alongside any code path that touches a performance budget. No `console.log` left in production builds.

## Testing Standards

All tests live adjacent to the code they test (`*.test.ts` / `*.spec.ts` siblings or a co-located `__tests__/` directory). Test naming follows `given [context] when [action] then [outcome]`. Mocks are scoped to the test file; global mocks require team approval. Integration tests cover all external boundaries (APIs, storage, scoring providers). E2E tests cover every user-facing flow defined in the spec. Flaky tests are treated as bugs — they are fixed or deleted within one sprint of discovery.

## Quality Gates

All of the following must pass before a PR can merge:

| Gate | Requirement |
|---|---|
| Linting | Zero errors, zero suppressed warnings |
| Type checking | Zero type errors (strict mode enforced) |
| Unit tests | All pass; coverage ≥ 80% on new code |
| Performance benchmarks | No budget regressions vs. `main` |
| Build | Clean production build with no warnings |
| Code review | At least one approval from a team member |

Bypassing a gate requires a written justification in the PR description and a follow-up issue created before merge.

## Governance
This constitution supersedes all other development practices and style guides. Amendments require: (1) a written rationale, (2) an update to this file, and (3) a migration plan for any existing code that would now be non-compliant. All PRs and code reviews must verify compliance with the principles above. Complexity that violates a principle must be documented in the `plan.md` Complexity Tracking table with justification.

**Version**: 1.0.0 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-19
