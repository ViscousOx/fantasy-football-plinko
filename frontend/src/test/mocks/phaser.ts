/**
 * Lightweight test double for the "phaser" package.
 *
 * In production, `Phaser.Scene` subclasses only get real `add` / `cameras` /
 * `scene` / `tweens` / `time` properties once they are registered with a
 * running `Phaser.Game` (the framework injects them during scene boot).
 * Unit tests instantiate scenes directly (`new SomeScene(...)`) without ever
 * booting a real game, and importing the real "phaser" package also fails
 * under jsdom because it eagerly probes `HTMLCanvasElement#getContext("2d")`
 * for feature detection, which jsdom does not implement.
 *
 * This mock avoids both problems: it stands in for the "phaser" module in
 * tests (via `vi.mock("phaser", ...)`) and provides just enough of the
 * runtime surface (chainable game-object factories, camera bounds, scene
 * transitions, tweens, and timers) for the Scene classes under test to run
 * their business logic without touching real rendering.
 */
import { vi } from "vitest";

/**
 * Returns a proxy object that:
 * - Resolves any unknown property access to a chainable no-op function
 *   (covers calls like `.setOrigin().setInteractive().on(...)`).
 * - Persists any property explicitly set on it (covers `.visible = true`).
 */
function chainable(): any {
  const target: Record<string, unknown> = {};
  const proxy: any = new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) {
        return obj[prop as string];
      }
      return (..._args: unknown[]) => proxy;
    },
    set(obj, prop, value) {
      obj[prop as string] = value;
      return true;
    },
  });
  return proxy;
}

class MockScene {
  add = {
    text: () => chainable(),
    rectangle: () => chainable(),
    graphics: () => chainable(),
  };
  cameras = { main: { width: 800, height: 600 } };
  tweens = { add: vi.fn() };
  time = {
    delayedCall: (_delay: number, callback: () => void) => callback(),
  };
  scene = { start: vi.fn(), stop: vi.fn() };

  constructor(_config?: unknown) {}
}

class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  static Contains(): boolean {
    return true;
  }
}

export default {
  Scene: MockScene,
  Geom: { Rectangle },
};
