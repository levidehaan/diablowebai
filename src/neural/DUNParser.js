/**
 * DUN File Parser and Writer
 *
 * Handles Diablo 1 DUN level files for reading and writing.
 * DUN files contain level map data used by the random level generation system.
 *
 * File Format:
 * - Header: 2 WORDs (width, height) in little-endian
 * - Base layer: W×H WORDs (tile indices + 1, 0 = default floor)
 * - Items layer: W×H×4 WORDs (4x resolution, optional)
 * - Monsters layer: W×H×4 WORDs (4x resolution, optional)
 * - Objects layer: W×H×4 WORDs (4x resolution, optional)
 *
 * Based on: https://github.com/savagesteel/d1-file-formats/blob/master/PC-Mac/DUN.md
 */

/**
 * Parse a DUN file buffer into structured data
 * @param {ArrayBuffer|Uint8Array} buffer - Raw DUN file data
 * @returns {Object} Parsed DUN data
 */
export function parseDUN(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  if (data.length < 4) {
    throw new Error('DUN file too small for header');
  }

  // Read header
  const width = view.getUint16(0, true);  // little-endian
  const height = view.getUint16(2, true);

  if (width === 0 || height === 0 || width > 256 || height > 256) {
    throw new Error(`Invalid DUN dimensions: ${width}x${height}`);
  }

  // Calculate layer sizes
  const baseLayerSize = width * height * 2;  // WORDs
  const subLayerSize = width * height * 4 * 2;  // 4x resolution, WORDs

  // Minimum size is header + base layer
  const minSize = 4 + baseLayerSize;
  if (data.length < minSize) {
    throw new Error(`DUN file too small: ${data.length} < ${minSize}`);
  }

  // Parse base layer (tiles)
  const baseTiles = [];
  let offset = 4;
  for (let y = 0; y < height; y++) {
    baseTiles[y] = [];
    for (let x = 0; x < width; x++) {
      // Value is tile index + 1, so we subtract 1
      // 0 means use default floor tile
      const value = view.getUint16(offset, true);
      baseTiles[y][x] = value === 0 ? 0 : value - 1;
      offset += 2;
    }
  }

  // Parse optional layers (items, monsters, objects)
  // These are at 4x resolution (2*width by 2*height per axis)
  const subWidth = width * 2;
  const subHeight = height * 2;

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

  // Check for items layer
  if (data.length >= offset + subLayerSize) {
    result.items = parseSubLayer(view, offset, subWidth, subHeight);
    result.hasItems = true;
    offset += subLayerSize;
  }

  // Check for monsters layer
  if (data.length >= offset + subLayerSize) {
    result.monsters = parseSubLayer(view, offset, subWidth, subHeight);
    result.hasMonsters = true;
    offset += subLayerSize;
  }

  // Check for objects layer
  if (data.length >= offset + subLayerSize) {
    result.objects = parseSubLayer(view, offset, subWidth, subHeight);
    result.hasObjects = true;
    offset += subLayerSize;
  }

  return result;
}

/**
 * Parse a sub-layer (items, monsters, objects)
 */
function parseSubLayer(view, startOffset, width, height) {
  const layer = [];
  let offset = startOffset;

  for (let y = 0; y < height; y++) {
    layer[y] = [];
    for (let x = 0; x < width; x++) {
      layer[y][x] = view.getUint16(offset, true);
      offset += 2;
    }
  }

  return layer;
}

/**
 * Write DUN data to a buffer
 * @param {Object} dunData - Parsed DUN data structure
 * @returns {Uint8Array} DUN file buffer
 */
export function writeDUN(dunData) {
  const { width, height, baseTiles, items, monsters, objects } = dunData;

  // Validate dimensions
  if (!width || !height || width > 256 || height > 256) {
    throw new Error(`Invalid DUN dimensions: ${width}x${height}`);
  }

  // Calculate buffer size
  const baseLayerSize = width * height * 2;
  const subLayerSize = width * height * 4 * 2;

  let totalSize = 4 + baseLayerSize;  // Header + base layer
  if (items) totalSize += subLayerSize;
  if (monsters) totalSize += subLayerSize;
  if (objects) totalSize += subLayerSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const result = new Uint8Array(buffer);

  // Write header
  view.setUint16(0, width, true);
  view.setUint16(2, height, true);

  // Write base layer
  let offset = 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = baseTiles[y]?.[x] ?? 0;
      // Store as tile index + 1 (0 = default floor)
      const value = tile === 0 ? 0 : tile + 1;
      view.setUint16(offset, value, true);
      offset += 2;
    }
  }

  // Write sub-layers
  const subWidth = width * 2;
  const subHeight = height * 2;

  if (items) {
    offset = writeSubLayer(view, offset, items, subWidth, subHeight);
  }

  if (monsters) {
    offset = writeSubLayer(view, offset, monsters, subWidth, subHeight);
  }

  if (objects) {
    offset = writeSubLayer(view, offset, objects, subWidth, subHeight);
  }

  return result;
}

/**
 * Write a sub-layer to the buffer
 */
function writeSubLayer(view, startOffset, layer, width, height) {
  let offset = startOffset;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = layer[y]?.[x] ?? 0;
      view.setUint16(offset, value, true);
      offset += 2;
    }
  }

  return offset;
}

/**
 * Create an empty DUN structure
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} defaultTile - Default tile value (0 = floor)
 * @returns {Object} Empty DUN data
 */
export function createEmptyDUN(width, height, defaultTile = 0) {
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
}

/**
 * Create empty sub-layer (items/monsters/objects)
 * @param {number} width - Base map width
 * @param {number} height - Base map height
 * @returns {number[][]} Empty sub-layer (2x dimensions)
 */
export function createEmptySubLayer(width, height) {
  const subWidth = width * 2;
  const subHeight = height * 2;
  const layer = [];

  for (let y = 0; y < subHeight; y++) {
    layer[y] = [];
    for (let x = 0; x < subWidth; x++) {
      layer[y][x] = 0;
    }
  }

  return layer;
}

/**
 * Convert a binary (0/1) grid to DUN tile grid
 * Uses TileMapper for proper tile ID conversion
 * @param {number[][]} binaryGrid - Grid with 0=floor, 1=wall
 * @param {Object} options - Conversion options
 * @returns {Object} DUN data structure
 */
export function binaryGridToDUN(binaryGrid, options = {}) {
  const height = binaryGrid.length;
  const width = binaryGrid[0]?.length || 0;

  if (width === 0 || height === 0) {
    throw new Error('Invalid grid dimensions');
  }

  // Create base tiles from binary grid
  const baseTiles = [];
  for (let y = 0; y < height; y++) {
    baseTiles[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = binaryGrid[y][x];
      // Simple conversion: 0 = floor (tile 0), 1 = wall (use wall tile)
      // More sophisticated conversion should use TileMapper
      baseTiles[y][x] = cell === 0 ? 0 : (options.wallTile || 1);
    }
  }

  const dun = {
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

  // Add monster layer if spawns provided
  if (options.monsters && options.monsters.length > 0) {
    dun.monsters = createEmptySubLayer(width, height);
    dun.hasMonsters = true;

    for (const spawn of options.monsters) {
      const sx = Math.floor(spawn.x * 2);
      const sy = Math.floor(spawn.y * 2);
      if (sy < dun.monsters.length && sx < dun.monsters[0].length) {
        dun.monsters[sy][sx] = spawn.monsterId || spawn.type || 1;
      }
    }
  }

  // Add object layer if objects provided
  if (options.objects && options.objects.length > 0) {
    dun.objects = createEmptySubLayer(width, height);
    dun.hasObjects = true;

    for (const obj of options.objects) {
      const sx = Math.floor(obj.x * 2);
      const sy = Math.floor(obj.y * 2);
      if (sy < dun.objects.length && sx < dun.objects[0].length) {
        dun.objects[sy][sx] = obj.objectId || obj.type || 1;
      }
    }
  }

  return dun;
}

/**
 * Visualize DUN as ASCII art
 * @param {Object} dunData - Parsed DUN data
 * @returns {string} ASCII representation
 */
export function visualizeDUN(dunData) {
  const { width, height, baseTiles, monsters, objects } = dunData;
  const lines = [];

  lines.push(`DUN: ${width}x${height}`);
  lines.push('');

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      const tile = baseTiles[y][x];

      // Check for monsters at this position (sub-tile centered)
      const hasMonster = monsters && (
        monsters[y * 2]?.[x * 2] ||
        monsters[y * 2]?.[x * 2 + 1] ||
        monsters[y * 2 + 1]?.[x * 2] ||
        monsters[y * 2 + 1]?.[x * 2 + 1]
      );

      // Check for objects
      const hasObject = objects && (
        objects[y * 2]?.[x * 2] ||
        objects[y * 2]?.[x * 2 + 1] ||
        objects[y * 2 + 1]?.[x * 2] ||
        objects[y * 2 + 1]?.[x * 2 + 1]
      );

      if (hasMonster) {
        line += 'M';
      } else if (hasObject) {
        line += 'O';
      } else if (tile === 0) {
        line += '.';  // Floor
      } else if (tile >= 1 && tile <= 12) {
        line += '#';  // Wall
      } else if (tile >= 13 && tile <= 15) {
        line += '.';  // Floor variants
      } else if (tile === 36) {
        line += '<';  // Stairs up
      } else if (tile === 37) {
        line += '>';  // Stairs down
      } else if (tile === 25 || tile === 26) {
        line += '+';  // Door
      } else {
        line += '?';  // Unknown
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Get statistics about a DUN file
 * @param {Object} dunData - Parsed DUN data
 * @returns {Object} Statistics
 */
export function getDUNStats(dunData) {
  const { width, height, baseTiles, monsters, objects, items } = dunData;

  let floorCount = 0;
  let wallCount = 0;
  let stairsUp = 0;
  let stairsDown = 0;
  let doorCount = 0;
  let otherCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = baseTiles[y][x];
      if (tile === 0 || (tile >= 13 && tile <= 15)) {
        floorCount++;
      } else if (tile >= 1 && tile <= 12) {
        wallCount++;
      } else if (tile === 36) {
        stairsUp++;
      } else if (tile === 37) {
        stairsDown++;
      } else if (tile === 25 || tile === 26) {
        doorCount++;
      } else {
        otherCount++;
      }
    }
  }

  // Count monsters and objects
  let monsterCount = 0;
  let objectCount = 0;
  let itemCount = 0;

  if (monsters) {
    for (const row of monsters) {
      for (const val of row) {
        if (val > 0) monsterCount++;
      }
    }
  }

  if (objects) {
    for (const row of objects) {
      for (const val of row) {
        if (val > 0) objectCount++;
      }
    }
  }

  if (items) {
    for (const row of items) {
      for (const val of row) {
        if (val > 0) itemCount++;
      }
    }
  }

  return {
    width,
    height,
    totalTiles: width * height,
    floorCount,
    wallCount,
    stairsUp,
    stairsDown,
    doorCount,
    otherCount,
    monsterCount,
    objectCount,
    itemCount,
    hasMonsters: monsterCount > 0,
    hasObjects: objectCount > 0,
    hasItems: itemCount > 0,
  };
}

// Default export
const DUNParser = {
  parse: parseDUN,
  write: writeDUN,
  createEmpty: createEmptyDUN,
  createEmptySubLayer,
  binaryGridToDUN,
  visualize: visualizeDUN,
  getStats: getDUNStats,
};

export default DUNParser;
