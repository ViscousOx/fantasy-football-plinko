import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSession,
  getSession,
  getOpenPositions,
  getPlayers,
  recordPositionPick,
  recordPlayerPick,
  syncPicks,
  Session,
  RosterSlot,
  Player,
  Position,
} from "../api";

describe("API Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSession", () => {
    it("posts to POST /api/sessions and returns a Session", async () => {
      const mockResponse: Session = {
        id: 1,
        sleeper_draft_id: "257270643320426496",
        created_at: "2026-08-19T14:00:00Z",
        completed_at: null,
        roster_slots: [
          {
            id: 1,
            position: "QB",
            slot_order: 1,
            filled_at: null,
            player: null,
          },
          {
            id: 2,
            position: "RB",
            slot_order: 2,
            filled_at: null,
            player: null,
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await createSession("257270643320426496");
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sleeper_draft_id: "257270643320426496" }),
      });
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(createSession("invalid")).rejects.toThrow();
    });
  });

  describe("getSession", () => {
    it("fetches GET /api/sessions/{id} and returns a Session", async () => {
      const mockResponse: Session = {
        id: 1,
        sleeper_draft_id: "257270643320426496",
        created_at: "2026-08-19T14:00:00Z",
        completed_at: null,
        roster_slots: [
          {
            id: 1,
            position: "QB",
            slot_order: 1,
            filled_at: null,
            player: null,
          },
        ],
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await getSession(1);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/1");
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(getSession(999)).rejects.toThrow();
    });
  });

  describe("getOpenPositions", () => {
    it("fetches GET /api/sessions/{id}/positions and returns RosterSlot[]", async () => {
      const mockResponse: RosterSlot[] = [
        {
          id: 1,
          position: "QB",
          slot_order: 1,
          filled_at: null,
          player: null,
        },
        {
          id: 3,
          position: "RB",
          slot_order: 3,
          filled_at: null,
          player: null,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await getOpenPositions(1);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/sessions/1/positions"
      );
    });

    it("returns empty array when draft is complete", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await getOpenPositions(1);
      expect(result).toEqual([]);
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(getOpenPositions(999)).rejects.toThrow();
    });
  });

  describe("getPlayers", () => {
    it("fetches the correct URL and returns Player[]", async () => {
      const mockResponse: Player[] = [
        {
          id: 10,
          sleeper_id: "4046",
          first_name: "Saquon",
          last_name: "Barkley",
          position: "RB",
          team: "NYG",
          search_rank: 12,
        },
        {
          id: 11,
          sleeper_id: "1408",
          first_name: "Le'Veon",
          last_name: "Bell",
          position: "RB",
          team: "PIT",
          search_rank: 340,
        },
      ];

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await getPlayers(1, "RB");
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/sessions/1/players/RB"
      );
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Unknown position" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(getPlayers(1, "INVALID" as Position)).rejects.toThrow();
    });
  });

  describe("recordPositionPick", () => {
    it("posts to position-pick and returns {run_id, position}", async () => {
      const mockResponse = { run_id: 5, position: "QB" };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await recordPositionPick(1, 1);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/sessions/1/position-pick",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roster_slot_id: 1 }),
        }
      );
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Slot already filled" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(recordPositionPick(1, 1)).rejects.toThrow();
    });
  });

  describe("recordPlayerPick", () => {
    it("posts to player-pick and returns {run_id, player, session_complete}", async () => {
      const mockResponse = {
        run_id: 6,
        player: {
          id: 10,
          sleeper_id: "4046",
          first_name: "Saquon",
          last_name: "Barkley",
          position: "RB" as const,
          team: "NYG",
          search_rank: 12,
        },
        session_complete: false,
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await recordPlayerPick(1, 1, 10);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/sessions/1/player-pick",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roster_slot_id: 1, player_id: 10 }),
        }
      );
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Player already taken" }), {
          status: 409,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(recordPlayerPick(1, 1, 999)).rejects.toThrow();
    });
  });

  describe("syncPicks", () => {
    it("posts to sync and returns {picks_synced, synced_at}", async () => {
      const mockResponse = {
        picks_synced: 14,
        synced_at: "2026-08-19T14:10:00Z",
      };

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

      const result = await syncPicks(1);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/sessions/1/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
    });

    it("throws on non-2xx responses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      );

      await expect(syncPicks(999)).rejects.toThrow();
    });
  });

  describe("SC-001 Performance: Full Pick Cycle API Budget", () => {
    it("completes a full pick cycle (recordPositionPick + recordPlayerPick) within 500ms", async () => {
      const sessionId = 1;
      const slotId = 1;
      const playerId = 10;

      // Mock recordPositionPick response
      const positionPickResponse = { run_id: 5, position: "QB" };

      // Mock recordPlayerPick response
      const playerPickResponse = {
        run_id: 6,
        player: {
          id: playerId,
          sleeper_id: "4046",
          first_name: "Saquon",
          last_name: "Barkley",
          position: "QB" as const,
          team: "NYG",
          search_rank: 12,
        },
        session_complete: false,
      };

      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(positionPickResponse), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(playerPickResponse), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        );

      // Measure the full pick cycle
      const startTime = performance.now();

      await recordPositionPick(sessionId, slotId);
      const positionPickResult = await recordPlayerPick(
        sessionId,
        slotId,
        playerId
      );

      const totalDuration = performance.now() - startTime;

      // Should complete within 500ms (SC-001 requirement)
      expect(totalDuration).toBeLessThan(500);

      // Verify results are correct
      expect(positionPickResult).toEqual(playerPickResponse);
    });
  });
});
