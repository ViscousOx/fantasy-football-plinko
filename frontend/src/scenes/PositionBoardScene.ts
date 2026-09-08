/**
 * PositionBoardScene - First plinko board for position selection
 * 
 * Responsibilities:
 * - Fetch open positions via api.getOpenPositions()
 * - Handle draft-complete guard (if no open positions, show completion state)
 * - Construct PlinkoBoard with correct slot count
 * - Render pegs (circles) and slot labels (position names)
 * - Handle user click/tap to drop ball
 * - Call api.recordPositionPick() when ball exits
 * - Transition to PlayerBoardScene with correct parameters
 */

import * as api from "../services/api";
import { PlinkoBoard } from "../entities/PlinkoBoard";
import { PlinkoBall } from "../entities/PlinkoBall";
import type { RosterSlot } from "../types";

interface SceneData {
  sessionId: number;
}

export class PositionBoardScene extends Phaser.Scene {
  private sessionId: number = 0;
  private board?: PlinkoBoard;
  private openSlots: RosterSlot[] = [];
  private slotLabels: string[] = [];
  private draftComplete: boolean = false;
  private isDropping: boolean = false;

  constructor(sessionId?: number) {
    super({ key: "PositionBoardScene" });
    if (sessionId) {
      this.sessionId = sessionId;
    }
  }

  init(data: SceneData): void {
    if (data?.sessionId) {
      this.sessionId = data.sessionId;
    }
  }

  async create(): Promise<void> {
    await this.initializeBoard();

    if (!this.draftComplete && this.board) {
      this.setupInteractivity();
    }
  }

  async initializeBoard(): Promise<void> {
    try {
      // Fetch open positions
      this.openSlots = await api.getOpenPositions(this.sessionId);

      if (this.openSlots.length === 0) {
        // Draft is complete
        this.draftComplete = true;
        this.renderDraftComplete();
        return;
      }

      // Extract position labels for slot labels
      this.slotLabels = this.openSlots.map((slot) => slot.position);

      // Create PlinkoBoard with number of slots matching open positions
      this.board = new PlinkoBoard(this.openSlots.length, {
        width: 800,
        height: 600,
      });

      // Render the board
      this.renderBoard();
    } catch (error) {
      console.error("Error initializing position board:", error);
      this.scene.start("SetupScene");
    }
  }

  private renderBoard(): void {
    if (!this.board) return;

    const { width, height } = this.cameras.main;
    const pegs = this.board.getPegPositions();

    // Draw pegs
    const graphics = this.add.graphics();
    graphics.fillStyle(0x888888, 1);

    pegs.forEach((row) => {
      row.forEach((peg) => {
        graphics.fillCircle(peg.x, peg.y, 8);
      });
    });

    // Draw slots with labels
    const slotCount = this.board.getSlotCount();
    for (let i = 0; i < slotCount; i++) {
      const bounds = this.board.getSlotBounds(i);

      // Draw slot box
      graphics.lineStyle(2, 0x333333, 1);
      graphics.strokeRect(bounds.x, bounds.y, bounds.width, 50);

      // Add position label
      this.add.text(
        bounds.x + bounds.width / 2,
        bounds.y + 25,
        this.slotLabels[i],
        {
          fontSize: "16px",
          color: "#333333",
          align: "center",
        }
      );
    }
  }

  private renderDraftComplete(): void {
    const { width, height } = this.cameras.main;

    this.add.text(width / 2, height / 2, "Draft Complete!", {
      fontSize: "48px",
      color: "#333333",
      align: "center",
    });

    this.add.text(
      width / 2,
      height / 2 + 60,
      "All positions have been filled.",
      {
        fontSize: "20px",
        color: "#666666",
        align: "center",
      }
    );
  }

  private setupInteractivity(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 0);
    graphics.fillRect(0, 0, 800, 600);
    graphics.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 800, 600),
      Phaser.Geom.Rectangle.Contains
    );

    graphics.on("pointerdown", () => {
      if (!this.isDropping) {
        this.dropBall();
      }
    });
  }

  private async dropBall(): Promise<void> {
    if (!this.board || this.isDropping) return;

    this.isDropping = true;

    try {
      const ball = new PlinkoBall(Math.random() * 1000000);
      const slotIndex = await ball.drop(this.board);

      // Animate ball falling to slot
      this.animateBallToSlot(slotIndex);

      // Call API to record pick
      await this.onBallExit(slotIndex);
    } catch (error) {
      console.error("Error dropping ball:", error);
    } finally {
      this.isDropping = false;
    }
  }

  private animateBallToSlot(slotIndex: number): void {
    if (!this.board) return;

    const bounds = this.board.getSlotBounds(slotIndex);
    const ballGraphics = this.add.graphics();
    ballGraphics.fillStyle(0xff0000, 1);
    ballGraphics.fillCircle(bounds.x + bounds.width / 2, 100, 8);

    // Simple animation (could be enhanced with tweens)
    this.tweens.add({
      targets: ballGraphics,
      y: bounds.y,
      duration: 300,
      ease: "Linear",
    });
  }

  async onBallExit(slotIndex: number): Promise<void> {
    const slot = this.openSlots[slotIndex];

    try {
      const result = await api.recordPositionPick(this.sessionId, slot.id);

      // Transition to PlayerBoardScene
      this.scene.start("PlayerBoardScene", {
        sessionId: this.sessionId,
        rosterSlotId: slot.id,
        position: result.position,
      });
    } catch (error) {
      console.error("Error recording position pick:", error);
      this.isDropping = false;
    }
  }
}
