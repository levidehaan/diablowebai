/**
 * Tile Mapper
 *
 * Converts binary (0/1) level grids to proper Diablo tile IDs.
 * Handles wall orientation, floor variety, and special tiles.
 *
 * Tile ID Reference (from devilution source):
 *
 * Cathedral (dlvl 1-4):
 *   Floors: 13-15
 *   Walls: 1-12 (orientation-based)
 *   Doors: 25-26
 *   Stairs: 36-37
 *   Pillars: 42
 *
 * Catacombs (dlvl 5-8):
 *   Floors: 130-135
 *   Walls: 100-120
 *   Arches: 145-150
 *
 * Caves (dlvl 9-12):
 *   Floors: 200-210
 *   Walls: 180-199
 *   Lava: 220-225
 *
 * Hell (dlvl 13-16):
 *   Floors: 300-310
 *   Walls: 280-299
 */

// Tile definitions by theme
const TILE_SETS = {
  cathedral: {
    floors: [13, 14, 15],
    walls: {
      vertical: 1,      // |
      horizontal: 2,    // -
      cornerNW: 3,      // ┌
      cornerNE: 4,      // ┐
      cornerSW: 5,      // └
      cornerSE: 6,      // ┘
      teeN: 7,          // ┬
      teeS: 8,          // ┴
      teeE: 9,          // ├
      teeW: 10,         // ┤
      cross: 11,        // ┼
      pillar: 12,       // isolated wall
    },
    door: 25,
    doorOpen: 26,
    stairsUp: 36,
    stairsDown: 37,
    pillar: 42,
    arch: 41,
    altar: 43,
  },
  catacombs: {
    floors: [130, 131, 132, 133, 134, 135],
    walls: {
      vertical: 100,
      horizontal: 101,
      cornerNW: 102,
      cornerNE: 103,
      cornerSW: 104,
      cornerSE: 105,
      teeN: 106,
      teeS: 107,
      teeE: 108,
      teeW: 109,
      cross: 110,
      pillar: 111,
    },
    door: 140,
    doorOpen: 141,
    stairsUp: 142,
    stairsDown: 143,
    arch: 145,
  },
  caves: {
    floors: [200, 201, 202, 203, 204, 205],
    walls: {
      vertical: 180,
      horizontal: 181,
      cornerNW: 182,
      cornerNE: 183,
      cornerSW: 184,
      cornerSE: 185,
      teeN: 186,
      teeS: 187,
      teeE: 188,
      teeW: 189,
      cross: 190,
      pillar: 191,
    },
    stairsUp: 210,
    stairsDown: 211,
    lava: 220,
    bridge: 230,
  },
  hell: {
    floors: [300, 301, 302, 303, 304, 305],
    walls: {
      vertical: 280,
      horizontal: 281,
      cornerNW: 282,
      cornerNE: 283,
      cornerSW: 284,
      cornerSE: 285,
      teeN: 286,
      teeS: 287,
      teeE: 288,
      teeW: 289,
      cross: 290,
      pillar: 291,
    },
    stairsUp: 310,
    stairsDown: 311,
    pentagram: 320,
  },
};

// Special markers in binary grids
const BINARY_MARKERS = {
  FLOOR: 0,
  WALL: 1,
  STAIRS_UP: 2,
  STAIRS_DOWN: 3,
  DOOR: 4,
  PILLAR: 5,
};

/**
 * Convert binary grid to proper tile IDs
 * @param {number[][]} binaryGrid - Grid with 0=floor, 1=wall, 2=stairs up, 3=stairs down
 * @param {string} theme - Theme name (cathedral, catacombs, caves, hell)
 * @param {Object} options - Optional settings
 * @returns {number[][]} Grid with proper Diablo tile IDs
 */
export function convertToTileGrid(binaryGrid, theme = 'cathedral', options = {}) {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const height = binaryGrid.length;
  const width = binaryGrid[0]?.length || 0;

  if (height === 0 || width === 0) {
    console.error('[TileMapper] Invalid grid dimensions');
    return [];
  }

  const tileGrid = [];

  for (let y = 0; y < height; y++) {
    tileGrid[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = binaryGrid[y][x];
      tileGrid[y][x] = convertCell(binaryGrid, x, y, cell, tiles, options);
    }
  }

  return tileGrid;
}

/**
 * Convert a single cell to proper tile ID
 */
function convertCell(grid, x, y, cell, tiles, options) {
  switch (cell) {
    case BINARY_MARKERS.FLOOR:
      return getFloorTile(tiles, x, y, options);

    case BINARY_MARKERS.WALL:
      return getWallTile(grid, x, y, tiles);

    case BINARY_MARKERS.STAIRS_UP:
      return tiles.stairsUp;

    case BINARY_MARKERS.STAIRS_DOWN:
      return tiles.stairsDown;

    case BINARY_MARKERS.DOOR:
      return tiles.door || tiles.walls.horizontal;

    case BINARY_MARKERS.PILLAR:
      return tiles.pillar || tiles.walls.pillar;

    default:
      // Treat unknown values as floor
      return getFloorTile(tiles, x, y, options);
  }
}

/**
 * Get a floor tile (with variety)
 */
function getFloorTile(tiles, x, y, options = {}) {
  if (!tiles.floors || tiles.floors.length === 0) {
    return 13; // Default cathedral floor
  }

  if (options.uniformFloors) {
    return tiles.floors[0];
  }

  // Use position-based pseudo-random for consistency
  const hash = (x * 31 + y * 17) % tiles.floors.length;
  return tiles.floors[hash];
}

/**
 * Get wall tile based on neighboring walls
 */
function getWallTile(grid, x, y, tiles) {
  const height = grid.length;
  const width = grid[0].length;

  // Check neighbors (treating out-of-bounds as walls)
  const n = y > 0 ? isWall(grid[y - 1][x]) : true;
  const s = y < height - 1 ? isWall(grid[y + 1][x]) : true;
  const e = x < width - 1 ? isWall(grid[y][x + 1]) : true;
  const w = x > 0 ? isWall(grid[y][x - 1]) : true;

  // Determine wall orientation based on neighbors
  const wallType = getWallType(n, s, e, w);

  return tiles.walls[wallType] || tiles.walls.pillar;
}

/**
 * Check if a cell is a wall
 */
function isWall(cell) {
  return cell === BINARY_MARKERS.WALL;
}

/**
 * Determine wall type based on NSEW neighbors
 */
function getWallType(n, s, e, w) {
  const count = [n, s, e, w].filter(Boolean).length;

  if (count === 4) {
    // All sides are walls - cross or solid
    return 'cross';
  }

  if (count === 3) {
    // Three walls - tee junction
    if (!n) return 'teeN';
    if (!s) return 'teeS';
    if (!e) return 'teeE';
    if (!w) return 'teeW';
  }

  if (count === 2) {
    // Two walls - corner or straight
    if (n && s) return 'vertical';
    if (e && w) return 'horizontal';
    if (n && e) return 'cornerSW';  // Wall comes from N and E, open SW
    if (n && w) return 'cornerSE';  // Wall comes from N and W, open SE
    if (s && e) return 'cornerNW';  // Wall comes from S and E, open NW
    if (s && w) return 'cornerNE';  // Wall comes from S and W, open NE
  }

  if (count === 1) {
    // Single wall connection - end piece
    if (n) return 'vertical';
    if (s) return 'vertical';
    if (e) return 'horizontal';
    if (w) return 'horizontal';
  }

  // Isolated wall - pillar
  return 'pillar';
}

/**
 * Place stairs in a grid
 * @param {number[][]} tileGrid - Tile grid (modified in place)
 * @param {Object} upPos - {x, y} for stairs up
 * @param {Object} downPos - {x, y} for stairs down
 * @param {string} theme - Theme name
 */
export function placeStairs(tileGrid, upPos, downPos, theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;

  if (upPos && isValidPos(tileGrid, upPos.x, upPos.y)) {
    tileGrid[upPos.y][upPos.x] = tiles.stairsUp;
  }

  if (downPos && isValidPos(tileGrid, downPos.x, downPos.y)) {
    tileGrid[downPos.y][downPos.x] = tiles.stairsDown;
  }
}

/**
 * Place doors in a grid
 * @param {number[][]} tileGrid - Tile grid (modified in place)
 * @param {Array<{x, y}>} positions - Door positions
 * @param {string} theme - Theme name
 */
export function placeDoors(tileGrid, positions, theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;

  for (const pos of positions) {
    if (isValidPos(tileGrid, pos.x, pos.y)) {
      tileGrid[pos.y][pos.x] = tiles.door;
    }
  }
}

/**
 * Check if position is valid in grid
 */
function isValidPos(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

/**
 * Get theme for a dungeon level
 * @param {number} level - Dungeon level (1-16)
 * @returns {string} Theme name
 */
export function getThemeForLevel(level) {
  if (level <= 4) return 'cathedral';
  if (level <= 8) return 'catacombs';
  if (level <= 12) return 'caves';
  return 'hell';
}

/**
 * Expand a small grid to 40x40 for Diablo
 * @param {number[][]} smallGrid - Smaller grid (e.g., 20x20)
 * @param {number} targetSize - Target size (default 40)
 * @returns {number[][]} Expanded grid
 */
export function expandGrid(smallGrid, targetSize = 40) {
  const srcHeight = smallGrid.length;
  const srcWidth = smallGrid[0]?.length || 0;

  if (srcHeight === 0 || srcWidth === 0) {
    return [];
  }

  const scaleY = targetSize / srcHeight;
  const scaleX = targetSize / srcWidth;

  const result = [];

  for (let y = 0; y < targetSize; y++) {
    result[y] = [];
    const srcY = Math.min(Math.floor(y / scaleY), srcHeight - 1);

    for (let x = 0; x < targetSize; x++) {
      const srcX = Math.min(Math.floor(x / scaleX), srcWidth - 1);
      result[y][x] = smallGrid[srcY][srcX];
    }
  }

  return result;
}

/**
 * Create a simple test level
 * @param {string} theme - Theme name
 * @returns {number[][]} 40x40 tile grid
 */
export function createTestLevel(theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const grid = [];

  for (let y = 0; y < 40; y++) {
    grid[y] = [];
    for (let x = 0; x < 40; x++) {
      // Border walls
      if (x === 0 || x === 39 || y === 0 || y === 39) {
        grid[y][x] = tiles.walls.vertical;
      }
      // Interior floor
      else {
        grid[y][x] = getFloorTile(tiles, x, y);
      }
    }
  }

  // Place stairs
  grid[5][5] = tiles.stairsUp;
  grid[34][34] = tiles.stairsDown;

  // Add some interior walls for interest
  for (let i = 10; i < 30; i++) {
    grid[20][i] = tiles.walls.horizontal;
  }
  grid[20][20] = tiles.door; // Door in wall

  return grid;
}

/**
 * Visualize a tile grid as ASCII
 * @param {number[][]} grid - Tile grid
 * @param {string} theme - Theme name
 * @returns {string} ASCII representation
 */
export function visualizeGrid(grid, theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const lines = [];

  for (let y = 0; y < grid.length; y++) {
    let line = '';
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];

      if (tiles.floors.includes(tile)) {
        line += '.';
      } else if (tile === tiles.stairsUp) {
        line += '<';
      } else if (tile === tiles.stairsDown) {
        line += '>';
      } else if (tile === tiles.door || tile === tiles.doorOpen) {
        line += '+';
      } else if (Object.values(tiles.walls).includes(tile)) {
        line += '#';
      } else {
        line += '?';
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

// Export constants
export { TILE_SETS, BINARY_MARKERS };

// Default export
const TileMapper = {
  convertToTileGrid,
  placeStairs,
  placeDoors,
  getThemeForLevel,
  expandGrid,
  createTestLevel,
  visualizeGrid,
  TILE_SETS,
  BINARY_MARKERS,
};

export default TileMapper;
