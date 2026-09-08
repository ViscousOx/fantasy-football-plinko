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

  constructor(seed: number, logger?: Logger) {
    this.seed = seed;
    this.rng = new SeededRandom(seed);
    this.logger = logger || null;
  }

  /**
   * Simulate ball drop through plinko board and return final slot index
   */
  drop(board: PlinkoBoard): number {
    const boardDimensions = board.getBoardDimensions();
    const slotCount = board.getSlotCount();
    const pegs = board.getPegPositions();

    // Initialize ball at top center
    const physics: BallPhysics = {
      x: boardDimensions.width / 2,
      y: 20,
      vx: (this.rng.next() - 0.5) * 2, // Small random horizontal velocity
      vy: 0,
    };

    const frameStartTime = performance.now();
    let frameCount = 0;
    let hasExited = false;
    let exitSlot = -1;

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

            physics.vx = Math.cos(angle) * this.bounce * Math.sqrt(
              physics.vx ** 2 + physics.vy ** 2
            );
            physics.vy = Math.sin(angle) * this.bounce * Math.sqrt(
              physics.vx ** 2 + physics.vy ** 2
            );
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
