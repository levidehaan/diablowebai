/**
 * Campaign Converter
 *
 * Converts AI-generated campaign JSON to proper DUN level files.
 * This is the critical pipeline that bridges AI output to playable game content.
 *
 * Campaign JSON structure:
 * {
 *   name: "Campaign Name",
 *   acts: [{
 *     name: "Act 1",
 *     levels: [{
 *       name: "Level 1",
 *       grid: [[0,1,1], [0,0,0], ...],  // Binary grid
 *       spawns: [{x, y, type, difficulty}],
 *       stairsUp: {x, y},
 *       stairsDown: {x, y}
 *     }]
 *   }]
 * }
 */

import DUNParser from './DUNParser';
import TileMapper, { TILE_SETS, BINARY_MARKERS, getThemeForLevel } from './TileMapper';
import MonsterMapper from './MonsterMapper';
import { validateLevel, checkPath, analyzeAreas } from './LevelValidator';

/**
 * Diablo Level Path Mapping
 *
 * IMPORTANT: Diablo's main dungeon levels (floors 1-16) are PROCEDURALLY GENERATED
 * at runtime - they don't load from DUN files. DUN files are only used for:
 * - Quest set pieces (Skeleton King's lair, Halls of the Blind, etc.)
 * - Random room templates used by the procedural generator
 * - Town sectors
 *
 * To get AI content into the game, we replace these quest areas.
 *
 * Actual DUN files in spawn.mpq (verified from ListFile.txt):
 * - levels\l1data\: banner1/2, hero1/2, lv1mazea/b, rnd1-6, sklkng series, vile1/2
 * - levels\l2data\: blind1/2, blood1-3, bonecha1/2, bonestr1/2
 * - levels\l3data\: anvil, foulwatr, lair
 * - levels\l4data\: diab1-4, vile1-3, warlord/2
 * - levels\towndata\: sector1s-4s
 */
export const GAME_LEVEL_PATHS = {
  // Cathedral (dlvl 1-4) quest areas - actual MPQ paths
  cathedral: {
    // Skeleton King's Lair - dlvl 3 quest
    skeleton_king: 'levels\\l1data\\sklkng.dun',
    skeleton_king_1: 'levels\\l1data\\sklkng1.dun',
    skeleton_king_2: 'levels\\l1data\\sklkng2.dun',
    skeleton_king_door: 'levels\\l1data\\sklkngdr.dun',
    skeleton_king_closed: 'levels\\l1data\\skngdc.dun',
    skeleton_king_open: 'levels\\l1data\\skngdo.dun',
    // Maze templates
    maze_a: 'levels\\l1data\\lv1mazea.dun',
    maze_b: 'levels\\l1data\\lv1mazeb.dun',
    // Random room templates (used by procedural generator)
    rnd1: 'levels\\l1data\\rnd1.dun',
    rnd2: 'levels\\l1data\\rnd2.dun',
    rnd3: 'levels\\l1data\\rnd3.dun',
    rnd4: 'levels\\l1data\\rnd4.dun',
    rnd5: 'levels\\l1data\\rnd5.dun',
    rnd6: 'levels\\l1data\\rnd6.dun',
    // Hero quest rooms
    hero1: 'levels\\l1data\\hero1.dun',
    hero2: 'levels\\l1data\\hero2.dun',
    // Ogden's Sign/Banner quest
    banner1: 'levels\\l1data\\banner1.dun',
    banner2: 'levels\\l1data\\banner2.dun',
    // Archbishop Lazarus/Vile quest
    vile1: 'levels\\l1data\\vile1.dun',
    vile2: 'levels\\l1data\\vile2.dun',
  },

  // Catacombs (dlvl 5-8) quest areas
  catacombs: {
    // Halls of the Blind - dlvl 7 quest
    blind1: 'levels\\l2data\\blind1.dun',
    blind2: 'levels\\l2data\\blind2.dun',
    // Valor/Blood quest
    blood1: 'levels\\l2data\\blood1.dun',
    blood2: 'levels\\l2data\\blood2.dun',
    blood3: 'levels\\l2data\\blood3.dun',
    // Bone Chamber
    bonecha1: 'levels\\l2data\\bonecha1.dun',
    bonecha2: 'levels\\l2data\\bonecha2.dun',
    // Bone structures
    bonestr1: 'levels\\l2data\\bonestr1.dun',
    bonestr2: 'levels\\l2data\\bonestr2.dun',
  },

  // Caves (dlvl 9-12) quest areas
  caves: {
    // Anvil of Fury quest
    anvil: 'levels\\l3data\\anvil.dun',
    // Poisoned Water Supply
    foulwatr: 'levels\\l3data\\foulwatr.dun',
    // Lazarus Lair
    lair: 'levels\\l3data\\lair.dun',
  },

  // Hell (dlvl 13-16) quest areas
  hell: {
    // Diablo's Lair - dlvl 16
    diab1: 'levels\\l4data\\diab1.dun',
    diab2a: 'levels\\l4data\\diab2a.dun',
    diab2b: 'levels\\l4data\\diab2b.dun',
    diab3a: 'levels\\l4data\\diab3a.dun',
    diab3b: 'levels\\l4data\\diab3b.dun',
    diab4a: 'levels\\l4data\\diab4a.dun',
    diab4b: 'levels\\l4data\\diab4b.dun',
    // Vile quest in Hell
    vile1: 'levels\\l4data\\vile1.dun',
    vile2: 'levels\\l4data\\vile2.dun',
    vile3: 'levels\\l4data\\vile3.dun',
    // Warlord of Blood quest
    warlord: 'levels\\l4data\\warlord.dun',
    warlord2: 'levels\\l4data\\warlord2.dun',
  },

  // Town sectors (used to build Tristram)
  town: {
    sector1s: 'levels\\towndata\\sector1s.dun',
    sector2s: 'levels\\towndata\\sector2s.dun',
    sector3s: 'levels\\towndata\\sector3s.dun',
    sector4s: 'levels\\towndata\\sector4s.dun',
  },
};

/**
 * Get the appropriate game level path for an AI-generated level
 * @param {string} theme - Level theme (cathedral, catacombs, caves, hell)
 * @param {number} levelIndex - Level index in campaign (1-based)
 * @param {string} levelType - Type of level (quest, random, etc.)
 * @returns {string} Path to replace in the MPQ
 */
export function getGameLevelPath(theme, levelIndex = 1, levelType = 'quest') {
  const themePaths = GAME_LEVEL_PATHS[theme] || GAME_LEVEL_PATHS.cathedral;
  const pathKeys = Object.keys(themePaths);

  // Map level index to available paths, cycling if needed
  const pathIndex = (levelIndex - 1) % pathKeys.length;
  const pathKey = pathKeys[pathIndex];

  return themePaths[pathKey];
}

/**
 * Get all available level paths for a theme
 */
export function getAvailableLevelPaths(theme) {
  return GAME_LEVEL_PATHS[theme] || GAME_LEVEL_PATHS.cathedral;
}

/**
 * Convert an entire campaign to DUN files
 * @param {Object} campaign - AI campaign JSON
 * @param {Object} options - Conversion options
 * @returns {Object} Conversion result with DUN files and validation
 */
export function convertCampaign(campaign, options = {}) {
  const results = {
    success: true,
    campaign: campaign.name || 'AI Campaign',
    levels: [],
    errors: [],
    warnings: [],
    files: new Map(), // path -> DUN buffer
  };

  if (!campaign || !campaign.acts) {
    results.success = false;
    results.errors.push('Invalid campaign: missing acts array');
    return results;
  }

  let levelIndex = 1;

  for (let actIndex = 0; actIndex < campaign.acts.length; actIndex++) {
    const act = campaign.acts[actIndex];

    if (!act.levels || !Array.isArray(act.levels)) {
      results.warnings.push(`Act ${actIndex + 1} has no levels`);
      continue;
    }

    for (let lvlIndex = 0; lvlIndex < act.levels.length; lvlIndex++) {
      const level = act.levels[lvlIndex];
      const theme = getThemeForLevel(levelIndex);

      try {
        const converted = convertLevel(level, {
          ...options,
          theme,
          levelIndex,
          actIndex: actIndex + 1,
          levelInAct: lvlIndex + 1,
        });

        results.levels.push({
          name: level.name || `Level ${levelIndex}`,
          path: converted.path,
          valid: converted.validation.valid,
          errors: converted.validation.errors,
          warnings: converted.validation.warnings,
          stats: converted.validation.stats,
        });

        if (!converted.validation.valid) {
          results.errors.push(`Level ${levelIndex}: ${converted.validation.errors.join(', ')}`);
        }
        if (converted.validation.warnings.length > 0) {
          results.warnings.push(`Level ${levelIndex}: ${converted.validation.warnings.join(', ')}`);
        }

        results.files.set(converted.path, converted.buffer);

      } catch (error) {
        results.success = false;
        results.errors.push(`Failed to convert level ${levelIndex}: ${error.message}`);
      }

      levelIndex++;
    }
  }

  return results;
}

/**
 * Convert a single level to DUN format
 * @param {Object} level - Level data from campaign JSON
 * @param {Object} options - Conversion options
 * @returns {Object} DUN data, buffer, and validation
 */
export function convertLevel(level, options = {}) {
  const {
    theme = 'cathedral',
    levelIndex = 1,
    actIndex = 1,
    levelInAct = 1,
    targetWidth = null,
    targetHeight = null,
    validateOutput = true,
  } = options;

  // Get tile set for theme
  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;

  // Build DUN data from level definition
  let dunData;

  if (level.grid && Array.isArray(level.grid)) {
    // Convert binary grid to DUN
    dunData = convertBinaryGrid(level.grid, tiles, options);
  } else if (level.tiles && Array.isArray(level.tiles)) {
    // Level already has tile IDs
    dunData = {
      width: level.tiles[0]?.length || 16,
      height: level.tiles.length,
      baseTiles: level.tiles,
    };
  } else {
    // Generate empty level with border
    const width = targetWidth || level.width || 16;
    const height = targetHeight || level.height || 16;
    dunData = createEmptyLevel(width, height, tiles);
  }

  // Place stairs
  placeStairs(dunData, level, tiles);

  // Add monsters
  if (level.spawns && Array.isArray(level.spawns)) {
    addMonsters(dunData, level.spawns, levelIndex);
  }

  // Add objects/items
  if (level.objects && Array.isArray(level.objects)) {
    addObjects(dunData, level.objects);
  }

  // Validation
  let validation = { valid: true, errors: [], warnings: [], stats: {} };
  if (validateOutput) {
    validation = validateLevel(dunData, theme);

    // Auto-fix critical issues
    if (options.autoFix && !validation.valid) {
      dunData = autoFixLevel(dunData, validation, tiles);
      validation = validateLevel(dunData, theme);
    }
  }

  // Generate path - use actual game level paths for proper loading
  const path = options.path || getGameLevelPath(theme, levelIndex, options.levelType || 'quest');

  // Write to buffer
  const buffer = DUNParser.write(dunData);

  return {
    dunData,
    buffer,
    path,
    validation,
    theme,
    preview: DUNParser.visualize(dunData),
  };
}

/**
 * Convert binary grid (0/1) to proper tile grid
 */
function convertBinaryGrid(binaryGrid, tiles, options = {}) {
  const height = binaryGrid.length;
  const width = binaryGrid[0]?.length || 0;

  // Expand if needed
  let grid = binaryGrid;
  if (options.expandTo) {
    grid = TileMapper.expandGrid(binaryGrid, options.expandTo);
  }

  // Convert to tile IDs
  const tileGrid = TileMapper.convertToTileGrid(grid, options.theme || 'cathedral');

  return {
    width: tileGrid[0]?.length || width,
    height: tileGrid.length || height,
    baseTiles: tileGrid,
  };
}

/**
 * Create empty level with border walls
 */
function createEmptyLevel(width, height, tiles) {
  const baseTiles = [];

  for (let y = 0; y < height; y++) {
    baseTiles[y] = [];
    for (let x = 0; x < width; x++) {
      // Border walls
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        baseTiles[y][x] = tiles.walls.vertical;
      } else {
        // Random floor tile
        const floorIndex = (x * 31 + y * 17) % tiles.floors.length;
        baseTiles[y][x] = tiles.floors[floorIndex];
      }
    }
  }

  return { width, height, baseTiles };
}

/**
 * Place stairs in level
 */
function placeStairs(dunData, level, tiles) {
  const { baseTiles, width, height } = dunData;

  // Find or use provided stairs up position
  let upPos = level.stairsUp || level.entry;
  if (!upPos) {
    // Default: top-left area
    upPos = findFloorNear(baseTiles, 2, 2, tiles);
  }

  // Find or use provided stairs down position
  let downPos = level.stairsDown || level.exit;
  if (!downPos) {
    // Default: bottom-right area
    downPos = findFloorNear(baseTiles, width - 3, height - 3, tiles);
  }

  // Place stairs
  if (upPos && isValidPos(baseTiles, upPos.x, upPos.y)) {
    baseTiles[upPos.y][upPos.x] = tiles.stairsUp;
  }

  if (downPos && isValidPos(baseTiles, downPos.x, downPos.y)) {
    baseTiles[downPos.y][downPos.x] = tiles.stairsDown;
  }
}

/**
 * Find a floor tile near a position
 */
function findFloorNear(baseTiles, targetX, targetY, tiles) {
  const height = baseTiles.length;
  const width = baseTiles[0]?.length || 0;

  // Search in expanding squares
  for (let radius = 0; radius < 10; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = targetX + dx;
        const y = targetY + dy;

        if (x >= 0 && x < width && y >= 0 && y < height) {
          if (tiles.floors.includes(baseTiles[y][x])) {
            return { x, y };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Check if position is valid
 */
function isValidPos(grid, x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0]?.length;
}

/**
 * Add monsters to level
 */
function addMonsters(dunData, spawns, dungeonLevel) {
  if (!spawns || spawns.length === 0) return;

  // Create monster layer at 2x resolution
  const monsterWidth = dunData.width * 2;
  const monsterHeight = dunData.height * 2;

  if (!dunData.monsters) {
    dunData.monsters = [];
    for (let y = 0; y < monsterHeight; y++) {
      dunData.monsters[y] = new Array(monsterWidth).fill(0);
    }
    dunData.hasMonsters = true;
  }

  // Convert AI spawns to monster IDs
  const converted = MonsterMapper.convertPlacements(spawns, dungeonLevel);

  for (const spawn of converted) {
    // Monster coordinates are at 2x tile resolution
    const mx = spawn.x * 2;
    const my = spawn.y * 2;

    if (my >= 0 && my < monsterHeight && mx >= 0 && mx < monsterWidth) {
      dunData.monsters[my][mx] = spawn.monsterId;
    }
  }
}

/**
 * Add objects/items to level
 */
function addObjects(dunData, objects) {
  if (!objects || objects.length === 0) return;

  const objectWidth = dunData.width * 2;
  const objectHeight = dunData.height * 2;

  if (!dunData.objects) {
    dunData.objects = [];
    for (let y = 0; y < objectHeight; y++) {
      dunData.objects[y] = new Array(objectWidth).fill(0);
    }
    dunData.hasObjects = true;
  }

  // Object IDs (simplified)
  const OBJECT_IDS = {
    barrel: 1,
    chest: 2,
    shrine: 3,
    bookcase: 4,
    torch: 5,
    skeleton_corpse: 6,
  };

  for (const obj of objects) {
    const ox = obj.x * 2;
    const oy = obj.y * 2;
    const objId = OBJECT_IDS[obj.type] || 1;

    if (oy >= 0 && oy < objectHeight && ox >= 0 && ox < objectWidth) {
      dunData.objects[oy][ox] = objId;
    }
  }
}

/**
 * Auto-fix critical level issues
 */
function autoFixLevel(dunData, validation, tiles) {
  const { baseTiles, width, height } = dunData;

  // Fix missing stairs
  for (const fix of validation.fixes || []) {
    if (fix.type === 'add_stairs_up' && fix.suggestion) {
      baseTiles[fix.suggestion.y][fix.suggestion.x] = tiles.stairsUp;
    }
    if (fix.type === 'add_stairs_down' && fix.suggestion) {
      baseTiles[fix.suggestion.y][fix.suggestion.x] = tiles.stairsDown;
    }
  }

  // If no path exists, try to create one
  const pathCheck = checkPath(dunData, 'stairs_up', 'stairs_down', getThemeForLevel(1));
  if (!pathCheck.reachable && pathCheck.from && pathCheck.to) {
    // Create a simple corridor between stairs
    createCorridor(baseTiles, pathCheck.from, pathCheck.to, tiles);
  }

  return dunData;
}

/**
 * Create a corridor between two points
 */
function createCorridor(baseTiles, from, to, tiles) {
  const floor = tiles.floors[0];
  let x = from.x;
  let y = from.y;

  // Simple L-shaped corridor
  // Go horizontal first
  while (x !== to.x) {
    if (baseTiles[y] && baseTiles[y][x] !== undefined) {
      if (!tiles.floors.includes(baseTiles[y][x]) &&
          baseTiles[y][x] !== tiles.stairsUp &&
          baseTiles[y][x] !== tiles.stairsDown) {
        baseTiles[y][x] = floor;
      }
    }
    x += (to.x > x) ? 1 : -1;
  }

  // Then go vertical
  while (y !== to.y) {
    if (baseTiles[y] && baseTiles[y][x] !== undefined) {
      if (!tiles.floors.includes(baseTiles[y][x]) &&
          baseTiles[y][x] !== tiles.stairsUp &&
          baseTiles[y][x] !== tiles.stairsDown) {
        baseTiles[y][x] = floor;
      }
    }
    y += (to.y > y) ? 1 : -1;
  }
}

/**
 * Generate DUN files for testing
 * @param {number} count - Number of test levels
 * @param {string} theme - Theme name
 * @returns {Map} path -> buffer map
 */
export function generateTestLevels(count = 4, theme = 'cathedral') {
  const files = new Map();

  for (let i = 1; i <= count; i++) {
    const level = {
      name: `Test Level ${i}`,
      grid: generateSimpleGrid(16, 16),
      spawns: [
        { x: 5, y: 5, type: 'skeleton' },
        { x: 10, y: 5, type: 'zombie' },
        { x: 5, y: 10, type: 'fallen' },
      ],
    };

    const result = convertLevel(level, {
      theme,
      levelIndex: i,
      actIndex: 1,
      levelInAct: i,
    });

    files.set(result.path, result.buffer);
  }

  return files;
}

/**
 * Generate simple binary grid
 */
function generateSimpleGrid(width, height) {
  const grid = [];

  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      // Border walls
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        grid[y][x] = BINARY_MARKERS.WALL;
      }
      // Random interior walls (sparse)
      else if (Math.random() < 0.1) {
        grid[y][x] = BINARY_MARKERS.WALL;
      }
      // Floor
      else {
        grid[y][x] = BINARY_MARKERS.FLOOR;
      }
    }
  }

  // Ensure corners have floor space for stairs
  grid[2][2] = BINARY_MARKERS.FLOOR;
  grid[2][3] = BINARY_MARKERS.FLOOR;
  grid[3][2] = BINARY_MARKERS.FLOOR;

  grid[height - 3][width - 3] = BINARY_MARKERS.FLOOR;
  grid[height - 3][width - 4] = BINARY_MARKERS.FLOOR;
  grid[height - 4][width - 3] = BINARY_MARKERS.FLOOR;

  return grid;
}

/**
 * Quick validation report for AI agent
 * @param {Object} dunData - Parsed DUN data
 * @param {string} theme - Theme name
 * @returns {string} Human-readable report
 */
export function getValidationReport(dunData, theme = 'cathedral') {
  const validation = validateLevel(dunData, theme);
  const areas = analyzeAreas(dunData, theme);

  let report = `=== Level Validation Report ===\n`;
  report += `Status: ${validation.valid ? 'VALID' : 'INVALID'}\n`;
  report += `Size: ${validation.stats.width}x${validation.stats.height}\n`;
  report += `Walkable: ${validation.stats.walkablePercent}%\n`;
  report += `Floors: ${validation.stats.floorCount}, Walls: ${validation.stats.wallCount}\n`;
  report += `Stairs: Up=${validation.stats.stairsUp}, Down=${validation.stats.stairsDown}\n`;
  report += `Monsters: ${validation.stats.monsterCount}\n`;
  report += `Areas: ${areas.totalAreas} (${areas.unreachableCount} unreachable tiles)\n`;

  if (validation.errors.length > 0) {
    report += `\nErrors:\n`;
    validation.errors.forEach(e => report += `  - ${e}\n`);
  }

  if (validation.warnings.length > 0) {
    report += `\nWarnings:\n`;
    validation.warnings.forEach(w => report += `  - ${w}\n`);
  }

  return report;
}

// Default export
const CampaignConverter = {
  convertCampaign,
  convertLevel,
  generateTestLevels,
  getValidationReport,
};

export default CampaignConverter;
