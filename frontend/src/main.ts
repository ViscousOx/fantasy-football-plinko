/**
 * Main entry point for the Fantasy Football Plinko frontend
 * 
 * Initializes Phaser.Game with:
 * - Matter physics engine
 * - All scenes registered
 * - Responsive canvas sizing
 */

import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { SetupScene } from "./scenes/SetupScene";
import { PositionBoardScene } from "./scenes/PositionBoardScene";
import { PlayerBoardScene } from "./scenes/PlayerBoardScene";
import { CongratsScene } from "./scenes/CongratsScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "app",
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: 1 },
      enableSleeping: true,
      debug: false,
    },
  },
  scene: [BootScene, SetupScene, PositionBoardScene, PlayerBoardScene, CongratsScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

// Initialize Phaser game
const game = new Phaser.Game(config);

// Optional: Log game instance to console for debugging
console.log("Fantasy Football Plinko game initialized");
