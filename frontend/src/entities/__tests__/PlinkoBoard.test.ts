import { describe, it, expect } from "vitest";
import { PlinkoBoard } from "../PlinkoBoard";

describe("PlinkoBoard", () => {
  it("should construct with a slot count and return an object", () => {
    const board = new PlinkoBoard(6);
    expect(board).toBeDefined();
    expect(typeof board).toBe("object");
  });

  it("should return peg positions for n rows of staggered pegs within board bounds", () => {
    const board = new PlinkoBoard(6);
    const pegs = board.getPegPositions();

    expect(Array.isArray(pegs)).toBe(true);
    expect(pegs.length).toBeGreaterThan(0);

    // All pegs should have x, y coordinates within board bounds
    pegs.forEach((row) => {
      row.forEach((peg) => {
        expect(peg).toHaveProperty("x");
        expect(peg).toHaveProperty("y");
        expect(typeof peg.x).toBe("number");
        expect(typeof peg.y).toBe("number");
        expect(peg.x).toBeGreaterThanOrEqual(0);
        expect(peg.y).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it("should return slot bounds for each bottom slot", () => {
    const slotCount = 6;
    const board = new PlinkoBoard(slotCount);

    for (let i = 0; i < slotCount; i++) {
      const bounds = board.getSlotBounds(i);

      expect(bounds).toHaveProperty("x");
      expect(bounds).toHaveProperty("y");
      expect(bounds).toHaveProperty("width");
      expect(typeof bounds.x).toBe("number");
      expect(typeof bounds.y).toBe("number");
      expect(typeof bounds.width).toBe("number");
      expect(bounds.width).toBeGreaterThan(0);
    }
  });

  it("should match slot count with the number of openings", () => {
    const slotCount = 6;
    const board = new PlinkoBoard(slotCount);

    let slotIndex = 0;
    let boundsExists = true;

    while (boundsExists) {
      try {
        board.getSlotBounds(slotIndex);
        slotIndex++;
      } catch {
        boundsExists = false;
      }
    }

    expect(slotIndex).toBe(slotCount);
  });

  it("should allow configurable board width and height via constructor options", () => {
    const options = { width: 400, height: 500 };
    const board = new PlinkoBoard(6, options);
    expect(board).toBeDefined();

    const pegs = board.getPegPositions();
    const allPegsInBounds = pegs.every((row) =>
      row.every(
        (peg) =>
          peg.x >= 0 &&
          peg.x <= options.width &&
          peg.y >= 0 &&
          peg.y <= options.height
      )
    );

    expect(allPegsInBounds).toBe(true);
  });
});
