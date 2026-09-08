/**
 * CongratsScene - Draft confirmation overlay
 * 
 * Responsibilities:
 * - Display congratulations message with player name
 * - Handle draft-complete variant (show "Draft Complete!" instead)
 * - Show dismiss button
 * - On dismiss: transition to PositionBoardScene (unless draft is complete)
 * - If draft is complete, stay on screen and don't transition
 */

import Phaser from "phaser";
import type { Player } from "../types";

interface SceneData {
  sessionId: number;
  player: Player;
  sessionComplete: boolean;
}

export class CongratsScene extends Phaser.Scene {
  private sessionId: number = 0;
  private player?: Player;
  public sessionComplete: boolean = false;
  public congratsText: string = "";
  public dismissButton?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "CongratsScene" });
  }

  init(data: SceneData): void {
    if (data) {
      this.sessionId = data.sessionId;
      this.player = data.player;
      this.sessionComplete = data.sessionComplete;
    }
  }

  async create(): Promise<void> {
    await this.initialize({
      sessionId: this.sessionId,
      player: this.player!,
      sessionComplete: this.sessionComplete,
    });
  }

  async initialize(data: SceneData): Promise<void> {
    this.sessionId = data.sessionId;
    this.player = data.player;
    this.sessionComplete = data.sessionComplete;

    // Build congratulations text
    if (this.sessionComplete) {
      this.congratsText = "Draft Complete!";
    } else {
      this.congratsText = `Draft ${data.player.first_name} ${data.player.last_name}!`;
    }

    // Render the scene
    this.renderScene();
  }

  private renderScene(): void {
    const { width, height } = this.cameras.main;

    // Add semi-transparent background overlay
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

    // Add congratulations text
    this.add
      .text(width / 2, height / 2 - 50, this.congratsText, {
        fontSize: "48px",
        color: "#ffffff",
        align: "center",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);

    // Add dismiss button
    this.dismissButton = this.add
      .text(width / 2, height / 2 + 80, "Continue", {
        fontSize: "24px",
        color: "#ffffff",
        backgroundColor: "#007bff",
        padding: { x: 20, y: 10 },
        align: "center",
      })
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.onDismiss();
      });

    this.dismissButton.visible = true;
  }

  async onDismiss(): Promise<void> {
    if (this.sessionComplete) {
      // Draft is complete, don't transition
      return;
    }

    // Transition back to PositionBoardScene for next pick
    this.scene.start("PositionBoardScene", {
      sessionId: this.sessionId,
    });
  }
}
