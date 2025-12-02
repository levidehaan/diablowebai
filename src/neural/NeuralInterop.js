/**
 * Neural Interop Layer
 *
 * Bidirectional bridge between the C++/WASM engine and JavaScript AI systems.
 * Handles memory access, state extraction, and command injection into the game.
 */

import NeuralConfig from './config';

/**
 * Game state structure offsets (from devilution reverse engineering)
 * These offsets may need adjustment based on the specific WASM build
 */
const GAME_OFFSETS = {
  // Player structure
  PLAYER_X: 0x00,
  PLAYER_Y: 0x04,
  PLAYER_HP: 0x08,
  PLAYER_MAX_HP: 0x0C,
  PLAYER_MANA: 0x10,
  PLAYER_MAX_MANA: 0x14,
  PLAYER_LEVEL: 0x18,
  PLAYER_CLASS: 0x1C,
  PLAYER_GOLD: 0x20,

  // Monster structure size and fields
  MONSTER_STRUCT_SIZE: 0x180,
  MONSTER_X: 0x00,
  MONSTER_Y: 0x04,
  MONSTER_HP: 0x08,
  MONSTER_MAX_HP: 0x0C,
  MONSTER_MODE: 0x10,
  MONSTER_TYPE: 0x14,
  MONSTER_AI: 0x18,
  MONSTER_TARGET_X: 0x1C,
  MONSTER_TARGET_Y: 0x20,
  MONSTER_UNIQUE_TYPE: 0x24,

  // Dungeon array dimensions
  DUNGEON_WIDTH: 40,
  DUNGEON_HEIGHT: 40,

  // Maximum entities
  MAX_MONSTERS: 200,
  MAX_QUESTS: 16,
};

/**
 * Monster modes from devilution
 */
const MONSTER_MODES = {
  MM_STAND: 0,
  MM_WALK: 1,
  MM_WALK2: 2,
  MM_WALK3: 3,
  MM_ATTACK: 4,
  MM_GOTHIT: 5,
  MM_DEATH: 6,
  MM_SATTACK: 7,
  MM_FADEIN: 8,
  MM_FADEOUT: 9,
  MM_RATTACK: 10,
  MM_SPSTAND: 11,
  MM_RSPATTACK: 12,
  MM_DELAY: 13,
  MM_CHARGE: 14,
  MM_STONE: 15,
  MM_HEAL: 16,
  MM_TALK: 17,
};

/**
 * Player classes
 */
const PLAYER_CLASSES = {
  PC_WARRIOR: 0,
  PC_ROGUE: 1,
  PC_SORCERER: 2,
};

/**
 * Level types
 */
const LEVEL_TYPES = {
  DTYPE_TOWN: 0,
  DTYPE_CATHEDRAL: 1,
  DTYPE_CATACOMBS: 2,
  DTYPE_CAVES: 3,
  DTYPE_HELL: 4,
};

class NeuralInterop {
  constructor() {
    this.wasm = null;
    this.initialized = false;
    this.pointers = {};
    this.eventListeners = new Map();
    this.frameCount = 0;
    this.lastStateSnapshot = null;

    // Bind methods
    this.onFrame = this.onFrame.bind(this);
    this.extractGameState = this.extractGameState.bind(this);
  }

  /**
   * Initialize the interop layer with the WASM module
   */
  initialize(wasmModule) {
    if (this.initialized) {
      this.log('warn', 'NeuralInterop already initialized');
      return;
    }

    this.wasm = wasmModule;
    this.initialized = true;

    // Discover exported functions and memory
    this.discoverExports();

    this.log('info', 'NeuralInterop initialized', {
      heapSize: this.wasm.HEAPU8?.length,
      exports: Object.keys(this.wasm).filter(k => k.startsWith('_')).length,
    });

    // Emit initialization event
    this.emit('initialized', { wasm: this.wasm });
  }

  /**
   * Discover and cache WASM module exports
   */
  discoverExports() {
    const exports = {};

    // Find all exported functions
    for (const key of Object.keys(this.wasm)) {
      if (typeof this.wasm[key] === 'function' && key.startsWith('_')) {
        exports[key] = this.wasm[key];
      }
    }

    this.exports = exports;

    // Cache commonly used memory accessors
    this.heap = {
      u8: this.wasm.HEAPU8,
      u16: this.wasm.HEAPU16,
      u32: this.wasm.HEAPU32,
      i8: this.wasm.HEAP8,
      i16: this.wasm.HEAP16,
      i32: this.wasm.HEAP32,
      f32: this.wasm.HEAPF32,
      f64: this.wasm.HEAPF64,
    };
  }

  /**
   * Refresh memory pointers (call after memory growth or level generation)
   */
  refreshPointers() {
    if (!this.initialized) return;

    // Update heap references (memory may have grown)
    this.heap = {
      u8: this.wasm.HEAPU8,
      u16: this.wasm.HEAPU16,
      u32: this.wasm.HEAPU32,
      i8: this.wasm.HEAP8,
      i16: this.wasm.HEAP16,
      i32: this.wasm.HEAP32,
      f32: this.wasm.HEAPF32,
      f64: this.wasm.HEAPF64,
    };

    // Call any registered pointer refresh callbacks
    this.emit('pointersRefreshed', { heap: this.heap });
  }

  /**
   * Read a value from WASM memory
   */
  readMemory(ptr, type = 'u32') {
    if (!this.initialized || !ptr) return 0;

    const heap = this.heap[type];
    if (!heap) {
      this.log('error', `Invalid memory type: ${type}`);
      return 0;
    }

    // Calculate element offset based on type size
    const elementSize = {
      u8: 1, i8: 1,
      u16: 2, i16: 2,
      u32: 4, i32: 4,
      f32: 4, f64: 8,
    }[type] || 4;

    return heap[ptr / elementSize];
  }

  /**
   * Write a value to WASM memory
   */
  writeMemory(ptr, value, type = 'u32') {
    if (!this.initialized || !ptr) return false;

    const heap = this.heap[type];
    if (!heap) {
      this.log('error', `Invalid memory type: ${type}`);
      return false;
    }

    const elementSize = {
      u8: 1, i8: 1,
      u16: 2, i16: 2,
      u32: 4, i32: 4,
      f32: 4, f64: 8,
    }[type] || 4;

    heap[ptr / elementSize] = value;
    return true;
  }

  /**
   * Read a string from WASM memory
   */
  readString(ptr, maxLength = 256) {
    if (!this.initialized || !ptr) return '';

    const bytes = [];
    for (let i = 0; i < maxLength; i++) {
      const byte = this.heap.u8[ptr + i];
      if (byte === 0) break;
      bytes.push(byte);
    }

    return String.fromCharCode(...bytes);
  }

  /**
   * Write a string to WASM memory
   */
  writeString(ptr, str, maxLength = 256) {
    if (!this.initialized || !ptr) return false;

    const length = Math.min(str.length, maxLength - 1);
    for (let i = 0; i < length; i++) {
      this.heap.u8[ptr + i] = str.charCodeAt(i);
    }
    this.heap.u8[ptr + length] = 0; // Null terminator

    return true;
  }

  /**
   * Read the dungeon tile array
   */
  readDungeonGrid(dungeonPtr) {
    if (!this.initialized || !dungeonPtr) return null;

    const grid = [];
    const width = GAME_OFFSETS.DUNGEON_WIDTH;
    const height = GAME_OFFSETS.DUNGEON_HEIGHT;

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        row.push(this.heap.u8[dungeonPtr + y * width + x]);
      }
      grid.push(row);
    }

    return grid;
  }

  /**
   * Write a dungeon tile array to memory
   */
  writeDungeonGrid(dungeonPtr, grid) {
    if (!this.initialized || !dungeonPtr || !grid) return false;

    const width = GAME_OFFSETS.DUNGEON_WIDTH;
    const height = GAME_OFFSETS.DUNGEON_HEIGHT;

    for (let y = 0; y < height && y < grid.length; y++) {
      for (let x = 0; x < width && x < grid[y].length; x++) {
        this.heap.u8[dungeonPtr + y * width + x] = grid[y][x];
      }
    }

    return true;
  }

  /**
   * Extract complete game state for AI analysis
   */
  extractGameState() {
    if (!this.initialized) return null;

    const state = {
      timestamp: Date.now(),
      frameCount: this.frameCount,
      player: this.extractPlayerState(),
      monsters: this.extractMonstersState(),
      level: this.extractLevelState(),
      quests: this.extractQuestsState(),
    };

    this.lastStateSnapshot = state;
    return state;
  }

  /**
   * Extract player state
   */
  extractPlayerState() {
    // This would require the actual player struct pointer
    // For now, return a placeholder that can be populated when pointers are known
    return {
      x: 0,
      y: 0,
      hp: 0,
      maxHp: 0,
      mana: 0,
      maxMana: 0,
      level: 0,
      class: 0,
      gold: 0,
    };
  }

  /**
   * Extract all monsters' state
   */
  extractMonstersState() {
    // Would iterate through the monster array when pointer is available
    return [];
  }

  /**
   * Extract current level state
   */
  extractLevelState() {
    return {
      type: 0,
      depth: 0,
      grid: null,
    };
  }

  /**
   * Extract active quests state
   */
  extractQuestsState() {
    return [];
  }

  /**
   * Inject a command into the game (simulated input)
   */
  injectCommand(command, params = {}) {
    if (!this.initialized) {
      this.log('warn', 'Cannot inject command - not initialized');
      return false;
    }

    this.log('debug', 'Injecting command', { command, params });

    switch (command) {
      case 'MOVE_MONSTER':
        return this.injectMonsterMove(params.monsterId, params.targetX, params.targetY);

      case 'SET_MONSTER_MODE':
        return this.injectMonsterMode(params.monsterId, params.mode);

      case 'OVERRIDE_DIALOGUE':
        return this.injectDialogue(params.npcId, params.text);

      case 'TRIGGER_EVENT':
        return this.triggerGameEvent(params.eventType, params.eventData);

      default:
        this.log('warn', `Unknown command: ${command}`);
        return false;
    }
  }

  /**
   * Inject monster movement command
   */
  injectMonsterMove(monsterId, targetX, targetY) {
    // Would write to monster's target coordinates
    this.emit('monsterMoveInjected', { monsterId, targetX, targetY });
    return true;
  }

  /**
   * Inject monster mode change
   */
  injectMonsterMode(monsterId, mode) {
    this.emit('monsterModeInjected', { monsterId, mode });
    return true;
  }

  /**
   * Inject dialogue override
   */
  injectDialogue(npcId, text) {
    this.emit('dialogueInjected', { npcId, text });
    return true;
  }

  /**
   * Trigger a game event
   */
  triggerGameEvent(eventType, eventData) {
    this.emit('gameEventTriggered', { eventType, eventData });
    return true;
  }

  /**
   * Frame update hook - called every render frame
   */
  onFrame(timestamp) {
    if (!this.initialized) return;

    this.frameCount++;

    // Emit frame event for subscribers
    this.emit('frame', {
      frameCount: this.frameCount,
      timestamp,
    });

    // Periodic state extraction for AI systems
    if (this.frameCount % 60 === 0) {
      this.emit('stateUpdate', this.extractGameState());
    }
  }

  /**
   * Hook into render batch for visual analysis
   */
  processRenderBatch(batch) {
    if (!NeuralConfig.debug.visualizeAI) return;

    this.emit('renderBatch', batch);
  }

  /**
   * Event system
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (err) {
          this.log('error', `Error in event listener for ${event}`, err);
        }
      }
    }
  }

  /**
   * Logging utility
   */
  log(level, message, data = null) {
    if (!NeuralConfig.debug.enabled) return;

    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(NeuralConfig.debug.logLevel);
    const messageLevel = levels.indexOf(level);

    if (messageLevel >= configLevel) {
      const prefix = `[NeuralInterop]`;
      if (data) {
        console[level](prefix, message, data);
      } else {
        console[level](prefix, message);
      }
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.eventListeners.clear();
    this.wasm = null;
    this.initialized = false;
    this.pointers = {};
    this.log('info', 'NeuralInterop destroyed');
  }
}

// Export constants for external use
export {
  GAME_OFFSETS,
  MONSTER_MODES,
  PLAYER_CLASSES,
  LEVEL_TYPES,
};

// Singleton instance
const neuralInterop = new NeuralInterop();
export default neuralInterop;
