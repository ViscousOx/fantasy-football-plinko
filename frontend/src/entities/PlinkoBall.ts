import { PlinkoBoard } from "./PlinkoBoard";

/**
 * Seeded random number generator for deterministic physics simulation
 * Uses a simple but effective Linear Congruential Generator (LCG)
 */
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    // LCG parameters (from Numerical Recipes)
    const a = 1664525;
    const c = 1013904223;
    const m = 2 ** 32;

    this.seed = (a * this.seed + c) % m;
    return this.seed / m; // Return value in [0, 1)
  }
}

interface BallPhysics {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Logger {
  info(message: string, data: any): void;
}

/**
 * PlinkoBall: Deterministic physics simulation for plinko ball drops
 * Uses a seeded RNG for reproducible results
 */
export class PlinkoBall {
  private seed: number;
  private rng: SeededRandom;
  private gravity: number = 0.5;
  private friction: number = 0.98;
  private bounce: number = 0.6;
  private pegRadius: number = 8;
  private ballRadius: number = 6;
  private maxFrameBudget: number = 16; // milliseconds per frame
  private logger: Logger | null = null;
  private lastPath: { x: number; y: number }[] = [];

  constructor(seed: number, logger?: Logger) {
    this.seed = seed;
    this.rng = new SeededRandom(seed);
    this.logger = logger || null;
  }

  /**
   * Get the recorded (x, y) trajectory from the most recent drop() call.
   * Used by the rendering layer to animate the ball bouncing through the
   * pegs instead of just tweening straight down to the final slot.
   */
  getLastPath(): { x: number; y: number }[] {
    return this.lastPath;
  }

  /**
   * Simulate ball drop through plinko board and return final slot index
   *
   * @param board - The plinko board to drop through
   * @param startX - Optional horizontal starting position (e.g. from user click/tap).
   *                 Defaults to the board's horizontal center if not provided.
   */
  drop(board: PlinkoBoard, startX?: number): number {
    const boardDimensions = board.getBoardDimensions();
    const slotCount = board.getSlotCount();
    const pegs = board.getPegPositions();

    const initialX =
      startX === undefined ? boardDimensions.width / 2 : startX;

    // Initialize ball at the requested drop position (clamped to board bounds)
    const physics: BallPhysics = {
      x: Math.max(
        this.ballRadius,
        Math.min(boardDimensions.width - this.ballRadius, initialX)
      ),
      y: 20,
      vx: (this.rng.next() - 0.5) * 2, // Small random horizontal velocity
      vy: 0,
    };

    const frameStartTime = performance.now();
    let frameCount = 0;
    let hasExited = false;
    let exitSlot = -1;

    // Reset the recorded trajectory for this drop
    this.lastPath = [{ x: physics.x, y: physics.y }];

    // Simulation loop with frame budget enforcement
    while (!hasExited && frameCount < 1000) {
      // Check frame budget
      if (performance.now() - frameStartTime > this.maxFrameBudget * 10) {
        // Use fallback resolver if budget exceeded
        exitSlot = Math.floor(this.rng.next() * slotCount);
        hasExited = true;
        break;
      }

      // Apply gravity and friction
      physics.vy += this.gravity;
      physics.vx *= this.friction;
      physics.vy *= this.friction;

      // Update position
      physics.x += physics.vx;
      physics.y += physics.vy;

      // Collision detection with pegs
      for (const row of pegs) {
        for (const peg of row) {
          const dist = Math.sqrt(
            (physics.x - peg.x) ** 2 + (physics.y - peg.y) ** 2
          );
          const minDist = this.ballRadius + this.pegRadius;

          if (dist < minDist) {
            // Collision detected: bounce the ball
            const angle = Math.atan2(physics.y - peg.y, physics.x - peg.x);
            physics.x = peg.x + Math.cos(angle) * minDist;
            physics.y = peg.y + Math.sin(angle) * minDist;

            // Capture the pre-bounce speed before mutating vx/vy so vy's
            // calculation doesn't use the already-updated vx value.
            const speed = Math.sqrt(physics.vx ** 2 + physics.vy ** 2);
            physics.vx = Math.cos(angle) * this.bounce * speed;
            physics.vy = Math.sin(angle) * this.bounce * speed;
          }
        }
      }

      // Boundary collisions
      if (physics.x < this.ballRadius) {
        physics.x = this.ballRadius;
        physics.vx = Math.abs(physics.vx) * this.bounce;
      }
      if (physics.x > boardDimensions.width - this.ballRadius) {
        physics.x = boardDimensions.width - this.ballRadius;
        physics.vx = -Math.abs(physics.vx) * this.bounce;
      }

      // Record the ball's position for this frame so the renderer can
      // animate the ball actually bouncing through the pegs.
      this.lastPath.push({ x: physics.x, y: physics.y });

      // Check if ball has exited the board at the bottom
      if (physics.y > boardDimensions.height - 50) {
        // Determine which slot the ball landed in
        const slotWidth = boardDimensions.width / slotCount;
        exitSlot = Math.floor(physics.x / slotWidth);
        exitSlot = Math.max(0, Math.min(slotCount - 1, exitSlot));
        hasExited = true;
      }

      frameCount++;
    }

    // Fallback if loop completes without exit
    if (!hasExited) {
      exitSlot = Math.floor(this.rng.next() * slotCount);
    }

    // Log the drop event if logger is available
    if (this.logger) {
      const durationMs = performance.now() - frameStartTime;
      this.logger.info("ball_dropped", {
        seed: this.seed,
        slotCount,
        resolvedSlot: exitSlot,
        durationMs: Math.round(durationMs * 100) / 100,
      });
    }

    return exitSlot;
  }
}
