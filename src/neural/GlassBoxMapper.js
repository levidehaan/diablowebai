/**
 * Glass Box Memory Mapper
 *
 * Advanced memory pattern recognition for DevilutionX WASM.
 * Uses heuristics and pattern matching to find and manipulate game structures
 * without requiring rebuilt WASM exports.
 *
 * This implements the "Glass Box" strategy from the architecture document:
 * - Scan memory for known patterns
 * - Identify structure locations through heuristics
 * - Provide read/write access to game state
 */

// Game constants from DevilutionX
const MAXDUNX = 112;
const MAXDUNY = 112;
const DMAXX = 40;
const DMAXY = 40;
const MAXMONSTERS = 200;
const MAXOBJECTS = 127;
const MAXITEMS = 127;
const MAX_PLRS = 4;

// Memory structure sizes (estimated from DevilutionX source)
const MONSTER_STRUCT_SIZE = 232; // MonsterStruct approximate size
const OBJECT_STRUCT_SIZE = 56;   // ObjectStruct approximate size
const ITEM_STRUCT_SIZE = 168;    // ItemStruct approximate size
const PLAYER_STRUCT_SIZE = 21376; // PlayerStruct approximate size (very large)
const TOWNER_STRUCT_SIZE = 88;   // TownerStruct approximate size

// Tile type ranges for different level types
const LEVEL_TILE_RANGES = {
  cathedral: { floors: [13, 14, 15], walls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], stairs: [36, 37] },
  catacombs: { floors: [3, 4, 5, 6], walls: [1, 2], stairs: [57, 58] },
  caves: { floors: [7, 8, 9], walls: [1, 2, 3, 4, 5, 6], stairs: [47, 48] },
  hell: { floors: [13, 14, 15], walls: [1, 2, 3, 4, 5, 6, 7, 8], stairs: [57, 58] },
  town: { floors: [1, 2, 3], roads: [10, 11, 12], buildings: [20, 21, 22, 23] },
};

class GlassBoxMapper {
  constructor() {
    this.wasm = null;
    this.heap = null;
    this.discovered = {
      dungeon: null,      // BYTE dungeon[40][40] - tile IDs
      dPiece: null,       // int dPiece[MAXDUNX][MAXDUNY] - piece IDs
      dMonster: null,     // int dMonster[MAXDUNX][MAXDUNY] - monster grid
      dObject: null,      // char dObject[MAXDUNX][MAXDUNY] - object grid
      dItem: null,        // char dItem[MAXDUNX][MAXDUNY] - item grid
      monsters: null,     // MonsterStruct monster[MAXMONSTERS]
      objects: null,      // ObjectStruct object[MAXOBJECTS]
      items: null,        // ItemStruct item[MAXITEMS]
      player: null,       // PlayerStruct plr[MAX_PLRS]
      towners: null,      // TownerStruct towner[]
      currlevel: null,    // int currlevel
      leveltype: null,    // int leveltype
      nummonsters: null,  // int nummonsters
      nobjects: null,     // int nobjects
      numitems: null,     // int numitems
    };
    this.scanCache = {};
    this.lastScanTime = 0;
  }

  /**
   * Initialize with WASM module
   */
  initialize(wasmModule) {
    if (!wasmModule || !wasmModule.HEAPU8) {
      console.error('[GlassBox] Invalid WASM module');
      return false;
    }

    this.wasm = wasmModule;
    this.heap = wasmModule.HEAPU8;
    console.log('[GlassBox] Initialized with WASM, heap size:', this.heap.length);
    return true;
  }

  /**
   * Full memory scan to discover all game structures
   */
  fullScan() {
    if (!this.heap) {
      console.error('[GlassBox] Not initialized');
      return { success: false, error: 'Not initialized' };
    }

    console.log('[GlassBox] Starting full memory scan...');
    const startTime = performance.now();

    const results = {
      dungeon: this.findDungeonArray(),
      dMonster: this.findDMonsterArray(),
      dObject: this.findDObjectArray(),
      monsters: this.findMonsterArray(),
      objects: this.findObjectArray(),
      player: this.findPlayerStruct(),
      currlevel: this.findCurrentLevel(),
    };

    const endTime = performance.now();
    console.log(`[GlassBox] Full scan completed in ${(endTime - startTime).toFixed(2)}ms`);

    // Update discovered pointers
    Object.entries(results).forEach(([key, result]) => {
      if (result.found) {
        this.discovered[key] = result.offset;
      }
    });

    this.lastScanTime = Date.now();

    return {
      success: true,
      discovered: { ...this.discovered },
      scanTime: endTime - startTime,
    };
  }

  /**
   * Find dungeon[40][40] array - base tile IDs
   */
  findDungeonArray() {
    const heap = this.heap;
    const candidates = [];

    // Search for 40x40 blocks with dungeon-like tile patterns
    for (let offset = 0; offset < heap.length - (DMAXX * DMAXY); offset += 4) {
      const score = this.scoreDungeonCandidate(offset);
      if (score > 100) {
        candidates.push({ offset, score });
      }
    }

    if (candidates.length === 0) {
      return { found: false };
    }

    // Sort by score
    candidates.sort((a, b) => b.score - a.score);

    console.log(`[GlassBox] Found ${candidates.length} dungeon candidates, best score: ${candidates[0].score}`);

    return {
      found: true,
      offset: candidates[0].offset,
      score: candidates[0].score,
      candidates: candidates.length,
    };
  }

  /**
   * Score a candidate dungeon location
   */
  scoreDungeonCandidate(offset) {
    const heap = this.heap;
    let floors = 0, walls = 0, stairs = 0, zeros = 0, invalid = 0;

    for (let i = 0; i < DMAXX * DMAXY; i++) {
      const tile = heap[offset + i];

      if (tile === 0) zeros++;
      else if (tile >= 13 && tile <= 15) floors++;
      else if (tile >= 1 && tile <= 12) walls++;
      else if (tile === 36 || tile === 37) stairs++;
      else if (tile > 100) invalid++;
    }

    // Valid dungeon should have balanced content
    if (invalid > 100 || zeros > 1200) return 0;
    if (floors < 50 || walls < 30) return 0;

    return floors + walls * 2 + stairs * 50 - zeros - invalid * 10;
  }

  /**
   * Find dMonster[MAXDUNX][MAXDUNY] array - monster positions
   */
  findDMonsterArray() {
    const heap = this.heap;
    const heapSize = heap.length;
    const arraySize = MAXDUNX * MAXDUNY * 4; // int array

    // dMonster should be mostly zeros with occasional monster IDs
    for (let offset = 0; offset < heapSize - arraySize; offset += 4) {
      let zeros = 0;
      let validIds = 0;
      let invalidIds = 0;

      // Sample check (don't check every cell for performance)
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor(Math.random() * MAXDUNX * MAXDUNY);
        const value = this.readInt32(offset + idx * 4);

        if (value === 0) zeros++;
        else if (value > 0 && value <= MAXMONSTERS) validIds++;
        else if (value > MAXMONSTERS || value < -MAXMONSTERS) invalidIds++;
      }

      // Most should be zero, some valid IDs, no invalid
      if (zeros > 80 && invalidIds < 5 && validIds > 0) {
        return { found: true, offset };
      }
    }

    return { found: false };
  }

  /**
   * Find dObject[MAXDUNX][MAXDUNY] array - object positions
   */
  findDObjectArray() {
    const heap = this.heap;
    const heapSize = heap.length;
    const arraySize = MAXDUNX * MAXDUNY; // char array

    for (let offset = 0; offset < heapSize - arraySize; offset += 4) {
      let zeros = 0;
      let validIds = 0;
      let invalidIds = 0;

      // Sample check
      for (let i = 0; i < 100; i++) {
        const idx = Math.floor(Math.random() * MAXDUNX * MAXDUNY);
        const value = heap[offset + idx];

        if (value === 0) zeros++;
        else if (value > 0 && value <= MAXOBJECTS) validIds++;
        else if (value > MAXOBJECTS) invalidIds++;
      }

      if (zeros > 85 && invalidIds < 3) {
        return { found: true, offset };
      }
    }

    return { found: false };
  }

  /**
   * Find monster[MAXMONSTERS] array
   */
  findMonsterArray() {
    const heap = this.heap;
    const heapSize = heap.length;
    const arraySize = MAXMONSTERS * MONSTER_STRUCT_SIZE;

    // Monsters have characteristic patterns:
    // - _mx, _my coordinates (0-112 range)
    // - _mhitpoints (positive values)
    // - _mMTidx (monster type index, small positive)

    for (let offset = 0; offset < heapSize - arraySize; offset += 1024) {
      let validMonsters = 0;

      for (let m = 0; m < 10; m++) {
        const baseAddr = offset + m * MONSTER_STRUCT_SIZE;

        // Check if this looks like a monster struct
        // First few fields should be position (_mx, _my as ints)
        const mx = this.readInt32(baseAddr);
        const my = this.readInt32(baseAddr + 4);

        if (mx >= 0 && mx < MAXDUNX && my >= 0 && my < MAXDUNY) {
          validMonsters++;
        }
      }

      if (validMonsters >= 5) {
        return { found: true, offset, validCount: validMonsters };
      }
    }

    return { found: false };
  }

  /**
   * Find object[MAXOBJECTS] array
   */
  findObjectArray() {
    const heap = this.heap;
    const heapSize = heap.length;
    const arraySize = MAXOBJECTS * OBJECT_STRUCT_SIZE;

    for (let offset = 0; offset < heapSize - arraySize; offset += 1024) {
      let validObjects = 0;

      for (let o = 0; o < 10; o++) {
        const baseAddr = offset + o * OBJECT_STRUCT_SIZE;

        // Objects have _ox, _oy coordinates and _otype
        const ox = this.readInt32(baseAddr);
        const oy = this.readInt32(baseAddr + 4);

        if (ox >= 0 && ox < MAXDUNX && oy >= 0 && oy < MAXDUNY) {
          validObjects++;
        }
      }

      if (validObjects >= 5) {
        return { found: true, offset, validCount: validObjects };
      }
    }

    return { found: false };
  }

  /**
   * Find player struct
   */
  findPlayerStruct() {
    const heap = this.heap;
    const heapSize = heap.length;

    // Player struct has characteristic patterns:
    // - _px, _py coordinates (within dungeon bounds)
    // - _pHitPoints, _pMaxHP (positive, typically 0-1000 range scaled)
    // - plrlevel (0-16)

    for (let offset = 0; offset < heapSize - PLAYER_STRUCT_SIZE; offset += 1024) {
      // Player position is near the start
      const px = this.readInt32(offset + 4);  // Offset guess
      const py = this.readInt32(offset + 8);

      if (px >= 0 && px < MAXDUNX && py >= 0 && py < MAXDUNY) {
        // Check for other player-like values
        const plrlevel = this.readInt32(offset + 100); // Guess

        if (plrlevel >= 0 && plrlevel <= 16) {
          return { found: true, offset, px, py, level: plrlevel };
        }
      }
    }

    return { found: false };
  }

  /**
   * Find current level variable
   */
  findCurrentLevel() {
    // currlevel is a small int (0-16)
    // Usually stored near other level state
    // This is a heuristic search

    if (!this.discovered.dungeon) {
      return { found: false };
    }

    // Look near the dungeon array for level state
    const baseSearch = Math.max(0, this.discovered.dungeon - 10000);
    const endSearch = Math.min(this.heap.length - 4, this.discovered.dungeon + 10000);

    for (let offset = baseSearch; offset < endSearch; offset += 4) {
      const value = this.readInt32(offset);
      // currlevel should be 0-16
      if (value >= 0 && value <= 16) {
        // Check surrounding values for related state
        const prev = this.readInt32(offset - 4);
        const next = this.readInt32(offset + 4);

        // leveltype is usually nearby and is 0-4
        if ((prev >= 0 && prev <= 4) || (next >= 0 && next <= 4)) {
          return { found: true, offset, value };
        }
      }
    }

    return { found: false };
  }

  // ============================================================
  // Read operations
  // ============================================================

  /**
   * Read the dungeon grid
   */
  readDungeonGrid() {
    if (!this.discovered.dungeon) {
      return null;
    }

    const grid = [];
    for (let y = 0; y < DMAXY; y++) {
      grid[y] = [];
      for (let x = 0; x < DMAXX; x++) {
        grid[y][x] = this.heap[this.discovered.dungeon + y * DMAXX + x];
      }
    }
    return grid;
  }

  /**
   * Read monster data
   */
  readMonsters() {
    if (!this.discovered.monsters) {
      return [];
    }

    const monsters = [];
    for (let i = 0; i < MAXMONSTERS; i++) {
      const base = this.discovered.monsters + i * MONSTER_STRUCT_SIZE;
      const mx = this.readInt32(base);
      const my = this.readInt32(base + 4);

      // Skip inactive monsters (position 0,0)
      if (mx === 0 && my === 0) continue;

      monsters.push({
        id: i,
        x: mx,
        y: my,
        hp: this.readInt32(base + 32), // Approximate HP offset
        type: this.readInt32(base + 16), // Approximate type offset
      });
    }
    return monsters;
  }

  /**
   * Read object data
   */
  readObjects() {
    if (!this.discovered.objects) {
      return [];
    }

    const objects = [];
    for (let i = 0; i < MAXOBJECTS; i++) {
      const base = this.discovered.objects + i * OBJECT_STRUCT_SIZE;
      const ox = this.readInt32(base);
      const oy = this.readInt32(base + 4);

      // Skip inactive objects
      if (ox === 0 && oy === 0) continue;

      objects.push({
        id: i,
        x: ox,
        y: oy,
        type: this.readInt32(base + 8), // Approximate type offset
      });
    }
    return objects;
  }

  // ============================================================
  // Write operations
  // ============================================================

  /**
   * Write dungeon grid
   */
  writeDungeonGrid(grid) {
    if (!this.discovered.dungeon) {
      return false;
    }

    for (let y = 0; y < DMAXY; y++) {
      for (let x = 0; x < DMAXX; x++) {
        this.heap[this.discovered.dungeon + y * DMAXX + x] = grid[y][x];
      }
    }
    return true;
  }

  /**
   * Write a single dungeon tile
   */
  writeTile(x, y, tileId) {
    if (!this.discovered.dungeon) {
      return false;
    }

    if (x < 0 || x >= DMAXX || y < 0 || y >= DMAXY) {
      return false;
    }

    this.heap[this.discovered.dungeon + y * DMAXX + x] = tileId;
    return true;
  }

  /**
   * Clear all monsters from level
   */
  clearMonsters() {
    if (this.discovered.dMonster) {
      // Zero out the dMonster grid
      for (let i = 0; i < MAXDUNX * MAXDUNY * 4; i++) {
        this.heap[this.discovered.dMonster + i] = 0;
      }
    }

    // Also need to reset nummonsters
    if (this.discovered.nummonsters) {
      this.writeInt32(this.discovered.nummonsters, 0);
    }

    return true;
  }

  /**
   * Clear all objects from level
   */
  clearObjects() {
    if (this.discovered.dObject) {
      for (let i = 0; i < MAXDUNX * MAXDUNY; i++) {
        this.heap[this.discovered.dObject + i] = 0;
      }
    }

    if (this.discovered.nobjects) {
      this.writeInt32(this.discovered.nobjects, 0);
    }

    return true;
  }

  // ============================================================
  // Utility functions
  // ============================================================

  readInt32(offset) {
    if (!this.wasm || !this.wasm.HEAP32) {
      // Fallback to manual reading
      const heap = this.heap;
      return heap[offset] |
             (heap[offset + 1] << 8) |
             (heap[offset + 2] << 16) |
             (heap[offset + 3] << 24);
    }
    return this.wasm.HEAP32[offset >> 2];
  }

  writeInt32(offset, value) {
    if (!this.wasm || !this.wasm.HEAP32) {
      const heap = this.heap;
      heap[offset] = value & 0xFF;
      heap[offset + 1] = (value >> 8) & 0xFF;
      heap[offset + 2] = (value >> 16) & 0xFF;
      heap[offset + 3] = (value >> 24) & 0xFF;
    } else {
      this.wasm.HEAP32[offset >> 2] = value;
    }
  }

  /**
   * Get discovery status
   */
  getStatus() {
    return {
      initialized: !!this.heap,
      heapSize: this.heap?.length || 0,
      discovered: { ...this.discovered },
      lastScanTime: this.lastScanTime,
    };
  }
}

// Singleton instance
const glassBoxMapper = new GlassBoxMapper();

export default glassBoxMapper;
export { GlassBoxMapper, DMAXX, DMAXY, MAXDUNX, MAXDUNY, MAXMONSTERS, MAXOBJECTS };
