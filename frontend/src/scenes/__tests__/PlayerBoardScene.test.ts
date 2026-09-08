import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlayerBoardScene } from "../PlayerBoardScene";
import * as api from "../../services/api";
import { Player, RosterSlot } from "../../types";

// Mock the api module
vi.mock("../../services/api");

describe("PlayerBoardScene", () => {
  let scene: PlayerBoardScene;
  const mockSessionId = 1;
  const mockRosterSlotId = 1;
  const mockPosition = "RB" as const;

  const mockPlayers: Player[] = [
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
    {
      id: 12,
      sleeper_id: "1234",
      first_name: "Joe",
      last_name: "Mixon",
      position: "RB",
      team: "CIN",
      search_rank: 25,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Empty-player guard", () => {
    it("should show error state when getPlayers returns empty array", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 0,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers to return empty array
      vi.mocked(api.getPlayers).mockResolvedValueOnce([]);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Assert error state is rendered
      expect(scene.errorState).toBe(true);

      // Assert no PlinkoBoard is constructed
      expect(scene.board).toBeUndefined();
    });

    it("should transition back to PositionBoardScene when no players available", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 0,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers to return empty array
      vi.mocked(api.getPlayers).mockResolvedValueOnce([]);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      await scene.initializeBoard();

      // Assert transition back to PositionBoardScene
      expect(startSceneSpy).toHaveBeenCalledWith("PositionBoardScene", {
        sessionId: mockSessionId,
      });
    });
  });

  describe("Normal load with players", () => {
    it("should call syncPicks before fetching players", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Assert syncPicks was called
      expect(api.syncPicks).toHaveBeenCalledWith(mockSessionId);
    });

    it("should construct PlinkoBoard with correct slot count matching players", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Assert PlinkoBoard is created
      expect(scene.board).toBeDefined();

      // Assert slot count matches player count
      expect(scene.board?.slotCount).toBe(mockPlayers.length);
    });

    it("should render player name labels on slots", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Assert player labels are created
      expect(scene.playerLabels).toHaveLength(3);
      expect(scene.playerLabels).toContain("Saquon Barkley");
      expect(scene.playerLabels).toContain("Le'Veon Bell");
      expect(scene.playerLabels).toContain("Joe Mixon");
    });

    it("should store players for later reference during pick", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Assert players are stored
      expect(scene.players).toEqual(mockPlayers);
    });
  });

  describe("Post-drop API call", () => {
    it("should call recordPlayerPick with correct parameters when ball exits", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      // Mock recordPlayerPick
      vi.mocked(api.recordPlayerPick).mockResolvedValueOnce({
        run_id: 6,
        player: mockPlayers[0],
        session_complete: false,
      });

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Simulate ball exit at slot index 0
      const slotIndex = 0;
      await scene.onBallExit(slotIndex);

      // Assert recordPlayerPick was called with correct parameters
      expect(api.recordPlayerPick).toHaveBeenCalledWith(
        mockSessionId,
        mockRosterSlotId,
        mockPlayers[slotIndex].id
      );
    });

    it("should transition to CongratsScene with correct data", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      // Mock recordPlayerPick
      vi.mocked(api.recordPlayerPick).mockResolvedValueOnce({
        run_id: 6,
        player: mockPlayers[1],
        session_complete: false,
      });

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate ball exit at slot index 1
      const slotIndex = 1;
      await scene.onBallExit(slotIndex);

      // Assert transition to CongratsScene with correct data
      expect(startSceneSpy).toHaveBeenCalledWith("CongratsScene", {
        sessionId: mockSessionId,
        player: mockPlayers[slotIndex],
        sessionComplete: false,
      });
    });

    it("should pass session_complete flag from API response to CongratsScene", async () => {
      // Mock syncPicks
      vi.mocked(api.syncPicks).mockResolvedValueOnce({
        picks_synced: 5,
        synced_at: "2026-08-19T14:00:00Z",
      });

      // Mock getPlayers
      vi.mocked(api.getPlayers).mockResolvedValueOnce(mockPlayers);

      // Mock recordPlayerPick with session_complete: true
      vi.mocked(api.recordPlayerPick).mockResolvedValueOnce({
        run_id: 6,
        player: mockPlayers[2],
        session_complete: true,
      });

      scene = new PlayerBoardScene(
        mockSessionId,
        mockRosterSlotId,
        mockPosition
      );
      await scene.initializeBoard();

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate ball exit
      const slotIndex = 2;
      await scene.onBallExit(slotIndex);

      // Verify session_complete flag is passed correctly
      const callArgs = startSceneSpy.mock.calls[0][1];
      expect(callArgs.sessionComplete).toBe(true);
    });
  });
});
