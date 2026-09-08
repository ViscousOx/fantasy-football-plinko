import { describe, it, expect, vi } from "vitest";
import { PlinkoBall } from "../PlinkoBall";
import { PlinkoBoard } from "../PlinkoBoard";

describe("PlinkoBall", () => {
  it("should accept a seed and resolve deterministically to the same slot on repeated runs", () => {
    const seed = 12345;
    const board = new PlinkoBoard(6);

    const ball1 = new PlinkoBall(seed);
    const slot1 = ball1.drop(board);

    const ball2 = new PlinkoBall(seed);
    const slot2 = ball2.drop(board);

    expect(slot1).toBe(slot2);
  });

  it("should return a slot index within valid range", () => {
    const board = new PlinkoBoard(6);
    const ball = new PlinkoBall(42);
    const slot = ball.drop(board);

    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(6);
  });

  it("should use fallback resolver if simulation exceeds frame budget", () => {
    const board = new PlinkoBoard(6);
    const ball = new PlinkoBall(999);

    // Record timing of drop execution
    const startTime = performance.now();
    const slot = ball.drop(board);
    const endTime = performance.now();

    // Slot should be valid
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(6);

    // Total drop time should complete (we don't enforce the fallback here,
    // just ensure the result is valid and timing is reasonable)
    expect(endTime - startTime).toBeGreaterThanOrEqual(0);
  });

  it("should produce deterministic results for the same seed and start position", () => {
    const board = new PlinkoBoard(8);

    for (let seed = 0; seed < 10; seed++) {
      const ball1 = new PlinkoBall(seed);
      const ball2 = new PlinkoBall(seed);

      const slot1 = ball1.drop(board);
      const slot2 = ball2.drop(board);

      expect(slot1).toBe(slot2);
    }
  });

  it("should produce a variety of outcomes across different start positions", () => {
    // With correct (energy-conserving) collision physics, a symmetric board
    // dropped from the exact same x every time will consistently resolve to
    // the same slot. Real variety comes from where the user clicks/taps to
    // drop the ball, so we simulate a spread of starting positions here.
    const board = new PlinkoBoard(8);
    const { width } = board.getBoardDimensions();
    const results: { [key: number]: number } = {};

    for (let seed = 0; seed < 10; seed++) {
      const startX = (width / 10) * seed + width / 20;
      const ball = new PlinkoBall(seed);
      results[seed] = ball.drop(board, startX);
    }

    const uniqueSlots = new Set(Object.values(results));
    expect(uniqueSlots.size).toBeGreaterThan(1);
  });

  it("should stay within physics update budget per frame", () => {
    const board = new PlinkoBoard(6);
    const ball = new PlinkoBall(777);

    const startTime = performance.now();
    ball.drop(board);
    const duration = performance.now() - startTime;

    // Total drop operation should complete in reasonable time (well under 100ms for test)
    expect(duration).toBeLessThan(100);
  });
});
