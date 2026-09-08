/**
 * PlayerBoardScene - Second plinko board for player selection
 * 
 * Responsibilities:
 * - Call api.syncPicks() to refresh available players
 * - Fetch players via api.getPlayers()
 * - Handle empty-player guard (if no players, show error and return to PositionBoardScene)
 * - Construct PlinkoBoard with correct slot count matching player count
 * - Render pegs and slot labels (player names)
 * - Handle user click/tap to drop ball
 * - Call api.recordPlayerPick() when ball exits
 * - Transition to CongratsScene with player data and session_complete flag
 */

import Phaser from "phaser";
import * as api from "../services/api";
import { PlinkoBoard } from "../entities/PlinkoBoard";
import { PlinkoBall } from "../entities/PlinkoBall";
import type { Player, Position } from "../types";

interface SceneData {
  sessionId: number;
  rosterSlotId: number;
  position: Position;
}

export class PlayerBoardScene extends Phaser.Scene {
  private sessionId: number = 0;
  private rosterSlotId: number = 0;
  private position: Position = "QB";
  private board?: PlinkoBoard;
  private players: Player[] = [];
  private playerLabels: string[] = [];
  private errorState: boolean = false;
  private isDropping: boolean = false;

  constructor(sessionId?: number, rosterSlotId?: number, position?: Position) {
    super({ key: "PlayerBoardScene" });
    if (sessionId) {
      this.sessionId = sessionId;
    }
    if (rosterSlotId) {
      this.rosterSlotId = rosterSlotId;
    }
    if (position) {
      this.position = position;
    }
  }

  init(data: SceneData): void {
    if (data) {
      this.sessionId = data.sessionId;
      this.rosterSlotId = data.rosterSlotId;
      this.position = data.position;
    }
  }

  async create(): Promise<void> {
    await this.initializeBoard();

    if (!this.errorState && this.board) {
      this.setupInteractivity();
    }
  }

  async initializeBoard(): Promise<void> {
    try {
      // Step 1: Sync picks from Sleeper (explicit freshness step)
      await api.syncPicks(this.sessionId);

      // Step 2: Fetch available players for this position
      this.players = await api.getPlayers(this.sessionId, this.position);

      if (this.players.length === 0) {
        // No players available - show error state and return to PositionBoardScene
        this.errorState = true;
        this.renderErrorState();
        return;
      }

      // Extract player name labels
      this.playerLabels = this.players.map(
        (p) => `${p.first_name} ${p.last_name}`
      );

      // Create PlinkoBoard with number of slots matching players
      this.board = new PlinkoBoard(this.players.length, {
        width: 800,
        height: 600,
      });

      // Render the board
      this.renderBoard();
    } catch (error) {
      console.error("Error initializing player board:", error);
      this.errorState = true;
      this.renderErrorState();
    }
  }

  private renderBoard(): void {
    if (!this.board) return;

    const pegs = this.board.getPegPositions();

    // Draw pegs
    const graphics = this.add.graphics();
    graphics.fillStyle(0x888888, 1);

    pegs.forEach((row) => {
      row.forEach((peg) => {
        graphics.fillCircle(peg.x, peg.y, 8);
      });
    });

    // Draw slots with player labels
    const slotCount = this.board.getSlotCount();
    for (let i = 0; i < slotCount; i++) {
      const bounds = this.board.getSlotBounds(i);

      // Draw slot box
      graphics.lineStyle(2, 0x333333, 1);
      graphics.strokeRect(bounds.x, bounds.y, bounds.width, 50);

      // Add player label
      this.add.text(
        bounds.x + bounds.width / 2,
        bounds.y + 25,
        this.playerLabels[i],
        {
          fontSize: "14px",
          color: "#333333",
          align: "center",
          wordWrap: { width: bounds.width - 10 },
        }
      );
    }
  }

  private renderErrorState(): void {
    const { width, height } = this.cameras.main;

    this.add
      .text(
        width / 2,
        height / 2,
        "No players available for this position.",
        {
          fontSize: "24px",
          color: "#dd0000",
          align: "center",
        }
      )
      .setOrigin(0.5);

    this.add
      .text(
        width / 2,
        height / 2 + 40,
        "Returning to position board...",
        {
          fontSize: "16px",
          color: "#666666",
          align: "center",
        }
      )
      .setOrigin(0.5);

    // Auto-transition back to PositionBoardScene after 2 seconds
    this.time.delayedCall(2000, () => {
      this.scene.start("PositionBoardScene", {
        sessionId: this.sessionId,
      });
    });
  }

  private setupInteractivity(): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 0);
    graphics.fillRect(0, 0, 800, 600);
    graphics.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 800, 600),
      Phaser.Geom.Rectangle.Contains
    );

    graphics.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!this.isDropping) {
        this.dropBall(pointer.x);
      }
    });
  }

  private async dropBall(startX: number): Promise<void> {
    if (!this.board || this.isDropping) return;

    this.isDropping = true;

    try {
      const ball = new PlinkoBall(Math.random() * 1000000);
      const slotIndex = ball.drop(this.board, startX);
      const path = ball.getLastPath();

      // Animate ball bouncing through the pegs along the simulated path
      await this.animateBallAlongPath(path);

      // Call API to record pick
      await this.onBallExit(slotIndex);
    } catch (error) {
      console.error("Error dropping ball:", error);
    } finally {
      this.isDropping = false;
    }
  }

  private animateBallAlongPath(
    path: { x: number; y: number }[]
  ): Promise<void> {
    return new Promise((resolve) => {
      if (path.length === 0) {
        resolve();
        return;
      }

      const ballGraphics = this.add.graphics();

      const drawAt = (index: number) => {
        const point = path[Math.max(0, Math.min(path.length - 1, index))];
        ballGraphics.clear();
        ballGraphics.fillStyle(0xff0000, 1);
        ballGraphics.fillCircle(point.x, point.y, 8);
      };

      drawAt(0);

      // Roughly two simulation frames per rendered ms, capped so long
      // simulations don't produce an excessively slow animation.
      const duration = Math.min(Math.max(path.length * 8, 300), 4000);

      this.tweens.addCounter({
        from: 0,
        to: path.length - 1,
        duration,
        ease: "Linear",
        onUpdate: (tween) => {
          drawAt(Math.round(tween.getValue() ?? 0));
        },
        onComplete: () => {
          resolve();
        },
      });
    });
  }

  async onBallExit(slotIndex: number): Promise<void> {
    const player = this.players[slotIndex];

    try {
      const result = await api.recordPlayerPick(
        this.sessionId,
        this.rosterSlotId,
        player.id
      );

      // Transition to CongratsScene
      this.scene.start("CongratsScene", {
        sessionId: this.sessionId,
        player: result.player,
        sessionComplete: result.session_complete,
      });
    } catch (error) {
      console.error("Error recording player pick:", error);
      this.isDropping = false;
    }
  }
}
