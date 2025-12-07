/**
 * Seed-Expanded Procedural Blueprints
 *
 * AI generates a single seed value + high-level modifiers:
 * {seed: 12345, mods: {density: high, theme: dark}}
 *
 * The SeedExpander uses PRNG to deterministically expand this into
 * full level details: town placements, trails, trees, monster groups.
 *
 * This turns verbose generation into one-liner outputs with infinite variety.
 */

import { SeededRandom, PerlinNoise, presetEngine, poissonDiskSampling } from './PresetLibrary';
import { compositor, BlueprintBuilder, LAYER_TYPES, BIOMES } from './LayeredCompositor';
import { PathWeaver, PATH_STYLES, DungeonPaths } from './PathWeaver';
import DUNParser from './DUNParser';
import { BINARY_MARKERS } from './TileMapper';

// ============================================================================
// MODIFIER DEFINITIONS
// ============================================================================

/**
 * Density levels affect how many things are placed
 */
export const DENSITY_LEVELS = {
  sparse: 0.3,
  low: 0.5,
  normal: 1.0,
  high: 1.5,
  dense: 2.0,
  packed: 3.0,
};

/**
 * Theme modifiers affect visual style
 */
export const THEME_MODIFIERS = {
  light: {
    foliageDensity: 1.0,
    monsterDensity: 0.5,
    treasureDensity: 1.5,
    biome: BIOMES.PLAINS,
  },
  normal: {
    foliageDensity: 1.0,
    monsterDensity: 1.0,
    treasureDensity: 1.0,
    biome: BIOMES.PLAINS,
  },
  dark: {
    foliageDensity: 1.5,
    monsterDensity: 1.5,
    treasureDensity: 0.8,
    biome: BIOMES.FOREST,
  },
  corrupted: {
    foliageDensity: 0.5,
    monsterDensity: 2.0,
    treasureDensity: 1.2,
    biome: BIOMES.CORRUPTED,
  },
  underground: {
    foliageDensity: 0,
    monsterDensity: 1.5,
    treasureDensity: 1.2,
    biome: BIOMES.UNDERGROUND,
  },
};

/**
 * Difficulty modifiers affect monster counts and types
 */
export const DIFFICULTY_MODIFIERS = {
  easy: {
    monsterMultiplier: 0.5,
    eliteChance: 0.05,
    treasureMultiplier: 1.2,
  },
  normal: {
    monsterMultiplier: 1.0,
    eliteChance: 0.1,
    treasureMultiplier: 1.0,
  },
  hard: {
    monsterMultiplier: 1.5,
    eliteChance: 0.2,
    treasureMultiplier: 0.9,
  },
  nightmare: {
    monsterMultiplier: 2.0,
    eliteChance: 0.3,
    treasureMultiplier: 0.8,
  },
  hell: {
    monsterMultiplier: 3.0,
    eliteChance: 0.5,
    treasureMultiplier: 0.7,
  },
};

/**
 * Size presets
 */
export const SIZE_PRESETS = {
  tiny: { width: 20, height: 20 },
  small: { width: 32, height: 32 },
  medium: { width: 40, height: 40 },
  large: { width: 56, height: 56 },
  huge: { width: 72, height: 72 },
};

// ============================================================================
// GENERATION TEMPLATES
// ============================================================================

/**
 * Templates define the structure of different level types
 */
export const GENERATION_TEMPLATES = {
  /**
   * Village template - Town with buildings and paths
   */
  village: {
    name: 'Village',
    description: 'A village settlement with buildings, paths, and foliage',
    baseParams: {
      buildings: { min: 4, max: 12 },
      paths: true,
      foliage: true,
      water: { chance: 0.3 },
      npcs: true,
    },
    generate(expander, seed, mods) {
      const rng = new SeededRandom(seed);
      const { width, height } = expander.getSize(mods);

      // Calculate building count based on density
      const densityMult = DENSITY_LEVELS[mods.density] || 1.0;
      const baseBuildings = rng.nextInt(this.baseParams.buildings.min, this.baseParams.buildings.max);
      const buildingCount = Math.round(baseBuildings * densityMult);

      // Get theme config
      const theme = THEME_MODIFIERS[mods.theme] || THEME_MODIFIERS.normal;

      // Build blueprint
      const builder = new BlueprintBuilder(width, height)
        .seed(seed)
        .terrain(theme.biome);

      // Add structures
      builder.structures({
        presets: [`town_cluster:${buildingCount}`],
      });

      // Add paths connecting structures
      if (this.baseParams.paths) {
        builder.paths({ connectStructures: true, pathMaterial: 'dirt' });
      }

      // Add foliage based on theme
      if (this.baseParams.foliage && theme.foliageDensity > 0) {
        builder.foliage(0.2 * theme.foliageDensity * densityMult, {
          types: ['trees', 'bushes'],
        });
      }

      // Maybe add water feature
      if (this.baseParams.water && rng.next() < this.baseParams.water.chance) {
        // Water will be handled as a special feature
      }

      // Add NPCs
      if (this.baseParams.npcs) {
        const npcPositions = expander._generateNPCPositions(width, height, rng);
        builder.entities({ npcs: npcPositions });
      }

      return builder.build();
    },
  },

  /**
   * Dungeon template - Rooms with corridors
   */
  dungeon: {
    name: 'Dungeon',
    description: 'A dungeon with rooms, corridors, monsters, and treasure',
    baseParams: {
      rooms: { min: 4, max: 10 },
      corridorWidth: 2,
      monsters: true,
      treasure: true,
      traps: { chance: 0.2 },
    },
    generate(expander, seed, mods) {
      const rng = new SeededRandom(seed);
      const { width, height } = expander.getSize(mods);

      const densityMult = DENSITY_LEVELS[mods.density] || 1.0;
      const baseRooms = rng.nextInt(this.baseParams.rooms.min, this.baseParams.rooms.max);
      const roomCount = Math.round(baseRooms * densityMult);

      const theme = THEME_MODIFIERS[mods.theme] || THEME_MODIFIERS.underground;
      const difficulty = DIFFICULTY_MODIFIERS[mods.difficulty] || DIFFICULTY_MODIFIERS.normal;

      const builder = new BlueprintBuilder(width, height)
        .seed(seed)
        .addLayer(LAYER_TYPES.TERRAIN, {
          biome: BIOMES.UNDERGROUND,
          defaultTile: BINARY_MARKERS.WALL,
        });

      // Add room structures
      builder.structures({
        presets: [{
          name: 'room_cluster',
          params: {
            roomCount,
            corridorWidth: this.baseParams.corridorWidth,
            addDoors: true,
          },
        }],
      });

      // Add monsters
      if (this.baseParams.monsters) {
        const monsterCount = Math.round(roomCount * 3 * difficulty.monsterMultiplier * densityMult);
        builder.entities({
          presets: [{
            name: 'monster_group',
            params: {
              count: monsterCount,
              formation: 'random',
              monsterType: expander._getMonsterTypeForLevel(mods.level || 1, rng),
            },
          }],
        });
      }

      // Add treasure
      if (this.baseParams.treasure) {
        const treasureRooms = Math.ceil(roomCount / 3 * difficulty.treasureMultiplier);
        builder.objects({
          presets: Array(treasureRooms).fill({
            name: 'treasure_room',
            params: { chestCount: rng.nextInt(1, 3), barrelCount: rng.nextInt(2, 5) },
          }),
        });
      }

      return builder.build();
    },
  },

  /**
   * Arena template - Combat-focused area
   */
  arena: {
    name: 'Arena',
    description: 'A combat arena with monsters and rewards',
    baseParams: {
      arenaSize: 0.5,
      pillars: true,
      entrances: { min: 1, max: 4 },
      waves: { min: 1, max: 3 },
    },
    generate(expander, seed, mods) {
      const rng = new SeededRandom(seed);
      const { width, height } = expander.getSize(mods);

      const densityMult = DENSITY_LEVELS[mods.density] || 1.0;
      const difficulty = DIFFICULTY_MODIFIERS[mods.difficulty] || DIFFICULTY_MODIFIERS.normal;

      const builder = new BlueprintBuilder(width, height)
        .seed(seed)
        .addLayer(LAYER_TYPES.TERRAIN, {
          biome: BIOMES.UNDERGROUND,
          defaultTile: BINARY_MARKERS.WALL,
        });

      // Add arena
      builder.structures({
        presets: [{
          name: 'arena_chamber',
          params: {
            width: Math.floor(width * this.baseParams.arenaSize),
            height: Math.floor(height * this.baseParams.arenaSize),
            hasPillars: this.baseParams.pillars,
            entrances: rng.nextInt(this.baseParams.entrances.min, this.baseParams.entrances.max),
          },
        }],
      });

      // Add monster waves
      const waves = rng.nextInt(this.baseParams.waves.min, this.baseParams.waves.max);
      const monstersPerWave = Math.round(8 * difficulty.monsterMultiplier * densityMult);

      builder.entities({
        presets: Array(waves).fill(null).map(() => ({
          name: 'monster_group',
          params: {
            count: monstersPerWave,
            formation: 'circle',
            radius: Math.floor(width * this.baseParams.arenaSize / 3),
            monsterType: expander._getMonsterTypeForLevel(mods.level || 1, rng),
          },
        })),
      });

      // Add reward chest in center
      builder.objects({
        presets: [{
          name: 'treasure_room',
          params: {
            chestCount: 1,
            barrelCount: 0,
            hasMainChest: true,
          },
        }],
      });

      return builder.build();
    },
  },

  /**
   * Forest template - Natural area with scattered elements
   */
  forest: {
    name: 'Forest',
    description: 'A forested area with clearings and paths',
    baseParams: {
      clearings: { min: 2, max: 5 },
      paths: true,
      monsters: true,
      treasureSpots: { chance: 0.3 },
    },
    generate(expander, seed, mods) {
      const rng = new SeededRandom(seed);
      const { width, height } = expander.getSize(mods);

      const densityMult = DENSITY_LEVELS[mods.density] || 1.0;
      const theme = THEME_MODIFIERS[mods.theme] || THEME_MODIFIERS.normal;

      const builder = new BlueprintBuilder(width, height)
        .seed(seed)
        .terrain(BIOMES.FOREST);

      // Dense foliage
      builder.foliage(0.4 * densityMult * theme.foliageDensity, {
        types: ['trees', 'bushes'],
      });

      // Add clearings as small structure presets
      const clearingCount = rng.nextInt(
        this.baseParams.clearings.min,
        this.baseParams.clearings.max
      );

      // Clearings carved as inverse forest patches
      builder.structures({
        buildings: Array(clearingCount).fill(null).map(() => ({
          x: rng.nextInt(5, width - 10),
          y: rng.nextInt(5, height - 10),
          width: rng.nextInt(4, 8),
          height: rng.nextInt(4, 8),
          type: 'clearing',
          door: false,
        })),
      });

      // Add paths connecting clearings
      if (this.baseParams.paths) {
        builder.paths({
          connectStructures: true,
          pathMaterial: 'dirt',
          pathWidth: 1,
        });
      }

      // Add wandering monsters
      if (this.baseParams.monsters) {
        const difficulty = DIFFICULTY_MODIFIERS[mods.difficulty] || DIFFICULTY_MODIFIERS.normal;
        builder.entities({
          presets: [{
            name: 'monster_group',
            params: {
              count: Math.round(clearingCount * 2 * difficulty.monsterMultiplier),
              formation: 'random',
              radius: Math.floor(width / 3),
            },
          }],
        });
      }

      return builder.build();
    },
  },

  /**
   * Ruins template - Destroyed buildings and debris
   */
  ruins: {
    name: 'Ruins',
    description: 'Destroyed settlement with rubble and undead',
    baseParams: {
      buildings: { min: 3, max: 8 },
      debris: true,
      undead: true,
    },
    generate(expander, seed, mods) {
      const rng = new SeededRandom(seed);
      const { width, height } = expander.getSize(mods);

      const densityMult = DENSITY_LEVELS[mods.density] || 1.0;

      const builder = new BlueprintBuilder(width, height)
        .seed(seed)
        .terrain(BIOMES.CORRUPTED);

      // Ruined buildings
      const buildingCount = Math.round(
        rng.nextInt(this.baseParams.buildings.min, this.baseParams.buildings.max) * densityMult
      );

      builder.structures({
        presets: [`town_cluster:${buildingCount}`],
        buildings: Array(buildingCount).fill(null).map(() => ({
          x: rng.nextInt(2, width - 8),
          y: rng.nextInt(2, height - 8),
          width: rng.nextInt(3, 6),
          height: rng.nextInt(3, 6),
          destroyed: true,
        })),
      });

      // Scattered debris
      if (this.baseParams.debris) {
        builder.foliage(0.25 * densityMult, {
          types: ['rocks', 'bones'],
          avoid: ['structure'],
        });
      }

      // Undead monsters
      if (this.baseParams.undead) {
        const difficulty = DIFFICULTY_MODIFIERS[mods.difficulty] || DIFFICULTY_MODIFIERS.normal;
        builder.entities({
          presets: [{
            name: 'monster_group',
            params: {
              count: Math.round(buildingCount * 2 * difficulty.monsterMultiplier),
              formation: 'random',
              monsterType: 1, // Skeleton
              hasLeader: rng.next() < difficulty.eliteChance,
              leaderType: 2, // Zombie as leader
            },
          }],
        });
      }

      return builder.build();
    },
  },
};

// ============================================================================
// SEED EXPANDER
// ============================================================================

/**
 * SeedExpander - Expands seed + modifiers into full level
 *
 * Usage:
 * const expander = new SeedExpander();
 * const result = expander.expand({
 *   seed: 12345,
 *   template: 'village',
 *   mods: {
 *     density: 'high',
 *     theme: 'dark',
 *     difficulty: 'hard',
 *     size: 'large',
 *   }
 * });
 */
export class SeedExpander {
  constructor() {
    this.templates = { ...GENERATION_TEMPLATES };
    this.customTemplates = new Map();
  }

  /**
   * Register a custom template
   */
  registerTemplate(name, template) {
    this.customTemplates.set(name, template);
  }

  /**
   * Get template by name
   */
  getTemplate(name) {
    return this.customTemplates.get(name) || this.templates[name] || null;
  }

  /**
   * List available templates
   */
  listTemplates() {
    const all = { ...this.templates };
    for (const [name, template] of this.customTemplates) {
      all[name] = template;
    }
    return Object.entries(all).map(([name, t]) => ({
      name,
      description: t.description,
    }));
  }

  /**
   * Get size from modifiers
   */
  getSize(mods) {
    if (mods.width && mods.height) {
      return { width: mods.width, height: mods.height };
    }
    return SIZE_PRESETS[mods.size] || SIZE_PRESETS.medium;
  }

  /**
   * Expand a seed specification into a full level
   * @param {Object} spec - Seed specification
   * @returns {Object} - Generated level data
   */
  expand(spec) {
    const {
      seed = Date.now(),
      template = 'village',
      mods = {},
    } = spec;

    // Normalize modifiers with defaults
    const normalizedMods = {
      density: mods.density || 'normal',
      theme: mods.theme || 'normal',
      difficulty: mods.difficulty || 'normal',
      size: mods.size || 'medium',
      level: mods.level || 1,
      ...mods,
    };

    const templateDef = this.getTemplate(template);
    if (!templateDef) {
      throw new Error(`Unknown template: ${template}`);
    }

    // Generate blueprint using template
    const blueprint = templateDef.generate(this, seed, normalizedMods);

    // Compose the level
    const composedResult = compositor.compose(blueprint);

    return {
      seed,
      template,
      mods: normalizedMods,
      blueprint,
      ...composedResult,
    };
  }

  /**
   * Expand to DUN buffer
   */
  expandToDUN(spec) {
    const result = this.expand(spec);
    const buffer = DUNParser.write(result.dunData);

    return {
      ...result,
      buffer,
    };
  }

  /**
   * Generate multiple levels with related seeds
   * Useful for creating a sequence of connected dungeon floors
   */
  expandSequence(baseSpec, count = 4) {
    const results = [];
    const baseSeed = baseSpec.seed || Date.now();

    for (let i = 0; i < count; i++) {
      // Derive seed for each level
      const levelSeed = this._deriveSeed(baseSeed, i);

      // Adjust modifiers for progression
      const levelMods = {
        ...baseSpec.mods,
        level: (baseSpec.mods?.level || 1) + i,
        // Increase difficulty slightly per level
        density: this._progressDensity(baseSpec.mods?.density || 'normal', i),
      };

      const result = this.expand({
        ...baseSpec,
        seed: levelSeed,
        mods: levelMods,
      });

      results.push({
        levelIndex: i,
        ...result,
      });
    }

    return results;
  }

  /**
   * Quick generation helpers
   */
  quickVillage(seed = Date.now(), size = 'medium') {
    return this.expand({
      seed,
      template: 'village',
      mods: { size },
    });
  }

  quickDungeon(seed = Date.now(), difficulty = 'normal') {
    return this.expand({
      seed,
      template: 'dungeon',
      mods: { difficulty },
    });
  }

  quickArena(seed = Date.now(), difficulty = 'hard') {
    return this.expand({
      seed,
      template: 'arena',
      mods: { difficulty },
    });
  }

  quickForest(seed = Date.now(), density = 'normal') {
    return this.expand({
      seed,
      template: 'forest',
      mods: { density },
    });
  }

  /**
   * Helper: Generate NPC positions for village
   */
  _generateNPCPositions(width, height, rng) {
    const npcs = [
      { role: 'blacksmith', offset: { x: 0.25, y: 0.25 } },
      { role: 'healer', offset: { x: 0.75, y: 0.25 } },
      { role: 'witch', offset: { x: 0.25, y: 0.75 } },
      { role: 'elder', offset: { x: 0.5, y: 0.5 } },
      { role: 'innkeeper', offset: { x: 0.75, y: 0.5 } },
      { role: 'merchant', offset: { x: 0.5, y: 0.75 } },
    ];

    return npcs.map(npc => ({
      ...npc,
      x: Math.floor(width * npc.offset.x + (rng.next() - 0.5) * 4),
      y: Math.floor(height * npc.offset.y + (rng.next() - 0.5) * 4),
    }));
  }

  /**
   * Helper: Get appropriate monster type for dungeon level
   */
  _getMonsterTypeForLevel(level, rng) {
    // Monster type ranges by dungeon depth
    const levelRanges = [
      { maxLevel: 4, types: [1, 2, 3] },        // Skeletons, zombies, fallen
      { maxLevel: 8, types: [4, 5, 6, 7] },     // Goatmen, scavengers, etc.
      { maxLevel: 12, types: [8, 9, 10, 11] },  // Cave dwellers
      { maxLevel: 16, types: [12, 13, 14, 15] }, // Hell spawn
    ];

    for (const range of levelRanges) {
      if (level <= range.maxLevel) {
        return rng.pick(range.types);
      }
    }

    return rng.pick(levelRanges[levelRanges.length - 1].types);
  }

  /**
   * Helper: Derive a new seed from base
   */
  _deriveSeed(baseSeed, index) {
    const rng = new SeededRandom(baseSeed);
    for (let i = 0; i <= index; i++) {
      rng.next();
    }
    return Math.floor(rng.next() * 0x7fffffff);
  }

  /**
   * Helper: Progress density for deeper levels
   */
  _progressDensity(baseDensity, levelOffset) {
    const densities = ['sparse', 'low', 'normal', 'high', 'dense', 'packed'];
    const baseIndex = densities.indexOf(baseDensity);
    const newIndex = Math.min(baseIndex + Math.floor(levelOffset / 2), densities.length - 1);
    return densities[newIndex >= 0 ? newIndex : 2];
  }
}

// ============================================================================
// COMPACT SEED NOTATION
// ============================================================================

/**
 * Parse compact seed notation:
 * "12345:village:high:dark:large"
 * "seed:template:density:theme:size"
 *
 * Or even more compact:
 * "12345:v:h:d:l" (using first letters)
 */
export function parseSeedNotation(notation) {
  const parts = notation.split(':');

  if (parts.length < 1) return null;

  const result = {
    seed: parseInt(parts[0]) || Date.now(),
    template: 'village',
    mods: {},
  };

  // Template aliases
  const templateAliases = {
    v: 'village', village: 'village',
    d: 'dungeon', dungeon: 'dungeon',
    a: 'arena', arena: 'arena',
    f: 'forest', forest: 'forest',
    r: 'ruins', ruins: 'ruins',
  };

  // Density aliases
  const densityAliases = {
    s: 'sparse', sparse: 'sparse',
    l: 'low', low: 'low',
    n: 'normal', normal: 'normal',
    h: 'high', high: 'high',
    d: 'dense', dense: 'dense',
    p: 'packed', packed: 'packed',
  };

  // Theme aliases
  const themeAliases = {
    l: 'light', light: 'light',
    n: 'normal', normal: 'normal',
    d: 'dark', dark: 'dark',
    c: 'corrupted', corrupted: 'corrupted',
    u: 'underground', underground: 'underground',
  };

  // Size aliases
  const sizeAliases = {
    t: 'tiny', tiny: 'tiny',
    s: 'small', small: 'small',
    m: 'medium', medium: 'medium',
    l: 'large', large: 'large',
    h: 'huge', huge: 'huge',
  };

  // Difficulty aliases
  const difficultyAliases = {
    e: 'easy', easy: 'easy',
    n: 'normal', normal: 'normal',
    h: 'hard', hard: 'hard',
    m: 'nightmare', nightmare: 'nightmare',
    i: 'hell', hell: 'hell',
  };

  if (parts[1]) {
    result.template = templateAliases[parts[1].toLowerCase()] || parts[1];
  }

  if (parts[2]) {
    result.mods.density = densityAliases[parts[2].toLowerCase()] || parts[2];
  }

  if (parts[3]) {
    result.mods.theme = themeAliases[parts[3].toLowerCase()] || parts[3];
  }

  if (parts[4]) {
    result.mods.size = sizeAliases[parts[4].toLowerCase()] || parts[4];
  }

  if (parts[5]) {
    result.mods.difficulty = difficultyAliases[parts[5].toLowerCase()] || parts[5];
  }

  return result;
}

/**
 * Generate seed notation string from spec
 */
export function toSeedNotation(spec) {
  const parts = [
    spec.seed || Date.now(),
    spec.template || 'village',
    spec.mods?.density || 'normal',
    spec.mods?.theme || 'normal',
    spec.mods?.size || 'medium',
    spec.mods?.difficulty || 'normal',
  ];

  return parts.join(':');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton expander
export const seedExpander = new SeedExpander();

export default {
  SeedExpander,
  seedExpander,
  parseSeedNotation,
  toSeedNotation,
  GENERATION_TEMPLATES,
  DENSITY_LEVELS,
  THEME_MODIFIERS,
  DIFFICULTY_MODIFIERS,
  SIZE_PRESETS,
};
