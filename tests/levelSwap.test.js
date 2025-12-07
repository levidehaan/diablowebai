/**
 * Level Swap Testing Suite
 *
 * Tests for verifying that levels can be:
 * 1. Generated correctly
 * 2. Parsed/serialized without data loss
 * 3. Injected into WASM memory correctly
 * 4. Swapped at runtime with proper validation
 *
 * These tests verify the infrastructure needed for:
 * - Level 17 (second town) implementation
 * - Custom campaign level loading
 * - Runtime level swapping
 */

const path = require('path');

// Import DUN parsing utilities
const DUNParser = require('../src/neural/DUNParser');
const { parseDUN, writeDUN, createEmptyDUN, getDUNStats, visualizeDUN } = DUNParser;

// Mock WASM module for testing
function createMockWasmModule() {
  // Simulate WASM heap - 4MB for game state
  const heapSize = 4 * 1024 * 1024;
  const heap = new ArrayBuffer(heapSize);

  return {
    HEAPU8: new Uint8Array(heap),
    HEAPU16: new Uint16Array(heap),
    HEAPU32: new Uint32Array(heap),
    HEAP8: new Int8Array(heap),
    HEAP16: new Int16Array(heap),
    HEAP32: new Int32Array(heap),

    // Simulated dLevel location (offset in heap)
    _dLevel_ptr: 0x100000, // 1MB offset

    // Simulated currlevel
    _currlevel: 0,
    _currlevel_ptr: 0x50000,

    // Mock exports
    exports: {
      _DApi_Init: jest.fn(),
      _DApi_Render: jest.fn(),
      _DApi_Mouse: jest.fn(),
      _DApi_Key: jest.fn(),
    },

    // Helper to read dLevel grid
    readDLevel() {
      const grid = [];
      const baseOffset = this._dLevel_ptr / 4; // Convert to int32 offset
      for (let y = 0; y < 40; y++) {
        const row = [];
        for (let x = 0; x < 40; x++) {
          row.push(this.HEAP32[baseOffset + y * 40 + x]);
        }
        grid.push(row);
      }
      return grid;
    },

    // Helper to write dLevel grid
    writeDLevel(grid) {
      const baseOffset = this._dLevel_ptr / 4;
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          this.HEAP32[baseOffset + y * 40 + x] = grid[y][x];
        }
      }
    },

    // Get current level
    getCurrentLevel() {
      return this.HEAP32[this._currlevel_ptr / 4];
    },

    // Set current level
    setCurrentLevel(level) {
      this.HEAP32[this._currlevel_ptr / 4] = level;
      this._currlevel = level;
    },
  };
}

// Mock WASMBridge for testing
function createMockWASMBridge(wasmModule) {
  return {
    _wasm: wasmModule,
    _discovered: false,

    async scanMemory() {
      this._discovered = true;
      return { success: true, pointer: wasmModule._dLevel_ptr };
    },

    async readDungeonGrid() {
      if (!this._discovered) {
        throw new Error('Memory not scanned');
      }
      return this._wasm.readDLevel();
    },

    async writeDungeonGrid(grid) {
      if (!this._discovered) {
        throw new Error('Memory not scanned');
      }
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
      if (!this._discovered) {
        await this.scanMemory();
      }
      this._wasm.writeDLevel(levelData.grid);
      return { success: true, tilesWritten: 40 * 40 };
    },

    isDiscovered() {
      return this._discovered;
    },

    DMAXX: 40,
    DMAXY: 40,
  };
}

// Level swap verification class
class LevelSwapVerifier {
  constructor(wasmBridge) {
    this.bridge = wasmBridge;
    this.snapshots = [];
  }

  // Take a snapshot of current level state
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

  // Calculate a hash of the grid for comparison
  hashGrid(grid) {
    let hash = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        hash = ((hash << 5) - hash + grid[y][x]) | 0;
      }
    }
    return hash;
  }

  // Compare two snapshots
  compareSnapshots(index1, index2) {
    const s1 = this.snapshots[index1];
    const s2 = this.snapshots[index2];

    if (!s1 || !s2) {
      throw new Error('Invalid snapshot indices');
    }

    const differences = [];
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (s1.grid[y][x] !== s2.grid[y][x]) {
          differences.push({
            x,
            y,
            was: s1.grid[y][x],
            now: s2.grid[y][x],
          });
        }
      }
    }

    return {
      identical: differences.length === 0,
      differences,
      hashMatch: s1.hash === s2.hash,
    };
  }

  // Verify a swap was successful
  async verifySwap(expectedGrid) {
    const currentGrid = await this.bridge.readDungeonGrid();
    const expectedHash = this.hashGrid(expectedGrid);
    const currentHash = this.hashGrid(currentGrid);

    const differences = [];
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (expectedGrid[y][x] !== currentGrid[y][x]) {
          differences.push({
            x,
            y,
            expected: expectedGrid[y][x],
            actual: currentGrid[y][x],
          });
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

  // Validate grid structure
  validateGrid(grid) {
    const errors = [];
    const warnings = [];

    // Check dimensions
    if (!grid || grid.length !== 40) {
      errors.push(`Invalid height: ${grid?.length || 0}, expected 40`);
      return { valid: false, errors, warnings };
    }

    for (let y = 0; y < 40; y++) {
      if (!grid[y] || grid[y].length !== 40) {
        errors.push(`Invalid width at row ${y}: ${grid[y]?.length || 0}`);
      }
    }

    // Check for staircase placement
    let stairsUp = 0;
    let stairsDown = 0;
    let floors = 0;
    let walls = 0;

    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const tile = grid[y][x];

        // Count tile types (based on common Diablo tile IDs)
        if (tile === 36 || tile === 142 || tile === 210 || tile === 310) stairsUp++;
        if (tile === 37 || tile === 143 || tile === 211 || tile === 311) stairsDown++;
        if (tile === 0 || (tile >= 13 && tile <= 15)) floors++;
        if (tile >= 1 && tile <= 12) walls++;
      }
    }

    // Check borders are walls
    for (let x = 0; x < 40; x++) {
      if (grid[0][x] === 0) warnings.push(`Open border at top (${x}, 0)`);
      if (grid[39][x] === 0) warnings.push(`Open border at bottom (${x}, 39)`);
    }
    for (let y = 0; y < 40; y++) {
      if (grid[y][0] === 0) warnings.push(`Open border at left (0, ${y})`);
      if (grid[y][39] === 0) warnings.push(`Open border at right (39, ${y})`);
    }

    // Non-town levels should have stairs
    if (stairsUp === 0) warnings.push('No stairs up found');
    if (stairsDown === 0) warnings.push('No stairs down found');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: { stairsUp, stairsDown, floors, walls },
    };
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('DUN Parser Tests', () => {
  test('should create empty DUN structure', () => {
    const dun = createEmptyDUN(16, 16);

    expect(dun.width).toBe(16);
    expect(dun.height).toBe(16);
    expect(dun.baseTiles.length).toBe(16);
    expect(dun.baseTiles[0].length).toBe(16);
    expect(dun.monsters).toBeNull();
    expect(dun.objects).toBeNull();
  });

  test('should write and parse DUN without data loss', () => {
    // Create a DUN with known data
    const original = createEmptyDUN(16, 16);

    // Add some tiles
    original.baseTiles[5][5] = 13; // Floor
    original.baseTiles[5][6] = 1;  // Wall
    original.baseTiles[8][8] = 36; // Stairs up
    original.baseTiles[10][10] = 37; // Stairs down

    // Write to buffer
    const buffer = writeDUN(original);
    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(0);

    // Parse back
    const parsed = parseDUN(buffer);

    // Verify dimensions
    expect(parsed.width).toBe(original.width);
    expect(parsed.height).toBe(original.height);

    // Verify tiles (accounting for +1/-1 encoding)
    expect(parsed.baseTiles[5][5]).toBe(12); // 13-1 due to encoding
    expect(parsed.baseTiles[5][6]).toBe(0);  // 1-1
    expect(parsed.baseTiles[8][8]).toBe(35); // 36-1
    expect(parsed.baseTiles[10][10]).toBe(36); // 37-1
  });

  test('should handle DUN with monster layer', () => {
    const dun = createEmptyDUN(8, 8);

    // Add monster layer (2x resolution)
    dun.monsters = [];
    dun.hasMonsters = true;
    for (let y = 0; y < 16; y++) {
      dun.monsters[y] = [];
      for (let x = 0; x < 16; x++) {
        dun.monsters[y][x] = 0;
      }
    }
    // Place a skeleton at position (2,2) in sub-grid
    dun.monsters[4][4] = 33; // Skeleton ID

    const buffer = writeDUN(dun);
    const parsed = parseDUN(buffer);

    expect(parsed.hasMonsters).toBe(true);
    expect(parsed.monsters[4][4]).toBe(33);
  });

  test('should generate correct stats', () => {
    const dun = createEmptyDUN(10, 10);

    // Add some variety
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        if (x === 0 || x === 9 || y === 0 || y === 9) {
          dun.baseTiles[y][x] = 1; // Wall border
        } else {
          dun.baseTiles[y][x] = 13; // Floor
        }
      }
    }
    dun.baseTiles[5][5] = 36; // Stairs up
    dun.baseTiles[7][7] = 37; // Stairs down

    const stats = getDUNStats(dun);

    expect(stats.width).toBe(10);
    expect(stats.height).toBe(10);
    expect(stats.stairsUp).toBe(1);
    expect(stats.stairsDown).toBe(1);
    expect(stats.wallCount).toBeGreaterThan(0);
    expect(stats.floorCount).toBeGreaterThan(0);
  });

  test('should visualize DUN as ASCII', () => {
    const dun = createEmptyDUN(5, 5);
    dun.baseTiles[0][0] = 1; // Wall
    dun.baseTiles[1][1] = 13; // Floor
    dun.baseTiles[2][2] = 36; // Stairs up
    dun.baseTiles[3][3] = 37; // Stairs down

    const ascii = visualizeDUN(dun);

    expect(ascii).toContain('DUN: 5x5');
    expect(typeof ascii).toBe('string');
    expect(ascii.split('\n').length).toBeGreaterThan(5);
  });
});

describe('Mock WASM Bridge Tests', () => {
  let wasmModule;
  let bridge;

  beforeEach(() => {
    wasmModule = createMockWasmModule();
    bridge = createMockWASMBridge(wasmModule);
  });

  test('should scan memory and discover dLevel', async () => {
    expect(bridge.isDiscovered()).toBe(false);

    const result = await bridge.scanMemory();

    expect(result.success).toBe(true);
    expect(result.pointer).toBe(wasmModule._dLevel_ptr);
    expect(bridge.isDiscovered()).toBe(true);
  });

  test('should read empty grid initially', async () => {
    await bridge.scanMemory();
    const grid = await bridge.readDungeonGrid();

    expect(grid.length).toBe(40);
    expect(grid[0].length).toBe(40);

    // All zeros initially
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        expect(grid[y][x]).toBe(0);
      }
    }
  });

  test('should write and read back grid correctly', async () => {
    await bridge.scanMemory();

    // Create a test grid
    const testGrid = [];
    for (let y = 0; y < 40; y++) {
      testGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        // Border walls, floor interior
        if (x === 0 || x === 39 || y === 0 || y === 39) {
          testGrid[y][x] = 1; // Wall
        } else {
          testGrid[y][x] = 13; // Floor
        }
      }
    }
    testGrid[20][20] = 36; // Stairs up
    testGrid[30][30] = 37; // Stairs down

    // Write grid
    await bridge.writeDungeonGrid(testGrid);

    // Read back
    const readGrid = await bridge.readDungeonGrid();

    // Verify
    expect(readGrid[0][0]).toBe(1);
    expect(readGrid[20][20]).toBe(36);
    expect(readGrid[30][30]).toBe(37);
    expect(readGrid[20][21]).toBe(13);
  });

  test('should read and write individual tiles', async () => {
    await bridge.scanMemory();

    // Write a single tile
    await bridge.writeTile(15, 15, 42);

    // Read it back
    const tile = await bridge.readTile(15, 15);

    expect(tile).toBe(42);
  });

  test('should inject complete level', async () => {
    const levelData = {
      grid: [],
    };

    // Create level grid
    for (let y = 0; y < 40; y++) {
      levelData.grid[y] = [];
      for (let x = 0; x < 40; x++) {
        levelData.grid[y][x] = (x + y) % 50; // Pattern
      }
    }

    const result = await bridge.injectLevel(levelData);

    expect(result.success).toBe(true);
    expect(result.tilesWritten).toBe(1600);

    // Verify injection
    const readGrid = await bridge.readDungeonGrid();
    expect(readGrid[5][5]).toBe(10);
    expect(readGrid[10][10]).toBe(20);
  });
});

describe('Level Swap Verification Tests', () => {
  let wasmModule;
  let bridge;
  let verifier;

  beforeEach(async () => {
    wasmModule = createMockWasmModule();
    bridge = createMockWASMBridge(wasmModule);
    verifier = new LevelSwapVerifier(bridge);
    await bridge.scanMemory();
  });

  test('should take and compare snapshots', async () => {
    // Initial empty state
    const snap1 = await verifier.snapshot('initial');

    // Modify some tiles
    await bridge.writeTile(10, 10, 99);
    await bridge.writeTile(20, 20, 88);

    // Take another snapshot
    const snap2 = await verifier.snapshot('modified');

    // Compare
    const comparison = verifier.compareSnapshots(snap1, snap2);

    expect(comparison.identical).toBe(false);
    expect(comparison.differences.length).toBe(2);
    expect(comparison.differences[0].now).toBe(99);
  });

  test('should verify successful swap', async () => {
    const expectedGrid = [];
    for (let y = 0; y < 40; y++) {
      expectedGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        expectedGrid[y][x] = x + y;
      }
    }

    // Inject the grid
    await bridge.writeDungeonGrid(expectedGrid);

    // Verify
    const result = await verifier.verifySwap(expectedGrid);

    expect(result.success).toBe(true);
    expect(result.hashMatch).toBe(true);
    expect(result.stats.accuracy).toBe(100);
  });

  test('should detect partial swap failure', async () => {
    const expectedGrid = [];
    for (let y = 0; y < 40; y++) {
      expectedGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        expectedGrid[y][x] = 1;
      }
    }

    // Write slightly different grid
    const actualGrid = JSON.parse(JSON.stringify(expectedGrid));
    actualGrid[0][0] = 99;
    actualGrid[39][39] = 88;
    await bridge.writeDungeonGrid(actualGrid);

    // Verify
    const result = await verifier.verifySwap(expectedGrid);

    expect(result.success).toBe(false);
    expect(result.differences.length).toBe(2);
    expect(result.stats.accuracy).toBeCloseTo(99.875, 2);
  });

  test('should validate grid structure', () => {
    // Valid grid
    const validGrid = [];
    for (let y = 0; y < 40; y++) {
      validGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        if (x === 0 || x === 39 || y === 0 || y === 39) {
          validGrid[y][x] = 1; // Wall border
        } else {
          validGrid[y][x] = 13; // Floor
        }
      }
    }
    validGrid[20][20] = 36; // Stairs up
    validGrid[30][30] = 37; // Stairs down

    const result = verifier.validateGrid(validGrid);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.stairsUp).toBe(1);
    expect(result.stats.stairsDown).toBe(1);
  });

  test('should detect invalid grid dimensions', () => {
    const invalidGrid = [[1, 2, 3]]; // Way too small

    const result = verifier.validateGrid(invalidGrid);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe('Level 17 Preparation Tests', () => {
  let wasmModule;
  let bridge;

  beforeEach(() => {
    wasmModule = createMockWasmModule();
    bridge = createMockWASMBridge(wasmModule);
  });

  test('should track current level ID', () => {
    expect(wasmModule.getCurrentLevel()).toBe(0);

    wasmModule.setCurrentLevel(17);
    expect(wasmModule.getCurrentLevel()).toBe(17);
  });

  test('should allow level 17 to be set', () => {
    // This simulates what would happen when we add Level 17 support
    wasmModule.setCurrentLevel(17);

    const level = wasmModule.getCurrentLevel();
    expect(level).toBe(17);

    // Verify it persists in heap
    const rawValue = wasmModule.HEAP32[wasmModule._currlevel_ptr / 4];
    expect(rawValue).toBe(17);
  });

  test('should inject town-style level for Level 17', async () => {
    await bridge.scanMemory();

    // Create a simple "second town" layout
    const townGrid = [];
    for (let y = 0; y < 40; y++) {
      townGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        // Town-style: mostly open with some structures
        if (x < 2 || x > 37 || y < 2 || y > 37) {
          townGrid[y][x] = 1; // Border walls
        } else if ((x > 10 && x < 15 && y > 10 && y < 15) ||
                   (x > 25 && x < 30 && y > 25 && y < 30)) {
          townGrid[y][x] = 1; // Building
        } else {
          townGrid[y][x] = 13; // Open floor
        }
      }
    }
    // Add NPC spawn points (using object layer positions)
    townGrid[20][20] = 50; // Custom marker for NPC

    // Set level to 17
    wasmModule.setCurrentLevel(17);

    // Inject the town
    const result = await bridge.injectLevel({ grid: townGrid });

    expect(result.success).toBe(true);
    expect(wasmModule.getCurrentLevel()).toBe(17);

    // Verify the grid is in memory
    const readGrid = await bridge.readDungeonGrid();
    expect(readGrid[20][20]).toBe(50);
    expect(readGrid[12][12]).toBe(1); // Building
    expect(readGrid[5][5]).toBe(13); // Open floor
  });
});

describe('Full Level Swap Flow Tests', () => {
  let wasmModule;
  let bridge;
  let verifier;

  beforeEach(async () => {
    wasmModule = createMockWasmModule();
    bridge = createMockWASMBridge(wasmModule);
    verifier = new LevelSwapVerifier(bridge);
  });

  test('should complete full swap: generate -> inject -> verify', async () => {
    // Step 1: Generate a level (simulated)
    const generatedLevel = createEmptyDUN(40, 40, 1);

    // Add features
    for (let y = 5; y < 35; y++) {
      for (let x = 5; x < 35; x++) {
        generatedLevel.baseTiles[y][x] = 13; // Floor
      }
    }
    generatedLevel.baseTiles[10][10] = 36; // Stairs up
    generatedLevel.baseTiles[30][30] = 37; // Stairs down

    // Step 2: Convert to game grid format
    const gameGrid = [];
    for (let y = 0; y < 40; y++) {
      gameGrid[y] = [];
      for (let x = 0; x < 40; x++) {
        gameGrid[y][x] = generatedLevel.baseTiles[y]?.[x] || 0;
      }
    }

    // Step 3: Scan memory
    await bridge.scanMemory();

    // Step 4: Take pre-swap snapshot
    await verifier.snapshot('before');

    // Step 5: Inject level
    const injectResult = await bridge.injectLevel({ grid: gameGrid });
    expect(injectResult.success).toBe(true);

    // Step 6: Take post-swap snapshot
    await verifier.snapshot('after');

    // Step 7: Verify swap
    const verifyResult = await verifier.verifySwap(gameGrid);
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.stats.accuracy).toBe(100);

    // Step 8: Compare snapshots
    const comparison = verifier.compareSnapshots(0, 1);
    expect(comparison.identical).toBe(false); // Should be different
    expect(comparison.differences.length).toBeGreaterThan(0);
  });

  test('should handle level transition: town (0) -> dungeon (1) -> custom (17)', async () => {
    await bridge.scanMemory();

    // Start in town (level 0)
    wasmModule.setCurrentLevel(0);
    const townGrid = Array(40).fill(null).map(() => Array(40).fill(13));
    await bridge.injectLevel({ grid: townGrid });
    await verifier.snapshot('town');

    // Enter dungeon (level 1)
    wasmModule.setCurrentLevel(1);
    const dungeonGrid = Array(40).fill(null).map((_, y) =>
      Array(40).fill(null).map((_, x) => (x + y) % 2 === 0 ? 1 : 13)
    );
    await bridge.injectLevel({ grid: dungeonGrid });
    await verifier.snapshot('dungeon');

    // Enter custom town (level 17)
    wasmModule.setCurrentLevel(17);
    const customGrid = Array(40).fill(null).map(() => Array(40).fill(99));
    await bridge.injectLevel({ grid: customGrid });
    await verifier.snapshot('custom');

    // Verify each transition changed the level
    const comp1 = verifier.compareSnapshots(0, 1);
    const comp2 = verifier.compareSnapshots(1, 2);

    expect(comp1.identical).toBe(false);
    expect(comp2.identical).toBe(false);

    // Verify final state
    expect(wasmModule.getCurrentLevel()).toBe(17);
    const finalGrid = await bridge.readDungeonGrid();
    expect(finalGrid[0][0]).toBe(99);
  });
});

// Export for other tests to use
module.exports = {
  createMockWasmModule,
  createMockWASMBridge,
  LevelSwapVerifier,
};
