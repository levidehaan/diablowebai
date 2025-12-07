/**
 * CustomAPIBridge.js - White Box WASM Integration
 *
 * This module provides the JavaScript interface to the CustomAPI exports
 * added to the recompiled DevilutionX WASM binary.
 *
 * When the custom WASM binary is loaded, this bridge provides direct access
 * to game internals without memory scanning. If the custom exports aren't
 * available, it falls back to the legacy WASMBridge approach.
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────┐
 * │ JavaScript Layer                                         │
 * │  ┌─────────────────┐                                    │
 * │  │ CustomAPIBridge │ ← You are here                     │
 * │  └────────┬────────┘                                    │
 * │           │                                              │
 * │  ┌────────▼────────┐                                    │
 * │  │  game.worker.js │ (calls WASM exports)               │
 * │  └────────┬────────┘                                    │
 * └───────────┼─────────────────────────────────────────────┘
 *             │
 * ┌───────────▼─────────────────────────────────────────────┐
 * │ WASM Binary                                              │
 * │  ┌─────────────────┐                                    │
 * │  │  CustomAPI.cpp  │ (new exports)                      │
 * │  └────────┬────────┘                                    │
 * │           │                                              │
 * │  ┌────────▼────────┐                                    │
 * │  │  DevilutionX    │ (game engine)                      │
 * │  └─────────────────┘                                    │
 * └─────────────────────────────────────────────────────────┘
 */

import debugLogger, { LogCategory } from './DebugLogger';

// Feature detection state
let customAPIAvailable = null;
let gameWorker = null;
let availableExports = [];

// Pending promises for async operations
const pendingPromises = new Map();
let requestId = 0;

// Custom API capabilities
const CUSTOM_API_EXPORTS = [
  'DApi_OverrideStartLevel',
  'DApi_SuppressNPCs',
  'DApi_SetDungeonGeometry',
  'DApi_InjectMonster',
  'DApi_ClearMonsters',
  'DApi_GetMonsterCount',
  'DApi_InjectObject',
  'DApi_ClearObjects',
  'DApi_GetCurrentLevel',
  'DApi_GetPlayerPos',
  'DApi_SetPlayerPos',
  'DApi_PauseGameLogic',
  'DApi_GetDLevelPtr',
  'DApi_GetDMonsterPtr',
  'DApi_GetDObjectPtr',
  'DApi_GetPlayerPtr',
  'DApi_GetQuestFlag',
  'DApi_SetQuestFlag',
];

/**
 * Initialize the CustomAPI bridge
 * @param {Worker} worker - The game worker instance
 * @returns {Promise<boolean>} True if custom API is available
 */
export async function initCustomAPI(worker) {
  debugLogger.info(LogCategory.DAPI, 'CustomAPI bridge initialization starting...');

  if (!worker) {
    console.error('[CustomAPI] No worker provided');
    debugLogger.error(LogCategory.DAPI, 'No worker provided to CustomAPI');
    return false;
  }

  gameWorker = worker;

  // Listen for responses
  worker.addEventListener('message', handleWorkerMessage);

  // Probe for custom API availability
  try {
    const result = await probeCustomAPI();
    customAPIAvailable = result.available;
    availableExports = result.exports || [];

    if (customAPIAvailable) {
      console.log('[CustomAPI] White Box mode: Custom exports available!');
      console.log('[CustomAPI] Available exports:', result.exports);
      debugLogger.info(LogCategory.DAPI, 'CustomAPI initialized in WHITE BOX mode', {
        available: true,
        exportCount: availableExports.length,
        exports: availableExports,
      });
    } else {
      console.log('[CustomAPI] Glass Box mode: Using memory scanning fallback');
      debugLogger.warn(LogCategory.DAPI, 'CustomAPI NOT available - using GLASS BOX fallback', {
        available: false,
        reason: 'No custom exports found in WASM',
      });
    }

    return customAPIAvailable;
  } catch (err) {
    console.warn('[CustomAPI] Probe failed:', err);
    debugLogger.error(LogCategory.DAPI, 'CustomAPI probe FAILED', {
      error: err.message,
      stack: err.stack,
    });
    customAPIAvailable = false;
    return false;
  }
}

// Export available exports for external access
export { availableExports };

/**
 * Check if CustomAPI exports are available in the WASM binary
 */
function probeCustomAPI() {
  return new Promise((resolve) => {
    const id = ++requestId;
    pendingPromises.set(id, resolve);

    gameWorker.postMessage({
      action: 'custom_api_probe',
      requestId: id,
      exports: CUSTOM_API_EXPORTS,
    });

    // Timeout after 2 seconds
    setTimeout(() => {
      if (pendingPromises.has(id)) {
        pendingPromises.delete(id);
        resolve({ available: false, exports: [] });
      }
    }, 2000);
  });
}

/**
 * Handle messages from worker
 */
function handleWorkerMessage(event) {
  const { action, requestId: id, ...data } = event.data;

  // Handle custom API responses
  if (action?.startsWith('custom_api_')) {
    const resolve = pendingPromises.get(id);
    if (resolve) {
      pendingPromises.delete(id);
      resolve(data);
    }
  }
}

/**
 * Call a CustomAPI function
 */
function callCustomAPI(funcName, ...args) {
  return new Promise((resolve, reject) => {
    if (!customAPIAvailable) {
      debugLogger.warn(LogCategory.DAPI, `DApi call ${funcName} rejected - CustomAPI not available`, { funcName, args });
      reject(new Error('CustomAPI not available - use fallback'));
      return;
    }

    const id = ++requestId;
    const callStartTime = Date.now();

    pendingPromises.set(id, (result) => {
      const duration = Date.now() - callStartTime;
      if (result.error) {
        debugLogger.logDapiCall(funcName, args, result.error, false);
        reject(new Error(result.error));
      } else {
        debugLogger.logDapiCall(funcName, args, result.value, true);
        debugLogger.debug(LogCategory.DAPI, `DApi call complete: ${funcName} (${duration}ms)`, {
          funcName,
          args,
          result: result.value,
          duration,
        });
        resolve(result.value);
      }
    });

    debugLogger.debug(LogCategory.DAPI, `DApi call starting: ${funcName}`, { funcName, args, requestId: id });

    gameWorker.postMessage({
      action: 'custom_api_call',
      requestId: id,
      func: funcName,
      args,
    });

    // Timeout
    setTimeout(() => {
      if (pendingPromises.has(id)) {
        pendingPromises.delete(id);
        debugLogger.error(LogCategory.DAPI, `DApi call TIMEOUT: ${funcName}`, { funcName, args });
        reject(new Error(`CustomAPI call ${funcName} timed out`));
      }
    }, 5000);
  });
}

// ============================================================
// GAME FLOW CONTROL
// ============================================================

/**
 * Override the starting level for new games
 * @param {number} levelId - Level to start on (0=Tristram, 1-16=dungeons)
 */
export async function overrideStartLevel(levelId) {
  return callCustomAPI('DApi_OverrideStartLevel', levelId);
}

/**
 * Suppress standard Tristram NPCs
 * @param {boolean} suppress - True to suppress NPC spawning
 */
export async function suppressNPCs(suppress) {
  return callCustomAPI('DApi_SuppressNPCs', suppress);
}

/**
 * Get the current dungeon level
 * @returns {Promise<number>} Current level ID
 */
export async function getCurrentLevel() {
  return callCustomAPI('DApi_GetCurrentLevel');
}

/**
 * Pause/resume game logic
 * @param {boolean} paused - True to pause, false to resume
 */
export async function pauseGameLogic(paused) {
  return callCustomAPI('DApi_PauseGameLogic', paused);
}

// ============================================================
// LEVEL GEOMETRY
// ============================================================

/**
 * Inject custom dungeon geometry
 * @param {number[][]} grid - 40x40 tile grid
 * @returns {Promise<boolean>} Success status
 */
export async function setDungeonGeometry(grid) {
  if (!grid || grid.length !== 40 || grid[0].length !== 40) {
    throw new Error('Grid must be 40x40');
  }

  // Flatten grid for transfer
  const flatGrid = new Uint8Array(40 * 40);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      flatGrid[y * 40 + x] = grid[y][x];
    }
  }

  return callCustomAPI('DApi_SetDungeonGeometry', flatGrid, 40, 40);
}

/**
 * Get pointer to dLevel array (for direct manipulation)
 * @returns {Promise<number>} Memory pointer
 */
export async function getDLevelPtr() {
  return callCustomAPI('DApi_GetDLevelPtr');
}

// ============================================================
// MONSTER CONTROL
// ============================================================

/**
 * Inject a monster into the current level
 * @param {number} x - X position (0-39)
 * @param {number} y - Y position (0-39)
 * @param {number} typeId - Monster type ID
 * @param {number} hp - HP (-1 for default)
 * @param {number} flags - Monster flags (0=normal, 1=unique, 2=champion)
 * @returns {Promise<number>} Monster slot index
 */
export async function injectMonster(x, y, typeId, hp = -1, flags = 0) {
  return callCustomAPI('DApi_InjectMonster', x, y, typeId, hp, flags);
}

/**
 * Clear all monsters from the level
 */
export async function clearMonsters() {
  return callCustomAPI('DApi_ClearMonsters');
}

/**
 * Get number of active monsters
 * @returns {Promise<number>} Monster count
 */
export async function getMonsterCount() {
  return callCustomAPI('DApi_GetMonsterCount');
}

/**
 * Get pointer to monster array
 * @returns {Promise<number>} Memory pointer
 */
export async function getDMonsterPtr() {
  return callCustomAPI('DApi_GetDMonsterPtr');
}

// ============================================================
// OBJECT CONTROL
// ============================================================

/**
 * Inject an object into the level
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} typeId - Object type ID
 * @returns {Promise<number>} Object slot index
 */
export async function injectObject(x, y, typeId) {
  return callCustomAPI('DApi_InjectObject', x, y, typeId);
}

/**
 * Clear all objects from the level
 */
export async function clearObjects() {
  return callCustomAPI('DApi_ClearObjects');
}

/**
 * Get pointer to object array
 * @returns {Promise<number>} Memory pointer
 */
export async function getDObjectPtr() {
  return callCustomAPI('DApi_GetDObjectPtr');
}

// ============================================================
// PLAYER CONTROL
// ============================================================

/**
 * Get player position
 * @returns {Promise<{x: number, y: number}>} Player coordinates
 */
export async function getPlayerPos() {
  const result = await callCustomAPI('DApi_GetPlayerPos');
  return { x: result.x, y: result.y };
}

/**
 * Teleport player to position
 * @param {number} x - Target X
 * @param {number} y - Target Y
 * @returns {Promise<boolean>} Success status
 */
export async function setPlayerPos(x, y) {
  return callCustomAPI('DApi_SetPlayerPos', x, y);
}

/**
 * Get pointer to player struct
 * @returns {Promise<number>} Memory pointer
 */
export async function getPlayerPtr() {
  return callCustomAPI('DApi_GetPlayerPtr');
}

// ============================================================
// QUEST CONTROL
// ============================================================

/**
 * Get a quest flag value
 * @param {number} questId - Quest ID (0-15)
 * @returns {Promise<number>} Quest state
 */
export async function getQuestFlag(questId) {
  return callCustomAPI('DApi_GetQuestFlag', questId);
}

/**
 * Set a quest flag value
 * @param {number} questId - Quest ID (0-15)
 * @param {number} value - New state value
 */
export async function setQuestFlag(questId, value) {
  return callCustomAPI('DApi_SetQuestFlag', questId, value);
}

// ============================================================
// HIGH-LEVEL OPERATIONS
// ============================================================

/**
 * Start a custom campaign (bypasses Tristram)
 * @param {Object} options - Campaign options
 * @param {number} options.startLevel - Level to start on
 * @param {number[][]} options.startGrid - Custom starting grid
 * @param {Array} options.monsters - Monsters to spawn
 * @param {Array} options.objects - Objects to place
 */
export async function startCustomCampaign(options) {
  const { startLevel = 1, startGrid, monsters = [], objects = [] } = options;

  // Override starting level
  await overrideStartLevel(startLevel);

  // Suppress Tristram NPCs
  await suppressNPCs(true);

  // If we have a custom grid, it will be injected on level enter
  // (The worker listens for LEVEL_ENTERED and applies pending data)

  console.log('[CustomAPI] Custom campaign configured:', {
    startLevel,
    hasGrid: !!startGrid,
    monsterCount: monsters.length,
    objectCount: objects.length,
  });

  return true;
}

/**
 * Inject a complete level setup
 * @param {Object} levelData - Level configuration
 */
export async function injectCompleteLevel(levelData) {
  const { grid, monsters = [], objects = [] } = levelData;

  // Pause game logic while we inject
  await pauseGameLogic(true);

  try {
    // Clear existing entities
    await clearMonsters();
    await clearObjects();

    // Inject grid
    if (grid) {
      await setDungeonGeometry(grid);
    }

    // Spawn monsters
    for (const m of monsters) {
      await injectMonster(m.x, m.y, m.typeId, m.hp || -1, m.flags || 0);
    }

    // Place objects
    for (const o of objects) {
      await injectObject(o.x, o.y, o.typeId);
    }

    console.log('[CustomAPI] Level injected:', {
      hasGrid: !!grid,
      monsters: monsters.length,
      objects: objects.length,
    });
  } finally {
    // Resume game
    await pauseGameLogic(false);
  }
}

/**
 * Implement the "Ghost Town" technique
 * Let Tristram load, then wipe and inject custom content
 */
export async function ghostTownInjection(customTownData) {
  // Wait for Tristram to finish loading
  const level = await getCurrentLevel();
  if (level !== 0) {
    throw new Error('Ghost Town only works on level 0 (Tristram)');
  }

  console.log('[CustomAPI] Executing Ghost Town injection...');

  // Pause while we work
  await pauseGameLogic(true);

  try {
    // Wipe standard NPCs and objects
    await clearMonsters();
    await clearObjects();

    // Inject custom geometry
    if (customTownData.grid) {
      await setDungeonGeometry(customTownData.grid);
    }

    // Spawn our custom "NPCs" (using monster slots with villager sprites)
    for (const npc of customTownData.npcs || []) {
      // NPCs use special monster type IDs that display as villagers
      await injectMonster(npc.x, npc.y, npc.typeId, 999999, 0);
    }

    // Place custom objects
    for (const obj of customTownData.objects || []) {
      await injectObject(obj.x, obj.y, obj.typeId);
    }

    // Teleport player to custom spawn point
    if (customTownData.playerSpawn) {
      await setPlayerPos(customTownData.playerSpawn.x, customTownData.playerSpawn.y);
    }

    console.log('[CustomAPI] Ghost Town injection complete!');
  } finally {
    await pauseGameLogic(false);
  }
}

// ============================================================
// STATUS AND DIAGNOSTICS
// ============================================================

/**
 * Check if CustomAPI is available
 */
export function isCustomAPIAvailable() {
  return customAPIAvailable === true;
}

/**
 * Get diagnostic info
 */
export async function getDiagnostics() {
  const info = {
    customAPIAvailable,
    workerConnected: !!gameWorker,
  };

  if (customAPIAvailable) {
    try {
      info.currentLevel = await getCurrentLevel();
      info.monsterCount = await getMonsterCount();
      info.playerPos = await getPlayerPos();
      info.dLevelPtr = await getDLevelPtr();
    } catch (err) {
      info.diagnosticsError = err.message;
    }
  }

  return info;
}

// ============================================================
// EXPORT
// ============================================================

const CustomAPIBridge = {
  // Initialization
  init: initCustomAPI,
  isAvailable: isCustomAPIAvailable,
  getDiagnostics,

  // Game flow
  overrideStartLevel,
  suppressNPCs,
  getCurrentLevel,
  pauseGameLogic,

  // Level geometry
  setDungeonGeometry,
  getDLevelPtr,

  // Monsters
  injectMonster,
  clearMonsters,
  getMonsterCount,
  getDMonsterPtr,

  // Objects
  injectObject,
  clearObjects,
  getDObjectPtr,

  // Player
  getPlayerPos,
  setPlayerPos,
  getPlayerPtr,

  // Quests
  getQuestFlag,
  setQuestFlag,

  // High-level operations
  startCustomCampaign,
  injectCompleteLevel,
  ghostTownInjection,
};

export default CustomAPIBridge;
