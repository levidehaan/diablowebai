/**
 * Enemy Placement System
 *
 * AI-driven enemy spawning and placement at design time.
 * Integrates with DungeonConfig for customizable monster pools, density, and difficulty.
 * Does NOT control real-time enemy behavior - only determines:
 * - Where enemies spawn
 * - What enemy types appear
 * - Difficulty scaling based on area
 * - Boss placement for progression gates
 */

import NeuralConfig from './config';
import { providerManager } from './providers';

// Lazy import DungeonConfig to avoid circular dependencies
let dungeonConfigInstance = null;
function getDungeonConfig() {
  if (!dungeonConfigInstance) {
    try {
      const { default: config } = require('./DungeonConfig');
      dungeonConfigInstance = config;
    } catch (e) {
      return null;
    }
  }
  return dungeonConfigInstance;
}

/**
 * Enemy types available in Diablo
 */
export const ENEMY_TYPES = {
  // Dungeon Level 1-4 (Cathedral)
  ZOMBIE: { id: 1, difficulty: 1, pack: true, name: 'Zombie' },
  FALLEN: { id: 2, difficulty: 1, pack: true, name: 'Fallen One' },
  SKELETON: { id: 3, difficulty: 2, pack: true, name: 'Skeleton' },
  SKELETON_ARCHER: { id: 4, difficulty: 2, pack: true, ranged: true, name: 'Skeleton Archer' },
  SCAVENGER: { id: 5, difficulty: 2, pack: true, name: 'Scavenger' },

  // Dungeon Level 5-8 (Catacombs)
  HIDDEN: { id: 6, difficulty: 3, pack: true, name: 'Hidden' },
  GOAT_MAN: { id: 7, difficulty: 3, pack: true, name: 'Goat Man' },
  GOAT_ARCHER: { id: 8, difficulty: 3, pack: true, ranged: true, name: 'Goat Archer' },
  OVERLORD: { id: 9, difficulty: 4, pack: false, name: 'Overlord' },
  GARGOYLE: { id: 10, difficulty: 4, pack: true, name: 'Gargoyle' },

  // Dungeon Level 9-12 (Caves)
  ACID_BEAST: { id: 11, difficulty: 5, pack: true, name: 'Acid Beast' },
  MAGMA_DEMON: { id: 12, difficulty: 5, pack: true, ranged: true, name: 'Magma Demon' },
  HORNED_DEMON: { id: 13, difficulty: 6, pack: false, name: 'Horned Demon' },
  LIGHTNING_DEMON: { id: 14, difficulty: 6, pack: true, name: 'Lightning Demon' },

  // Dungeon Level 13-16 (Hell)
  BALROG: { id: 15, difficulty: 7, pack: false, name: 'Balrog' },
  VIPER: { id: 16, difficulty: 7, pack: true, name: 'Viper' },
  SUCCUBUS: { id: 17, difficulty: 8, pack: true, ranged: true, name: 'Succubus' },
  KNIGHT: { id: 18, difficulty: 8, pack: false, name: 'Black Knight' },
  ADVOCATE: { id: 19, difficulty: 9, pack: false, name: 'Advocate' },

  // Bosses
  BUTCHER: { id: 100, difficulty: 10, boss: true, name: 'The Butcher' },
  SKELETON_KING: { id: 101, difficulty: 12, boss: true, name: 'King Leoric' },
  LAZARUS: { id: 102, difficulty: 14, boss: true, name: 'Archbishop Lazarus' },
  DIABLO: { id: 103, difficulty: 20, boss: true, name: 'Diablo' },
};

/**
 * Spawn group templates
 */
const SPAWN_TEMPLATES = {
  PATROL: {
    formation: 'line',
    minCount: 2,
    maxCount: 4,
    spacing: 2,
  },
  AMBUSH: {
    formation: 'circle',
    minCount: 3,
    maxCount: 6,
    spacing: 3,
    hidden: true,
  },
  GUARD: {
    formation: 'cluster',
    minCount: 1,
    maxCount: 2,
    spacing: 1,
  },
  HORDE: {
    formation: 'random',
    minCount: 6,
    maxCount: 12,
    spacing: 2,
  },
  BOSS_ROOM: {
    formation: 'boss_with_minions',
    minions: 4,
    spacing: 4,
  },
};

/**
 * Calculate spawn positions for a group
 */
function calculateSpawnPositions(template, centerX, centerY, count, grid) {
  const positions = [];
  const { formation, spacing } = SPAWN_TEMPLATES[template] || SPAWN_TEMPLATES.PATROL;

  switch (formation) {
    case 'line':
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        const x = Math.round(centerX + offset);
        const y = centerY;
        if (isValidSpawn(x, y, grid)) {
          positions.push({ x, y });
        }
      }
      break;

    case 'circle':
      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        const x = Math.round(centerX + Math.cos(angle) * spacing);
        const y = Math.round(centerY + Math.sin(angle) * spacing);
        if (isValidSpawn(x, y, grid)) {
          positions.push({ x, y });
        }
      }
      break;

    case 'cluster':
      positions.push({ x: centerX, y: centerY });
      for (let i = 1; i < count; i++) {
        const x = centerX + Math.floor(Math.random() * spacing * 2) - spacing;
        const y = centerY + Math.floor(Math.random() * spacing * 2) - spacing;
        if (isValidSpawn(x, y, grid)) {
          positions.push({ x, y });
        }
      }
      break;

    case 'random':
      for (let i = 0; i < count; i++) {
        let attempts = 0;
        while (attempts < 10) {
          const x = centerX + Math.floor(Math.random() * spacing * 4) - spacing * 2;
          const y = centerY + Math.floor(Math.random() * spacing * 4) - spacing * 2;
          if (isValidSpawn(x, y, grid) && !positions.some(p => p.x === x && p.y === y)) {
            positions.push({ x, y });
            break;
          }
          attempts++;
        }
      }
      break;

    case 'boss_with_minions':
      // Boss in center
      positions.push({ x: centerX, y: centerY, isBoss: true });
      // Minions around
      for (let i = 0; i < SPAWN_TEMPLATES.BOSS_ROOM.minions; i++) {
        const angle = (2 * Math.PI * i) / SPAWN_TEMPLATES.BOSS_ROOM.minions;
        const x = Math.round(centerX + Math.cos(angle) * spacing);
        const y = Math.round(centerY + Math.sin(angle) * spacing);
        if (isValidSpawn(x, y, grid)) {
          positions.push({ x, y });
        }
      }
      break;
  }

  return positions;
}

/**
 * Check if a position is valid for spawning
 */
function isValidSpawn(x, y, grid) {
  if (!grid) return true;
  if (x < 0 || x >= grid[0]?.length || y < 0 || y >= grid.length) return false;
  return grid[y][x] === 0; // FLOOR tile
}

/**
 * Get appropriate enemy types for a difficulty level
 */
function getEnemiesForDifficulty(targetDifficulty, variance = 1) {
  const minDiff = Math.max(1, targetDifficulty - variance);
  const maxDiff = targetDifficulty + variance;

  return Object.entries(ENEMY_TYPES)
    .filter(([_, enemy]) => !enemy.boss && enemy.difficulty >= minDiff && enemy.difficulty <= maxDiff)
    .map(([key, enemy]) => ({ key, ...enemy }));
}

/**
 * Get boss for a difficulty level
 */
function getBossForDifficulty(targetDifficulty) {
  const bosses = Object.entries(ENEMY_TYPES)
    .filter(([_, enemy]) => enemy.boss)
    .map(([key, enemy]) => ({ key, ...enemy }))
    .sort((a, b) => Math.abs(a.difficulty - targetDifficulty) - Math.abs(b.difficulty - targetDifficulty));

  return bosses[0] || null;
}

/**
 * Get enemies for difficulty using DungeonConfig if available
 */
function getEnemiesForDifficultyWithConfig(targetDifficulty, level, variance = 1) {
  const config = getDungeonConfig();

  if (config && level) {
    try {
      const allowed = config.getEffectiveMonsters(level);
      if (allowed && allowed.length > 0) {
        // Filter by difficulty range
        const minDiff = Math.max(1, targetDifficulty - variance);
        const maxDiff = targetDifficulty + variance;

        return allowed
          .map(name => {
            const enemy = Object.entries(ENEMY_TYPES).find(([key]) => key === name);
            if (enemy) {
              return { key: enemy[0], ...enemy[1] };
            }
            return null;
          })
          .filter(e => e && !e.boss && e.difficulty >= minDiff && e.difficulty <= maxDiff);
      }
    } catch (e) {
      // Fallback
    }
  }

  return getEnemiesForDifficulty(targetDifficulty, variance);
}

/**
 * Get effective spawn count based on DungeonConfig density
 */
function getEffectiveSpawnCount(baseCount, level) {
  const config = getDungeonConfig();
  if (config && level) {
    try {
      const density = config.getEffectiveMonsterDensity(level);
      // density is 0-1+, scale count accordingly
      return Math.ceil(baseCount * density * 3); // density 0.33 = normal count
    } catch (e) {
      // Fallback
    }
  }
  return baseCount;
}

/**
 * Mock placement generator for offline use
 */
class MockPlacementGenerator {
  static generatePlacements(areaConfig, grid) {
    const placements = [];
    const { difficulty, spawnPoints, bossArea, level } = areaConfig;

    // Regular spawn points
    for (const spawn of (spawnPoints || [])) {
      const template = spawn.template || 'PATROL';
      const templateConfig = SPAWN_TEMPLATES[template];
      const baseCount = Math.floor(Math.random() * (templateConfig.maxCount - templateConfig.minCount + 1)) + templateConfig.minCount;
      const count = getEffectiveSpawnCount(baseCount, level);

      const positions = calculateSpawnPositions(template, spawn.x, spawn.y, count, grid);
      const enemyPool = getEnemiesForDifficultyWithConfig(difficulty, level);

      if (enemyPool.length === 0) continue;

      // Pick primary enemy type for this group
      const primaryEnemy = enemyPool[Math.floor(Math.random() * enemyPool.length)];

      for (const pos of positions) {
        // 80% same type, 20% random from pool for variety
        const enemy = Math.random() < 0.8
          ? primaryEnemy
          : enemyPool[Math.floor(Math.random() * enemyPool.length)];

        placements.push({
          x: pos.x,
          y: pos.y,
          enemyType: enemy.key,
          enemyId: enemy.id,
          difficulty: enemy.difficulty,
          hidden: templateConfig.hidden || false,
        });
      }
    }

    // Boss placement
    if (bossArea) {
      // Check DungeonConfig for boss override
      const config = getDungeonConfig();
      let boss = null;
      let minionType = null;
      let minionCount = 4;

      if (config && level) {
        try {
          const bossConfig = config.getBoss(level);
          if (bossConfig) {
            boss = {
              key: bossConfig.type,
              id: ENEMY_TYPES[bossConfig.type]?.id,
              difficulty: ENEMY_TYPES[bossConfig.type]?.difficulty || 10,
              name: bossConfig.name || bossConfig.type,
            };
            minionType = bossConfig.minions;
            minionCount = bossConfig.minionCount || 4;
          }
        } catch (e) {
          // Fallback
        }
      }

      if (!boss) {
        boss = bossArea.bossType
          ? ENEMY_TYPES[bossArea.bossType]
          : getBossForDifficulty(difficulty + 2);
      }

      if (boss) {
        const positions = calculateSpawnPositions('BOSS_ROOM', bossArea.x, bossArea.y, 1, grid);

        placements.push({
          x: bossArea.x,
          y: bossArea.y,
          enemyType: bossArea.bossType || boss.key,
          enemyId: boss.id,
          difficulty: boss.difficulty,
          isBoss: true,
          progressionGate: bossArea.progressionGate || null,
        });

        // Add minions around boss
        const minionPositions = calculateSpawnPositions('BOSS_ROOM', bossArea.x, bossArea.y, minionCount + 1, grid);
        const minionPool = minionType
          ? [{ key: minionType, ...ENEMY_TYPES[minionType] }].filter(m => m.id)
          : getEnemiesForDifficultyWithConfig(difficulty, level);

        for (let i = 1; i < minionPositions.length; i++) {
          const pos = minionPositions[i];
          const minion = minionPool[Math.floor(Math.random() * minionPool.length)];

          if (minion) {
            placements.push({
              x: pos.x,
              y: pos.y,
              enemyType: minion.key,
              enemyId: minion.id,
              difficulty: minion.difficulty,
              isBossMinion: true,
            });
          }
        }
      }
    }

    return placements;
  }
}

/**
 * Main Enemy Placement System
 */
class EnemyPlacementSystem {
  constructor() {
    this.placements = [];
    this.cachedPlacements = new Map();
  }

  /**
   * Generate enemy placements for an area
   */
  async generatePlacements(areaConfig, grid = null) {
    const cacheKey = JSON.stringify({ ...areaConfig, hasGrid: !!grid });

    if (this.cachedPlacements.has(cacheKey)) {
      return this.cachedPlacements.get(cacheKey);
    }

    let placements;

    const provider = providerManager.getProvider();
    if (!provider || NeuralConfig.debug.mockAPIResponses) {
      placements = MockPlacementGenerator.generatePlacements(areaConfig, grid);
    } else {
      placements = await this.generateWithAI(areaConfig, grid);
    }

    this.cachedPlacements.set(cacheKey, placements);
    this.placements = placements;

    return placements;
  }

  /**
   * Generate placements using AI
   */
  async generateWithAI(areaConfig, grid) {
    const provider = providerManager.getProvider();
    if (!provider) {
      return MockPlacementGenerator.generatePlacements(areaConfig, grid);
    }

    const prompt = `Generate enemy placements for a Diablo-style dungeon area.

Area Configuration:
- Name: ${areaConfig.name || 'Unknown Area'}
- Difficulty Level: ${areaConfig.difficulty} (1-10 scale)
- Theme: ${areaConfig.theme || 'dungeon'}
- Size: ${grid ? `${grid[0].length}x${grid.length}` : 'Unknown'}

Available Spawn Points:
${(areaConfig.spawnPoints || []).map((sp, i) =>
  `${i + 1}. Position (${sp.x}, ${sp.y}) - Template: ${sp.template || 'PATROL'}`
).join('\n')}

${areaConfig.bossArea ? `Boss Area: Position (${areaConfig.bossArea.x}, ${areaConfig.bossArea.y})
Required Boss Type: ${areaConfig.bossArea.bossType || 'auto-select based on difficulty'}
Progression Gate: ${areaConfig.bossArea.progressionGate || 'none'}` : 'No boss area defined'}

Available Enemy Types (select based on difficulty):
${Object.entries(ENEMY_TYPES)
  .filter(([_, e]) => !e.boss)
  .map(([key, e]) => `- ${key}: Difficulty ${e.difficulty}, Pack: ${e.pack}`)
  .join('\n')}

Available Bosses:
${Object.entries(ENEMY_TYPES)
  .filter(([_, e]) => e.boss)
  .map(([key, e]) => `- ${key}: Difficulty ${e.difficulty}`)
  .join('\n')}

Generate a JSON array of enemy placements. Each placement should have:
- x, y: coordinates
- enemyType: one of the available types
- difficulty: enemy's difficulty rating
- hidden: boolean for ambush enemies
- isBoss: boolean for boss enemies
- progressionGate: string if killing this enemy unlocks something

Consider:
1. Mix enemy types for interesting combat
2. Place ranged enemies behind melee
3. Use terrain for ambushes
4. Boss should be challenging but fair
5. Difficulty should match area level

Respond with ONLY a JSON array, no explanation.`;

    try {
      const response = await provider.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 2000,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const placements = JSON.parse(jsonMatch[0]);
        return this.validatePlacements(placements, areaConfig, grid);
      }
    } catch (error) {
      console.error('[EnemyPlacement] AI generation failed:', error);
    }

    return MockPlacementGenerator.generatePlacements(areaConfig, grid);
  }

  /**
   * Validate and fix AI-generated placements
   */
  validatePlacements(placements, areaConfig, grid) {
    return placements.filter(p => {
      // Validate required fields
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return false;
      if (!p.enemyType) return false;

      // Validate enemy type exists
      if (!ENEMY_TYPES[p.enemyType]) {
        // Try to map to known type
        const similar = Object.keys(ENEMY_TYPES).find(k =>
          k.toLowerCase().includes(p.enemyType.toLowerCase()) ||
          p.enemyType.toLowerCase().includes(k.toLowerCase())
        );
        if (similar) {
          p.enemyType = similar;
        } else {
          return false;
        }
      }

      // Validate position
      if (grid && !isValidSpawn(p.x, p.y, grid)) {
        return false;
      }

      // Add enemy ID if missing
      if (!p.enemyId) {
        p.enemyId = ENEMY_TYPES[p.enemyType].id;
      }

      // Add difficulty if missing
      if (!p.difficulty) {
        p.difficulty = ENEMY_TYPES[p.enemyType].difficulty;
      }

      return true;
    });
  }

  /**
   * Get placements for a specific area of the map
   */
  getPlacementsInArea(x, y, width, height) {
    return this.placements.filter(p =>
      p.x >= x && p.x < x + width &&
      p.y >= y && p.y < y + height
    );
  }

  /**
   * Get all boss placements
   */
  getBossPlacements() {
    return this.placements.filter(p => p.isBoss);
  }

  /**
   * Get placements that act as progression gates
   */
  getProgressionGates() {
    return this.placements.filter(p => p.progressionGate);
  }

  /**
   * Clear cached placements
   */
  clearCache() {
    this.cachedPlacements.clear();
    this.placements = [];
  }

  /**
   * Export placements for saving
   */
  export() {
    return {
      placements: this.placements,
      version: 1,
    };
  }

  /**
   * Import saved placements
   */
  import(data) {
    if (data.version === 1 && Array.isArray(data.placements)) {
      this.placements = data.placements;
      return true;
    }
    return false;
  }
}

// Singleton instance
const enemyPlacementSystem = new EnemyPlacementSystem();

export {
  EnemyPlacementSystem,
  SPAWN_TEMPLATES,
  MockPlacementGenerator,
  getEnemiesForDifficulty,
  getBossForDifficulty,
  calculateSpawnPositions,
};

export default enemyPlacementSystem;
