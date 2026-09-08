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

/**
 * Upper bound on how many player openings are rendered on a single board.
 * The backend returns every undrafted player at a position with no limit,
 * which for deep pools (e.g. WR) can be 50-100+ players. Rendering that many
 * slots/pegs on an 800px-wide board causes pegs to overlap into solid bars
 * (see PlinkoBoard's own density guard) and makes the labels unreadable, so
 * we cap display to the top-ranked players and let subsequent picks surface
 * the rest as the pool narrows.
 */
const MAX_DISPLAYED_PLAYERS = 15;

export class PlayerBoardScene extends Phaser.Scene {
  private sessionId: number = 0;
  private rosterSlotId: number = 0;
  private position: Position = "QB";
  private board?: PlinkoBoard;
  private players: Player[] = [];
  private playerLabels: string[] = [];
  private errorState: boolean = false;
  private isDropping: boolean = false;
  private isSyncing: boolean = false;

  // Board graphics/labels are torn down and rebuilt every time the
  // available-player pool is refreshed (initial load or manual sync), since
  // the slot count/positions can shift as players get drafted elsewhere.
  private boardGraphics?: Phaser.GameObjects.Graphics;
  private slotLabelTexts: Phaser.GameObjects.Text[] = [];
  private dropZone?: Phaser.GameObjects.Graphics;

  private syncButton?: Phaser.GameObjects.Text;
  private syncStatusText?: Phaser.GameObjects.Text;
  private lastSyncedAt?: Date;

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
    this.setupSyncControls();

    await this.initializeBoard({ isManualSync: false });

    if (!this.errorState && this.board) {
      this.setupInteractivity();
    }
  }

  /**
   * Fetch the latest available players (optionally re-polling Sleeper for
   * live draft picks first) and (re)build the board from scratch.
   *
   * This is called both on initial scene entry and whenever the user
   * presses the "Sync" button, since a live Sleeper draft can produce new
   * picks at any time while this screen is on display - the slot count and
   * contents may need to shrink/reorder between the initial load and the
   * moment the user actually drops the ball.
   */
  async initializeBoard(
    { isManualSync }: { isManualSync: boolean } = { isManualSync: false }
  ): Promise<void> {
    try {
      // Step 1: Sync picks from Sleeper (explicit freshness step)
      const syncResult = await api.syncPicks(this.sessionId);
      this.lastSyncedAt = new Date(syncResult.synced_at);

      // Step 2: Fetch available players for this position
      const availablePlayers = await api.getPlayers(
        this.sessionId,
        this.position
      );

      if (availablePlayers.length === 0) {
        // No players available - show error state and return to PositionBoardScene
        this.errorState = true;
        this.renderErrorState();
        return;
      }

      // Cap the number of rendered openings so the board stays playable and
      // legible even when the full available pool is large (players are
      // already ordered by search_rank, i.e. best-available first).
      this.players = availablePlayers.slice(0, MAX_DISPLAYED_PLAYERS);

      // Create PlinkoBoard with number of slots matching players
      this.board = new PlinkoBoard(this.players.length, {
        width: 800,
        height: 600,
      });

      // Extract player name labels. Once slot count grows large enough that
      // each slot is too narrow to fit a full "First Last" name without
      // wrapping past the slot box (see renderBoard's slotHeight), abbreviate
      // the first name to an initial so labels stay legible and contained.
      const slotWidth = 800 / this.players.length;
      this.playerLabels = this.players.map((p) =>
        this.formatPlayerLabel(p.first_name, p.last_name, slotWidth)
      );

      // Render the board
      this.renderBoard();
      this.updateSyncStatusText(
        isManualSync
          ? `Synced - ${this.players.length} available`
          : undefined
      );
    } catch (error) {
      console.error("Error initializing player board:", error);
      if (isManualSync) {
        // Don't nuke an already-playable board just because a manual
        // re-sync failed transiently (e.g. Sleeper hiccup) - let the user
        // keep playing with the last-known-good data and try again.
        this.updateSyncStatusText("Sync failed - showing last known data");
      } else {
        this.errorState = true;
        this.renderErrorState();
      }
    }
  }

  /**
   * Manual re-sync entry point, wired to the "Sync" button. Re-polls
   * Sleeper for picks and rebuilds the board in place so the user can
   * confirm they're not about to drop on a player someone else just
   * drafted live, without losing their spot on the screen.
   */
  private async handleManualSync(): Promise<void> {
    if (this.isSyncing || this.isDropping || this.errorState) return;

    this.isSyncing = true;
    this.setDropZoneEnabled(false);
    this.setSyncButtonEnabled(false);
    this.updateSyncStatusText("Syncing with Sleeper...");

    try {
      await this.initializeBoard({ isManualSync: true });
    } finally {
      this.isSyncing = false;
      this.setSyncButtonEnabled(true);
      if (!this.errorState) {
        this.setDropZoneEnabled(true);
      }
    }
  }

  /**
   * Adds the persistent "Sync" button and status label. These live outside
   * the board-rebuild lifecycle (renderBoard/clearBoard) since they should
   * stay put across refreshes, not get torn down and recreated.
   */
  private setupSyncControls(): void {
    this.syncButton = this.add
      .text(800 - 16, 16, "Sync", {
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#28a745",
        padding: { x: 14, y: 8 },
        align: "center",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.handleManualSync();
      });

    this.syncStatusText = this.add
      .text(800 - 16, 52, "", {
        fontSize: "12px",
        color: "#cccccc",
        align: "right",
      })
      .setOrigin(1, 0);
  }

  private setSyncButtonEnabled(enabled: boolean): void {
    if (!this.syncButton) return;
    this.syncButton.setAlpha(enabled ? 1 : 0.5);
    if (enabled) {
      this.syncButton.setInteractive({ useHandCursor: true });
    } else {
      this.syncButton.disableInteractive();
    }
  }

  private updateSyncStatusText(message?: string): void {
    if (!this.syncStatusText) return;

    if (message) {
      this.syncStatusText.setText(message);
      return;
    }

    if (this.lastSyncedAt) {
      this.syncStatusText.setText(
        `Last synced ${this.lastSyncedAt.toLocaleTimeString()}`
      );
    }
  }

  /**
   * Format a player's name for display in a slot, abbreviating the first
   * name to an initial once the slot is too narrow to comfortably fit the
   * full name on one or two wrapped lines (roughly 7px/char at the smallest
   * font size used in renderBoard).
   */
  private formatPlayerLabel(
    firstName: string,
    lastName: string,
    slotWidth: number
  ): string {
    const fullName = `${firstName} ${lastName}`;
    const narrowSlotThreshold = 90;

    if (slotWidth >= narrowSlotThreshold || firstName.length === 0) {
      return fullName;
    }

    return `${firstName[0]}. ${lastName}`;
  }

  /**
   * Pick a font size that scales down as slots get narrower, so labels are
   * more likely to fit within the slot box without excessive wrapping.
   */
  private computeFontSize(slotWidth: number): number {
    if (slotWidth >= 90) return 14;
    if (slotWidth >= 70) return 12;
    if (slotWidth >= 55) return 11;
    return 10;
  }

  private renderBoard(): void {
    if (!this.board) return;

    // Tear down any previously drawn pegs/slots/labels first. Without this,
    // re-rendering after a manual sync (or a resync that changes the number
    // of available players) would draw the new board on top of the old one
    // instead of replacing it.
    this.clearBoardGraphics();

    const pegs = this.board.getPegPositions();

    // Draw pegs
    const graphics = this.add.graphics();
    this.boardGraphics = graphics;
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
      const slotHeight = 50;
      graphics.lineStyle(2, 0x333333, 1);
      graphics.strokeRect(bounds.x, bounds.y, bounds.width, slotHeight);

      // Add player label, centered within the slot box. `setOrigin(0.5)`
      // anchors the text's own center (not its top-left corner) to the
      // given x/y, so it stays centered instead of overflowing to the
      // right/bottom of the box. Font size shrinks for narrower slots (more
      // players on the board) to keep names from overflowing vertically.
      const label = this.add
        .text(
          bounds.x + bounds.width / 2,
          bounds.y + slotHeight / 2,
          this.playerLabels[i],
          {
            fontSize: `${this.computeFontSize(bounds.width)}px`,
            color: "#333333",
            align: "center",
            wordWrap: { width: bounds.width - 8 },
          }
        )
        .setOrigin(0.5);
      this.slotLabelTexts.push(label);
    }
  }

  private clearBoardGraphics(): void {
    this.boardGraphics?.destroy();
    this.boardGraphics = undefined;
    this.slotLabelTexts.forEach((label) => label.destroy());
    this.slotLabelTexts = [];
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
      if (!this.isDropping && !this.isSyncing) {
        this.dropBall(pointer.x);
      }
    });

    this.dropZone = graphics;
  }

  private setDropZoneEnabled(enabled: boolean): void {
    if (!this.dropZone) return;
    if (enabled) {
      this.dropZone.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 800, 600),
        Phaser.Geom.Rectangle.Contains
      );
    } else {
      this.dropZone.disableInteractive();
    }
  }

  private async dropBall(startX: number): Promise<void> {
    if (!this.board || this.isDropping || this.isSyncing) return;

    this.isDropping = true;
    this.setSyncButtonEnabled(false);

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
      this.setSyncButtonEnabled(true);
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

      // The most likely cause of a rejected pick is a 409: someone else
      // drafted this exact player on Sleeper in the window between our
      // last sync and this drop. Rather than leaving the user stuck
      // staring at a stale, unplayable board, automatically re-sync and
      // rebuild so they can immediately try again with fresh data.
      this.updateSyncStatusText(
        "That pick didn't go through (player may already be drafted) - re-syncing..."
      );
      await this.handleManualSync();
    }
  }
}
