/**
 * Frontend TypeScript Interfaces
 *
 * These interfaces mirror the JSON shapes returned by the API.
 */

/**
 * Position enum — must match backend values exactly
 */
export type Position = "QB" | "RB" | "WR" | "TE" | "FLEX" | "BN" | "K" | "DEF";

/**
 * A draftable player (available in the current league draft)
 */
export interface Player {
  id: number;
  sleeper_id: string;
  first_name: string;
  last_name: string;
  position: Position;
  team: string | null;
  search_rank: number | null;
}

/**
 * A single open or filled roster slot
 */
export interface RosterSlot {
  id: number;
  position: Position;
  slot_order: number;
  filled_at: string | null;
  player: Player | null;
}

/**
 * Session overview returned by GET /api/sessions/{id}
 */
export interface Session {
  id: number;
  sleeper_draft_id: string;
  created_at: string; // ISO-8601
  completed_at: string | null;
  roster_slots?: RosterSlot[];
}

/**
 * Response from POST /api/sessions/{id}/position-pick
 */
export interface PositionPickResponse {
  run_id: number;
  position: Position;
}

/**
 * Response from POST /api/sessions/{id}/player-pick
 */
export interface PlayerPickResponse {
  run_id: number;
  player: Player;
  session_complete: boolean;
}

/**
 * Response from POST /api/sessions/{id}/sync
 */
export interface SyncResponse {
  picks_synced: number;
  synced_at: string; // ISO-8601
}
