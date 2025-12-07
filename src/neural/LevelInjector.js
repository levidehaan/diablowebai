/**
 * LevelInjector Service
 *
 * Manages runtime level injection into the WASM game engine.
 * Bridges the gap between AI-generated content and the live game.
 *
 * Features:
 * - Initializes WASMBridge connection to game worker
 * - Queues levels for injection on level transitions
 * - Supports immediate injection for current level
 * - Tracks injection state and provides callbacks
 * - Integrates with CampaignBuilder output
 */

import WASMBridge, { initWASMBridge } from './WASMBridge';
import DUNParser from './DUNParser';
import debugLogger, { LogCategory } from './DebugLogger';

// Level injection states
export const INJECTION_STATE = {
  IDLE: 'idle',
  PENDING: 'pending',
  INJECTING: 'injecting',
  COMPLETE: 'complete',
  FAILED: 'failed',
};

// Level transition types
export const TRANSITION_TYPE = {
  STAIRS_DOWN: 'stairs_down',
  STAIRS_UP: 'stairs_up',
  PORTAL: 'portal',
  TOWN_PORTAL: 'town_portal',
  GAME_START: 'game_start',
};

/**
 * LevelInjector - Singleton service for managing level injection
 */
class LevelInjector {
  constructor() {
    // State
    this.initialized = false;
    this.worker = null;
    this.state = INJECTION_STATE.IDLE;
    this.memoryDiscovered = false;

    // Pending injections by level ID
    this.pendingLevels = new Map(); // levelId → { grid, monsters, objects, metadata }

    // Current injection
    this.currentInjection = null;

    // Event listeners
    this.listeners = new Map();

    // Injection history
    this.history = [];

    // Current game state (tracked from worker messages)
    this.gameState = {
      currentLevel: 0,
      playerX: 0,
      playerY: 0,
      inGame: false,
    };

    // Bind message handler
    this.handleWorkerMessage = this.handleWorkerMessage.bind(this);
  }

  /**
   * Initialize with game worker
   * @param {Worker} worker - The game worker instance
   */
  async init(worker) {
    debugLogger.info(LogCategory.INJECTION, 'LevelInjector initialization starting...');

    if (this.initialized) {
      console.log('[LevelInjector] Already initialized');
      debugLogger.warn(LogCategory.INJECTION, 'LevelInjector already initialized');
      return true;
    }

    if (!worker) {
      console.error('[LevelInjector] No worker provided');
      debugLogger.error(LogCategory.INJECTION, 'No worker provided to LevelInjector');
      return false;
    }

    this.worker = worker;

    // Initialize WASMBridge
    const bridgeInit = initWASMBridge(worker);
    if (!bridgeInit) {
      console.error('[LevelInjector] Failed to init WASMBridge');
      debugLogger.error(LogCategory.INJECTION, 'WASMBridge initialization failed');
      return false;
    }
    debugLogger.info(LogCategory.INJECTION, 'WASMBridge initialized');

    // Listen for worker messages
    worker.addEventListener('message', this.handleWorkerMessage);

    // Scan memory to find dungeon arrays
    try {
      const scanResult = await WASMBridge.scanMemory();
      this.memoryDiscovered = scanResult.success;
      console.log('[LevelInjector] Memory scan:', scanResult);
      debugLogger.logMemoryScan(scanResult.success, scanResult.pointer, scanResult.stats);
    } catch (err) {
      console.warn('[LevelInjector] Memory scan failed (game may not be loaded yet):', err.message);
      debugLogger.warn(LogCategory.INJECTION, 'Memory scan failed (game may not be loaded)', {
        error: err.message,
      });
    }

    this.initialized = true;
    console.log('[LevelInjector] Initialized');
    debugLogger.info(LogCategory.INJECTION, 'LevelInjector initialization COMPLETE', {
      memoryDiscovered: this.memoryDiscovered,
    });
    return true;
  }

  /**
   * Handle messages from the game worker
   */
  handleWorkerMessage(event) {
    const { action, ...data } = event.data;

    switch (action) {
      case 'neural_scan_result':
        this.memoryDiscovered = data.success;
        debugLogger.logMemoryScan(data.success, data.pointer, data.stats);
        this.emit('memoryDiscovered', data);
        break;

      case 'neural_inject_result':
        if (data.success) {
          this.state = INJECTION_STATE.COMPLETE;
          debugLogger.logInjectionResult(this.currentInjection?.levelId, true, {
            method: 'worker_message',
            injection: this.currentInjection,
          });
          this.emit('injectionComplete', this.currentInjection);
          this.history.push({
            timestamp: Date.now(),
            ...this.currentInjection,
            success: true,
          });
        } else {
          this.state = INJECTION_STATE.FAILED;
          debugLogger.logInjectionResult(this.currentInjection?.levelId, false, {
            error: data.error,
          });
          this.emit('injectionFailed', { error: data.error });
        }
        this.currentInjection = null;
        break;

      case 'neural_write_result':
        if (data.success) {
          console.log('[LevelInjector] Grid write successful');
          debugLogger.info(LogCategory.INJECTION, 'Grid write successful via worker');
        } else {
          debugLogger.error(LogCategory.INJECTION, 'Grid write failed', data);
        }
        break;

      case 'game_state':
        // Track game state changes
        const prevLevel = this.gameState.currentLevel;
        this.gameState = { ...this.gameState, ...data };

        // Check for level transition
        if (data.currentLevel !== undefined && data.currentLevel !== prevLevel) {
          debugLogger.info(LogCategory.INJECTION, `Game state: level transition detected ${prevLevel} → ${data.currentLevel}`);
          this.onLevelTransition(prevLevel, data.currentLevel);
        }
        break;
    }
  }

  /**
   * Handle level transition - inject pending levels
   */
  async onLevelTransition(fromLevel, toLevel) {
    console.log(`[LevelInjector] Level transition: ${fromLevel} → ${toLevel}`);
    debugLogger.info(LogCategory.INJECTION, `Level transition: ${fromLevel} → ${toLevel}`, {
      fromLevel,
      toLevel,
      pendingLevels: Array.from(this.pendingLevels.keys()),
      hasPendingForTarget: this.pendingLevels.has(toLevel),
    });

    // Check if we have a pending level for this destination
    if (this.pendingLevels.has(toLevel)) {
      const levelData = this.pendingLevels.get(toLevel);
      console.log(`[LevelInjector] Found pending level for ${toLevel}, injecting...`);
      debugLogger.info(LogCategory.INJECTION, `Found pending injection for level ${toLevel}, starting injection...`, {
        levelId: toLevel,
        gridSize: levelData.grid ? `${levelData.grid[0]?.length}x${levelData.grid.length}` : 'no grid',
        monsters: levelData.monsters?.length || 0,
        objects: levelData.objects?.length || 0,
      });

      // Small delay to let the game engine set up the level first
      await this.delay(100);

      await this.injectLevelData(levelData, toLevel);
      this.pendingLevels.delete(toLevel);
    } else {
      debugLogger.debug(LogCategory.INJECTION, `No pending injection for level ${toLevel}`);
    }

    this.emit('levelTransition', { from: fromLevel, to: toLevel });
  }

  /**
   * Queue a level for injection when the player enters it
   * @param {number} levelId - The level ID (0-16, or 17+ for custom)
   * @param {Object} levelData - Level data with grid, monsters, objects
   */
  queueLevel(levelId, levelData) {
    console.log(`[LevelInjector] Queuing level ${levelId}`);

    // Validate level data
    if (!levelData.grid || levelData.grid.length !== 40) {
      console.error('[LevelInjector] Invalid level data - grid must be 40x40');
      debugLogger.error(LogCategory.INJECTION, `Invalid level data for level ${levelId}`, {
        hasGrid: !!levelData.grid,
        gridLength: levelData.grid?.length,
        expected: 40,
      });
      return false;
    }

    this.pendingLevels.set(levelId, {
      ...levelData,
      queuedAt: Date.now(),
    });

    debugLogger.logInjectionAttempt(levelId, 'queue', levelData);
    debugLogger.info(LogCategory.INJECTION, `Level ${levelId} queued for injection`, {
      levelId,
      gridSize: `${levelData.grid[0]?.length}x${levelData.grid.length}`,
      monsters: levelData.monsters?.length || 0,
      objects: levelData.objects?.length || 0,
      totalQueuedLevels: this.pendingLevels.size,
    });

    this.emit('levelQueued', { levelId, hasMonsters: !!levelData.monsters });
    return true;
  }

  /**
   * Queue multiple levels (e.g., from a campaign build)
   * @param {Map} levels - Map of levelId → levelData
   */
  queueCampaign(levels) {
    let count = 0;
    for (const [levelId, levelData] of levels) {
      if (this.queueLevel(levelId, levelData)) {
        count++;
      }
    }
    console.log(`[LevelInjector] Queued ${count} levels from campaign`);
    return count;
  }

  /**
   * Inject a level immediately (for current level)
   * @param {Object} levelData - Level data with grid
   * @param {number} levelId - Optional level ID for tracking
   */
  async injectNow(levelData, levelId = null) {
    if (!this.initialized) {
      throw new Error('LevelInjector not initialized');
    }

    if (!this.memoryDiscovered) {
      // Try to discover memory
      try {
        const scanResult = await WASMBridge.scanMemory();
        this.memoryDiscovered = scanResult.success;
        if (!scanResult.success) {
          throw new Error('Could not discover WASM memory');
        }
      } catch (err) {
        throw new Error(`Memory discovery failed: ${err.message}`);
      }
    }

    return this.injectLevelData(levelData, levelId);
  }

  /**
   * Internal: Inject level data
   */
  async injectLevelData(levelData, levelId) {
    this.state = INJECTION_STATE.INJECTING;
    this.currentInjection = { levelId, timestamp: Date.now() };

    try {
      // Inject via WASMBridge
      const result = await WASMBridge.injectLevel(levelData);

      if (result.success) {
        console.log(`[LevelInjector] Level ${levelId ?? 'current'} injected successfully`);
        return true;
      } else {
        throw new Error(result.error || 'Injection failed');
      }
    } catch (err) {
      this.state = INJECTION_STATE.FAILED;
      this.emit('injectionFailed', { error: err.message, levelId });
      throw err;
    }
  }

  /**
   * Inject a DUN file (parsed or raw buffer)
   * @param {Object|Uint8Array} dunData - Parsed DUN or raw buffer
   * @param {number} levelId - Level ID
   */
  async injectDUN(dunData, levelId = null) {
    let parsed = dunData;

    // Parse if it's a buffer
    if (dunData instanceof Uint8Array || dunData instanceof ArrayBuffer) {
      parsed = DUNParser.parse(dunData);
    }

    // Convert to 40x40 grid
    const grid = this.dunToGrid(parsed);

    return this.injectNow({ grid }, levelId);
  }

  /**
   * Convert DUN data to 40x40 game grid
   */
  dunToGrid(dunData) {
    const grid = [];

    for (let y = 0; y < 40; y++) {
      grid[y] = [];
      for (let x = 0; x < 40; x++) {
        // DUN tiles map directly if within bounds
        if (y < dunData.height && x < dunData.width) {
          grid[y][x] = dunData.baseTiles[y][x];
        } else {
          grid[y][x] = 1; // Wall for out of bounds
        }
      }
    }

    return grid;
  }

  /**
   * Read current level grid from game
   */
  async readCurrentLevel() {
    if (!this.memoryDiscovered) {
      await WASMBridge.scanMemory();
    }
    return WASMBridge.readDungeonGrid();
  }

  /**
   * Clear all pending levels
   */
  clearPending() {
    const count = this.pendingLevels.size;
    this.pendingLevels.clear();
    console.log(`[LevelInjector] Cleared ${count} pending levels`);
    return count;
  }

  /**
   * Get injection status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      memoryDiscovered: this.memoryDiscovered,
      state: this.state,
      pendingLevels: Array.from(this.pendingLevels.keys()),
      historyCount: this.history.length,
      gameState: { ...this.gameState },
    };
  }

  // ============================================================================
  // Event system
  // ============================================================================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[LevelInjector] Event listener error (${event}):`, err);
        }
      });
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const levelInjector = new LevelInjector();

// Export both instance and class
export { LevelInjector };
export default levelInjector;
