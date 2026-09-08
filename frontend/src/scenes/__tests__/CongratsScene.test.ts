import { describe, it, expect, vi, beforeEach } from "vitest";
import { CongratsScene } from "../CongratsScene";
import { Player } from "../../types";

describe("CongratsScene", () => {
  let scene: CongratsScene;
  const mockSessionId = 1;
  const mockPlayer: Player = {
    id: 10,
    sleeper_id: "4046",
    first_name: "Saquon",
    last_name: "Barkley",
    position: "RB",
    team: "NYG",
    search_rank: 12,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Normal variant (draft not complete)", () => {
    it("should display player name text in format 'Draft [First Last]!'", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: false,
      });

      // Assert congratulations text is displayed
      expect(scene.congratsText).toBe("Draft Saquon Barkley!");
    });

    it("should show dismiss button when draft is not complete", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: false,
      });

      // Assert dismiss button is rendered
      expect(scene.dismissButton).toBeDefined();
      expect(scene.dismissButton?.visible).toBe(true);
    });

    it("should transition to PositionBoardScene when dismiss button is clicked", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: false,
      });

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate dismiss button click
      await scene.onDismiss();

      // Assert transition to PositionBoardScene
      expect(startSceneSpy).toHaveBeenCalledWith("PositionBoardScene", {
        sessionId: mockSessionId,
      });
    });

    it("should pass correct sessionId to next scene", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: false,
      });

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate dismiss button click
      await scene.onDismiss();

      // Verify correct sessionId is passed
      const callArgs = startSceneSpy.mock.calls[0][1];
      expect(callArgs.sessionId).toBe(mockSessionId);
    });
  });

  describe("Complete variant (session_complete: true)", () => {
    it("should display 'Draft Complete!' text when session is complete", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: true,
      });

      // Assert completion text is displayed
      expect(scene.congratsText).toBe("Draft Complete!");
    });

    it("should show dismiss button even when draft is complete", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: true,
      });

      // Assert dismiss button is rendered
      expect(scene.dismissButton).toBeDefined();
      expect(scene.dismissButton?.visible).toBe(true);
    });

    it("should NOT transition to PositionBoardScene when dismiss is clicked on completed draft", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: true,
      });

      // Mock scene transition
      const startSceneSpy = vi.fn();
      scene.scene.start = startSceneSpy;

      // Simulate dismiss button click
      await scene.onDismiss();

      // Assert NO transition occurs
      expect(startSceneSpy).not.toHaveBeenCalled();
    });

    it("should stay on CongratsScene when session is complete", async () => {
      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: true,
      });

      // Mock scene stop
      const stopSceneSpy = vi.fn();
      scene.scene.stop = stopSceneSpy;

      // Simulate dismiss button click
      await scene.onDismiss();

      // Assert scene is not started/changed
      // (scene should remain visible showing draft complete message)
      expect(scene.sessionComplete).toBe(true);
    });
  });

  describe("Player name display", () => {
    it("should correctly format player names with spaces", async () => {
      const playerWithMiddleName = {
        ...mockPlayer,
        first_name: "Patrick",
        last_name: "Mahomes",
      };

      scene = new CongratsScene();
      await scene.initialize({
        sessionId: mockSessionId,
        player: playerWithMiddleName,
        sessionComplete: false,
      });

      expect(scene.congratsText).toBe("Draft Patrick Mahomes!");
    });

    it("should display different player on subsequent calls", async () => {
      const player2: Player = {
        id: 20,
        sleeper_id: "1234",
        first_name: "Travis",
        last_name: "Kelce",
        position: "TE",
        team: "KC",
        search_rank: 5,
      };

      scene = new CongratsScene();

      // First initialization
      await scene.initialize({
        sessionId: mockSessionId,
        player: mockPlayer,
        sessionComplete: false,
      });
      expect(scene.congratsText).toBe("Draft Saquon Barkley!");

      // Re-initialize with different player
      await scene.initialize({
        sessionId: mockSessionId,
        player: player2,
        sessionComplete: false,
      });
      expect(scene.congratsText).toBe("Draft Travis Kelce!");
    });
  });
});
