/**
 * PlinkoBoard: Configurable plinko game board with pegs and slots
 * Handles peg layout (triangular grid) and slot boundary calculations
 */

interface PegPosition {
  x: number;
  y: number;
}

interface SlotBounds {
  x: number;
  y: number;
  width: number;
}

interface PlinkoBoardOptions {
  width?: number;
  height?: number;
  rows?: number;
  pegsPerRow?: number;
  pegRadius?: number;
}

/**
 * Peg layout is intentionally decoupled from `slotCount`. The number of
 * collisions a ball can experience is part of the game's difficulty/feel,
 * and should stay constant across every board regardless of how many
 * openings remain (e.g. as positions/players get drafted and the pool of
 * available slots shrinks). If peg density scaled down with slotCount, late
 * picks would fall through a nearly empty board with almost no randomness.
 * These defaults represent a "full" board's peg density and are reused for
 * every slotCount unless explicitly overridden via options.
 */
const DEFAULT_PEGS_PER_ROW = 15;
const DEFAULT_ROWS = 9;

export class PlinkoBoard {
  private slotCount: number;
  private width: number;
  private height: number;
  private rows: number;
  private pegsPerRow: number;
  private pegRadius: number;
  private pegs: PegPosition[][] = [];
  private slots: SlotBounds[] = [];

  constructor(slotCount: number, options: PlinkoBoardOptions = {}) {
    this.slotCount = slotCount;
    this.width = options.width ?? 800;
    this.height = options.height ?? 600;
    this.pegRadius = options.pegRadius ?? 8;

    // Guard against peg rows becoming visually solid bars: once the
    // requested pegsPerRow grows large enough that pegs would have to be
    // spaced closer than ~3x their radius, the circles overlap and render
    // as a continuous line instead of discrete pegs, and the ball can no
    // longer pass between them. The peg column count is intentionally NOT
    // derived from `slotCount` (see DEFAULT_PEGS_PER_ROW/DEFAULT_ROWS above)
    // so every board has the same peg density regardless of how many
    // openings exist; the slots below remain independently sized from
    // `slotCount`, so this only affects the decorative/collision peg
    // layout, not how many openings exist.
    const requestedPegsPerRow = options.pegsPerRow ?? DEFAULT_PEGS_PER_ROW;
    const minPegSpacing = this.pegRadius * 3;
    const maxPegsPerRow = Math.max(
      1,
      Math.floor(this.width / minPegSpacing) - 1
    );
    this.pegsPerRow = Math.min(requestedPegsPerRow, maxPegsPerRow);

    this.rows = options.rows ?? DEFAULT_ROWS;

    this.generatePegs();
    this.generateSlots();
  }

  /**
   * Generate peg positions in a triangular grid pattern
   * Each row is offset alternately to create the classic plinko appearance
   */
  private generatePegs(): void {
    const pegSpacingX = this.width / (this.pegsPerRow + 1);
    const pegSpacingY = this.height / (this.rows + 1);
    const rowStartY = pegSpacingY;

    for (let row = 0; row < this.rows; row++) {
      this.pegs[row] = [];

      // Offset alternating rows for staggered effect
      const isOddRow = row % 2 === 1;
      const pegsInRow = isOddRow ? this.pegsPerRow - 1 : this.pegsPerRow;
      const rowOffset = isOddRow ? pegSpacingX / 2 : 0;

      for (let col = 0; col < pegsInRow; col++) {
        const x = pegSpacingX + col * pegSpacingX + rowOffset;
        const y = rowStartY + row * pegSpacingY;

        this.pegs[row].push({
          x: Math.max(this.pegRadius, Math.min(this.width - this.pegRadius, x)),
          y: Math.max(this.pegRadius, Math.min(this.height - this.pegRadius, y)),
        });
      }
    }
  }

  /**
   * Generate slot boundaries at the bottom of the board
   * Slots are evenly distributed across the board width
   */
  private generateSlots(): void {
    const slotWidth = this.width / this.slotCount;
    const slotY = this.height - 60; // Position slots near bottom

    for (let i = 0; i < this.slotCount; i++) {
      this.slots.push({
        x: i * slotWidth,
        y: slotY,
        width: slotWidth,
      });
    }
  }

  /**
   * Get all peg positions organized by row
   */
  getPegPositions(): PegPosition[][] {
    return this.pegs;
  }

  /**
   * Get the bounds of a specific slot by index
   */
  getSlotBounds(index: number): SlotBounds {
    if (index < 0 || index >= this.slotCount) {
      throw new Error(`Slot index ${index} out of bounds [0, ${this.slotCount - 1}]`);
    }
    return this.slots[index];
  }

  /**
   * Get board dimensions
   */
  getBoardDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Get total number of slots
   */
  getSlotCount(): number {
    return this.slotCount;
  }
}
