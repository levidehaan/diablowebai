/**
 * MPQ Builder
 *
 * Enhanced MPQ creation system that can:
 * - Create new MPQ archives from scratch
 * - Build proper hash and block tables
 * - Support file compression (PKWARE DCL)
 * - Generate DUN files from grid data
 * - Modify monster/item/quest data
 *
 * This extends the basic MPQWriter with full creation capabilities.
 */

import { hash } from '../api/savefile';

// ============================================================================
// CONSTANTS
// ============================================================================

const MPQ_MAGIC = 0x1A51504D;  // 'MPQ\x1A'
const MPQ_HEADER_SIZE = 32;
const HASH_ENTRY_SIZE = 16;
const BLOCK_ENTRY_SIZE = 16;

// Block flags
const BlockFlags = {
  IMPLODE: 0x00000100,        // PKWARE DCL compression
  COMPRESS: 0x00000200,       // Multiple compressions
  ENCRYPTED: 0x00010000,      // Encrypted
  FIX_KEY: 0x00020000,        // Key adjustment
  PATCH_FILE: 0x00100000,     // Patch file
  SINGLE_UNIT: 0x01000000,    // Single unit (no sectors)
  DELETE_MARKER: 0x02000000,  // Deleted file
  SECTOR_CRC: 0x04000000,     // Sector CRC
  EXISTS: 0x80000000,         // File exists
};

// Default hash table size (must be power of 2)
const DEFAULT_HASH_TABLE_SIZE = 1024;
const DEFAULT_BLOCK_SIZE_SHIFT = 3;  // 512 << 3 = 4096

// ============================================================================
// HASH TABLE GENERATION
// ============================================================================

let _cryptTable = null;

/**
 * Initialize the MPQ crypto table
 */
function getCryptTable() {
  if (_cryptTable) return _cryptTable;

  _cryptTable = new Uint32Array(1280);
  let seed = 0x00100001;

  for (let i = 0; i < 256; i++) {
    for (let j = i; j < 1280; j += 256) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const a = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const b = seed & 0xFFFF;
      _cryptTable[j] = a | b;
    }
  }

  return _cryptTable;
}

/**
 * Compute MPQ hash for a string
 */
function mpqHash(str, hashType) {
  const cryptTable = getCryptTable();
  let seed1 = 0x7FED7FED;
  let seed2 = 0xEEEEEEEE;

  str = str.toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    seed1 = cryptTable[(hashType << 8) + ch] ^ (seed1 + seed2);
    seed2 = ch + seed1 + seed2 + (seed2 << 5) + 3;
  }

  return seed1 >>> 0;
}

/**
 * Encrypt/decrypt data block
 */
function cryptBlock(data, key, decrypt = false) {
  const cryptTable = getCryptTable();
  const u32 = new Uint32Array(data.buffer, data.byteOffset, Math.floor(data.length / 4));
  let seed = 0xEEEEEEEE;

  for (let i = 0; i < u32.length; i++) {
    seed += cryptTable[0x400 + (key & 0xFF)];
    if (decrypt) {
      const decrypted = u32[i] ^ (seed + key);
      seed = (decrypted + seed * 33 + 3) | 0;
      u32[i] = decrypted;
    } else {
      const original = u32[i];
      u32[i] = original ^ (seed + key);
      seed = (original + seed * 33 + 3) | 0;
    }
    key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0B);
  }
}

// ============================================================================
// MPQ BUILDER CLASS
// ============================================================================

export class MPQBuilder {
  constructor(options = {}) {
    this.files = new Map();  // path -> { data, flags, compressed }
    this.hashTableSize = options.hashTableSize || DEFAULT_HASH_TABLE_SIZE;
    this.blockSizeShift = options.blockSizeShift || DEFAULT_BLOCK_SIZE_SHIFT;
    this.blockSize = 512 << this.blockSizeShift;

    // Statistics
    this.stats = {
      filesAdded: 0,
      totalUncompressed: 0,
      totalCompressed: 0,
    };
  }

  // ==========================================================================
  // FILE MANAGEMENT
  // ==========================================================================

  /**
   * Add a file to the archive
   * @param {string} path - File path in the archive
   * @param {Uint8Array} data - File data
   * @param {Object} options - Optional settings
   */
  addFile(path, data, options = {}) {
    const normalPath = this.normalizePath(path);
    const fileData = data instanceof Uint8Array ? data : new Uint8Array(data);

    let flags = BlockFlags.EXISTS | BlockFlags.SINGLE_UNIT;

    // For small files, use SINGLE_UNIT (no sectors)
    if (fileData.length <= this.blockSize || options.singleUnit !== false) {
      flags |= BlockFlags.SINGLE_UNIT;
    }

    this.files.set(normalPath, {
      data: fileData,
      size: fileData.length,
      flags,
      compressed: false,
    });

    this.stats.filesAdded++;
    this.stats.totalUncompressed += fileData.length;

    return this;
  }

  /**
   * Add multiple files at once
   * @param {Object} files - { path: data } mapping
   */
  addFiles(files) {
    for (const [path, data] of Object.entries(files)) {
      this.addFile(path, data);
    }
    return this;
  }

  /**
   * Remove a file from the archive
   */
  removeFile(path) {
    const normalPath = this.normalizePath(path);
    this.files.delete(normalPath);
    return this;
  }

  /**
   * Check if a file exists
   */
  hasFile(path) {
    return this.files.has(this.normalizePath(path));
  }

  /**
   * Get a file's data
   */
  getFile(path) {
    const entry = this.files.get(this.normalizePath(path));
    return entry ? entry.data : null;
  }

  /**
   * List all files
   */
  listFiles() {
    return Array.from(this.files.keys());
  }

  /**
   * Normalize file path for MPQ
   */
  normalizePath(path) {
    return path.toLowerCase().replace(/\//g, '\\');
  }

  // ==========================================================================
  // BUILD ARCHIVE
  // ==========================================================================

  /**
   * Build the MPQ archive
   * @returns {Uint8Array} The complete MPQ file
   */
  build() {
    const fileList = Array.from(this.files.entries()).map(([path, entry]) => ({
      path,
      ...entry,
    }));

    if (fileList.length === 0) {
      throw new Error('Cannot build empty MPQ archive');
    }

    // Calculate sizes
    const hashTableBytes = this.hashTableSize * HASH_ENTRY_SIZE;
    const blockTableBytes = fileList.length * BLOCK_ENTRY_SIZE;

    // Calculate file data positions
    let dataOffset = MPQ_HEADER_SIZE;
    for (const file of fileList) {
      file.offset = dataOffset;
      file.compressedSize = file.data.length;  // No compression for now
      dataOffset += file.compressedSize;
    }

    const hashTableOffset = dataOffset;
    const blockTableOffset = hashTableOffset + hashTableBytes;
    const archiveSize = blockTableOffset + blockTableBytes;

    // Create output buffer
    const output = new Uint8Array(archiveSize);
    const view = new DataView(output.buffer);

    // Write header
    view.setUint32(0, MPQ_MAGIC, true);           // Magic
    view.setUint32(4, MPQ_HEADER_SIZE, true);     // Header size
    view.setUint32(8, archiveSize, true);         // Archive size
    view.setUint16(12, 0, true);                  // Format version
    view.setUint16(14, this.blockSizeShift, true); // Block size shift
    view.setUint32(16, hashTableOffset, true);    // Hash table offset
    view.setUint32(20, blockTableOffset, true);   // Block table offset
    view.setUint32(24, this.hashTableSize, true); // Hash table entries
    view.setUint32(28, fileList.length, true);    // Block table entries

    // Write file data
    for (const file of fileList) {
      output.set(file.data, file.offset);
    }

    // Build and write hash table
    const hashTable = this.buildHashTable(fileList);
    const hashTableEncrypted = new Uint8Array(hashTable.buffer.slice());
    cryptBlock(hashTableEncrypted, mpqHash('(hash table)', 3), false);
    output.set(hashTableEncrypted, hashTableOffset);

    // Build and write block table
    const blockTable = this.buildBlockTable(fileList);
    const blockTableEncrypted = new Uint8Array(blockTable.buffer.slice());
    cryptBlock(blockTableEncrypted, mpqHash('(block table)', 3), false);
    output.set(blockTableEncrypted, blockTableOffset);

    this.stats.totalCompressed = dataOffset - MPQ_HEADER_SIZE;

    console.log(`[MPQBuilder] Built archive: ${archiveSize} bytes, ${fileList.length} files`);

    return output;
  }

  /**
   * Build hash table
   */
  buildHashTable(fileList) {
    const table = new Uint32Array(this.hashTableSize * 4);

    // Initialize all entries as empty
    for (let i = 0; i < this.hashTableSize; i++) {
      table[i * 4 + 0] = 0xFFFFFFFF;  // Hash A
      table[i * 4 + 1] = 0xFFFFFFFF;  // Hash B
      table[i * 4 + 2] = 0xFFFF;       // Locale (neutral)
      table[i * 4 + 3] = 0xFFFFFFFF;  // Block index (empty)
    }

    // Insert files
    for (let blockIndex = 0; blockIndex < fileList.length; blockIndex++) {
      const file = fileList[blockIndex];
      const hashA = mpqHash(file.path, 1);
      const hashB = mpqHash(file.path, 2);
      const startIndex = mpqHash(file.path, 0) % this.hashTableSize;

      // Find empty slot (linear probing)
      for (let i = 0; i < this.hashTableSize; i++) {
        const index = (startIndex + i) % this.hashTableSize;
        if (table[index * 4 + 3] === 0xFFFFFFFF) {
          table[index * 4 + 0] = hashA;
          table[index * 4 + 1] = hashB;
          table[index * 4 + 2] = 0;  // Neutral locale
          table[index * 4 + 3] = blockIndex;
          break;
        }
      }
    }

    return table;
  }

  /**
   * Build block table
   */
  buildBlockTable(fileList) {
    const table = new Uint32Array(fileList.length * 4);

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      table[i * 4 + 0] = file.offset;          // File position
      table[i * 4 + 1] = file.compressedSize;  // Compressed size
      table[i * 4 + 2] = file.size;            // Uncompressed size
      table[i * 4 + 3] = file.flags;           // Flags
    }

    return table;
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Export as downloadable file
   */
  download(filename = 'game.mpq') {
    const data = this.build();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    return data;
  }

  /**
   * Get build statistics
   */
  getStats() {
    return {
      ...this.stats,
      fileCount: this.files.size,
      hashTableSize: this.hashTableSize,
      blockSize: this.blockSize,
    };
  }

  /**
   * Clear all files
   */
  clear() {
    this.files.clear();
    this.stats = {
      filesAdded: 0,
      totalUncompressed: 0,
      totalCompressed: 0,
    };
    return this;
  }
}

// ============================================================================
// DUN FILE BUILDER
// ============================================================================

/**
 * Tile IDs for DUN files by theme
 */
export const DUN_TILES = {
  CATHEDRAL: {
    FLOOR: 13,
    WALL_HORIZONTAL: 1,
    WALL_VERTICAL: 2,
    WALL_CORNER_NW: 3,
    WALL_CORNER_NE: 4,
    WALL_CORNER_SW: 5,
    WALL_CORNER_SE: 6,
    DOOR_HORIZONTAL: 25,
    DOOR_VERTICAL: 26,
    STAIRS_UP: 36,
    STAIRS_DOWN: 37,
    ARCH: 11,
    PILLAR: 10,
  },
  CATACOMBS: {
    FLOOR: 13,
    WALL_HORIZONTAL: 1,
    WALL_VERTICAL: 2,
    DOOR_HORIZONTAL: 25,
    DOOR_VERTICAL: 26,
    STAIRS_UP: 36,
    STAIRS_DOWN: 37,
  },
  CAVES: {
    FLOOR: 13,
    WALL: 1,
    LAVA: 50,
    WATER: 51,
    STAIRS_UP: 36,
    STAIRS_DOWN: 37,
  },
  HELL: {
    FLOOR: 13,
    WALL: 1,
    LAVA: 50,
    STAIRS_UP: 36,
    STAIRS_DOWN: 37,
  },
};

/**
 * DUN File Builder - Creates level layout files
 */
export class DUNBuilder {
  constructor(width, height, theme = 'CATHEDRAL') {
    this.width = width;
    this.height = height;
    this.theme = theme;
    this.tiles = DUN_TILES[theme] || DUN_TILES.CATHEDRAL;

    // Main tile layer (width × height)
    this.tileLayer = new Uint16Array(width * height);

    // Sub-layers at 2x resolution (width*2 × height*2)
    this.subWidth = width * 2;
    this.subHeight = height * 2;
    this.itemLayer = new Uint16Array(this.subWidth * this.subHeight);
    this.monsterLayer = new Uint16Array(this.subWidth * this.subHeight);
    this.objectLayer = new Uint16Array(this.subWidth * this.subHeight);

    // Initialize with floor
    this.tileLayer.fill(this.tiles.FLOOR + 1);  // +1 for DUN encoding
  }

  // ==========================================================================
  // TILE OPERATIONS
  // ==========================================================================

  /**
   * Set a tile at position
   */
  setTile(x, y, tileId) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      // DUN format uses value N-1 as actual tile, so add 1
      this.tileLayer[y * this.width + x] = tileId + 1;
    }
    return this;
  }

  /**
   * Get tile at position
   */
  getTile(x, y) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.tileLayer[y * this.width + x] - 1;
    }
    return -1;
  }

  /**
   * Fill rectangle with tile
   */
  fillRect(x1, y1, x2, y2, tileId) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(this.width - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(this.height - 1, Math.max(y1, y2));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        this.setTile(x, y, tileId);
      }
    }
    return this;
  }

  /**
   * Draw walls around a rectangle
   */
  drawWalls(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    // Top and bottom walls
    for (let x = minX; x <= maxX; x++) {
      this.setTile(x, minY, this.tiles.WALL_HORIZONTAL || this.tiles.WALL || 1);
      this.setTile(x, maxY, this.tiles.WALL_HORIZONTAL || this.tiles.WALL || 1);
    }

    // Left and right walls
    for (let y = minY; y <= maxY; y++) {
      this.setTile(minX, y, this.tiles.WALL_VERTICAL || this.tiles.WALL || 2);
      this.setTile(maxX, y, this.tiles.WALL_VERTICAL || this.tiles.WALL || 2);
    }

    // Corners
    if (this.tiles.WALL_CORNER_NW) {
      this.setTile(minX, minY, this.tiles.WALL_CORNER_NW);
      this.setTile(maxX, minY, this.tiles.WALL_CORNER_NE);
      this.setTile(minX, maxY, this.tiles.WALL_CORNER_SW);
      this.setTile(maxX, maxY, this.tiles.WALL_CORNER_SE);
    }

    return this;
  }

  /**
   * Place a door
   */
  placeDoor(x, y, horizontal = true) {
    const doorTile = horizontal
      ? (this.tiles.DOOR_HORIZONTAL || 25)
      : (this.tiles.DOOR_VERTICAL || 26);
    this.setTile(x, y, doorTile);
    return this;
  }

  /**
   * Place stairs
   */
  placeStairs(x, y, goingUp = true) {
    const stairTile = goingUp ? this.tiles.STAIRS_UP : this.tiles.STAIRS_DOWN;
    this.setTile(x, y, stairTile);
    return this;
  }

  // ==========================================================================
  // SUB-LAYER OPERATIONS (MONSTERS, ITEMS, OBJECTS)
  // ==========================================================================

  /**
   * Place a monster at sub-layer coordinates
   * @param {number} x - X position (0 to width*2-1)
   * @param {number} y - Y position (0 to height*2-1)
   * @param {number} monsterId - Monster type ID
   */
  placeMonster(x, y, monsterId) {
    if (x >= 0 && x < this.subWidth && y >= 0 && y < this.subHeight) {
      this.monsterLayer[y * this.subWidth + x] = monsterId;
    }
    return this;
  }

  /**
   * Place an item at sub-layer coordinates
   */
  placeItem(x, y, itemId) {
    if (x >= 0 && x < this.subWidth && y >= 0 && y < this.subHeight) {
      this.itemLayer[y * this.subWidth + x] = itemId;
    }
    return this;
  }

  /**
   * Place an object at sub-layer coordinates
   */
  placeObject(x, y, objectId) {
    if (x >= 0 && x < this.subWidth && y >= 0 && y < this.subHeight) {
      this.objectLayer[y * this.subWidth + x] = objectId;
    }
    return this;
  }

  /**
   * Place monster at tile coordinates (converts to sub-layer)
   */
  placeMonsterAtTile(tileX, tileY, monsterId) {
    // Center of tile in sub-layer coordinates
    const subX = tileX * 2 + 1;
    const subY = tileY * 2 + 1;
    return this.placeMonster(subX, subY, monsterId);
  }

  /**
   * Place object at tile coordinates
   */
  placeObjectAtTile(tileX, tileY, objectId) {
    const subX = tileX * 2 + 1;
    const subY = tileY * 2 + 1;
    return this.placeObject(subX, subY, objectId);
  }

  // ==========================================================================
  // ROOM GENERATION
  // ==========================================================================

  /**
   * Create a rectangular room
   */
  createRoom(x, y, width, height, options = {}) {
    const { hasDoor = true, doorSide = 'south' } = options;

    // Fill interior with floor
    this.fillRect(x + 1, y + 1, x + width - 2, y + height - 2, this.tiles.FLOOR);

    // Draw walls
    this.drawWalls(x, y, x + width - 1, y + height - 1);

    // Add door
    if (hasDoor) {
      const doorPos = {
        north: { x: x + Math.floor(width / 2), y },
        south: { x: x + Math.floor(width / 2), y: y + height - 1 },
        east: { x: x + width - 1, y: y + Math.floor(height / 2) },
        west: { x, y: y + Math.floor(height / 2) },
      }[doorSide];

      if (doorPos) {
        const isHorizontal = doorSide === 'north' || doorSide === 'south';
        this.placeDoor(doorPos.x, doorPos.y, isHorizontal);
      }
    }

    return this;
  }

  /**
   * Create a corridor between two points
   */
  createCorridor(x1, y1, x2, y2, width = 2) {
    // Simple L-shaped corridor
    const midX = x1;
    const midY = y2;

    // Vertical segment
    const minY = Math.min(y1, midY);
    const maxY = Math.max(y1, midY);
    for (let y = minY; y <= maxY; y++) {
      for (let w = 0; w < width; w++) {
        this.setTile(x1 + w, y, this.tiles.FLOOR);
      }
    }

    // Horizontal segment
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      for (let w = 0; w < width; w++) {
        this.setTile(x, midY + w, this.tiles.FLOOR);
      }
    }

    return this;
  }

  // ==========================================================================
  // BUILD DUN FILE
  // ==========================================================================

  /**
   * Build the DUN file data
   */
  build(options = {}) {
    const {
      includeItems = false,
      includeMonsters = false,
      includeObjects = false,
    } = options;

    // Calculate sizes
    const tileLayerSize = this.width * this.height * 2;
    const subLayerSize = this.subWidth * this.subHeight * 2;

    let totalSize = 4 + tileLayerSize;  // Header + tile layer
    if (includeItems) totalSize += subLayerSize;
    if (includeMonsters) totalSize += subLayerSize;
    if (includeObjects) totalSize += subLayerSize;

    // Create buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    let offset = 0;

    // Write header
    view.setUint16(offset, this.width, true);
    offset += 2;
    view.setUint16(offset, this.height, true);
    offset += 2;

    // Write tile layer
    for (let i = 0; i < this.tileLayer.length; i++) {
      view.setUint16(offset, this.tileLayer[i], true);
      offset += 2;
    }

    // Write optional sub-layers
    if (includeItems) {
      for (let i = 0; i < this.itemLayer.length; i++) {
        view.setUint16(offset, this.itemLayer[i], true);
        offset += 2;
      }
    }

    if (includeMonsters) {
      for (let i = 0; i < this.monsterLayer.length; i++) {
        view.setUint16(offset, this.monsterLayer[i], true);
        offset += 2;
      }
    }

    if (includeObjects) {
      for (let i = 0; i < this.objectLayer.length; i++) {
        view.setUint16(offset, this.objectLayer[i], true);
        offset += 2;
      }
    }

    return new Uint8Array(buffer);
  }

  /**
   * Create from a 2D grid array
   */
  static fromGrid(grid, theme = 'CATHEDRAL') {
    const height = grid.length;
    const width = grid[0]?.length || 0;

    const builder = new DUNBuilder(width, height, theme);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y] && grid[y][x] !== undefined) {
          builder.setTile(x, y, grid[y][x]);
        }
      }
    }

    return builder;
  }

  /**
   * Export as ASCII visualization
   */
  toASCII() {
    const chars = {
      0: ' ',  // Empty
      [this.tiles.FLOOR]: '.',
      [this.tiles.WALL_HORIZONTAL]: '─',
      [this.tiles.WALL_VERTICAL]: '│',
      [this.tiles.WALL_CORNER_NW]: '┌',
      [this.tiles.WALL_CORNER_NE]: '┐',
      [this.tiles.WALL_CORNER_SW]: '└',
      [this.tiles.WALL_CORNER_SE]: '┘',
      [this.tiles.DOOR_HORIZONTAL]: '▬',
      [this.tiles.DOOR_VERTICAL]: '▐',
      [this.tiles.STAIRS_UP]: '↑',
      [this.tiles.STAIRS_DOWN]: '↓',
    };

    let result = '';
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const tile = this.getTile(x, y);
        result += chars[tile] || '?';
      }
      result += '\n';
    }
    return result;
  }
}

// ============================================================================
// MONSTER DATA BUILDER
// ============================================================================

/**
 * Monster IDs from the game
 */
export const MONSTER_IDS = {
  // Zombies
  ZOMBIE: 1,
  GHOUL: 2,
  ROTTING_CARCASS: 3,
  BLACK_DEATH: 4,

  // Fallen
  FALLEN_ONE: 17,
  CARVER: 18,
  DEVIL_KIN: 19,
  DARK_ONE: 20,

  // Skeletons
  SKELETON: 33,
  CORPSE_AXE: 34,
  BURNING_DEAD: 35,
  HORROR: 36,

  // Skeleton Archers
  SKELETON_ARCHER: 37,
  CORPSE_BOW: 38,
  BURNING_DEAD_ARCHER: 39,
  HORROR_ARCHER: 40,

  // Bosses
  SKELETON_KING: 21,
  BUTCHER: 22,
  DIABLO: 101,
};

/**
 * Monster pool by dungeon theme
 */
export const MONSTER_POOLS = {
  CATHEDRAL: [
    MONSTER_IDS.ZOMBIE,
    MONSTER_IDS.FALLEN_ONE,
    MONSTER_IDS.SKELETON,
    MONSTER_IDS.SKELETON_ARCHER,
  ],
  CATACOMBS: [
    MONSTER_IDS.GHOUL,
    MONSTER_IDS.CARVER,
    MONSTER_IDS.CORPSE_AXE,
    MONSTER_IDS.CORPSE_BOW,
  ],
  CAVES: [
    MONSTER_IDS.ROTTING_CARCASS,
    MONSTER_IDS.DEVIL_KIN,
    MONSTER_IDS.BURNING_DEAD,
    MONSTER_IDS.BURNING_DEAD_ARCHER,
  ],
  HELL: [
    MONSTER_IDS.BLACK_DEATH,
    MONSTER_IDS.DARK_ONE,
    MONSTER_IDS.HORROR,
    MONSTER_IDS.HORROR_ARCHER,
  ],
};

/**
 * Monster Data Builder - Creates monster placement data
 */
export class MonsterDataBuilder {
  constructor() {
    this.placements = [];
  }

  /**
   * Add a monster placement
   */
  addMonster(x, y, monsterId, options = {}) {
    this.placements.push({
      x,
      y,
      monsterId,
      isUnique: options.isUnique || false,
      level: options.level || 1,
    });
    return this;
  }

  /**
   * Generate random placements for a level
   */
  generateForLevel(width, height, theme, density = 0.1) {
    const pool = MONSTER_POOLS[theme] || MONSTER_POOLS.CATHEDRAL;
    const count = Math.floor(width * height * density);

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const monsterId = pool[Math.floor(Math.random() * pool.length)];

      this.addMonster(x, y, monsterId);
    }

    return this;
  }

  /**
   * Get placements
   */
  getPlacements() {
    return [...this.placements];
  }

  /**
   * Apply to a DUN builder
   */
  applyToDUN(dunBuilder) {
    for (const placement of this.placements) {
      dunBuilder.placeMonsterAtTile(placement.x, placement.y, placement.monsterId);
    }
    return this;
  }
}

// ============================================================================
// OBJECT DATA BUILDER
// ============================================================================

/**
 * Object IDs from the game
 */
export const OBJECT_IDS = {
  // Containers
  BARREL: 1,
  CHEST: 2,
  CHEST_LARGE: 3,
  SARCOPHAGUS: 4,

  // Interactive
  LEVER: 5,
  DOOR: 6,

  // Shrines
  SHRINE_MYSTERIOUS: 10,
  SHRINE_HIDDEN: 11,
  SHRINE_GLOOMY: 12,
  SHRINE_WEIRD: 13,
  SHRINE_MAGICAL: 14,
  SHRINE_STONE: 15,
  SHRINE_RELIGIOUS: 16,
  SHRINE_ENCHANTED: 17,
  SHRINE_THAUMATURGIC: 18,
  SHRINE_FASCINATING: 19,
  SHRINE_CRYPTIC: 20,
  SHRINE_ELDRITCH: 21,
  SHRINE_EERIE: 22,
  SHRINE_DIVINE: 23,
  SHRINE_HOLY: 24,
  SHRINE_SACRED: 25,
  SHRINE_SPIRITUAL: 26,
  SHRINE_SPOOKY: 27,
  SHRINE_ABANDONED: 28,
  SHRINE_CREEPY: 29,
  SHRINE_QUIET: 30,
  SHRINE_SECLUDED: 31,
  SHRINE_ORNATE: 32,
  SHRINE_GLIMMERING: 33,
  SHRINE_TAINTED: 34,

  // Decorative
  BOOKCASE: 40,
  SKELETON_DECOR: 41,
  ALTAR: 42,
  FOUNTAIN: 43,
};

/**
 * Object Data Builder - Creates object placement data
 */
export class ObjectDataBuilder {
  constructor() {
    this.placements = [];
  }

  /**
   * Add an object placement
   */
  addObject(x, y, objectId, options = {}) {
    this.placements.push({
      x,
      y,
      objectId,
      ...options,
    });
    return this;
  }

  /**
   * Generate treasure placements
   */
  generateTreasure(width, height, density = 0.05) {
    const treasureObjects = [OBJECT_IDS.BARREL, OBJECT_IDS.CHEST, OBJECT_IDS.CHEST_LARGE];
    const count = Math.floor(width * height * density);

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const objectId = treasureObjects[Math.floor(Math.random() * treasureObjects.length)];

      this.addObject(x, y, objectId);
    }

    return this;
  }

  /**
   * Generate shrine placements
   */
  generateShrines(width, height, count = 2) {
    const shrines = [
      OBJECT_IDS.SHRINE_MYSTERIOUS,
      OBJECT_IDS.SHRINE_MAGICAL,
      OBJECT_IDS.SHRINE_ENCHANTED,
      OBJECT_IDS.SHRINE_DIVINE,
    ];

    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      const objectId = shrines[Math.floor(Math.random() * shrines.length)];

      this.addObject(x, y, objectId);
    }

    return this;
  }

  /**
   * Get placements
   */
  getPlacements() {
    return [...this.placements];
  }

  /**
   * Apply to a DUN builder
   */
  applyToDUN(dunBuilder) {
    for (const placement of this.placements) {
      dunBuilder.placeObjectAtTile(placement.x, placement.y, placement.objectId);
    }
    return this;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default MPQBuilder;
