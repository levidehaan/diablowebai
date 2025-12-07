/**
 * Semantic Token Compression via Macros
 *
 * Defines a macro system where AI uses shorthand symbols that get
 * expanded client-side into full structures before MPQ packing.
 *
 * Examples:
 * - "@town:medium" → Full town cluster preset call
 * - "^trail:curvy" → Path weaving with curviness
 * - "*trees:50" → Forest patch with 50 trees
 * - "#mob:skeleton[5]" → Monster group of 5 skeletons
 * - "!chest:rare@10,15" → Rare chest at position
 *
 * Supports nested macros: "@enemy:custom[#stat_boost:fire]"
 */

import { presetEngine, parsePresetShorthand } from './PresetLibrary';
import { compositor, BlueprintBuilder, LAYER_TYPES, BIOMES } from './LayeredCompositor';
import { PathWeaver, PATH_STYLES } from './PathWeaver';
import { TOWN_TILES } from './TownGenerator';

// ============================================================================
// MACRO DEFINITIONS
// ============================================================================

/**
 * Macro prefix meanings:
 * @ - Preset instantiation
 * ^ - Path/trail generation
 * * - Scatter/distribution (foliage, rocks, etc.)
 * # - Entity placement (monsters, NPCs)
 * ! - Object placement (chests, shrines)
 * $ - Modifier/attribute
 * % - Terrain/biome setting
 * & - Special/composite operations
 */

export const MACRO_PREFIXES = {
  PRESET: '@',
  PATH: '^',
  SCATTER: '*',
  ENTITY: '#',
  OBJECT: '!',
  MODIFIER: '$',
  TERRAIN: '%',
  COMPOSITE: '&',
};

// ============================================================================
// BUILT-IN MACRO DICTIONARY
// ============================================================================

export const MACRO_DICTIONARY = {
  // ==========================================================================
  // PRESET MACROS (@)
  // ==========================================================================

  '@town': {
    type: 'preset',
    description: 'Town cluster preset',
    variants: {
      small: { preset: 'town_cluster', params: { count: 4, radius: 4 } },
      medium: { preset: 'town_cluster', params: { count: 8, radius: 6 } },
      large: { preset: 'town_cluster', params: { count: 12, radius: 8 } },
      tiny: { preset: 'town_cluster', params: { count: 2, radius: 3 } },
    },
    defaultVariant: 'medium',
  },

  '@forest': {
    type: 'preset',
    description: 'Forest patch preset',
    variants: {
      sparse: { preset: 'forest_patch', params: { density: 0.15, hasRocks: false } },
      normal: { preset: 'forest_patch', params: { density: 0.3, hasRocks: true } },
      dense: { preset: 'forest_patch', params: { density: 0.5, hasRocks: true, hasFlowers: true } },
      dark: { preset: 'forest_patch', params: { density: 0.6, hasRocks: true, rockDensity: 0.2 } },
    },
    defaultVariant: 'normal',
  },

  '@dungeon': {
    type: 'preset',
    description: 'Dungeon room cluster',
    variants: {
      small: { preset: 'room_cluster', params: { roomCount: 3, spread: 8 } },
      medium: { preset: 'room_cluster', params: { roomCount: 5, spread: 12 } },
      large: { preset: 'room_cluster', params: { roomCount: 8, spread: 15 } },
      maze: { preset: 'room_cluster', params: { roomCount: 10, spread: 18, roomMinSize: 3, roomMaxSize: 5 } },
    },
    defaultVariant: 'medium',
  },

  '@arena': {
    type: 'preset',
    description: 'Combat arena',
    variants: {
      small: { preset: 'arena_chamber', params: { width: 12, height: 12 } },
      medium: { preset: 'arena_chamber', params: { width: 16, height: 16 } },
      large: { preset: 'arena_chamber', params: { width: 24, height: 24 } },
      boss: { preset: 'arena_chamber', params: { width: 20, height: 20, entrances: 1, pillarSpacing: 5 } },
    },
    defaultVariant: 'medium',
  },

  '@treasure': {
    type: 'preset',
    description: 'Treasure room',
    variants: {
      poor: { preset: 'treasure_room', params: { chestCount: 1, barrelCount: 3 } },
      normal: { preset: 'treasure_room', params: { chestCount: 3, barrelCount: 5 } },
      rich: { preset: 'treasure_room', params: { chestCount: 5, barrelCount: 8, hasMainChest: true } },
      vault: { preset: 'treasure_room', params: { chestCount: 8, barrelCount: 12, hasMainChest: true, radius: 6 } },
    },
    defaultVariant: 'normal',
  },

  // ==========================================================================
  // PATH MACROS (^)
  // ==========================================================================

  '^trail': {
    type: 'path',
    description: 'Trail/path generation',
    variants: {
      straight: { style: PATH_STYLES.STRAIGHT, curviness: 0 },
      curvy: { style: PATH_STYLES.WINDING, curviness: 0.4 },
      forest: { style: PATH_STYLES.FOREST, curviness: 0.5 },
      road: { style: PATH_STYLES.ROAD, curviness: 0.1 },
    },
    defaultVariant: 'curvy',
    requiresPoints: true,
  },

  '^river': {
    type: 'path',
    description: 'River/stream',
    variants: {
      narrow: { style: PATH_STYLES.RIVER, width: 1 },
      normal: { style: PATH_STYLES.RIVER, width: 2 },
      wide: { style: PATH_STYLES.RIVER, width: 4 },
    },
    defaultVariant: 'normal',
    requiresPoints: true,
  },

  '^corridor': {
    type: 'path',
    description: 'Dungeon corridor',
    variants: {
      narrow: { style: PATH_STYLES.CORRIDOR, width: 1 },
      normal: { style: PATH_STYLES.CORRIDOR, width: 2 },
      wide: { style: PATH_STYLES.CORRIDOR, width: 3 },
    },
    defaultVariant: 'normal',
    requiresPoints: true,
  },

  // ==========================================================================
  // SCATTER MACROS (*)
  // ==========================================================================

  '*trees': {
    type: 'scatter',
    description: 'Scatter trees',
    expand: (count, area) => ({
      layer: LAYER_TYPES.FOLIAGE,
      params: {
        density: Math.min(count / (area || 100), 0.6),
        types: ['trees'],
        avoid: ['structure', 'path'],
      },
    }),
  },

  '*bushes': {
    type: 'scatter',
    description: 'Scatter bushes',
    expand: (count, area) => ({
      layer: LAYER_TYPES.FOLIAGE,
      params: {
        density: Math.min(count / (area || 100), 0.4),
        types: ['bushes'],
        avoid: ['structure', 'path'],
      },
    }),
  },

  '*flowers': {
    type: 'scatter',
    description: 'Scatter flowers',
    expand: (count, area) => ({
      layer: LAYER_TYPES.FOLIAGE,
      params: {
        density: Math.min(count / (area || 100), 0.3),
        types: ['flowers'],
        avoid: ['structure', 'path', 'water'],
      },
    }),
  },

  '*rocks': {
    type: 'scatter',
    description: 'Scatter rocks/rubble',
    expand: (count, area) => ({
      layer: LAYER_TYPES.FOLIAGE,
      params: {
        density: Math.min(count / (area || 100), 0.25),
        types: ['rocks'],
        avoid: ['structure', 'path'],
      },
    }),
  },

  '*barrels': {
    type: 'scatter',
    description: 'Scatter barrels',
    expand: (count) => ({
      layer: LAYER_TYPES.OBJECTS,
      params: {
        objects: Array(count).fill({ type: 'barrel' }),
      },
    }),
  },

  // ==========================================================================
  // ENTITY MACROS (#)
  // ==========================================================================

  '#mob': {
    type: 'entity',
    description: 'Monster group',
    variants: {
      skeleton: { monsterType: 1, formation: 'cluster' },
      zombie: { monsterType: 2, formation: 'random' },
      fallen: { monsterType: 3, formation: 'cluster', hasLeader: true, leaderType: 4 },
      goat: { monsterType: 5, formation: 'line' },
      scavenger: { monsterType: 6, formation: 'circle' },
    },
    expand: (variant, count, position) => ({
      preset: 'monster_group',
      params: {
        count: count || 5,
        centerX: position?.[0] || null,
        centerY: position?.[1] || null,
        ...variant,
      },
    }),
  },

  '#boss': {
    type: 'entity',
    description: 'Boss placement',
    variants: {
      skelking: { monsterType: 100, formation: 'cluster', count: 1 },
      butcher: { monsterType: 101, formation: 'cluster', count: 1 },
      leoric: { monsterType: 102, formation: 'cluster', count: 1 },
      lazarus: { monsterType: 103, formation: 'cluster', count: 1 },
      diablo: { monsterType: 104, formation: 'cluster', count: 1 },
    },
    expand: (variant, _, position) => ({
      preset: 'monster_group',
      params: {
        count: variant.count,
        centerX: position?.[0] || null,
        centerY: position?.[1] || null,
        monsterType: variant.monsterType,
        formation: 'cluster',
        radius: 2,
      },
    }),
  },

  '#npc': {
    type: 'entity',
    description: 'NPC placement',
    variants: {
      blacksmith: { role: 'blacksmith', id: 62 },
      witch: { role: 'witch', id: 63 },
      healer: { role: 'healer', id: 64 },
      elder: { role: 'elder', id: 65 },
      innkeeper: { role: 'innkeeper', id: 66 },
      merchant: { role: 'merchant', id: 67 },
    },
    expand: (variant, _, position) => ({
      layer: LAYER_TYPES.ENTITIES,
      npc: {
        x: position?.[0] || 0,
        y: position?.[1] || 0,
        ...variant,
      },
    }),
  },

  // ==========================================================================
  // OBJECT MACROS (!)
  // ==========================================================================

  '!chest': {
    type: 'object',
    description: 'Chest placement',
    variants: {
      normal: { type: 'chest', id: 51 },
      large: { type: 'large_chest', id: 50 },
      rare: { type: 'chest', id: 51, quality: 'rare' },
      gold: { type: 'large_chest', id: 50, quality: 'gold' },
    },
    expand: (variant, _, position) => ({
      layer: LAYER_TYPES.OBJECTS,
      object: {
        x: position?.[0] || 0,
        y: position?.[1] || 0,
        ...variant,
      },
    }),
  },

  '!shrine': {
    type: 'object',
    description: 'Shrine placement',
    variants: {
      mysterious: { type: 'shrine', id: 60, effect: 'random' },
      healing: { type: 'shrine', id: 61, effect: 'heal' },
      mana: { type: 'shrine', id: 62, effect: 'mana' },
      combat: { type: 'shrine', id: 63, effect: 'damage' },
      defense: { type: 'shrine', id: 64, effect: 'armor' },
    },
    expand: (variant, _, position) => ({
      layer: LAYER_TYPES.OBJECTS,
      object: {
        x: position?.[0] || 0,
        y: position?.[1] || 0,
        ...variant,
      },
    }),
  },

  '!stairs': {
    type: 'object',
    description: 'Stairs placement',
    variants: {
      up: { type: 'stairs_up', tile: 36 },
      down: { type: 'stairs_down', tile: 37 },
    },
    expand: (variant, _, position) => ({
      setTile: {
        x: position?.[0] || 0,
        y: position?.[1] || 0,
        tile: variant.tile,
      },
    }),
  },

  // ==========================================================================
  // TERRAIN MACROS (%)
  // ==========================================================================

  '%biome': {
    type: 'terrain',
    description: 'Set terrain biome',
    variants: {
      plains: { biome: BIOMES.PLAINS },
      forest: { biome: BIOMES.FOREST },
      swamp: { biome: BIOMES.SWAMP },
      desert: { biome: BIOMES.DESERT },
      snow: { biome: BIOMES.SNOW },
      volcanic: { biome: BIOMES.VOLCANIC },
      underground: { biome: BIOMES.UNDERGROUND },
      corrupted: { biome: BIOMES.CORRUPTED },
    },
    expand: (variant) => ({
      layer: LAYER_TYPES.TERRAIN,
      params: variant,
    }),
  },

  '%floor': {
    type: 'terrain',
    description: 'Fill area with floor type',
    variants: {
      grass: { tiles: TOWN_TILES.grass },
      dirt: { tiles: TOWN_TILES.dirt },
      stone: { tiles: TOWN_TILES.cobblestone },
      water: { tiles: TOWN_TILES.water },
    },
    expand: (variant, _, bounds) => ({
      fillArea: {
        x: bounds?.[0] || 0,
        y: bounds?.[1] || 0,
        width: bounds?.[2] || 10,
        height: bounds?.[3] || 10,
        tiles: variant.tiles,
      },
    }),
  },

  // ==========================================================================
  // COMPOSITE MACROS (&)
  // ==========================================================================

  '&village': {
    type: 'composite',
    description: 'Complete village with all elements',
    expand: (variant, params) => ({
      blueprint: new BlueprintBuilder(params.width || 40, params.height || 40)
        .seed(params.seed || Date.now())
        .terrain(BIOMES.PLAINS)
        .structures({ presets: ['town_cluster:' + (variant.houses || 8)] })
        .paths({ connectStructures: true })
        .foliage(variant.foliage || 0.2)
        .build(),
    }),
    variants: {
      small: { houses: 4, foliage: 0.15 },
      medium: { houses: 8, foliage: 0.2 },
      large: { houses: 12, foliage: 0.25 },
    },
    defaultVariant: 'medium',
  },

  '&dungeon': {
    type: 'composite',
    description: 'Complete dungeon level',
    expand: (variant, params) => ({
      blueprint: new BlueprintBuilder(params.width || 40, params.height || 40)
        .seed(params.seed || Date.now())
        .addLayer(LAYER_TYPES.TERRAIN, { biome: BIOMES.UNDERGROUND })
        .structures({ presets: ['room_cluster:' + (variant.rooms || 5)] })
        .objects({ presets: ['treasure_room'] })
        .entities({ presets: [{ name: 'monster_group', params: { count: variant.monsters || 10 } }] })
        .build(),
    }),
    variants: {
      easy: { rooms: 3, monsters: 5 },
      medium: { rooms: 5, monsters: 10 },
      hard: { rooms: 8, monsters: 20 },
      boss: { rooms: 6, monsters: 15 },
    },
    defaultVariant: 'medium',
  },
};

// ============================================================================
// MACRO PARSER
// ============================================================================

/**
 * Parse a single macro expression
 *
 * Formats:
 * - "@town:medium" → preset with variant
 * - "@town:medium[seed=123]" → preset with variant and params
 * - "*trees:50" → scatter with count
 * - "#mob:skeleton[5]" → entity with count
 * - "#mob:skeleton[5]@10,15" → entity with count and position
 * - "!chest:rare@10,15" → object with position
 */
export function parseMacro(expression) {
  // Match macro pattern: prefix + name + optional variant + optional params + optional position
  const macroRegex = /^([@^*#!$%&])(\w+)(?::(\w+))?(?:\[([^\]]*)\])?(?:@(\d+),(\d+))?$/;
  const match = expression.match(macroRegex);

  if (!match) return null;

  const [, prefix, name, variant, paramsStr, posX, posY] = match;

  const result = {
    raw: expression,
    prefix,
    name,
    fullName: prefix + name,
    variant: variant || null,
    params: {},
    position: posX && posY ? [parseInt(posX), parseInt(posY)] : null,
  };

  // Parse parameters
  if (paramsStr) {
    // Check if it's a simple count (just a number)
    if (/^\d+$/.test(paramsStr)) {
      result.params.count = parseInt(paramsStr);
    } else {
      // Parse key=value pairs
      const pairs = paramsStr.split(',');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value !== undefined) {
          // Try to parse as number or boolean
          if (value === 'true') result.params[key.trim()] = true;
          else if (value === 'false') result.params[key.trim()] = false;
          else if (!isNaN(Number(value))) result.params[key.trim()] = Number(value);
          else result.params[key.trim()] = value.trim();
        }
      }
    }
  }

  return result;
}

/**
 * Parse multiple macros from a string
 * Macros are separated by whitespace or semicolons
 */
export function parseMultipleMacros(input) {
  const macros = [];
  const regex = /[@^*#!$%&]\w+(?::\w+)?(?:\[[^\]]*\])?(?:@\d+,\d+)?/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const parsed = parseMacro(match[0]);
    if (parsed) {
      macros.push(parsed);
    }
  }

  return macros;
}

// ============================================================================
// MACRO EXPANDER
// ============================================================================

/**
 * MacroProcessor - Main class for expanding macros
 */
export class MacroProcessor {
  constructor() {
    this.dictionary = { ...MACRO_DICTIONARY };
    this.customMacros = new Map();
  }

  /**
   * Register a custom macro
   */
  registerMacro(name, definition) {
    this.customMacros.set(name, definition);
  }

  /**
   * Get macro definition
   */
  getMacro(fullName) {
    return this.customMacros.get(fullName) || this.dictionary[fullName] || null;
  }

  /**
   * List all available macros
   */
  listMacros() {
    const all = { ...this.dictionary };
    for (const [name, def] of this.customMacros) {
      all[name] = def;
    }

    return Object.entries(all).map(([name, def]) => ({
      name,
      type: def.type,
      description: def.description,
      variants: def.variants ? Object.keys(def.variants) : null,
    }));
  }

  /**
   * Expand a single macro to its full representation
   * @param {Object|string} macro - Parsed macro object or raw string
   * @returns {Object} - Expanded operation
   */
  expand(macro) {
    // Parse if string
    if (typeof macro === 'string') {
      macro = parseMacro(macro);
      if (!macro) {
        return { error: `Invalid macro: ${macro}` };
      }
    }

    const definition = this.getMacro(macro.fullName);
    if (!definition) {
      return { error: `Unknown macro: ${macro.fullName}` };
    }

    // Get variant config
    let variantConfig = {};
    if (definition.variants) {
      const variantName = macro.variant || definition.defaultVariant;
      variantConfig = definition.variants[variantName] || {};

      if (!definition.variants[variantName] && macro.variant) {
        return { error: `Unknown variant '${macro.variant}' for macro ${macro.fullName}` };
      }
    }

    // Expand based on type
    let expanded;

    switch (definition.type) {
      case 'preset':
        expanded = {
          type: 'preset',
          preset: variantConfig.preset,
          params: {
            ...variantConfig.params,
            ...macro.params,
          },
        };
        if (macro.position) {
          expanded.params.centerX = macro.position[0];
          expanded.params.centerY = macro.position[1];
        }
        break;

      case 'path':
        expanded = {
          type: 'path',
          style: variantConfig.style,
          params: {
            ...variantConfig,
            ...macro.params,
          },
        };
        break;

      case 'scatter':
        if (definition.expand) {
          expanded = {
            type: 'layer',
            ...definition.expand(macro.params.count, macro.params.area),
          };
        }
        break;

      case 'entity':
        if (definition.expand) {
          expanded = {
            type: 'entity',
            ...definition.expand(variantConfig, macro.params.count, macro.position),
          };
        }
        break;

      case 'object':
        if (definition.expand) {
          expanded = {
            type: 'object',
            ...definition.expand(variantConfig, null, macro.position),
          };
        }
        break;

      case 'terrain':
        if (definition.expand) {
          expanded = {
            type: 'terrain',
            ...definition.expand(variantConfig, null, macro.position),
          };
        }
        break;

      case 'composite':
        if (definition.expand) {
          const compVariant = macro.variant || definition.defaultVariant;
          const compConfig = definition.variants?.[compVariant] || {};
          expanded = {
            type: 'composite',
            ...definition.expand(compConfig, macro.params),
          };
        }
        break;

      default:
        expanded = { error: `Unknown macro type: ${definition.type}` };
    }

    return {
      macro: macro.raw,
      expanded,
    };
  }

  /**
   * Expand multiple macros
   */
  expandAll(macros) {
    if (typeof macros === 'string') {
      macros = parseMultipleMacros(macros);
    }

    return macros.map(m => this.expand(m));
  }

  /**
   * Process a macro string and apply to grid
   * @param {Object} grid - Target grid
   * @param {string} macroString - String containing macros
   * @returns {Object} - Processing results
   */
  process(grid, macroString) {
    const macros = parseMultipleMacros(macroString);
    const results = {
      processed: 0,
      errors: [],
      operations: [],
    };

    for (const macro of macros) {
      const expanded = this.expand(macro);

      if (expanded.error) {
        results.errors.push(expanded.error);
        continue;
      }

      try {
        const opResult = this._applyOperation(grid, expanded.expanded);
        results.operations.push({
          macro: macro.raw,
          result: opResult,
        });
        results.processed++;
      } catch (e) {
        results.errors.push(`Error applying ${macro.raw}: ${e.message}`);
      }
    }

    return results;
  }

  /**
   * Apply an expanded operation to a grid
   */
  _applyOperation(grid, operation) {
    switch (operation.type) {
      case 'preset':
        return presetEngine.instantiate(grid, operation.preset, operation.params);

      case 'composite':
        if (operation.blueprint) {
          return compositor.compose(operation.blueprint);
        }
        break;

      case 'layer':
        // Apply as single layer
        return compositor.compose({
          width: grid.width,
          height: grid.height,
          layers: [{ type: operation.layer, params: operation.params }],
        });

      case 'object':
        // Direct object placement
        if (operation.object) {
          this._placeObject(grid, operation.object);
          return { placed: operation.object };
        }
        break;

      case 'entity':
        // Direct entity placement
        if (operation.preset) {
          return presetEngine.instantiate(grid, operation.preset, operation.params);
        }
        if (operation.npc) {
          this._placeNPC(grid, operation.npc);
          return { placed: operation.npc };
        }
        break;

      case 'terrain':
        if (operation.fillArea) {
          this._fillArea(grid, operation.fillArea);
          return { filled: operation.fillArea };
        }
        break;

      default:
        return { error: `Unknown operation type: ${operation.type}` };
    }

    return { applied: true };
  }

  _placeObject(grid, obj) {
    if (!grid.objects) {
      grid.objects = [];
      for (let y = 0; y < grid.height * 2; y++) {
        grid.objects[y] = new Array(grid.width * 2).fill(0);
      }
      grid.hasObjects = true;
    }

    const ox = obj.x * 2;
    const oy = obj.y * 2;
    if (grid.objects[oy] && grid.objects[oy][ox] !== undefined) {
      grid.objects[oy][ox] = obj.id || 51;
    }
  }

  _placeNPC(grid, npc) {
    if (!grid.objects) {
      grid.objects = [];
      for (let y = 0; y < grid.height * 2; y++) {
        grid.objects[y] = new Array(grid.width * 2).fill(0);
      }
      grid.hasObjects = true;
    }

    const ox = npc.x * 2;
    const oy = npc.y * 2;
    if (grid.objects[oy] && grid.objects[oy][ox] !== undefined) {
      grid.objects[oy][ox] = npc.id || 67;
    }
  }

  _fillArea(grid, area) {
    const { x, y, width, height, tiles } = area;
    const gridTiles = grid.tiles || grid;

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;
        if (gridTiles[py] && gridTiles[py][px] !== undefined) {
          const tile = Array.isArray(tiles) ? tiles[Math.floor(Math.random() * tiles.length)] : tiles;
          gridTiles[py][px] = tile;
        }
      }
    }
  }
}

// ============================================================================
// SHORTHAND NOTATION
// ============================================================================

/**
 * Ultra-compact shorthand examples:
 *
 * "@T:m" → @town:medium
 * "^t:c" → ^trail:curvy
 * "*t:50" → *trees:50
 * "#s[5]@10,15" → #mob:skeleton[5]@10,15
 *
 * This further compresses AI output
 */

export const SHORTHAND_ALIASES = {
  // Presets
  '@T': '@town',
  '@F': '@forest',
  '@D': '@dungeon',
  '@A': '@arena',
  '@$': '@treasure',

  // Paths
  '^t': '^trail',
  '^r': '^river',
  '^c': '^corridor',

  // Scatter
  '*t': '*trees',
  '*b': '*bushes',
  '*f': '*flowers',
  '*r': '*rocks',
  '*B': '*barrels',

  // Entities
  '#s': '#mob:skeleton',
  '#z': '#mob:zombie',
  '#f': '#mob:fallen',
  '#g': '#mob:goat',
  '#B': '#boss',

  // Objects
  '!c': '!chest',
  '!C': '!chest:large',
  '!s': '!shrine',
  '!u': '!stairs:up',
  '!d': '!stairs:down',

  // Terrain
  '%g': '%floor:grass',
  '%d': '%floor:dirt',
  '%s': '%floor:stone',
  '%w': '%floor:water',

  // Composites
  '&v': '&village',
  '&D': '&dungeon',
};

/**
 * Expand shorthand aliases in macro string
 */
export function expandShorthand(input) {
  let result = input;

  // Sort aliases by length (longest first) to avoid partial matches
  const sortedAliases = Object.entries(SHORTHAND_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [short, full] of sortedAliases) {
    result = result.replace(new RegExp(escapeRegex(short), 'g'), full);
  }

  return result;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton processor
export const macroProcessor = new MacroProcessor();

export default {
  MacroProcessor,
  macroProcessor,
  parseMacro,
  parseMultipleMacros,
  expandShorthand,
  MACRO_DICTIONARY,
  MACRO_PREFIXES,
  SHORTHAND_ALIASES,
};
