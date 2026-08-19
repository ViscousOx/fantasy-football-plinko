# Feature Specification: Fantasy Football Plinko Draft Assistant

**Feature Branch**: `001-plinko-game-help`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "I want to build a plinko game to help me choose my fantasy football draft. I want the plinko game to start at a level with openings at the bottom for draftable positions on my team. Once the plinko ball falls through one of those openings it'll fall into another plinko board with openings for available players in the position it had fallen through. When the plinko ball falls through these last openings a congratulatory message will show up saying to draft the specific player. Players and positions are of a list so when one position or player is chosen based on the plinko balls path it is removed from the list and can't be chosen again"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Drop Ball to Determine Draft Position (Priority: P1)

A user preparing for their fantasy football draft launches the app and drops a plinko ball on the first board. The ball bounces through pegs and falls through one of the position openings at the bottom (e.g., RB, WR, QB, TE, K, DEF). The selected position is then highlighted and the user is advanced to the second board for that position.

**Why this priority**: This is the core mechanic. Without it nothing else functions. It defines the entry point for every draft decision and constitutes a minimal, demonstrable product on its own.

**Independent Test**: Can be fully tested by dropping a ball on the position board and verifying it lands in one of the draftable position slots, visually highlights the result, and advances the session state to the player board for that position.

**Acceptance Scenarios**:

1. **Given** a draft session is started with a full roster of unfilled positions, **When** the user drops the plinko ball on the position board, **Then** the ball physically animates through pegs, lands in exactly one position slot, that position is marked as selected, and the UI transitions to the player board for that position.
2. **Given** all remaining positions have at least one available player, **When** the ball lands in a position opening, **Then** only that one position is consumed and all other positions remain available for future drops.
3. **Given** the position board is rendered, **When** it loads, **Then** only positions that still need to be filled are shown as open slots; already-drafted positions are absent or visually closed.

---

### User Story 2 - Drop Ball to Select a Player from the Chosen Position (Priority: P1)

After the position board resolves to a position, the user sees a second plinko board whose openings correspond to available players at that position. The user drops the ball; it falls through one player's opening and a congratulatory message appears naming that player as the one to draft.

**Why this priority**: Equally foundational to the first story — this is the payoff of the entire interaction. Together with Story 1 it forms the complete happy-path MVP.

**Independent Test**: Can be fully tested by pre-seeding a position selection and rendering the player board, then dropping a ball and verifying the correct player name appears in the congratulatory message.

**Acceptance Scenarios**:

1. **Given** a position has been resolved from the first board, **When** the player board renders, **Then** each open slot at the bottom corresponds to exactly one undrafted player at that position.
2. **Given** the player board is active, **When** the user drops the plinko ball and it exits through a player's opening, **Then** a congratulatory message appears with that player's name (e.g., "Draft [Player Name]!").
3. **Given** the congratulatory message is displayed, **When** the user acknowledges it, **Then** that player is removed from the available player pool and cannot appear in any future player board.

---

### User Story 3 - Persistent Draft State Across Multiple Rounds (Priority: P2)

The user runs multiple drop cycles — one per draft pick — and the app tracks which positions have been filled and which players have been taken. Each new cycle starts the position board with only unfilled positions available, and each player board shows only undrafted players.

**Why this priority**: Without state persistence between picks the app is only useful for a single pick. Full draft assistance requires the removal mechanic to function across many rounds.

**Independent Test**: Can be fully tested by simulating three consecutive picks and asserting that (a) the position filled in pick N does not appear in the position board of pick N+1, and (b) the player taken in pick N does not appear in any subsequent player board for that position.

**Acceptance Scenarios**:

1. **Given** a position was filled in a previous round, **When** the position board loads for the next round, **Then** that position slot is absent or closed.
2. **Given** a player was drafted in a previous round, **When** the player board for the same position opens in a later round (if the position re-appears — e.g., flex or multi-slot positions), **Then** the previously drafted player is not listed.
3. **Given** all required roster positions have been filled, **When** the user attempts to start another drop, **Then** the app indicates the draft is complete and no new plinko board is shown.

---

### User Story 4 - Configurable Roster Positions and Player Pool (Priority: P2)

Before the draft begins the user can specify which roster positions need to be filled (e.g., 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, 1 K, 1 DEF) and supply the pool of available players per position. The plinko boards reflect this configuration exactly.

**Why this priority**: Without configuration the app only works for one fixed roster format. Configurability makes it useful for any league format and for entering real pre-draft player availability.

**Independent Test**: Can be fully tested by configuring a custom roster (e.g., 2 RB slots) and verifying that the position board shows RB twice (or with a count indicator) and that the position is only fully removed after both RB slots are filled.

**Acceptance Scenarios**:

1. **Given** the user configures 2 RB slots, **When** the position board renders, **Then** RB is available for selection twice; after the first RB is drafted the slot count decreases to 1 and RB remains on the board.
2. **Given** the user provides a player list for WR containing 10 players, **When** the WR player board renders, **Then** all 10 players appear as openings (up to the board's display capacity).
3. **Given** the configuration is saved, **When** a new draft session starts with the same config, **Then** all positions and player pools are restored to their initial state.

---

### Edge Cases

- What happens when only one player remains at a position? The player board shows a single opening; the ball lands there deterministically and the congratulatory message fires.
- What happens when a position has no available players but is still needed on the roster? The system must flag this as an invalid state and prevent navigating to an empty player board.
- What happens when all positions are filled mid-session? The draft-complete state is triggered immediately; no new position board is shown.
- How does the system handle a plinko ball that gets "stuck" or fails to exit through any opening? A timeout or fallback mechanism randomly resolves a winner after a defined physics timeout (≤ 16 ms per the performance budget) to avoid hanging the UI.
- What happens if the user refreshes or closes the app mid-draft? State must be recoverable from local/session storage so the draft can resume.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a first-level plinko board whose bottom openings correspond to each unfilled roster position in the current draft session.
- **FR-002**: System MUST animate a plinko ball with physics-based peg collisions when the user initiates a drop on either board.
- **FR-003**: System MUST detect which opening the ball exits through and record that result as the selected position (first board) or selected player (second board).
- **FR-004**: System MUST transition from the position board to the player board for the resolved position once the ball exits.
- **FR-005**: System MUST render the player board with openings for each undrafted player at the resolved position.
- **FR-006**: System MUST display a congratulatory message identifying the specific player to draft when the ball exits a player opening.
- **FR-007**: System MUST remove a position from the position board once it has been fully filled (all slots for that position consumed).
- **FR-008**: System MUST remove a player from all future player boards once that player has been selected.
- **FR-009**: System MUST persist draft state (filled positions, drafted players) across multiple drop cycles within the same session.
- **FR-010**: System MUST allow the user to configure the roster slot composition (position name + count) before starting the draft.
- **FR-011**: System MUST allow the user to supply an available player list per position before starting the draft.
- **FR-012**: System MUST indicate when the draft is complete (all roster slots filled) and prevent additional drops.
- **FR-013**: System MUST recover draft state from local/session storage if the page is refreshed mid-session.
- **FR-014**: System MUST enforce a fallback resolution if the ball fails to exit through any opening within the physics simulation timeout.

### Key Entities

- **DraftSession**: Represents one full fantasy draft run. Holds the roster configuration, current fill state per position slot, and the set of drafted players.
- **RosterSlot**: A single position opening on the roster (e.g., one of two RB slots). Has a type (QB, RB, WR, TE, FLEX, K, DEF), a filled/unfilled state, and optionally the player drafted into it.
- **Player**: A draftable athlete. Has a name, position type, and a drafted flag. Belongs to the player pool for exactly one position type.
- **PlinkoBoard**: The visual and physics model for one level of plinko. Has a set of pegs, a ball-drop origin, and a list of named openings at the bottom.
- **PlinkoRun**: A single ball-drop event. Records which board it occurred on, the outcome opening (position or player), and a timestamp.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can complete a full draft pick (position selection + player selection) in under 30 seconds from initiating the first drop to dismissing the congratulatory message.
- **SC-002**: The plinko ball animation resolves and an opening is determined within ≤ 16 ms of simulation time (60 fps target per the project performance budget).
- **SC-003**: After N rounds, exactly N positions are marked filled and exactly N players are absent from future boards, with zero duplicates or omissions.
- **SC-004**: 100% of player board openings correspond to valid, undrafted players for the resolved position — no stale or duplicate entries appear.
- **SC-005**: Draft state survives a hard page refresh; the user can resume from exactly the same point without data loss.
- **SC-006**: The complete flow (configure → draft → congrats) can be demonstrated end-to-end without a backend — state is managed entirely client-side.

## Assumptions

- The target user is a single person managing their own fantasy draft; multi-user simultaneous access is out of scope for v1.
- The application is a browser-based single-page application; no native mobile app is required for v1.
- Standard scoring league roster formats are the primary use case (e.g., ESPN, Yahoo standard 9-slot rosters), but the configuration system must support any slot composition.
- The FLEX position is treated as a special roster slot that accepts RB, WR, or TE players; the player board for FLEX shows all undrafted players across those position types.
- Physics simulation uses a deterministic pseudo-random seed per drop so results are reproducible in tests but appear random to the user.
- Local/session storage is sufficient for state persistence; no user account or server-side persistence is required.
- Mobile support (responsive layout) is desirable but secondary to desktop functionality for v1.
