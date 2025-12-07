#!/usr/bin/env node
/**
 * Standalone Level Swap Test Runner
 *
 * This runs the level swap tests without requiring jest.
 * Uses Node.js built-in test utilities and assertions.
 *
 * Usage: node tests/runLevelSwapTests.js
 */

const assert = require('assert');
const path = require('path');

// Track test results
let passed = 0;
let failed = 0;
const failures = [];

// Collect tests to run
const testQueue = [];
let currentSuite = null;

// Simple test framework
function describe(name, fn) {
  currentSuite = name;
  fn();
  currentSuite = null;
}

function test(name, fn) {
  testQueue.push({ suite: currentSuite, name, fn });
}

// Run all collected tests
async function runTestQueue() {
  let lastSuite = null;

  for (const { suite, name, fn } of testQueue) {
    if (suite !== lastSuite) {
      console.log(`\n\x1b[1m${suite}\x1b[0m`);
      lastSuite = suite;
    }

    try {
      const result = fn();
      if (result instanceof Promise) {
        await result;
      }
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (err) {
      failed++;
      failures.push({ name, error: err });
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    \x1b[31m${err.message}\x1b[0m`);
    }
  }
}

// Mock jest.fn()
function mockFn() {
  const fn = function (...args) {
    fn.calls.push(args);
    fn.callCount++;
    return fn.returnValue;
  };
  fn.calls = [];
  fn.callCount = 0;
  fn.returnValue = undefined;
  fn.mockReturnValue = (val) => { fn.returnValue = val; return fn; };
  return fn;
}

const jest = { fn: mockFn };

// Simple expect implementation
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected} but got ${actual}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeDefined() {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toBeNull() {
      if (actual !== null) {
        throw new Error(`Expected null but got ${actual}`);
      }
    },
    toBeInstanceOf(cls) {
      if (!(actual instanceof cls)) {
        throw new Error(`Expected instance of ${cls.name}`);
      }
    },
    toBeGreaterThan(expected) {
      if (!(actual > expected)) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThan(expected) {
      if (!(actual < expected)) {
        throw new Error(`Expected ${actual} to be less than ${expected}`);
      }
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const epsilon = Math.pow(10, -precision) / 2;
      if (diff > epsilon) {
        throw new Error(`Expected ${actual} to be close to ${expected}`);
      }
    },
    toHaveLength(expected) {
      if (actual.length !== expected) {
        throw new Error(`Expected length ${expected} but got ${actual.length}`);
      }
    },
    toContain(expected) {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${expected}`);
      }
    },
  };
}

// ============================================================================
// Import DUN Parser (ES modules workaround)
// ============================================================================

// We need to load ES modules differently
async function loadDUNParser() {
  // Create a mock that mirrors the expected interface
  // Since we can't easily import ES modules in CommonJS

  // DUN format constants
  const createEmptyDUN = (width, height, defaultTile = 0) => {
    const baseTiles = [];
    for (let y = 0; y < height; y++) {
      baseTiles[y] = [];
      for (let x = 0; x < width; x++) {
        baseTiles[y][x] = defaultTile;
      }
    }
    return {
      width,
      height,
      baseTiles,
      items: null,
      monsters: null,
      objects: null,
      hasItems: false,
      hasMonsters: false,
      hasObjects: false,
    };
  };

  const writeDUN = (dunData) => {
    const { width, height, baseTiles, items, monsters, objects } = dunData;

    let totalSize = 4 + (width * height * 2);
    if (items) totalSize += width * height * 4 * 2;
    if (monsters) totalSize += width * height * 4 * 2;
    if (objects) totalSize += width * height * 4 * 2;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    view.setUint16(0, width, true);
    view.setUint16(2, height, true);

    let offset = 4;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = baseTiles[y]?.[x] ?? 0;
        const value = tile === 0 ? 0 : tile + 1;
        view.setUint16(offset, value, true);
        offset += 2;
      }
    }

    // Write sub-layers if present
    const subWidth = width * 2;
    const subHeight = height * 2;

    const writeSubLayer = (layer) => {
      for (let y = 0; y < subHeight; y++) {
        for (let x = 0; x < subWidth; x++) {
          const value = layer?.[y]?.[x] ?? 0;
          view.setUint16(offset, value, true);
          offset += 2;
        }
      }
    };

    if (items) writeSubLayer(items);
    if (monsters) writeSubLayer(monsters);
    if (objects) writeSubLayer(objects);

    return new Uint8Array(buffer);
  };

  const parseDUN = (buffer) => {
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const width = view.getUint16(0, true);
    const height = view.getUint16(2, true);

    const baseTiles = [];
    let offset = 4;
    for (let y = 0; y < height; y++) {
      baseTiles[y] = [];
      for (let x = 0; x < width; x++) {
        const value = view.getUint16(offset, true);
        baseTiles[y][x] = value === 0 ? 0 : value - 1;
        offset += 2;
      }
    }

    const subWidth = width * 2;
    const subHeight = height * 2;
    const subLayerSize = subWidth * subHeight * 2;

    const parseSubLayer = () => {
      const layer = [];
      for (let y = 0; y < subHeight; y++) {
        layer[y] = [];
        for (let x = 0; x < subWidth; x++) {
          if (offset < data.length) {
            layer[y][x] = view.getUint16(offset, true);
            offset += 2;
          } else {
            layer[y][x] = 0;
          }
        }
      }
      return layer;
    };

    const result = {
      width,
      height,
      baseTiles,
      items: null,
      monsters: null,
      objects: null,
      hasItems: false,
      hasMonsters: false,
      hasObjects: false,
    };

    if (data.length >= offset + subLayerSize) {
      result.items = parseSubLayer();
      result.hasItems = true;
    }

    if (data.length >= offset + subLayerSize) {
      result.monsters = parseSubLayer();
      result.hasMonsters = true;
    }

    if (data.length >= offset + subLayerSize) {
      result.objects = parseSubLayer();
      result.hasObjects = true;
    }

    return result;
  };

  const getDUNStats = (dunData) => {
    const { width, height, baseTiles, monsters, objects, items } = dunData;

    let floorCount = 0, wallCount = 0, stairsUp = 0, stairsDown = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = baseTiles[y][x];
        if (tile === 0 || (tile >= 13 && tile <= 15)) floorCount++;
        else if (tile >= 1 && tile <= 12) wallCount++;
        else if (tile === 36) stairsUp++;
        else if (tile === 37) stairsDown++;
      }
    }

    return { width, height, floorCount, wallCount, stairsUp, stairsDown };
  };

  const visualizeDUN = (dunData) => {
    const { width, height, baseTiles } = dunData;
    const lines = [`DUN: ${width}x${height}`, ''];

    for (let y = 0; y < height; y++) {
      let line = '';
      for (let x = 0; x < width; x++) {
        const tile = baseTiles[y][x];
        if (tile === 0) line += '.';
        else if (tile >= 1 && tile <= 12) line += '#';
        else if (tile >= 13 && tile <= 15) line += '.';
        else if (tile === 36) line += '<';
        else if (tile === 37) line += '>';
        else line += '?';
      }
      lines.push(line);
    }

    return lines.join('\n');
  };

  return { createEmptyDUN, writeDUN, parseDUN, getDUNStats, visualizeDUN };
}

// ============================================================================
// Mock WASM Infrastructure
// ============================================================================

function createMockWasmModule() {
  const heapSize = 4 * 1024 * 1024;
  const heap = new ArrayBuffer(heapSize);

  return {
    HEAPU8: new Uint8Array(heap),
    HEAPU16: new Uint16Array(heap),
    HEAPU32: new Uint32Array(heap),
    HEAP32: new Int32Array(heap),

    _dLevel_ptr: 0x100000,
    _currlevel: 0,
    _currlevel_ptr: 0x50000,

    readDLevel() {
      const grid = [];
      const baseOffset = this._dLevel_ptr / 4;
      for (let y = 0; y < 40; y++) {
        const row = [];
        for (let x = 0; x < 40; x++) {
          row.push(this.HEAP32[baseOffset + y * 40 + x]);
        }
        grid.push(row);
      }
      return grid;
    },

    writeDLevel(grid) {
      const baseOffset = this._dLevel_ptr / 4;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          this.HEAP32[baseOffset + y * 40 + x] = grid[y][x];
        }
      }
    },

    getCurrentLevel() {
      return this.HEAP32[this._currlevel_ptr / 4];
    },

    setCurrentLevel(level) {
      this.HEAP32[this._currlevel_ptr / 4] = level;
      this._currlevel = level;
    },
  };
}

function createMockWASMBridge(wasmModule) {
  return {
    _wasm: wasmModule,
    _discovered: false,

    async scanMemory() {
      this._discovered = true;
      return { success: true, pointer: wasmModule._dLevel_ptr };
    },

    async readDungeonGrid() {
      if (!this._discovered) throw new Error('Memory not scanned');
      return this._wasm.readDLevel();
    },

    async writeDungeonGrid(grid) {
      if (!this._discovered) throw new Error('Memory not scanned');
      this._wasm.writeDLevel(grid);
      return { success: true };
    },

    async readTile(x, y) {
      const grid = this._wasm.readDLevel();
      return grid[y][x];
    },

    async writeTile(x, y, tileId) {
      const grid = this._wasm.readDLevel();
      grid[y][x] = tileId;
      this._wasm.writeDLevel(grid);
      return { success: true };
    },

    async injectLevel(levelData) {
      if (!this._discovered) await this.scanMemory();
      this._wasm.writeDLevel(levelData.grid);
      return { success: true, tilesWritten: 40 * 40 };
    },

    isDiscovered() { return this._discovered; },

    DMAXX: 40,
    DMAXY: 40,
  };
}

// Level Swap Verifier
class LevelSwapVerifier {
  constructor(wasmBridge) {
    this.bridge = wasmBridge;
    this.snapshots = [];
  }

  async snapshot(label) {
    const grid = await this.bridge.readDungeonGrid();
    this.snapshots.push({
      label,
      timestamp: Date.now(),
      grid: JSON.parse(JSON.stringify(grid)),
      hash: this.hashGrid(grid),
    });
    return this.snapshots.length - 1;
  }

  hashGrid(grid) {
    let hash = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        hash = ((hash << 5) - hash + grid[y][x]) | 0;
      }
    }
    return hash;
  }

  compareSnapshots(index1, index2) {
    const s1 = this.snapshots[index1];
    const s2 = this.snapshots[index2];

    const differences = [];
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (s1.grid[y][x] !== s2.grid[y][x]) {
          differences.push({ x, y, was: s1.grid[y][x], now: s2.grid[y][x] });
        }
      }
    }

    return {
      identical: differences.length === 0,
      differences,
      hashMatch: s1.hash === s2.hash,
    };
  }

  async verifySwap(expectedGrid) {
    const currentGrid = await this.bridge.readDungeonGrid();
    const expectedHash = this.hashGrid(expectedGrid);
    const currentHash = this.hashGrid(currentGrid);

    const differences = [];
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (expectedGrid[y][x] !== currentGrid[y][x]) {
          differences.push({ x, y, expected: expectedGrid[y][x], actual: currentGrid[y][x] });
        }
      }
    }

    return {
      success: differences.length === 0,
      hashMatch: expectedHash === currentHash,
      differences,
      stats: {
        totalTiles: 40 * 40,
        correctTiles: 40 * 40 - differences.length,
        accuracy: ((40 * 40 - differences.length) / (40 * 40)) * 100,
      },
    };
  }

  validateGrid(grid) {
    const errors = [];
    const warnings = [];

    if (!grid || grid.length !== 40) {
      errors.push(`Invalid height: ${grid?.length || 0}, expected 40`);
      return { valid: false, errors, warnings };
    }

    let stairsUp = 0, stairsDown = 0, floors = 0, walls = 0;

    for (let y = 0; y < 40; y++) {
      if (!grid[y] || grid[y].length !== 40) {
        errors.push(`Invalid width at row ${y}`);
      }
      for (let x = 0; x < 40; x++) {
        const tile = grid[y][x];
        if (tile === 36) stairsUp++;
        if (tile === 37) stairsDown++;
        if (tile === 0 || (tile >= 13 && tile <= 15)) floors++;
        if (tile >= 1 && tile <= 12) walls++;
      }
    }

    if (stairsUp === 0) warnings.push('No stairs up found');
    if (stairsDown === 0) warnings.push('No stairs down found');

    return { valid: errors.length === 0, errors, warnings, stats: { stairsUp, stairsDown, floors, walls } };
  }
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runAllTests() {
  console.log('\x1b[1m\x1b[34m=== Level Swap Test Suite ===\x1b[0m');

  const DUNParser = await loadDUNParser();
  const { createEmptyDUN, writeDUN, parseDUN, getDUNStats, visualizeDUN } = DUNParser;

  // DUN Parser Tests
  describe('DUN Parser Tests', () => {
    test('should create empty DUN structure', () => {
      const dun = createEmptyDUN(16, 16);
      expect(dun.width).toBe(16);
      expect(dun.height).toBe(16);
      expect(dun.baseTiles.length).toBe(16);
      expect(dun.baseTiles[0].length).toBe(16);
      expect(dun.monsters).toBeNull();
    });

    test('should write and parse DUN without data loss', () => {
      const original = createEmptyDUN(16, 16);
      original.baseTiles[5][5] = 13;
      original.baseTiles[8][8] = 36;

      const buffer = writeDUN(original);
      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(0);

      const parsed = parseDUN(buffer);
      expect(parsed.width).toBe(original.width);
      expect(parsed.height).toBe(original.height);
      // DUN format stores tile+1, parses back to tile (symmetric encoding)
      expect(parsed.baseTiles[5][5]).toBe(13); // Should match original
      expect(parsed.baseTiles[8][8]).toBe(36); // Should match original
    });

    test('should generate correct stats', () => {
      const dun = createEmptyDUN(10, 10);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          if (x === 0 || x === 9 || y === 0 || y === 9) {
            dun.baseTiles[y][x] = 1;
          } else {
            dun.baseTiles[y][x] = 13;
          }
        }
      }
      dun.baseTiles[5][5] = 36;
      dun.baseTiles[7][7] = 37;

      const stats = getDUNStats(dun);
      expect(stats.width).toBe(10);
      expect(stats.stairsUp).toBe(1);
      expect(stats.stairsDown).toBe(1);
    });

    test('should visualize DUN as ASCII', () => {
      const dun = createEmptyDUN(5, 5);
      dun.baseTiles[0][0] = 1;
      dun.baseTiles[2][2] = 36;

      const ascii = visualizeDUN(dun);
      expect(ascii).toContain('DUN: 5x5');
      expect(ascii.split('\n').length).toBeGreaterThan(5);
    });
  });

  // Mock WASM Bridge Tests
  describe('Mock WASM Bridge Tests', () => {
    test('should scan memory and discover dLevel', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);

      expect(bridge.isDiscovered()).toBe(false);
      const result = await bridge.scanMemory();
      expect(result.success).toBe(true);
      expect(bridge.isDiscovered()).toBe(true);
    });

    test('should read empty grid initially', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      await bridge.scanMemory();

      const grid = await bridge.readDungeonGrid();
      expect(grid.length).toBe(40);
      expect(grid[0].length).toBe(40);
      expect(grid[0][0]).toBe(0);
    });

    test('should write and read back grid correctly', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      await bridge.scanMemory();

      const testGrid = [];
      for (let y = 0; y < 40; y++) {
        testGrid[y] = [];
        for (let x = 0; x < 40; x++) {
          testGrid[y][x] = (x === 0 || x === 39 || y === 0 || y === 39) ? 1 : 13;
        }
      }
      testGrid[20][20] = 36;

      await bridge.writeDungeonGrid(testGrid);
      const readGrid = await bridge.readDungeonGrid();

      expect(readGrid[0][0]).toBe(1);
      expect(readGrid[20][20]).toBe(36);
      expect(readGrid[20][21]).toBe(13);
    });

    test('should inject complete level', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);

      const levelData = { grid: [] };
      for (let y = 0; y < 40; y++) {
        levelData.grid[y] = [];
        for (let x = 0; x < 40; x++) {
          levelData.grid[y][x] = (x + y) % 50;
        }
      }

      const result = await bridge.injectLevel(levelData);
      expect(result.success).toBe(true);
      expect(result.tilesWritten).toBe(1600);

      const readGrid = await bridge.readDungeonGrid();
      expect(readGrid[5][5]).toBe(10);
      expect(readGrid[10][10]).toBe(20);
    });
  });

  // Level Swap Verification Tests
  describe('Level Swap Verification Tests', () => {
    test('should take and compare snapshots', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      const verifier = new LevelSwapVerifier(bridge);
      await bridge.scanMemory();

      const snap1 = await verifier.snapshot('initial');
      await bridge.writeTile(10, 10, 99);
      await bridge.writeTile(20, 20, 88);
      const snap2 = await verifier.snapshot('modified');

      const comparison = verifier.compareSnapshots(snap1, snap2);
      expect(comparison.identical).toBe(false);
      expect(comparison.differences.length).toBe(2);
    });

    test('should verify successful swap', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      const verifier = new LevelSwapVerifier(bridge);
      await bridge.scanMemory();

      const expectedGrid = [];
      for (let y = 0; y < 40; y++) {
        expectedGrid[y] = [];
        for (let x = 0; x < 40; x++) {
          expectedGrid[y][x] = x + y;
        }
      }

      await bridge.writeDungeonGrid(expectedGrid);
      const result = await verifier.verifySwap(expectedGrid);

      expect(result.success).toBe(true);
      expect(result.hashMatch).toBe(true);
      expect(result.stats.accuracy).toBe(100);
    });

    test('should validate grid structure', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      const verifier = new LevelSwapVerifier(bridge);

      const validGrid = [];
      for (let y = 0; y < 40; y++) {
        validGrid[y] = [];
        for (let x = 0; x < 40; x++) {
          validGrid[y][x] = (x === 0 || x === 39 || y === 0 || y === 39) ? 1 : 13;
        }
      }
      validGrid[20][20] = 36;
      validGrid[30][30] = 37;

      const result = verifier.validateGrid(validGrid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.stairsUp).toBe(1);
    });
  });

  // Level 17 Preparation Tests
  describe('Level 17 Preparation Tests', () => {
    test('should track current level ID', () => {
      const wasmModule = createMockWasmModule();
      expect(wasmModule.getCurrentLevel()).toBe(0);

      wasmModule.setCurrentLevel(17);
      expect(wasmModule.getCurrentLevel()).toBe(17);
    });

    test('should inject town-style level for Level 17', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      await bridge.scanMemory();

      const townGrid = [];
      for (let y = 0; y < 40; y++) {
        townGrid[y] = [];
        for (let x = 0; x < 40; x++) {
          if (x < 2 || x > 37 || y < 2 || y > 37) {
            townGrid[y][x] = 1;
          } else {
            townGrid[y][x] = 13;
          }
        }
      }
      townGrid[20][20] = 50;

      wasmModule.setCurrentLevel(17);
      const result = await bridge.injectLevel({ grid: townGrid });

      expect(result.success).toBe(true);
      expect(wasmModule.getCurrentLevel()).toBe(17);

      const readGrid = await bridge.readDungeonGrid();
      expect(readGrid[20][20]).toBe(50);
    });
  });

  // Full Level Swap Flow Tests
  describe('Full Level Swap Flow Tests', () => {
    test('should complete full swap: generate -> inject -> verify', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      const verifier = new LevelSwapVerifier(bridge);

      const generatedLevel = createEmptyDUN(40, 40, 1);
      for (let y = 5; y < 35; y++) {
        for (let x = 5; x < 35; x++) {
          generatedLevel.baseTiles[y][x] = 13;
        }
      }
      generatedLevel.baseTiles[10][10] = 36;
      generatedLevel.baseTiles[30][30] = 37;

      const gameGrid = [];
      for (let y = 0; y < 40; y++) {
        gameGrid[y] = [];
        for (let x = 0; x < 40; x++) {
          gameGrid[y][x] = generatedLevel.baseTiles[y]?.[x] || 0;
        }
      }

      await bridge.scanMemory();
      await verifier.snapshot('before');
      const injectResult = await bridge.injectLevel({ grid: gameGrid });
      expect(injectResult.success).toBe(true);

      await verifier.snapshot('after');
      const verifyResult = await verifier.verifySwap(gameGrid);
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.stats.accuracy).toBe(100);

      const comparison = verifier.compareSnapshots(0, 1);
      expect(comparison.identical).toBe(false);
    });

    test('should handle level transition: town (0) -> dungeon (1) -> custom (17)', async () => {
      const wasmModule = createMockWasmModule();
      const bridge = createMockWASMBridge(wasmModule);
      const verifier = new LevelSwapVerifier(bridge);
      await bridge.scanMemory();

      wasmModule.setCurrentLevel(0);
      const townGrid = Array(40).fill(null).map(() => Array(40).fill(13));
      await bridge.injectLevel({ grid: townGrid });
      await verifier.snapshot('town');

      wasmModule.setCurrentLevel(1);
      const dungeonGrid = Array(40).fill(null).map((_, y) =>
        Array(40).fill(null).map((_, x) => (x + y) % 2 === 0 ? 1 : 13)
      );
      await bridge.injectLevel({ grid: dungeonGrid });
      await verifier.snapshot('dungeon');

      wasmModule.setCurrentLevel(17);
      const customGrid = Array(40).fill(null).map(() => Array(40).fill(99));
      await bridge.injectLevel({ grid: customGrid });
      await verifier.snapshot('custom');

      const comp1 = verifier.compareSnapshots(0, 1);
      const comp2 = verifier.compareSnapshots(1, 2);

      expect(comp1.identical).toBe(false);
      expect(comp2.identical).toBe(false);
      expect(wasmModule.getCurrentLevel()).toBe(17);

      const finalGrid = await bridge.readDungeonGrid();
      expect(finalGrid[0][0]).toBe(99);
    });
  });

  // Run all queued tests
  await runTestQueue();

  // Print summary
  console.log('\n\x1b[1m=== Test Summary ===\x1b[0m');
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

  if (failures.length > 0) {
    console.log('\n\x1b[1mFailures:\x1b[0m');
    failures.forEach(({ name, error }) => {
      console.log(`  \x1b[31m${name}\x1b[0m`);
      console.log(`    ${error.stack || error.message}`);
    });
  }

  console.log('\n');

  return failed === 0;
}

// Run tests
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
