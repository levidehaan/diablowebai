/**
 * Monster Mapper
 *
 * Maps AI enemy type names to Diablo WASM monster IDs.
 * Handles spawn level restrictions and monster difficulty scaling.
 * Integrates with DungeonConfig for customizable monster pools.
 *
 * Monster IDs from devilution source (monstdat.cpp)
 */

// Import DungeonConfig for customization (lazy import to avoid circular deps)
let dungeonConfigInstance = null;
function getDungeonConfig() {
  if (!dungeonConfigInstance) {
    try {
      const { default: config } = require('./DungeonConfig');
      dungeonConfigInstance = config;
    } catch (e) {
      // DungeonConfig not available, use defaults
      return null;
    }
  }
  return dungeonConfigInstance;
}

// Monster type IDs by category
const MONSTER_IDS = {
  // Zombies (Cathedral common)
  ZOMBIE: 1,
  GHOUL: 2,
  ROTTING_CARCASS: 3,
  BLACK_DEATH: 4,

  // Fallen ones (Cathedral)
  FALLEN_ONE: 17,
  CARVER: 18,
  DEVIL_KIN: 19,
  DARK_ONE: 20,

  // Skeletons (All areas)
  SKELETON: 33,
  CORPSE_AXE: 34,
  BURNING_DEAD: 35,
  HORROR: 36,

  // Skeleton Archers
  SKELETON_ARCHER: 37,
  CORPSE_BOW: 38,
  BURNING_DEAD_ARCHER: 39,
  HORROR_ARCHER: 40,

  // Scavengers (Cathedral/Catacombs)
  SCAVENGER: 49,
  PLAGUE_EATER: 50,
  SHADOW_BEAST: 51,
  BONE_GASHER: 52,

  // Bats (Caves/Hell)
  FIEND: 65,
  BLINK: 66,
  GLOOM: 67,
  FAMILIAR: 68,

  // Goat Men (Catacombs/Caves)
  FLESH_CLAN: 81,
  STONE_CLAN: 82,
  FIRE_CLAN: 83,
  NIGHT_CLAN: 84,

  // Goat Archers
  FLESH_CLAN_ARCHER: 85,
  STONE_CLAN_ARCHER: 86,
  FIRE_CLAN_ARCHER: 87,
  NIGHT_CLAN_ARCHER: 88,

  // Demons (Hell)
  HIDDEN: 97,
  STALKER: 98,
  UNSEEN: 99,
  ILLUSION_WEAVER: 100,

  // Bosses
  SKELETON_KING: 101,
  BUTCHER: 102,
  DIABLO: 107,
  LAZARUS: 108,
};

// Monsters available at each dungeon level range
const LEVEL_MONSTERS = {
  // Cathedral (1-4)
  cathedral: [
    'ZOMBIE', 'FALLEN_ONE', 'SKELETON', 'SCAVENGER',
    'GHOUL', 'CARVER', 'CORPSE_AXE', 'PLAGUE_EATER',
  ],

  // Catacombs (5-8)
  catacombs: [
    'SKELETON', 'BURNING_DEAD', 'HORROR', 'FLESH_CLAN',
    'STONE_CLAN', 'SKELETON_ARCHER', 'CORPSE_BOW',
    'ROTTING_CARCASS', 'BLACK_DEATH', 'SHADOW_BEAST',
  ],

  // Caves (9-12)
  caves: [
    'HORROR', 'FIRE_CLAN', 'NIGHT_CLAN', 'FIEND', 'BLINK',
    'BURNING_DEAD', 'HORROR_ARCHER', 'BONE_GASHER',
    'FIRE_CLAN_ARCHER', 'NIGHT_CLAN_ARCHER',
  ],

  // Hell (13-16)
  hell: [
    'GLOOM', 'FAMILIAR', 'HIDDEN', 'STALKER', 'UNSEEN',
    'ILLUSION_WEAVER', 'NIGHT_CLAN', 'NIGHT_CLAN_ARCHER',
  ],
};

// Boss encounters by level
const BOSSES = {
  3: { type: 'SKELETON_KING', minions: 'SKELETON' },
  4: { type: 'BUTCHER', minions: 'ZOMBIE' },
  16: { type: 'DIABLO', minions: 'HIDDEN' },
  15: { type: 'LAZARUS', minions: 'UNSEEN' },
};

// AI enemy type to WASM monster ID mapping
const AI_TYPE_MAPPING = {
  // Generic types
  'zombie': 'ZOMBIE',
  'skeleton': 'SKELETON',
  'fallen': 'FALLEN_ONE',
  'scavenger': 'SCAVENGER',
  'goat': 'FLESH_CLAN',
  'bat': 'FIEND',
  'demon': 'HIDDEN',

  // Specific types
  'ghoul': 'GHOUL',
  'carver': 'CARVER',
  'archer': 'SKELETON_ARCHER',
  'horror': 'HORROR',

  // Boss types
  'skeleton_king': 'SKELETON_KING',
  'butcher': 'BUTCHER',
  'diablo': 'DIABLO',

  // Difficulty variants
  'easy': 'ZOMBIE',
  'medium': 'SKELETON',
  'hard': 'HORROR',
  'elite': 'STALKER',
};

/**
 * Get monster ID for AI enemy type
 * @param {string} aiType - AI enemy type name
 * @param {number} level - Dungeon level (1-16)
 * @returns {number} WASM monster ID
 */
export function getMonsterID(aiType, level = 1) {
  // Normalize type name
  const normalizedType = normalizeTypeName(aiType);

  // Direct mapping check
  let monsterName = AI_TYPE_MAPPING[normalizedType];

  if (!monsterName) {
    // Try to find best match for level
    monsterName = getMonsterForLevel(normalizedType, level);
  }

  const monsterId = MONSTER_IDS[monsterName];

  if (monsterId === undefined) {
    console.warn(`[MonsterMapper] Unknown monster type: ${aiType}, using SKELETON`);
    return MONSTER_IDS.SKELETON;
  }

  return monsterId;
}

/**
 * Normalize AI type name
 */
function normalizeTypeName(type) {
  if (!type) return 'skeleton';
  return type.toLowerCase().replace(/[^a-z]/g, '_').replace(/_+/g, '_');
}

/**
 * Get appropriate monster for a level
 * @param {string} baseType - Base monster type
 * @param {number} level - Dungeon level
 * @returns {string} Monster name
 */
function getMonsterForLevel(baseType, level) {
  // Check DungeonConfig first for custom monster pool
  const config = getDungeonConfig();
  let available;

  if (config) {
    try {
      available = config.getEffectiveMonsters(level);
    } catch (e) {
      // Fallback to defaults
      available = null;
    }
  }

  if (!available || available.length === 0) {
    const theme = getThemeForLevel(level);
    available = LEVEL_MONSTERS[theme] || LEVEL_MONSTERS.cathedral;
  }

  // Try to find matching type in available monsters
  for (const monster of available) {
    if (monster.toLowerCase().includes(baseType)) {
      return monster;
    }
  }

  // Return first appropriate monster for level
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get theme for dungeon level
 */
function getThemeForLevel(level) {
  if (level <= 4) return 'cathedral';
  if (level <= 8) return 'catacombs';
  if (level <= 12) return 'caves';
  return 'hell';
}

/**
 * Convert AI placements to WASM spawn data
 * @param {Array} placements - Array of {x, y, enemyType, difficulty}
 * @param {number} level - Dungeon level
 * @returns {Array} Array of {x, y, monsterId}
 */
export function convertPlacements(placements, level = 1) {
  if (!placements || !Array.isArray(placements)) {
    return [];
  }

  return placements.map(placement => ({
    x: placement.x,
    y: placement.y,
    monsterId: getMonsterID(placement.enemyType || placement.type, level),
    flags: getDifficultyFlags(placement.difficulty),
  }));
}

/**
 * Get spawn flags based on difficulty
 * @param {number} difficulty - 1-5 difficulty rating
 * @returns {number} Spawn flags
 */
function getDifficultyFlags(difficulty) {
  if (!difficulty) return 0;

  // Higher difficulty = chance of being unique/champion
  if (difficulty >= 5) return 0x02; // Unique
  if (difficulty >= 4) return 0x01; // Champion
  return 0;
}

/**
 * Get boss info for a level
 * @param {number} level - Dungeon level
 * @returns {Object|null} Boss info or null
 */
export function getBossForLevel(level) {
  const boss = BOSSES[level];
  if (!boss) return null;

  return {
    monsterId: MONSTER_IDS[boss.type],
    name: boss.type,
    minionId: MONSTER_IDS[boss.minions],
    minionName: boss.minions,
  };
}

/**
 * Get all available monsters for a level
 * Uses DungeonConfig if available for custom monster pools
 * @param {number} level - Dungeon level
 * @returns {Array<{name, id}>} Available monsters
 */
export function getAvailableMonsters(level) {
  // Check DungeonConfig first
  const config = getDungeonConfig();
  let available;

  if (config) {
    try {
      available = config.getEffectiveMonsters(level);
    } catch (e) {
      available = null;
    }
  }

  if (!available || available.length === 0) {
    const theme = getThemeForLevel(level);
    available = LEVEL_MONSTERS[theme] || LEVEL_MONSTERS.cathedral;
  }

  return available.map(name => ({
    name,
    id: MONSTER_IDS[name],
  })).filter(m => m.id !== undefined);
}

/**
 * Get monster density for a level (from DungeonConfig or default)
 * @param {number} level - Dungeon level
 * @returns {number} Density 0-1
 */
export function getMonsterDensity(level) {
  const config = getDungeonConfig();
  if (config) {
    try {
      return config.getEffectiveMonsterDensity(level);
    } catch (e) {
      // Fallback
    }
  }
  // Default density increases with level
  return 0.3 + (level * 0.02);
}

/**
 * Get boss configuration for a level
 * @param {number} level - Dungeon level
 * @returns {Object|null} Boss config with monsterId, name, minionId, etc.
 */
export function getBossConfig(level) {
  const config = getDungeonConfig();
  if (config) {
    try {
      const boss = config.getBoss(level);
      if (boss) {
        return {
          monsterId: MONSTER_IDS[boss.type] || boss.monsterId,
          name: boss.name || boss.type,
          type: boss.type,
          minionId: boss.minions ? MONSTER_IDS[boss.minions] : null,
          minionName: boss.minions,
          minionCount: boss.minionCount || 4,
          dialogue: boss.dialogue,
          rewards: boss.rewards,
        };
      }
    } catch (e) {
      // Fallback
    }
  }

  // Default bosses
  return getBossForLevel(level);
}

/**
 * Generate random spawns for a level
 * @param {number[][]} grid - Tile grid (to find valid positions)
 * @param {number} count - Number of monsters to spawn
 * @param {number} level - Dungeon level
 * @param {Object} floorTiles - Set of floor tile IDs
 * @returns {Array} Spawn positions with monster IDs
 */
export function generateRandomSpawns(grid, count, level, floorTiles = new Set([13, 14, 15])) {
  const spawns = [];
  const available = getAvailableMonsters(level);
  const validPositions = [];

  // Find all valid floor positions
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (floorTiles.has(grid[y][x])) {
        // Don't spawn too close to edges
        if (x > 3 && x < 36 && y > 3 && y < 36) {
          validPositions.push({ x, y });
        }
      }
    }
  }

  if (validPositions.length === 0) {
    console.warn('[MonsterMapper] No valid spawn positions found');
    return [];
  }

  // Shuffle positions
  for (let i = validPositions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [validPositions[i], validPositions[j]] = [validPositions[j], validPositions[i]];
  }

  // Take up to count positions
  const spawnCount = Math.min(count, validPositions.length);

  for (let i = 0; i < spawnCount; i++) {
    const pos = validPositions[i];
    const monster = available[Math.floor(Math.random() * available.length)];

    spawns.push({
      x: pos.x,
      y: pos.y,
      monsterId: monster.id,
      name: monster.name,
    });
  }

  return spawns;
}

// Export constants
export { MONSTER_IDS, LEVEL_MONSTERS, BOSSES };

// Default export
const MonsterMapper = {
  getMonsterID,
  convertPlacements,
  getBossForLevel,
  getBossConfig,
  getAvailableMonsters,
  getMonsterDensity,
  generateRandomSpawns,
  MONSTER_IDS,
  LEVEL_MONSTERS,
  BOSSES,
};

export default MonsterMapper;
