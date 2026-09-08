/**
 * BootScene - Initial scene that preloads assets and restores session state
 * 
 * Responsibilities:
 * - Preload graphic/audio assets
 * - Check for existing session_id in localStorage
 * - Transition to SetupScene or PositionBoardScene depending on session state
 */

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload(): void {
    // Preload assets here (placeholder sprites acceptable at this stage)
    // In future phases, load actual game graphics and sounds
    
    // Example placeholder asset loading (currently commented as we don't have assets yet):
    // this.load.image("peg", "assets/peg.png");
    // this.load.image("ball", "assets/ball.png");
  }

  create(): void {
    // Check localStorage for existing session_id
    const sessionIdStr = localStorage.getItem("session_id");
    
    if (sessionIdStr) {
      // Session exists, parse the ID and transition to PositionBoardScene
      const sessionId = parseInt(sessionIdStr, 10);
      this.scene.start("PositionBoardScene", { sessionId });
    } else {
      // No session, go to SetupScene for draft ID entry
      this.scene.start("SetupScene");
    }
  }
}
