import { describe, it, expect, vi, beforeEach } from "vitest";
import { PositionBoardScene } from "../PositionBoardScene";
import * as api from "../../services/api";
import { RosterSlot, Position } from "../../types";

// Mock the api module
vi.mock("../../services/api");

// Phaser.Scene only gets real `add`/`cameras`/`scene` properties once booted
// by a running Phaser.Game. Use a lightweight test double so scenes can be
// unit tested in isolation without a real game/canvas (see
// src/test/mocks/phaser.ts for details).
vi.mock("phaser", () => import("../../test/mocks/phaser"));

describe("PositionBoardScene", () => {
  let scene: PositionBoardScene;
  const mockSessionId = 1;
  const mockOpenSlots: RosterSlot[] = [
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
    {
      id: 3,
      position: "WR",
      slot_order: 3,
      filled_at: null,
      player: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Draft-complete guard", () => {
    it("should render draft-complete state when getOpenPositions returns empty array", async () => {
      // Mock getOpenPositions to return empty array
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce([]);

      // Create scene with session data
      const mockPhaserScene = {
        add: {
          text: vi.fn(),
        },
      } as unknown as Phaser.Scene;

      // Simulate scene initialization
      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Assert that no PlinkoBoard constructor is called (draft is complete)
      expect(scene.board).toBeUndefined();

      // Assert that draft-complete state is rendered
      expect(scene.draftComplete).toBe(true);
    });
  });

  describe("Normal load with open slots", () => {
    it("should construct PlinkoBoard with correct slot count", async () => {
      // Mock getOpenPositions to return 3 slots
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Assert PlinkoBoard is created
      expect(scene.board).toBeDefined();

      // Assert slot count matches open slots
      expect(scene.board?.slotCount).toBe(3);
    });

    it("should render slot labels with position names", async () => {
      // Mock getOpenPositions
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Assert slot labels are created for each position
      expect(scene.slotLabels).toHaveLength(3);
      expect(scene.slotLabels).toContain("QB");
      expect(scene.slotLabels).toContain("RB");
      expect(scene.slotLabels).toContain("WR");
    });

    it("should store open slots for later reference during pick", async () => {
      // Mock getOpenPositions
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Assert open slots are stored
      expect(scene.openSlots).toEqual(mockOpenSlots);
    });
  });

  describe("Post-drop API call", () => {
    it("should call recordPositionPick when ball exits a slot", async () => {
      // Mock getOpenPositions
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      // Mock recordPositionPick
      vi.mocked(api.recordPositionPick).mockResolvedValueOnce({
        run_id: 5,
        position: "QB",
      });

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Simulate ball exit at slot index 0 (QB position)
      const slotIndex = 0;
      await scene.onBallExit(slotIndex);

      // Assert recordPositionPick was called with correct parameters
      expect(api.recordPositionPick).toHaveBeenCalledWith(
        mockSessionId,
        mockOpenSlots[slotIndex].id
      );
    });

    it("should transition to PlayerBoardScene with correct position after pick", async () => {
      // Mock getOpenPositions
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      // Mock recordPositionPick
      vi.mocked(api.recordPositionPick).mockResolvedValueOnce({
        run_id: 5,
        position: "RB",
      });

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate ball exit at slot index 1 (RB position)
      const slotIndex = 1;
      await scene.onBallExit(slotIndex);

      // Assert transition to PlayerBoardScene with correct data
      expect(startSceneSpy).toHaveBeenCalledWith("PlayerBoardScene", {
        sessionId: mockSessionId,
        rosterSlotId: mockOpenSlots[slotIndex].id,
        position: "RB",
      });
    });

    it("should pass roster_slot_id from openSlots array to next scene", async () => {
      // Mock getOpenPositions
      vi.mocked(api.getOpenPositions).mockResolvedValueOnce(mockOpenSlots);

      // Mock recordPositionPick
      vi.mocked(api.recordPositionPick).mockResolvedValueOnce({
        run_id: 5,
        position: "WR",
      });

      scene = new PositionBoardScene(mockSessionId);
      await scene.initializeBoard();

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate ball exit at slot index 2 (WR position)
      const slotIndex = 2;
      await scene.onBallExit(slotIndex);

      // Verify the roster_slot_id passed is correct
      const callArgs = startSceneSpy.mock.calls[0][1];
      expect(callArgs.rosterSlotId).toBe(mockOpenSlots[slotIndex].id);
    });
  });
});
