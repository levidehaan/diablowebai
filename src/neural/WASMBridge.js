/**
 * WASM Bridge
 *
 * Main thread interface for communicating with the game worker
 * to access and modify WASM memory for AI level injection.
 *
 * This module sends commands to the game.worker.js which has
 * direct access to WASM memory. Results are received via callbacks.
 */

// Dungeon grid dimensions
const DMAXX = 40;
const DMAXY = 40;
const GRID_SIZE = DMAXX * DMAXY;

// Worker reference
let gameWorker = null;

// Pending response callbacks
const pendingCallbacks = new Map();
let requestId = 0;

// Discovery state (synced from worker)
let memoryInfo = {
  discovered: false,
  pointer: null,
  heapSize: 0,
};

/**
 * Initialize bridge with worker reference
 * @param {Worker} worker - The game worker instance
 */
export function initWASMBridge(worker) {
  if (!worker) {
    console.error('[WASMBridge] No worker provided');
    return false;
  }

  gameWorker = worker;

  // Listen for neural responses from worker
  worker.addEventListener('message', handleWorkerMessage);

  console.log('[WASMBridge] Initialized with worker');
  return true;
}

/**
 * Handle messages from the worker
 */
function handleWorkerMessage(event) {
  const { action, ...data } = event.data;

  // Handle neural response actions
  switch (action) {
    case 'neural_scan_result':
      handleScanResult(data);
      break;
    case 'neural_grid_result':
      handleGridResult(data);
      break;
    case 'neural_write_result':
      handleWriteResult(data);
      break;
    case 'neural_tile_result':
      handleTileResult(data);
      break;
    case 'neural_info_result':
      handleInfoResult(data);
      break;
    case 'neural_inject_result':
      handleInjectResult(data);
      break;
    case 'wasm_discovery':
      handleWasmDiscovery(data);
      break;
  }
}

// Response handlers
function handleScanResult(data) {
  if (data.success) {
    memoryInfo.discovered = true;
    memoryInfo.pointer = data.pointer;
    console.log('[WASMBridge] Scan successful, dLevel at:', data.pointer);
  }
  resolveCallback('scan', data);
}

function handleGridResult(data) {
  resolveCallback('readGrid', data);
}

function handleWriteResult(data) {
  resolveCallback('writeGrid', data);
}

function handleTileResult(data) {
  resolveCallback('tile', data);
}

function handleInfoResult(data) {
  memoryInfo = {
    discovered: data.discovered,
    pointer: data.pointers?.dLevel,
    heapSize: data.heapSize,
  };
  resolveCallback('info', data);
}

function handleInjectResult(data) {
  resolveCallback('inject', data);
}

function handleWasmDiscovery(data) {
  console.log('[WASMBridge] WASM exports discovered:', data.exports?.length);
}

/**
 * Resolve a pending callback
 */
function resolveCallback(type, data) {
  const callback = pendingCallbacks.get(type);
  if (callback) {
    pendingCallbacks.delete(type);
    callback(data);
  }
}

/**
 * Send command to worker
 */
function sendCommand(action, data = {}) {
  if (!gameWorker) {
    console.error('[WASMBridge] Worker not initialized');
    return false;
  }
  gameWorker.postMessage({ action, ...data });
  return true;
}

/**
 * Scan memory to find dungeon arrays
 * @returns {Promise} Resolves with scan result
 */
export function scanMemory() {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('scan', (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Scan failed'));
      }
    });
    if (!sendCommand('neural_scan_memory')) {
      pendingCallbacks.delete('scan');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Read entire dungeon grid
 * @returns {Promise<number[][]>} 40x40 grid of tile IDs
 */
export function readDungeonGrid() {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('readGrid', (result) => {
      if (result.success) {
        resolve(result.grid);
      } else {
        reject(new Error(result.error || 'Read failed'));
      }
    });
    if (!sendCommand('neural_read_grid')) {
      pendingCallbacks.delete('readGrid');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Write entire dungeon grid
 * @param {number[][]} grid - 40x40 grid of tile IDs
 * @returns {Promise}
 */
export function writeDungeonGrid(grid) {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('writeGrid', (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Write failed'));
      }
    });
    if (!sendCommand('neural_write_grid', { grid })) {
      pendingCallbacks.delete('writeGrid');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Read a single tile
 * @param {number} x - X coordinate (0-39)
 * @param {number} y - Y coordinate (0-39)
 * @returns {Promise<number>} Tile ID
 */
export function readTile(x, y) {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('tile', (result) => {
      if (result.success) {
        resolve(result.tile);
      } else {
        reject(new Error(result.error || 'Read failed'));
      }
    });
    if (!sendCommand('neural_read_tile', { x, y })) {
      pendingCallbacks.delete('tile');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Write a single tile
 * @param {number} x - X coordinate (0-39)
 * @param {number} y - Y coordinate (0-39)
 * @param {number} tileId - Tile ID to write
 * @returns {Promise}
 */
export function writeTile(x, y, tileId) {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('tile', (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Write failed'));
      }
    });
    if (!sendCommand('neural_write_tile', { x, y, tileId })) {
      pendingCallbacks.delete('tile');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Get memory info from worker
 * @returns {Promise}
 */
export function getMemoryInfo() {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('info', (result) => {
      resolve(result);
    });
    if (!sendCommand('neural_get_info')) {
      pendingCallbacks.delete('info');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Inject a complete level
 * @param {Object} levelData - Level data with grid, monsters, objects
 * @returns {Promise}
 */
export function injectLevel(levelData) {
  return new Promise((resolve, reject) => {
    pendingCallbacks.set('inject', (result) => {
      if (result.success) {
        resolve(result);
      } else {
        reject(new Error(result.error || 'Injection failed'));
      }
    });
    if (!sendCommand('neural_inject_level', { levelData })) {
      pendingCallbacks.delete('inject');
      reject(new Error('Worker not available'));
    }
  });
}

/**
 * Check if memory has been discovered
 */
export function isDiscovered() {
  return memoryInfo.discovered;
}

/**
 * Get cached memory info (without querying worker)
 */
export function getCachedInfo() {
  return { ...memoryInfo };
}

// Main WASMBridge object
const WASMBridge = {
  // Initialization
  init: initWASMBridge,

  // Memory operations
  scanMemory,
  readDungeonGrid,
  writeDungeonGrid,
  readTile,
  writeTile,

  // Level injection
  injectLevel,

  // Info
  getMemoryInfo,
  isDiscovered,
  getCachedInfo,

  // Constants
  DMAXX,
  DMAXY,
  GRID_SIZE,
};

export default WASMBridge;
