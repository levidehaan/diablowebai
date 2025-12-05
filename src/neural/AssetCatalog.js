/**
 * Asset Catalog System
 *
 * Comprehensive catalog of game assets from spawn.mpq with:
 * - Full asset inventory by category
 * - Asset reuse mapping (which assets can substitute for others)
 * - Combination rules for composite assets
 * - Search and filtering capabilities
 * - Metadata extraction from asset files
 */

// ============================================================================
// ASSET CATEGORIES
// ============================================================================

export const AssetCategory = {
  MONSTER: 'monster',
  NPC: 'npc',
  PLAYER: 'player',
  OBJECT: 'object',
  TILE: 'tile',
  UI: 'ui',
  EFFECT: 'effect',
  ITEM: 'item',
  CURSOR: 'cursor',
  FONT: 'font',
};

export const AssetType = {
  CEL: 'cel',          // Single-direction sprites
  CL2: 'cl2',          // Multi-direction sprites
  PCX: 'pcx',          // Palette files
  DUN: 'dun',          // Level layouts
  AMP: 'amp',          // Automap data
  TIL: 'til',          // Tile definitions
  MIN: 'min',          // Minimaps
  SOL: 'sol',          // Solid data
  PAL: 'pal',          // Palette
  TRN: 'trn',          // Color translation
  WAV: 'wav',          // Sound effects
};

// ============================================================================
// MONSTER ASSETS CATALOG
// ============================================================================

/**
 * Complete monster sprite catalog from spawn.mpq
 */
export const MONSTER_ASSETS = {
  // Act 1 - Cathedral
  zombie: {
    id: 1,
    path: 'monsters\\zombie',
    variants: ['zombie', 'ghoul', 'rotfeast', 'black_death'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 16, hit: 8, death: 24 },
    size: { width: 128, height: 128 },
    theme: 'CATHEDRAL',
  },
  skeleton: {
    id: 33,
    path: 'monsters\\skelsd',
    variants: ['skeleton', 'corpse_axe', 'burning_dead', 'horror'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 16, hit: 8, death: 16 },
    size: { width: 96, height: 96 },
    theme: 'CATHEDRAL',
  },
  skeleton_archer: {
    id: 37,
    path: 'monsters\\skelbow',
    variants: ['skeleton_archer', 'corpse_bow', 'burning_dead_archer', 'horror_archer'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 16 },
    size: { width: 96, height: 96 },
    theme: 'CATHEDRAL',
  },
  fallen: {
    id: 17,
    path: 'monsters\\fallen',
    variants: ['fallen_one', 'carver', 'devil_kin', 'dark_one'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 6, death: 16 },
    size: { width: 64, height: 64 },
    theme: 'CATHEDRAL',
  },
  scavenger: {
    id: 5,
    path: 'monsters\\scav',
    variants: ['scavenger', 'plague_eater', 'shadow_beast', 'bone_gasher'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 16 },
    size: { width: 96, height: 96 },
    theme: 'CATHEDRAL',
  },

  // Act 2 - Catacombs
  goat_man: {
    id: 41,
    path: 'monsters\\goatmace',
    variants: ['flesh_clan', 'stone_clan', 'fire_clan', 'night_clan'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 16, hit: 8, death: 24 },
    size: { width: 128, height: 128 },
    theme: 'CATACOMBS',
  },
  goat_archer: {
    id: 45,
    path: 'monsters\\goatbow',
    variants: ['flesh_clan_archer', 'stone_clan_archer', 'fire_clan_archer', 'night_clan_archer'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 24 },
    size: { width: 128, height: 128 },
    theme: 'CATACOMBS',
  },
  hidden: {
    id: 49,
    path: 'monsters\\sneak',
    variants: ['hidden', 'stalker', 'unseen', 'illusion_weaver'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 16 },
    size: { width: 96, height: 96 },
    theme: 'CATACOMBS',
  },

  // Act 3 - Caves
  acid_beast: {
    id: 61,
    path: 'monsters\\acid',
    variants: ['acid_beast', 'poison_spitter', 'pit_beast', 'lava_lord'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 24 },
    size: { width: 128, height: 128 },
    theme: 'CAVES',
  },
  toad_demon: {
    id: 65,
    path: 'monsters\\toad',
    variants: ['toad_demon', 'fire_toad', 'hell_spawn', 'winged_demon'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 16, hit: 8, death: 20 },
    size: { width: 128, height: 128 },
    theme: 'CAVES',
  },

  // Act 4 - Hell
  balrog: {
    id: 81,
    path: 'monsters\\balrog',
    variants: ['slayer', 'guardian', 'vortex_lord', 'balrog'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 20, hit: 8, death: 32 },
    size: { width: 160, height: 160 },
    theme: 'HELL',
  },
  succubus: {
    id: 85,
    path: 'monsters\\succ',
    variants: ['succubus', 'snow_witch', 'hell_spawn', 'soul_burner'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 8, death: 16 },
    size: { width: 96, height: 96 },
    theme: 'HELL',
  },
  advocate: {
    id: 89,
    path: 'monsters\\mage',
    variants: ['counselor', 'magistrate', 'cabalist', 'advocate'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death', 'special'],
    frameCount: { stand: 8, walk: 8, attack: 12, hit: 6, death: 20, special: 8 },
    size: { width: 128, height: 128 },
    theme: 'HELL',
  },

  // Bosses
  skeleton_king: {
    id: 21,
    path: 'monsters\\skelking',
    variants: ['skeleton_king'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death', 'special'],
    frameCount: { stand: 8, walk: 8, attack: 20, hit: 8, death: 32, special: 12 },
    size: { width: 192, height: 192 },
    theme: 'CATHEDRAL',
    isBoss: true,
  },
  butcher: {
    id: 22,
    path: 'monsters\\butcher',
    variants: ['butcher'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death'],
    frameCount: { stand: 8, walk: 8, attack: 16, hit: 8, death: 24 },
    size: { width: 160, height: 160 },
    theme: 'CATHEDRAL',
    isBoss: true,
  },
  diablo: {
    id: 101,
    path: 'monsters\\diablo',
    variants: ['diablo'],
    directions: 8,
    animations: ['stand', 'walk', 'attack', 'hit', 'death', 'special'],
    frameCount: { stand: 8, walk: 8, attack: 24, hit: 8, death: 40, special: 16 },
    size: { width: 256, height: 256 },
    theme: 'HELL',
    isBoss: true,
  },
};

// ============================================================================
// OBJECT ASSETS CATALOG
// ============================================================================

/**
 * Complete object/decor sprite catalog
 */
export const OBJECT_ASSETS = {
  // Containers
  barrel: {
    id: 1,
    path: 'objects\\barrel',
    animations: ['idle', 'break'],
    frameCount: { idle: 1, break: 8 },
    size: { width: 64, height: 64 },
    interactive: true,
    breakable: true,
  },
  chest: {
    id: 2,
    path: 'objects\\chest1',
    animations: ['closed', 'opening', 'open'],
    frameCount: { closed: 1, opening: 8, open: 1 },
    size: { width: 64, height: 64 },
    interactive: true,
    variants: ['chest1', 'chest2', 'chest3'],
  },
  sarcophagus: {
    id: 4,
    path: 'objects\\sarc',
    animations: ['closed', 'opening', 'open'],
    frameCount: { closed: 1, opening: 12, open: 1 },
    size: { width: 96, height: 64 },
    interactive: true,
    theme: 'CATACOMBS',
  },

  // Shrines
  shrine_cross: {
    id: 10,
    path: 'objects\\shrineG',
    animations: ['idle', 'activate'],
    frameCount: { idle: 1, activate: 12 },
    size: { width: 64, height: 96 },
    interactive: true,
    theme: 'CATHEDRAL',
  },
  shrine_cauldron: {
    id: 11,
    path: 'objects\\cauldron',
    animations: ['idle', 'bubbling', 'activate'],
    frameCount: { idle: 1, bubbling: 8, activate: 12 },
    size: { width: 64, height: 64 },
    interactive: true,
  },

  // Decorative
  torch_stand: {
    id: 30,
    path: 'objects\\ltorch',
    animations: ['burning'],
    frameCount: { burning: 8 },
    size: { width: 32, height: 96 },
    emitsLight: true,
  },
  candle: {
    id: 31,
    path: 'objects\\candle',
    animations: ['burning'],
    frameCount: { burning: 4 },
    size: { width: 16, height: 32 },
    emitsLight: true,
  },
  bookshelf: {
    id: 40,
    path: 'objects\\bcase',
    animations: ['idle'],
    frameCount: { idle: 1 },
    size: { width: 64, height: 96 },
    themes: ['CATHEDRAL', 'CATACOMBS'],
  },
  altar: {
    id: 42,
    path: 'objects\\altar',
    animations: ['idle'],
    frameCount: { idle: 1 },
    size: { width: 96, height: 64 },
    themes: ['CATHEDRAL'],
  },
  fountain: {
    id: 43,
    path: 'objects\\fountain',
    animations: ['flowing'],
    frameCount: { flowing: 8 },
    size: { width: 64, height: 64 },
    themes: ['CATACOMBS'],
  },

  // Dungeon features
  lever: {
    id: 5,
    path: 'objects\\lever',
    animations: ['off', 'switch', 'on'],
    frameCount: { off: 1, switch: 6, on: 1 },
    size: { width: 32, height: 48 },
    interactive: true,
    triggerable: true,
  },
  door_cathedral: {
    id: 6,
    path: 'objects\\doors\\l1',
    animations: ['closed', 'opening', 'open'],
    frameCount: { closed: 1, opening: 8, open: 1 },
    size: { width: 64, height: 128 },
    interactive: true,
    theme: 'CATHEDRAL',
  },
  door_catacombs: {
    id: 7,
    path: 'objects\\doors\\l2',
    animations: ['closed', 'opening', 'open'],
    frameCount: { closed: 1, opening: 8, open: 1 },
    size: { width: 64, height: 128 },
    interactive: true,
    theme: 'CATACOMBS',
  },
};

// ============================================================================
// TILE ASSETS CATALOG
// ============================================================================

/**
 * Tileset information by theme
 */
export const TILE_ASSETS = {
  CATHEDRAL: {
    path: 'levels\\l1data',
    tilCount: 206,
    minCount: 206,
    solPath: 'levels\\l1data\\l1.sol',
    ampPath: 'levels\\l1data\\l1.amp',
    palettePath: 'levels\\l1data\\l1.pal',
    colors: {
      floor: [0x60, 0x60, 0x60],
      wall: [0x40, 0x30, 0x30],
      door: [0x80, 0x60, 0x40],
    },
  },
  CATACOMBS: {
    path: 'levels\\l2data',
    tilCount: 160,
    minCount: 160,
    solPath: 'levels\\l2data\\l2.sol',
    ampPath: 'levels\\l2data\\l2.amp',
    palettePath: 'levels\\l2data\\l2.pal',
    colors: {
      floor: [0x50, 0x40, 0x30],
      wall: [0x30, 0x28, 0x20],
      door: [0x70, 0x50, 0x30],
    },
  },
  CAVES: {
    path: 'levels\\l3data',
    tilCount: 166,
    minCount: 166,
    solPath: 'levels\\l3data\\l3.sol',
    ampPath: 'levels\\l3data\\l3.amp',
    palettePath: 'levels\\l3data\\l3.pal',
    colors: {
      floor: [0x40, 0x50, 0x40],
      wall: [0x30, 0x40, 0x30],
      lava: [0xFF, 0x60, 0x00],
    },
  },
  HELL: {
    path: 'levels\\l4data',
    tilCount: 212,
    minCount: 212,
    solPath: 'levels\\l4data\\l4.sol',
    ampPath: 'levels\\l4data\\l4.amp',
    palettePath: 'levels\\l4data\\l4.pal',
    colors: {
      floor: [0x40, 0x20, 0x20],
      wall: [0x30, 0x10, 0x10],
      lava: [0xFF, 0x40, 0x00],
    },
  },
  TOWN: {
    path: 'levels\\towndata',
    tilCount: 384,
    minCount: 384,
    solPath: 'levels\\towndata\\town.sol',
    palettePath: 'levels\\towndata\\town.pal',
    colors: {
      grass: [0x40, 0x80, 0x40],
      path: [0x80, 0x70, 0x50],
      building: [0x60, 0x50, 0x40],
    },
  },
};

// ============================================================================
// ASSET REUSE MAPPING
// ============================================================================

/**
 * Maps assets that can substitute for each other
 * Used when an exact asset isn't available or for variety
 */
export const ASSET_SUBSTITUTIONS = {
  monsters: {
    // Zombies can substitute for each other
    zombie: ['ghoul', 'rotfeast', 'black_death'],
    ghoul: ['zombie', 'rotfeast'],

    // Skeletons interchangeable
    skeleton: ['corpse_axe', 'burning_dead', 'horror'],
    skeleton_archer: ['corpse_bow', 'burning_dead_archer', 'horror_archer'],

    // Fallen variants
    fallen_one: ['carver', 'devil_kin', 'dark_one'],

    // Goat men
    flesh_clan: ['stone_clan', 'fire_clan', 'night_clan'],

    // Demons
    balrog: ['slayer', 'guardian', 'vortex_lord'],
    succubus: ['snow_witch', 'hell_spawn', 'soul_burner'],
  },

  objects: {
    // Containers
    barrel: ['barrel'],
    chest: ['chest1', 'chest2', 'chest3'],

    // Light sources
    torch: ['ltorch', 'torch2', 'candle'],

    // Shrines (visual only, effects differ)
    shrine: ['shrineG', 'shrineA', 'shrineC'],
  },

  tiles: {
    // Floor variants
    floor_cathedral: [13, 14, 15, 16],
    floor_catacombs: [13, 14, 15],
    floor_caves: [13, 14],
    floor_hell: [13, 14, 15],

    // Wall variants
    wall_cathedral: [1, 2, 7, 8],
    wall_catacombs: [1, 2, 5, 6],
  },
};

// ============================================================================
// COMBINATION RULES
// ============================================================================

/**
 * Rules for combining assets together
 */
export const COMBINATION_RULES = {
  /**
   * Monsters that work well together (pack bonuses, etc)
   */
  monsterGroups: {
    fallen_party: {
      leader: 'fallen_shaman',
      followers: ['fallen_one', 'carver'],
      ratio: { leader: 1, followers: [4, 8] },
      description: 'Shaman leads a group of fallen',
    },
    skeleton_army: {
      types: ['skeleton', 'skeleton_archer'],
      ratio: [3, 1],
      minCount: 4,
      maxCount: 12,
      description: 'Mixed melee and ranged skeletons',
    },
    goat_warband: {
      types: ['goat_man', 'goat_archer'],
      ratio: [2, 1],
      minCount: 3,
      maxCount: 9,
      description: 'Goatmen with support archers',
    },
  },

  /**
   * Room decoration rules
   */
  roomDecorations: {
    library: {
      required: ['bookshelf'],
      optional: ['candle', 'torch_stand'],
      floor: 'floor_cathedral',
    },
    treasury: {
      required: ['chest'],
      optional: ['barrel', 'gold_pile'],
      probability: { chest: 0.3, barrel: 0.4 },
    },
    shrine_room: {
      required: ['shrine'],
      optional: ['torch_stand', 'candle'],
      spacing: { shrine: { min: 3, max: 1 } },
    },
    throne_room: {
      required: ['throne'],
      optional: ['torch_stand', 'banner'],
      centerpiece: true,
    },
  },

  /**
   * Theme-appropriate combinations
   */
  themeAssets: {
    CATHEDRAL: {
      monsters: ['zombie', 'skeleton', 'fallen', 'scavenger'],
      objects: ['barrel', 'chest', 'altar', 'bookshelf', 'shrine_cross'],
      bosses: ['skeleton_king', 'butcher'],
    },
    CATACOMBS: {
      monsters: ['goat_man', 'goat_archer', 'hidden', 'skeleton'],
      objects: ['sarcophagus', 'chest', 'fountain', 'shrine_cauldron'],
      bosses: ['boneripper'],
    },
    CAVES: {
      monsters: ['acid_beast', 'toad_demon', 'scavenger'],
      objects: ['barrel', 'chest', 'lever'],
      bosses: ['farnham'],
    },
    HELL: {
      monsters: ['balrog', 'succubus', 'advocate'],
      objects: ['lever', 'chest'],
      bosses: ['diablo'],
    },
  },
};

// ============================================================================
// ASSET CATALOG CLASS
// ============================================================================

/**
 * Asset Catalog - Main interface for querying game assets
 */
export class AssetCatalog {
  constructor() {
    this.cache = new Map();
    this.loaded = false;
    this.mpqReader = null;
  }

  /**
   * Initialize with an MPQ reader
   */
  initialize(mpqReader) {
    this.mpqReader = mpqReader;
    this.loaded = true;
    console.log('[AssetCatalog] Initialized');
  }

  // ==========================================================================
  // MONSTER QUERIES
  // ==========================================================================

  /**
   * Get monster asset info by ID or name
   */
  getMonster(idOrName) {
    if (typeof idOrName === 'number') {
      return Object.values(MONSTER_ASSETS).find(m => m.id === idOrName);
    }
    return MONSTER_ASSETS[idOrName.toLowerCase()];
  }

  /**
   * Get all monsters for a theme
   */
  getMonstersForTheme(theme) {
    return Object.entries(MONSTER_ASSETS)
      .filter(([_, m]) => m.theme === theme)
      .map(([name, data]) => ({ name, ...data }));
  }

  /**
   * Get all bosses
   */
  getBosses() {
    return Object.entries(MONSTER_ASSETS)
      .filter(([_, m]) => m.isBoss)
      .map(([name, data]) => ({ name, ...data }));
  }

  /**
   * Find substitute monsters
   */
  getMonsterSubstitutes(name) {
    const key = name.toLowerCase();
    return ASSET_SUBSTITUTIONS.monsters[key] || [];
  }

  // ==========================================================================
  // OBJECT QUERIES
  // ==========================================================================

  /**
   * Get object asset info
   */
  getObject(idOrName) {
    if (typeof idOrName === 'number') {
      return Object.values(OBJECT_ASSETS).find(o => o.id === idOrName);
    }
    return OBJECT_ASSETS[idOrName.toLowerCase()];
  }

  /**
   * Get all interactive objects
   */
  getInteractiveObjects() {
    return Object.entries(OBJECT_ASSETS)
      .filter(([_, o]) => o.interactive)
      .map(([name, data]) => ({ name, ...data }));
  }

  /**
   * Get objects for a theme
   */
  getObjectsForTheme(theme) {
    return Object.entries(OBJECT_ASSETS)
      .filter(([_, o]) => !o.theme || o.theme === theme || o.themes?.includes(theme))
      .map(([name, data]) => ({ name, ...data }));
  }

  // ==========================================================================
  // TILE QUERIES
  // ==========================================================================

  /**
   * Get tileset info for a theme
   */
  getTileset(theme) {
    return TILE_ASSETS[theme];
  }

  /**
   * Get all tilesets
   */
  getAllTilesets() {
    return { ...TILE_ASSETS };
  }

  // ==========================================================================
  // COMBINATION QUERIES
  // ==========================================================================

  /**
   * Get monster group configuration
   */
  getMonsterGroup(groupName) {
    return COMBINATION_RULES.monsterGroups[groupName];
  }

  /**
   * Get room decoration rules
   */
  getRoomDecoration(roomType) {
    return COMBINATION_RULES.roomDecorations[roomType];
  }

  /**
   * Get all assets appropriate for a theme
   */
  getThemeAssets(theme) {
    return COMBINATION_RULES.themeAssets[theme] || null;
  }

  // ==========================================================================
  // SEARCH
  // ==========================================================================

  /**
   * Search all assets by name/tag
   */
  search(query, options = {}) {
    const { category, theme, limit = 50 } = options;
    const results = [];
    const lowerQuery = query.toLowerCase();

    // Search monsters
    if (!category || category === AssetCategory.MONSTER) {
      for (const [name, data] of Object.entries(MONSTER_ASSETS)) {
        if (name.includes(lowerQuery) || data.variants?.some(v => v.includes(lowerQuery))) {
          if (!theme || data.theme === theme) {
            results.push({ category: AssetCategory.MONSTER, name, ...data });
          }
        }
      }
    }

    // Search objects
    if (!category || category === AssetCategory.OBJECT) {
      for (const [name, data] of Object.entries(OBJECT_ASSETS)) {
        if (name.includes(lowerQuery)) {
          if (!theme || !data.theme || data.theme === theme) {
            results.push({ category: AssetCategory.OBJECT, name, ...data });
          }
        }
      }
    }

    return results.slice(0, limit);
  }

  // ==========================================================================
  // ASSET LOADING
  // ==========================================================================

  /**
   * Load asset data from MPQ
   */
  async loadAsset(path) {
    if (!this.mpqReader) {
      throw new Error('MPQ reader not initialized');
    }

    // Check cache
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    // Load from MPQ
    const data = await this.mpqReader.getFile(path);
    if (data) {
      this.cache.set(path, data);
    }

    return data;
  }

  /**
   * Load monster sprite set
   */
  async loadMonsterSprites(monsterName) {
    const monster = this.getMonster(monsterName);
    if (!monster) {
      throw new Error(`Unknown monster: ${monsterName}`);
    }

    const sprites = {};
    for (const anim of monster.animations) {
      const path = `${monster.path}\\${anim}.cl2`;
      sprites[anim] = await this.loadAsset(path);
    }

    return sprites;
  }

  /**
   * Load object sprite
   */
  async loadObjectSprite(objectName) {
    const obj = this.getObject(objectName);
    if (!obj) {
      throw new Error(`Unknown object: ${objectName}`);
    }

    return this.loadAsset(`${obj.path}.cel`);
  }

  // ==========================================================================
  // METADATA
  // ==========================================================================

  /**
   * Get catalog statistics
   */
  getStats() {
    return {
      monsters: Object.keys(MONSTER_ASSETS).length,
      bosses: Object.values(MONSTER_ASSETS).filter(m => m.isBoss).length,
      objects: Object.keys(OBJECT_ASSETS).length,
      tilesets: Object.keys(TILE_ASSETS).length,
      monsterGroups: Object.keys(COMBINATION_RULES.monsterGroups).length,
      roomTypes: Object.keys(COMBINATION_RULES.roomDecorations).length,
      cacheSize: this.cache.size,
    };
  }

  /**
   * Clear the asset cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Export catalog as JSON
   */
  export() {
    return {
      monsters: MONSTER_ASSETS,
      objects: OBJECT_ASSETS,
      tiles: TILE_ASSETS,
      substitutions: ASSET_SUBSTITUTIONS,
      combinations: COMBINATION_RULES,
      stats: this.getStats(),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const assetCatalog = new AssetCatalog();

export default assetCatalog;
