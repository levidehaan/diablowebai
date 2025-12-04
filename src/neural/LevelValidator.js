/**
 * Level Validator
 *
 * Validates DUN level files before export to ensure they will work in-game.
 * Checks for structural issues, pathfinding, and required elements.
 *
 * This is a critical tool for the AI agent to verify levels before export.
 */

import { TILE_SETS, BINARY_MARKERS } from './TileMapper';

// Validation result types
export const VALIDATION_STATUS = {
  VALID: 'valid',
  WARNING: 'warning',
  ERROR: 'error',
};

/**
 * Validate a DUN level structure
 * @param {Object} dunData - Parsed DUN data with baseTiles, monsters, etc.
 * @param {string} theme - Level theme (cathedral, catacombs, caves, hell)
 * @returns {Object} Validation result with errors, warnings, and fixes
 */
export function validateLevel(dunData, theme = 'cathedral') {
  const errors = [];
  const warnings = [];
  const fixes = [];

  if (!dunData || !dunData.baseTiles) {
    return {
      valid: false,
      status: VALIDATION_STATUS.ERROR,
      errors: ['Invalid DUN data: missing baseTiles'],
      warnings: [],
      fixes: [],
    };
  }

  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const { baseTiles, width, height, monsters } = dunData;

  // 1. Check dimensions
  const dimResult = validateDimensions(width, height);
  if (dimResult.error) errors.push(dimResult.error);
  if (dimResult.warning) warnings.push(dimResult.warning);

  // 2. Check for stairs
  const stairsResult = validateStairs(baseTiles, tiles);
  errors.push(...stairsResult.errors);
  warnings.push(...stairsResult.warnings);
  fixes.push(...stairsResult.fixes);

  // 3. Check entry point accessibility
  const entryResult = validateEntryAccess(baseTiles, tiles);
  errors.push(...entryResult.errors);
  warnings.push(...entryResult.warnings);

  // 4. Check pathfinding from entry to exit
  const pathResult = validatePathToExit(baseTiles, tiles);
  errors.push(...pathResult.errors);
  warnings.push(...pathResult.warnings);

  // 5. Validate tile IDs
  const tileResult = validateTileIDs(baseTiles, tiles);
  errors.push(...tileResult.errors);
  warnings.push(...tileResult.warnings);

  // 6. Check monster spawns
  if (monsters && dunData.hasMonsters) {
    const monsterResult = validateMonsterSpawns(monsters, baseTiles, tiles);
    errors.push(...monsterResult.errors);
    warnings.push(...monsterResult.warnings);
  } else {
    warnings.push('Level has no monster spawns');
  }

  // 7. Check border integrity
  const borderResult = validateBorder(baseTiles, tiles);
  errors.push(...borderResult.errors);
  warnings.push(...borderResult.warnings);

  // Determine overall status
  const valid = errors.length === 0;
  let status = VALIDATION_STATUS.VALID;
  if (warnings.length > 0) status = VALIDATION_STATUS.WARNING;
  if (errors.length > 0) status = VALIDATION_STATUS.ERROR;

  return {
    valid,
    status,
    errors,
    warnings,
    fixes,
    stats: getValidationStats(baseTiles, monsters, tiles),
  };
}

/**
 * Validate level dimensions
 */
function validateDimensions(width, height) {
  const result = { error: null, warning: null };

  if (width < 8 || height < 8) {
    result.error = `Level too small: ${width}x${height} (minimum 8x8)`;
  } else if (width < 16 || height < 16) {
    result.warning = `Level may be too small: ${width}x${height} (recommended 16x16+)`;
  }

  if (width > 112 || height > 112) {
    result.error = `Level too large: ${width}x${height} (maximum 112x112)`;
  }

  return result;
}

/**
 * Validate stairs exist and are accessible
 */
function validateStairs(baseTiles, tiles) {
  const result = { errors: [], warnings: [], fixes: [] };

  let stairsUpPos = null;
  let stairsDownPos = null;

  // Find stairs positions
  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      const tile = baseTiles[y][x];
      if (tile === tiles.stairsUp) {
        stairsUpPos = { x, y };
      } else if (tile === tiles.stairsDown) {
        stairsDownPos = { x, y };
      }
    }
  }

  if (!stairsUpPos) {
    result.errors.push('No stairs up (entry point) found');
    result.fixes.push({
      type: 'add_stairs_up',
      suggestion: findGoodStairsPosition(baseTiles, tiles, 'up'),
    });
  }

  if (!stairsDownPos) {
    result.errors.push('No stairs down (exit point) found');
    result.fixes.push({
      type: 'add_stairs_down',
      suggestion: findGoodStairsPosition(baseTiles, tiles, 'down'),
    });
  }

  return result;
}

/**
 * Find a good position for stairs
 */
function findGoodStairsPosition(baseTiles, tiles, type) {
  const height = baseTiles.length;
  const width = baseTiles[0]?.length || 0;

  // Look for floor tiles near corners
  const searchAreas = type === 'up'
    ? [{ x: 2, y: 2 }, { x: 2, y: 5 }, { x: 5, y: 2 }]
    : [{ x: width - 3, y: height - 3 }, { x: width - 3, y: height - 6 }];

  for (const area of searchAreas) {
    const { x, y } = area;
    if (y >= 0 && y < height && x >= 0 && x < width) {
      if (isFloorTile(baseTiles[y][x], tiles)) {
        return { x, y };
      }
    }
  }

  // Find any floor tile
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (isFloorTile(baseTiles[y][x], tiles)) {
        return { x, y };
      }
    }
  }

  return null;
}

/**
 * Check if tile is a floor
 */
function isFloorTile(tile, tiles) {
  return tiles.floors && tiles.floors.includes(tile);
}

/**
 * Check if tile is a wall
 */
function isWallTile(tile, tiles) {
  if (!tiles.walls) return false;
  return Object.values(tiles.walls).includes(tile);
}

/**
 * Check if tile is walkable
 */
function isWalkable(tile, tiles) {
  // Floors, stairs, and doors are walkable
  return isFloorTile(tile, tiles) ||
         tile === tiles.stairsUp ||
         tile === tiles.stairsDown ||
         tile === tiles.door ||
         tile === tiles.doorOpen;
}

/**
 * Validate entry point (stairs up) is accessible
 */
function validateEntryAccess(baseTiles, tiles) {
  const result = { errors: [], warnings: [] };

  // Find stairs up
  let stairsUpPos = null;
  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      if (baseTiles[y][x] === tiles.stairsUp) {
        stairsUpPos = { x, y };
        break;
      }
    }
    if (stairsUpPos) break;
  }

  if (!stairsUpPos) return result; // Already reported in stairs validation

  // Check if surrounded by walls
  const { x, y } = stairsUpPos;
  const height = baseTiles.length;
  const width = baseTiles[0].length;

  let blockedCount = 0;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;

    if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
      blockedCount++;
    } else if (!isWalkable(baseTiles[ny][nx], tiles)) {
      blockedCount++;
    }
  }

  if (blockedCount === 4) {
    result.errors.push(`Entry point (stairs up) at (${x},${y}) is completely surrounded by walls`);
  } else if (blockedCount === 3) {
    result.warnings.push(`Entry point (stairs up) at (${x},${y}) has only one exit`);
  }

  return result;
}

/**
 * Validate path exists from entry to exit using BFS
 */
function validatePathToExit(baseTiles, tiles) {
  const result = { errors: [], warnings: [] };

  // Find stairs positions
  let stairsUpPos = null;
  let stairsDownPos = null;

  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      const tile = baseTiles[y][x];
      if (tile === tiles.stairsUp) stairsUpPos = { x, y };
      if (tile === tiles.stairsDown) stairsDownPos = { x, y };
    }
  }

  if (!stairsUpPos || !stairsDownPos) return result; // Already reported

  // BFS pathfinding
  const path = findPath(baseTiles, stairsUpPos, stairsDownPos, tiles);

  if (!path) {
    result.errors.push(`No path found from entry (${stairsUpPos.x},${stairsUpPos.y}) to exit (${stairsDownPos.x},${stairsDownPos.y})`);
  } else if (path.length > (baseTiles.length + baseTiles[0].length) * 2) {
    result.warnings.push(`Path from entry to exit is very long (${path.length} tiles)`);
  }

  return result;
}

/**
 * Simple BFS pathfinding
 */
function findPath(baseTiles, start, end, tiles) {
  const height = baseTiles.length;
  const width = baseTiles[0].length;
  const visited = new Set();
  const queue = [[start, [start]]];

  const key = (p) => `${p.x},${p.y}`;
  visited.add(key(start));

  while (queue.length > 0) {
    const [current, path] = queue.shift();

    if (current.x === end.x && current.y === end.y) {
      return path;
    }

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const next = { x: nx, y: ny };
      const k = key(next);

      if (nx >= 0 && nx < width && ny >= 0 && ny < height &&
          !visited.has(k) && isWalkable(baseTiles[ny][nx], tiles)) {
        visited.add(k);
        queue.push([next, [...path, next]]);
      }
    }
  }

  return null; // No path found
}

/**
 * Validate all tile IDs are valid for theme
 */
function validateTileIDs(baseTiles, tiles) {
  const result = { errors: [], warnings: [] };

  // Build set of valid tile IDs
  const validTiles = new Set();

  // Add floors
  if (tiles.floors) {
    tiles.floors.forEach(t => validTiles.add(t));
  }

  // Add walls
  if (tiles.walls) {
    Object.values(tiles.walls).forEach(t => validTiles.add(t));
  }

  // Add special tiles
  if (tiles.stairsUp) validTiles.add(tiles.stairsUp);
  if (tiles.stairsDown) validTiles.add(tiles.stairsDown);
  if (tiles.door) validTiles.add(tiles.door);
  if (tiles.doorOpen) validTiles.add(tiles.doorOpen);
  if (tiles.pillar) validTiles.add(tiles.pillar);
  if (tiles.arch) validTiles.add(tiles.arch);
  if (tiles.altar) validTiles.add(tiles.altar);
  if (tiles.lava) validTiles.add(tiles.lava);
  if (tiles.bridge) validTiles.add(tiles.bridge);
  if (tiles.pentagram) validTiles.add(tiles.pentagram);

  // Also allow 0 as default tile
  validTiles.add(0);

  const invalidTiles = new Map();

  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      const tile = baseTiles[y][x];
      if (!validTiles.has(tile)) {
        if (!invalidTiles.has(tile)) {
          invalidTiles.set(tile, []);
        }
        invalidTiles.get(tile).push({ x, y });
      }
    }
  }

  if (invalidTiles.size > 0) {
    for (const [tile, positions] of invalidTiles) {
      if (positions.length > 10) {
        result.warnings.push(`Unknown tile ID ${tile} found at ${positions.length} positions`);
      } else {
        result.warnings.push(`Unknown tile ID ${tile} at positions: ${positions.map(p => `(${p.x},${p.y})`).join(', ')}`);
      }
    }
  }

  return result;
}

/**
 * Validate monster spawns are on valid tiles
 */
function validateMonsterSpawns(monsters, baseTiles, tiles) {
  const result = { errors: [], warnings: [] };

  if (!monsters || !Array.isArray(monsters)) return result;

  let totalMonsters = 0;
  let invalidSpawns = [];

  // Monsters are at 2x resolution
  for (let my = 0; my < monsters.length; my++) {
    for (let mx = 0; mx < monsters[my].length; mx++) {
      const monsterId = monsters[my][mx];
      if (monsterId > 0) {
        totalMonsters++;

        // Convert to base tile coordinates
        const tx = Math.floor(mx / 2);
        const ty = Math.floor(my / 2);

        if (ty < baseTiles.length && tx < baseTiles[ty].length) {
          const tile = baseTiles[ty][tx];
          if (!isWalkable(tile, tiles)) {
            invalidSpawns.push({ x: mx, y: my, monsterId, tile });
          }
        }
      }
    }
  }

  if (invalidSpawns.length > 0) {
    result.errors.push(`${invalidSpawns.length} monster(s) placed on non-walkable tiles`);
    if (invalidSpawns.length <= 5) {
      for (const spawn of invalidSpawns) {
        result.errors.push(`  Monster ${spawn.monsterId} at (${spawn.x},${spawn.y}) on tile ${spawn.tile}`);
      }
    }
  }

  if (totalMonsters === 0) {
    result.warnings.push('Level has monster layer but no monsters');
  } else if (totalMonsters > 100) {
    result.warnings.push(`Level has very high monster count: ${totalMonsters}`);
  }

  return result;
}

/**
 * Validate level has proper border
 */
function validateBorder(baseTiles, tiles) {
  const result = { errors: [], warnings: [] };

  const height = baseTiles.length;
  const width = baseTiles[0]?.length || 0;

  if (height < 4 || width < 4) return result;

  let openBorderCount = 0;

  // Check top and bottom rows
  for (let x = 0; x < width; x++) {
    if (isWalkable(baseTiles[0][x], tiles)) openBorderCount++;
    if (isWalkable(baseTiles[height - 1][x], tiles)) openBorderCount++;
  }

  // Check left and right columns
  for (let y = 1; y < height - 1; y++) {
    if (isWalkable(baseTiles[y][0], tiles)) openBorderCount++;
    if (isWalkable(baseTiles[y][width - 1], tiles)) openBorderCount++;
  }

  if (openBorderCount > 0) {
    result.warnings.push(`Level border has ${openBorderCount} walkable tiles (may cause issues)`);
  }

  return result;
}

/**
 * Get validation statistics
 */
function getValidationStats(baseTiles, monsters, tiles) {
  let floorCount = 0;
  let wallCount = 0;
  let stairsUp = 0;
  let stairsDown = 0;
  let doors = 0;
  let monsterCount = 0;

  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      const tile = baseTiles[y][x];

      if (isFloorTile(tile, tiles)) floorCount++;
      else if (isWallTile(tile, tiles)) wallCount++;
      if (tile === tiles.stairsUp) stairsUp++;
      if (tile === tiles.stairsDown) stairsDown++;
      if (tile === tiles.door || tile === tiles.doorOpen) doors++;
    }
  }

  if (monsters) {
    for (let y = 0; y < monsters.length; y++) {
      for (let x = 0; x < monsters[y].length; x++) {
        if (monsters[y][x] > 0) monsterCount++;
      }
    }
  }

  return {
    width: baseTiles[0]?.length || 0,
    height: baseTiles.length,
    floorCount,
    wallCount,
    stairsUp,
    stairsDown,
    doors,
    monsterCount,
    walkablePercent: Math.round((floorCount / (floorCount + wallCount)) * 100) || 0,
  };
}

/**
 * Check if a path exists between two points
 * @param {Object} dunData - Parsed DUN data
 * @param {Object} from - {x, y} or 'stairs_up'
 * @param {Object} to - {x, y} or 'stairs_down'
 * @param {string} theme - Level theme
 * @returns {Object} Path check result
 */
export function checkPath(dunData, from, to, theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const { baseTiles } = dunData;

  // Resolve special position names
  let fromPos = from;
  let toPos = to;

  if (from === 'stairs_up' || from === 'entry') {
    fromPos = findTilePosition(baseTiles, tiles.stairsUp);
  }
  if (to === 'stairs_down' || to === 'exit') {
    toPos = findTilePosition(baseTiles, tiles.stairsDown);
  }

  if (!fromPos) {
    return { reachable: false, error: 'Start position not found' };
  }
  if (!toPos) {
    return { reachable: false, error: 'End position not found' };
  }

  const path = findPath(baseTiles, fromPos, toPos, tiles);

  return {
    reachable: path !== null,
    path: path,
    length: path ? path.length : 0,
    from: fromPos,
    to: toPos,
  };
}

/**
 * Find position of a specific tile
 */
function findTilePosition(baseTiles, tileId) {
  for (let y = 0; y < baseTiles.length; y++) {
    for (let x = 0; x < baseTiles[y].length; x++) {
      if (baseTiles[y][x] === tileId) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Find all unreachable areas in a level
 * @param {Object} dunData - Parsed DUN data
 * @param {string} theme - Level theme
 * @returns {Object} Areas analysis
 */
export function analyzeAreas(dunData, theme = 'cathedral') {
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const { baseTiles } = dunData;
  const height = baseTiles.length;
  const width = baseTiles[0]?.length || 0;

  const visited = new Set();
  const areas = [];

  const key = (x, y) => `${x},${y}`;

  // Find all connected areas using flood fill
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!visited.has(key(x, y)) && isWalkable(baseTiles[y][x], tiles)) {
        const area = floodFill(baseTiles, x, y, tiles, visited);
        areas.push(area);
      }
    }
  }

  // Find which area contains stairs
  let mainAreaIndex = -1;
  const stairsUpPos = findTilePosition(baseTiles, tiles.stairsUp);

  if (stairsUpPos) {
    for (let i = 0; i < areas.length; i++) {
      if (areas[i].positions.some(p => p.x === stairsUpPos.x && p.y === stairsUpPos.y)) {
        mainAreaIndex = i;
        break;
      }
    }
  }

  return {
    totalAreas: areas.length,
    mainAreaIndex,
    areas: areas.map((area, i) => ({
      index: i,
      isMain: i === mainAreaIndex,
      size: area.positions.length,
      hasStairsUp: area.hasStairsUp,
      hasStairsDown: area.hasStairsDown,
      bounds: area.bounds,
    })),
    unreachableCount: areas.length > 1
      ? areas.filter((_, i) => i !== mainAreaIndex).reduce((sum, a) => sum + a.positions.length, 0)
      : 0,
  };
}

/**
 * Flood fill to find connected area
 */
function floodFill(baseTiles, startX, startY, tiles, visited) {
  const height = baseTiles.length;
  const width = baseTiles[0].length;
  const positions = [];
  const queue = [{ x: startX, y: startY }];

  let minX = startX, maxX = startX, minY = startY, maxY = startY;
  let hasStairsUp = false;
  let hasStairsDown = false;

  const key = (x, y) => `${x},${y}`;

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    const k = key(x, y);

    if (visited.has(k)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (!isWalkable(baseTiles[y][x], tiles)) continue;

    visited.add(k);
    positions.push({ x, y });

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    if (baseTiles[y][x] === tiles.stairsUp) hasStairsUp = true;
    if (baseTiles[y][x] === tiles.stairsDown) hasStairsDown = true;

    queue.push({ x: x - 1, y });
    queue.push({ x: x + 1, y });
    queue.push({ x, y: y - 1 });
    queue.push({ x, y: y + 1 });
  }

  return {
    positions,
    hasStairsUp,
    hasStairsDown,
    bounds: { minX, maxX, minY, maxY },
  };
}

// Default export
const LevelValidator = {
  validateLevel,
  checkPath,
  analyzeAreas,
  VALIDATION_STATUS,
};

export default LevelValidator;
