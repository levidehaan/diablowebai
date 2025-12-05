/**
 * Game Event Detector
 *
 * Detects game events by comparing state snapshots between frames.
 * Since the WASM engine doesn't emit events directly, we poll for changes.
 *
 * Detected Events:
 * - MONSTER_KILLED: Monster HP went from > 0 to 0
 * - MONSTER_SPAWNED: New monster appeared
 * - PLAYER_DAMAGED: Player HP decreased
 * - PLAYER_HEALED: Player HP increased
 * - PLAYER_LEVELED: Player level increased
 * - LEVEL_ENTERED: Current dungeon level changed
 * - GOLD_CHANGED: Player gold changed
 * - ITEM_PICKED: (future - requires item tracking)
 * - QUEST_UPDATED: (future - requires quest tracking)
 */

// Game state structure sizes and offsets (from devilution source)
const OFFSETS = {
  // Player structure (simplified)
  PLAYER_STRUCT_SIZE: 0x4000,  // Approximate
  PLR_PX: 0x00,        // Player X position
  PLR_PY: 0x04,        // Player Y position
  PLR_HP: 0x10,        // Current HP
  PLR_MAXHP: 0x14,     // Max HP
  PLR_MANA: 0x18,      // Current Mana
  PLR_MAXMANA: 0x1C,   // Max Mana
  PLR_LEVEL: 0x20,     // Character level
  PLR_GOLD: 0x24,      // Gold amount

  // Monster structure
  MONSTER_STRUCT_SIZE: 0x180,
  MON_HP: 0x08,        // Monster HP
  MON_MAXHP: 0x0C,     // Monster Max HP
  MON_TYPE: 0x14,      // Monster type ID
  MON_MODE: 0x10,      // Monster mode (MM_DEATH = 6)
  MON_X: 0x00,         // Monster X
  MON_Y: 0x04,         // Monster Y

  // Level info
  CURRLEVEL_OFFSET: null,  // Discovered at runtime

  // Array sizes
  MAX_MONSTERS: 200,
  DUNGEON_WIDTH: 40,
  DUNGEON_HEIGHT: 40,
};

// Monster modes
const MM_DEATH = 6;

/**
 * Event types emitted by the detector
 */
export const GameEventType = {
  // Combat events
  MONSTER_KILLED: 'monster_killed',
  MONSTER_SPAWNED: 'monster_spawned',
  BOSS_KILLED: 'boss_killed',

  // Player events
  PLAYER_DAMAGED: 'player_damaged',
  PLAYER_HEALED: 'player_healed',
  PLAYER_LEVELED: 'player_leveled',
  PLAYER_DIED: 'player_died',
  PLAYER_MOVED: 'player_moved',

  // Economy events
  GOLD_GAINED: 'gold_gained',
  GOLD_SPENT: 'gold_spent',

  // Level events
  LEVEL_ENTERED: 'level_entered',
  LEVEL_CLEARED: 'level_cleared',

  // Interaction events
  OBJECT_ACTIVATED: 'object_activated',
  SHRINE_USED: 'shrine_used',
};

/**
 * Boss monster IDs
 */
const BOSS_MONSTERS = new Set([
  101, // SKELETON_KING
  102, // BUTCHER
  107, // DIABLO
  108, // LAZARUS
]);

/**
 * GameEventDetector - Detects game events by polling WASM memory
 */
export class GameEventDetector {
  constructor() {
    this.wasm = null;
    this.heap = null;
    this.initialized = false;

    // Memory pointers (discovered at runtime)
    this.pointers = {
      player: null,
      monsters: null,
      currlevel: null,
      nummonsters: null,
    };

    // Previous state for change detection
    this.prevState = {
      playerHp: 0,
      playerMaxHp: 0,
      playerLevel: 0,
      playerGold: 0,
      playerX: 0,
      playerY: 0,
      currentLevel: -1,
      monsters: new Map(), // monsterId -> {hp, type, x, y}
      monsterCount: 0,
    };

    // Event queue (sent to main thread)
    this.eventQueue = [];

    // Statistics
    this.stats = {
      framesProcessed: 0,
      eventsEmitted: 0,
      lastEventTime: 0,
    };
  }

  /**
   * Initialize with WASM module
   */
  initialize(wasmModule) {
    this.wasm = wasmModule;
    this.heap = {
      u8: wasmModule.HEAPU8,
      u32: wasmModule.HEAPU32,
      i32: wasmModule.HEAP32,
    };
    this.initialized = true;

    console.log('[GameEventDetector] Initialized');

    // Try to discover memory pointers
    this.discoverPointers();
  }

  /**
   * Attempt to discover memory pointers by scanning WASM exports
   */
  discoverPointers() {
    if (!this.wasm) return;

    // Look for exported symbols that might give us pointers
    // This is build-dependent and may not work for all builds

    // Common exported names in devilution builds
    const potentialExports = [
      '_plr',           // Player array
      '_monster',       // Monster array
      '_currlevel',     // Current level
      '_nummonsters',   // Monster count
      '_nummissiles',   // Missile count
      '_dFlags',        // Dungeon flags
    ];

    for (const name of potentialExports) {
      if (typeof this.wasm[name] === 'number') {
        const shortName = name.replace('_', '');
        this.pointers[shortName] = this.wasm[name];
        console.log(`[GameEventDetector] Found ${name} at ${this.wasm[name].toString(16)}`);
      }
    }

    // If pointers not found via exports, we'll use memory scanning
    // (more expensive but works for any build)
  }

  /**
   * Process a frame - detect events by comparing with previous state
   * Call this every frame (e.g., in the render loop)
   */
  processFrame() {
    if (!this.initialized || !this.heap) return;

    this.stats.framesProcessed++;

    // Get current state
    const currentState = this.extractCurrentState();
    if (!currentState) return;

    // Compare with previous state and emit events
    this.detectEvents(currentState);

    // Update previous state
    this.prevState = currentState;
  }

  /**
   * Extract current game state from WASM memory
   */
  extractCurrentState() {
    // For now, return a placeholder
    // Full implementation requires discovered pointers

    const state = {
      playerHp: 0,
      playerMaxHp: 0,
      playerLevel: 0,
      playerGold: 0,
      playerX: 0,
      playerY: 0,
      currentLevel: -1,
      monsters: new Map(),
      monsterCount: 0,
    };

    // If we have pointers, read actual values
    // This will be expanded as we discover memory layout

    return state;
  }

  /**
   * Detect events by comparing current and previous state
   */
  detectEvents(currentState) {
    const prev = this.prevState;

    // Skip first frame (no previous state)
    if (prev.currentLevel === -1 && currentState.currentLevel === -1) {
      return;
    }

    // --- Level Events ---
    if (currentState.currentLevel !== prev.currentLevel && currentState.currentLevel >= 0) {
      this.emitEvent(GameEventType.LEVEL_ENTERED, {
        level: currentState.currentLevel,
        previousLevel: prev.currentLevel,
        theme: this.getLevelTheme(currentState.currentLevel),
      });
    }

    // --- Player Events ---
    if (currentState.playerHp > 0) {
      // Player took damage
      if (currentState.playerHp < prev.playerHp && prev.playerHp > 0) {
        this.emitEvent(GameEventType.PLAYER_DAMAGED, {
          damage: prev.playerHp - currentState.playerHp,
          currentHp: currentState.playerHp,
          maxHp: currentState.playerMaxHp,
        });
      }

      // Player healed
      if (currentState.playerHp > prev.playerHp) {
        this.emitEvent(GameEventType.PLAYER_HEALED, {
          amount: currentState.playerHp - prev.playerHp,
          currentHp: currentState.playerHp,
          maxHp: currentState.playerMaxHp,
        });
      }
    }

    // Player died
    if (currentState.playerHp <= 0 && prev.playerHp > 0) {
      this.emitEvent(GameEventType.PLAYER_DIED, {
        level: currentState.currentLevel,
      });
    }

    // Player leveled up
    if (currentState.playerLevel > prev.playerLevel && prev.playerLevel > 0) {
      this.emitEvent(GameEventType.PLAYER_LEVELED, {
        newLevel: currentState.playerLevel,
        previousLevel: prev.playerLevel,
      });
    }

    // Player moved (significant distance)
    const dx = currentState.playerX - prev.playerX;
    const dy = currentState.playerY - prev.playerY;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      // Only emit if moved to a new tile
      if (dx !== 0 || dy !== 0) {
        this.emitEvent(GameEventType.PLAYER_MOVED, {
          x: currentState.playerX,
          y: currentState.playerY,
          previousX: prev.playerX,
          previousY: prev.playerY,
        });
      }
    }

    // --- Gold Events ---
    if (currentState.playerGold > prev.playerGold) {
      this.emitEvent(GameEventType.GOLD_GAINED, {
        amount: currentState.playerGold - prev.playerGold,
        total: currentState.playerGold,
      });
    }
    if (currentState.playerGold < prev.playerGold) {
      this.emitEvent(GameEventType.GOLD_SPENT, {
        amount: prev.playerGold - currentState.playerGold,
        total: currentState.playerGold,
      });
    }

    // --- Monster Events ---
    this.detectMonsterEvents(currentState.monsters, prev.monsters);

    // --- Level Cleared ---
    if (prev.monsterCount > 0 && currentState.monsterCount === 0) {
      this.emitEvent(GameEventType.LEVEL_CLEARED, {
        level: currentState.currentLevel,
      });
    }
  }

  /**
   * Detect monster-related events
   */
  detectMonsterEvents(currentMonsters, prevMonsters) {
    // Check for killed monsters
    for (const [monsterId, prevData] of prevMonsters) {
      const currentData = currentMonsters.get(monsterId);

      // Monster existed before but is now dead or gone
      if (!currentData || (prevData.hp > 0 && currentData.hp <= 0)) {
        const eventType = BOSS_MONSTERS.has(prevData.type)
          ? GameEventType.BOSS_KILLED
          : GameEventType.MONSTER_KILLED;

        this.emitEvent(eventType, {
          monsterId,
          monsterType: prevData.type,
          x: prevData.x,
          y: prevData.y,
          isBoss: BOSS_MONSTERS.has(prevData.type),
        });
      }
    }

    // Check for spawned monsters
    for (const [monsterId, currentData] of currentMonsters) {
      if (!prevMonsters.has(monsterId) && currentData.hp > 0) {
        this.emitEvent(GameEventType.MONSTER_SPAWNED, {
          monsterId,
          monsterType: currentData.type,
          x: currentData.x,
          y: currentData.y,
        });
      }
    }
  }

  /**
   * Get dungeon theme for a level number
   */
  getLevelTheme(level) {
    if (level === 0) return 'town';
    if (level <= 4) return 'cathedral';
    if (level <= 8) return 'catacombs';
    if (level <= 12) return 'caves';
    return 'hell';
  }

  /**
   * Emit an event to the queue
   */
  emitEvent(type, data) {
    const event = {
      type,
      data,
      timestamp: Date.now(),
      frame: this.stats.framesProcessed,
    };

    this.eventQueue.push(event);
    this.stats.eventsEmitted++;
    this.stats.lastEventTime = event.timestamp;

    console.log(`[GameEventDetector] Event: ${type}`, data);
  }

  /**
   * Get and clear pending events (call from worker message handler)
   */
  flushEvents() {
    const events = this.eventQueue;
    this.eventQueue = [];
    return events;
  }

  /**
   * Check if there are pending events
   */
  hasPendingEvents() {
    return this.eventQueue.length > 0;
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Manually inject an event (for testing or external triggers)
   */
  injectEvent(type, data) {
    this.emitEvent(type, data);
  }

  /**
   * Reset state (call on level change or game restart)
   */
  reset() {
    this.prevState = {
      playerHp: 0,
      playerMaxHp: 0,
      playerLevel: 0,
      playerGold: 0,
      playerX: 0,
      playerY: 0,
      currentLevel: -1,
      monsters: new Map(),
      monsterCount: 0,
    };
    this.eventQueue = [];
  }
}

// Export singleton for use in worker
export const gameEventDetector = new GameEventDetector();
export default gameEventDetector;
