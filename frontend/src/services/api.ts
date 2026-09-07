/**
 * API Service Layer
 *
 * Typed fetch wrappers for all Fantasy Football Plinko API endpoints.
 * All functions throw on non-2xx responses.
 */

import type {
  Session,
  Player,
  RosterSlot,
  Position,
  PositionPickResponse,
  PlayerPickResponse,
  SyncResponse,
} from "../types/index";

const BASE_URL = "/api";

/**
 * Helper function to make API requests and handle errors
 */
async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = options ? await fetch(url, options) : await fetch(url);

  if (!response.ok) {
    throw new Error(
      `API Error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Create a new plinko session by syncing an existing Sleeper draft.
 *
 * POST /api/sessions
 */
export async function createSession(sleeper_draft_id: string): Promise<Session> {
  return apiRequest<Session>(`${BASE_URL}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sleeper_draft_id }),
  });
}

/**
 * Retrieve full session state including all roster slots and their fill status.
 *
 * GET /api/sessions/{id}
 */
export async function getSession(session_id: number): Promise<Session> {
  return apiRequest<Session>(`${BASE_URL}/sessions/${session_id}`);
}

/**
 * List only the open (unfilled) roster slots, used to populate the position plinko board.
 *
 * GET /api/sessions/{id}/positions
 */
export async function getOpenPositions(session_id: number): Promise<RosterSlot[]> {
  return apiRequest<RosterSlot[]>(`${BASE_URL}/sessions/${session_id}/positions`);
}

/**
 * List all players available for drafting at a given position.
 *
 * GET /api/sessions/{id}/players/{position}
 *
 * @param session_id - The session ID
 * @param position - One of QB, RB, WR, TE, FLEX, BN, K, DEF
 */
export async function getPlayers(
  session_id: number,
  position: Position
): Promise<Player[]> {
  return apiRequest<Player[]>(
    `${BASE_URL}/sessions/${session_id}/players/${position}`
  );
}

/**
 * Record the result of a position-board plinko drop (a roster slot was selected).
 *
 * POST /api/sessions/{id}/position-pick
 */
export async function recordPositionPick(
  session_id: number,
  roster_slot_id: number
): Promise<PositionPickResponse> {
  return apiRequest<PositionPickResponse>(
    `${BASE_URL}/sessions/${session_id}/position-pick`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roster_slot_id }),
    }
  );
}

/**
 * Record the result of a player-board plinko drop (a specific player was selected).
 * Fills the roster slot.
 *
 * POST /api/sessions/{id}/player-pick
 */
export async function recordPlayerPick(
  session_id: number,
  roster_slot_id: number,
  player_id: number
): Promise<PlayerPickResponse> {
  return apiRequest<PlayerPickResponse>(
    `${BASE_URL}/sessions/${session_id}/player-pick`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roster_slot_id, player_id }),
    }
  );
}

/**
 * Re-poll Sleeper for the latest draft picks and update draft_picks_cache.
 * This endpoint is the explicit freshness boundary for player availability.
 *
 * POST /api/sessions/{id}/sync
 */
export async function syncPicks(session_id: number): Promise<SyncResponse> {
  return apiRequest<SyncResponse>(
    `${BASE_URL}/sessions/${session_id}/sync`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }
  );
}
