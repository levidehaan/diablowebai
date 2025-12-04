/**
 * Dungeon Configuration System
 *
 * Provides complete control over dungeon generation parameters.
 * Exposes all configurable aspects to AI for dynamic campaign creation.
 *
 * Features:
 * - Per-level configuration (themes, monsters, difficulty)
 * - Global difficulty scaling
 * - Story beat integration with level triggers
 * - Boss customization and placement
 * - Treasure and loot configuration
 * - Runtime parameter modification
 */

import { MONSTER_IDS, LEVEL_MONSTERS, BOSSES } from './MonsterMapper';
import { ENEMY_TYPES } from './EnemyPlacement';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Dungeon themes with their characteristics
 */
export const DUNGEON_THEMES = {
  CATHEDRAL: {
    id: 1,
    name: 'Cathedral',
    levelRange: [1, 4],
    tilePrefix: 'l1',
    ambiance: 'gothic, stone corridors, crypts',
    defaultMonsters: ['ZOMBIE', 'FALLEN_ONE', 'SKELETON', 'SCAVENGER', 'SKELETON_ARCHER'],
  },
  CATACOMBS: {
    id: 2,
    name: 'Catacombs',
    levelRange: [5, 8],
    tilePrefix: 'l2',
    ambiance: 'burial chambers, narrow passages, bones',
    defaultMonsters: ['HIDDEN', 'GOAT_MAN', 'GOAT_ARCHER', 'OVERLORD', 'GARGOYLE', 'SKELETON'],
  },
  CAVES: {
    id: 3,
    name: 'Caves',
    levelRange: [9, 12],
    tilePrefix: 'l3',
    ambiance: 'natural caverns, lava, underground lakes',
    defaultMonsters: ['ACID_BEAST', 'MAGMA_DEMON', 'HORNED_DEMON', 'LIGHTNING_DEMON'],
  },
  HELL: {
    id: 4,
    name: 'Hell',
    levelRange: [13, 16],
    tilePrefix: 'l4',
    ambiance: 'demonic architecture, fire pits, blood',
    defaultMonsters: ['BALROG', 'VIPER', 'SUCCUBUS', 'KNIGHT', 'ADVOCATE'],
  },
};

/**
 * Difficulty presets
 */
export const DIFFICULTY_PRESETS = {
  EASY: {
    name: 'Easy',
    monsterHealthMultiplier: 0.75,
    monsterDamageMultiplier: 0.75,
    monsterDensity: 0.6,
    xpMultiplier: 0.8,
    goldMultiplier: 1.2,
    itemQualityBonus: 0,
  },
  NORMAL: {
    name: 'Normal',
    monsterHealthMultiplier: 1.0,
    monsterDamageMultiplier: 1.0,
    monsterDensity: 1.0,
    xpMultiplier: 1.0,
    goldMultiplier: 1.0,
    itemQualityBonus: 0,
  },
  NIGHTMARE: {
    name: 'Nightmare',
    monsterHealthMultiplier: 1.5,
    monsterDamageMultiplier: 1.5,
    monsterDensity: 1.3,
    xpMultiplier: 1.5,
    goldMultiplier: 1.5,
    itemQualityBonus: 10,
  },
  HELL: {
    name: 'Hell',
    monsterHealthMultiplier: 2.0,
    monsterDamageMultiplier: 2.0,
    monsterDensity: 1.5,
    xpMultiplier: 2.0,
    goldMultiplier: 2.0,
    itemQualityBonus: 25,
  },
};

/**
 * Loot quality tiers
 */
export const LOOT_TIERS = {
  COMMON: { weight: 60, colorName: 'white', minLevel: 1 },
  MAGIC: { weight: 25, colorName: 'blue', minLevel: 1 },
  RARE: { weight: 10, colorName: 'yellow', minLevel: 5 },
  UNIQUE: { weight: 4, colorName: 'gold', minLevel: 10 },
  SET: { weight: 1, colorName: 'green', minLevel: 10 },
};

// ============================================================================
// DEFAULT LEVEL CONFIGURATIONS
// ============================================================================

/**
 * Create default configuration for a single level
 */
function createDefaultLevelConfig(level) {
  const theme = getThemeForLevel(level);
  const themeData = DUNGEON_THEMES[theme];

  return {
    level,
    theme,
    themeOverride: null, // Allow changing theme

    // Difficulty
    difficulty: Math.ceil(level / 4), // 1-4 scale
    difficultyMultiplier: 1.0,

    // Monster configuration
    monsterDensity: 0.3 + (level * 0.02), // Increases with depth
    allowedMonsters: [...themeData.defaultMonsters],
    disallowedMonsters: [],
    monsterLevelBonus: 0, // Add to base monster level

    // Boss configuration
    boss: BOSSES[level] || null,
    bossOverride: null, // { type, name, minions, dialogue }
    customBossLocation: null, // { x, y }

    // Treasure configuration
    treasureDensity: 0.2,
    goldMultiplier: 1.0,
    itemQualityBonus: 0,
    guaranteedDrops: [], // Items that always spawn

    // Quest/Story integration
    questTriggers: [], // Triggers that fire on level entry
    storyBeats: [], // { event, trigger, dialogue }
    requiredQuests: [], // Quest IDs needed to access this level

    // Layout overrides
    customLayout: null, // Full DUN replacement
    roomCount: { min: 3, max: 8 },
    corridorWidth: 2,

    // Special flags
    noMonsters: false,
    noTreasure: false,
    isBossLevel: level === 3 || level === 4 || level === 15 || level === 16,
    isQuestLevel: false,

    // Environment
    ambiance: themeData.ambiance,
    lightLevel: 1.0 - (level * 0.03), // Gets darker deeper
    hasFog: level >= 9,
  };
}

/**
 * Get theme name for a dungeon level
 */
export function getThemeForLevel(level) {
  if (level <= 4) return 'CATHEDRAL';
  if (level <= 8) return 'CATACOMBS';
  if (level <= 12) return 'CAVES';
  return 'HELL';
}

/**
 * Get theme data for a level
 */
export function getThemeDataForLevel(level) {
  return DUNGEON_THEMES[getThemeForLevel(level)];
}

// ============================================================================
// DUNGEON CONFIG CLASS
// ============================================================================

/**
 * Main DungeonConfig class - manages all dungeon parameters
 */
export class DungeonConfig {
  constructor(options = {}) {
    // Initialize level configurations (1-16)
    this.levels = new Map();
    for (let i = 1; i <= 16; i++) {
      this.levels.set(i, createDefaultLevelConfig(i));
    }

    // Global configuration
    this.global = {
      difficultyPreset: 'NORMAL',
      difficultyMultiplier: 1.0,
      xpMultiplier: 1.0,
      goldMultiplier: 1.0,
      itemQualityBonus: 0,
      monsterDensityMultiplier: 1.0,
      allowUniqueMonsters: true,
      allowChampionMonsters: true,
    };

    // Story beats - events triggered at specific points
    this.storyBeats = [];

    // Custom boss encounters beyond defaults
    this.customBosses = new Map();

    // Event listeners
    this.listeners = new Map();

    // Apply any initial options
    if (options.difficulty) {
      this.setDifficultyPreset(options.difficulty);
    }
    if (options.levels) {
      for (const [level, config] of Object.entries(options.levels)) {
        this.configureLevelPartial(parseInt(level), config);
      }
    }
    if (options.storyBeats) {
      this.storyBeats = options.storyBeats;
    }
  }

  // ==========================================================================
  // LEVEL CONFIGURATION
  // ==========================================================================

  /**
   * Get configuration for a specific level
   */
  getLevelConfig(level) {
    if (level < 1 || level > 16) {
      throw new Error(`Invalid level: ${level}. Must be 1-16.`);
    }
    return this.levels.get(level);
  }

  /**
   * Set complete configuration for a level
   */
  setLevelConfig(level, config) {
    if (level < 1 || level > 16) {
      throw new Error(`Invalid level: ${level}. Must be 1-16.`);
    }

    // Merge with defaults to ensure all fields present
    const defaults = createDefaultLevelConfig(level);
    const merged = { ...defaults, ...config, level };

    this.levels.set(level, merged);
    this.emit('levelConfigChanged', { level, config: merged });

    return merged;
  }

  /**
   * Partially update a level configuration
   */
  configureLevelPartial(level, partialConfig) {
    const current = this.getLevelConfig(level);
    return this.setLevelConfig(level, { ...current, ...partialConfig });
  }

  /**
   * Configure a range of levels at once
   */
  configureLevelRange(startLevel, endLevel, config) {
    const results = [];
    for (let level = startLevel; level <= endLevel; level++) {
      results.push(this.configureLevelPartial(level, config));
    }
    return results;
  }

  /**
   * Configure all levels of a specific theme
   */
  configureTheme(themeName, config) {
    const theme = DUNGEON_THEMES[themeName.toUpperCase()];
    if (!theme) {
      throw new Error(`Invalid theme: ${themeName}`);
    }

    const [start, end] = theme.levelRange;
    return this.configureLevelRange(start, end, config);
  }

  // ==========================================================================
  // MONSTER CONFIGURATION
  // ==========================================================================

  /**
   * Set allowed monsters for a level
   */
  setAllowedMonsters(level, monsters) {
    return this.configureLevelPartial(level, { allowedMonsters: monsters });
  }

  /**
   * Add monsters to allowed list
   */
  addAllowedMonsters(level, monsters) {
    const config = this.getLevelConfig(level);
    const newList = [...new Set([...config.allowedMonsters, ...monsters])];
    return this.configureLevelPartial(level, { allowedMonsters: newList });
  }

  /**
   * Remove monsters from allowed list
   */
  removeMonsters(level, monsters) {
    const config = this.getLevelConfig(level);
    const newList = config.allowedMonsters.filter(m => !monsters.includes(m));
    return this.configureLevelPartial(level, { allowedMonsters: newList });
  }

  /**
   * Set disallowed monsters (blacklist)
   */
  setDisallowedMonsters(level, monsters) {
    return this.configureLevelPartial(level, { disallowedMonsters: monsters });
  }

  /**
   * Get effective monster list for a level (considering global settings)
   */
  getEffectiveMonsters(level) {
    const config = this.getLevelConfig(level);
    let monsters = [...config.allowedMonsters];

    // Remove disallowed
    monsters = monsters.filter(m => !config.disallowedMonsters.includes(m));

    return monsters;
  }

  /**
   * Set monster density for a level
   */
  setMonsterDensity(level, density) {
    if (density < 0 || density > 1) {
      throw new Error('Monster density must be between 0 and 1');
    }
    return this.configureLevelPartial(level, { monsterDensity: density });
  }

  /**
   * Get effective monster density (with global multiplier)
   */
  getEffectiveMonsterDensity(level) {
    const config = this.getLevelConfig(level);
    const preset = DIFFICULTY_PRESETS[this.global.difficultyPreset];
    return config.monsterDensity * this.global.monsterDensityMultiplier * preset.monsterDensity;
  }

  // ==========================================================================
  // BOSS CONFIGURATION
  // ==========================================================================

  /**
   * Set boss for a level
   */
  setBoss(level, bossConfig) {
    // bossConfig: { type, name, minions, minionCount, dialogue, rewards }
    return this.configureLevelPartial(level, {
      bossOverride: bossConfig,
      isBossLevel: true,
    });
  }

  /**
   * Remove boss from a level
   */
  removeBoss(level) {
    return this.configureLevelPartial(level, {
      bossOverride: null,
      isBossLevel: false,
    });
  }

  /**
   * Get boss configuration for a level
   */
  getBoss(level) {
    const config = this.getLevelConfig(level);
    return config.bossOverride || config.boss;
  }

  /**
   * Add a custom boss encounter
   */
  addCustomBoss(id, bossConfig) {
    this.customBosses.set(id, {
      id,
      ...bossConfig,
      created: Date.now(),
    });
    return this.customBosses.get(id);
  }

  /**
   * Place a custom boss on a specific level
   */
  placeCustomBoss(level, bossId, location = null) {
    const boss = this.customBosses.get(bossId);
    if (!boss) {
      throw new Error(`Custom boss not found: ${bossId}`);
    }

    return this.configureLevelPartial(level, {
      bossOverride: boss,
      customBossLocation: location,
      isBossLevel: true,
    });
  }

  // ==========================================================================
  // DIFFICULTY CONFIGURATION
  // ==========================================================================

  /**
   * Set global difficulty preset
   */
  setDifficultyPreset(preset) {
    const upperPreset = preset.toUpperCase();
    if (!DIFFICULTY_PRESETS[upperPreset]) {
      throw new Error(`Invalid difficulty preset: ${preset}`);
    }

    this.global.difficultyPreset = upperPreset;
    this.emit('difficultyChanged', { preset: upperPreset });

    return DIFFICULTY_PRESETS[upperPreset];
  }

  /**
   * Set level-specific difficulty multiplier
   */
  setLevelDifficulty(level, multiplier) {
    return this.configureLevelPartial(level, { difficultyMultiplier: multiplier });
  }

  /**
   * Get effective difficulty for a level
   */
  getEffectiveDifficulty(level) {
    const config = this.getLevelConfig(level);
    const preset = DIFFICULTY_PRESETS[this.global.difficultyPreset];

    return {
      level: config.difficulty,
      multiplier: config.difficultyMultiplier * this.global.difficultyMultiplier,
      monsterHealth: preset.monsterHealthMultiplier * config.difficultyMultiplier,
      monsterDamage: preset.monsterDamageMultiplier * config.difficultyMultiplier,
      xp: preset.xpMultiplier * this.global.xpMultiplier,
      gold: preset.goldMultiplier * this.global.goldMultiplier,
    };
  }

  // ==========================================================================
  // TREASURE CONFIGURATION
  // ==========================================================================

  /**
   * Set treasure density for a level
   */
  setTreasureDensity(level, density) {
    if (density < 0 || density > 1) {
      throw new Error('Treasure density must be between 0 and 1');
    }
    return this.configureLevelPartial(level, { treasureDensity: density });
  }

  /**
   * Set item quality bonus for a level
   */
  setItemQualityBonus(level, bonus) {
    return this.configureLevelPartial(level, { itemQualityBonus: bonus });
  }

  /**
   * Add guaranteed drops to a level
   */
  addGuaranteedDrops(level, items) {
    const config = this.getLevelConfig(level);
    const newDrops = [...config.guaranteedDrops, ...items];
    return this.configureLevelPartial(level, { guaranteedDrops: newDrops });
  }

  /**
   * Get effective loot configuration
   */
  getEffectiveLootConfig(level) {
    const config = this.getLevelConfig(level);
    const preset = DIFFICULTY_PRESETS[this.global.difficultyPreset];

    return {
      density: config.treasureDensity,
      goldMultiplier: config.goldMultiplier * this.global.goldMultiplier * preset.goldMultiplier,
      qualityBonus: config.itemQualityBonus + this.global.itemQualityBonus + preset.itemQualityBonus,
      guaranteedDrops: config.guaranteedDrops,
    };
  }

  // ==========================================================================
  // STORY BEAT CONFIGURATION
  // ==========================================================================

  /**
   * Add a story beat to a specific level
   */
  addStoryBeat(level, beat) {
    // beat: { id, event, trigger, dialogue, actions }
    const config = this.getLevelConfig(level);
    const newBeat = {
      id: beat.id || `beat_${level}_${Date.now()}`,
      level,
      ...beat,
    };

    const storyBeats = [...config.storyBeats, newBeat];
    this.configureLevelPartial(level, { storyBeats });

    // Also add to global list
    this.storyBeats.push(newBeat);

    this.emit('storyBeatAdded', newBeat);
    return newBeat;
  }

  /**
   * Add level entry trigger
   */
  addLevelEntryTrigger(level, trigger) {
    // trigger: { id, dialogue, actions, oneShot }
    const config = this.getLevelConfig(level);
    const newTrigger = {
      id: trigger.id || `entry_${level}_${Date.now()}`,
      type: 'LEVEL_ENTERED',
      conditions: { levelId: level },
      ...trigger,
    };

    const questTriggers = [...config.questTriggers, newTrigger];
    this.configureLevelPartial(level, { questTriggers });

    return newTrigger;
  }

  /**
   * Add boss defeat trigger
   */
  addBossDefeatTrigger(level, trigger) {
    const boss = this.getBoss(level);
    if (!boss) {
      throw new Error(`No boss configured for level ${level}`);
    }

    const newTrigger = {
      id: trigger.id || `boss_defeat_${level}_${Date.now()}`,
      type: 'BOSS_KILLED',
      conditions: { bossId: boss.type || boss.name },
      ...trigger,
    };

    const config = this.getLevelConfig(level);
    const questTriggers = [...config.questTriggers, newTrigger];
    this.configureLevelPartial(level, { questTriggers });

    return newTrigger;
  }

  /**
   * Set required quests to access a level
   */
  setRequiredQuests(level, questIds) {
    return this.configureLevelPartial(level, { requiredQuests: questIds });
  }

  /**
   * Get all story beats for a level
   */
  getStoryBeats(level) {
    const config = this.getLevelConfig(level);
    return {
      onEntry: config.questTriggers.filter(t => t.type === 'LEVEL_ENTERED'),
      onBossDefeat: config.questTriggers.filter(t => t.type === 'BOSS_KILLED'),
      storyBeats: config.storyBeats,
      requiredQuests: config.requiredQuests,
    };
  }

  // ==========================================================================
  // THEME CONFIGURATION
  // ==========================================================================

  /**
   * Override theme for a specific level
   */
  setThemeOverride(level, theme) {
    const upperTheme = theme.toUpperCase();
    if (!DUNGEON_THEMES[upperTheme]) {
      throw new Error(`Invalid theme: ${theme}`);
    }

    const themeData = DUNGEON_THEMES[upperTheme];
    return this.configureLevelPartial(level, {
      themeOverride: upperTheme,
      theme: upperTheme,
      allowedMonsters: [...themeData.defaultMonsters],
      ambiance: themeData.ambiance,
    });
  }

  /**
   * Get effective theme for a level
   */
  getEffectiveTheme(level) {
    const config = this.getLevelConfig(level);
    const themeName = config.themeOverride || config.theme;
    return {
      name: themeName,
      data: DUNGEON_THEMES[themeName],
    };
  }

  // ==========================================================================
  // LAYOUT CONFIGURATION
  // ==========================================================================

  /**
   * Set custom DUN layout for a level
   */
  setCustomLayout(level, dunData) {
    return this.configureLevelPartial(level, {
      customLayout: dunData,
      isQuestLevel: true,
    });
  }

  /**
   * Set room generation parameters
   */
  setRoomParams(level, params) {
    // params: { min, max, minSize, maxSize, corridorWidth }
    return this.configureLevelPartial(level, {
      roomCount: { min: params.min || 3, max: params.max || 8 },
      corridorWidth: params.corridorWidth || 2,
    });
  }

  // ==========================================================================
  // SPECIAL FLAGS
  // ==========================================================================

  /**
   * Mark level as having no monsters
   */
  setNoMonsters(level, value = true) {
    return this.configureLevelPartial(level, { noMonsters: value });
  }

  /**
   * Mark level as having no treasure
   */
  setNoTreasure(level, value = true) {
    return this.configureLevelPartial(level, { noTreasure: value });
  }

  /**
   * Mark level as a quest level
   */
  setQuestLevel(level, value = true) {
    return this.configureLevelPartial(level, { isQuestLevel: value });
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Export configuration as JSON
   */
  export() {
    const levels = {};
    for (const [level, config] of this.levels) {
      levels[level] = { ...config };
    }

    return {
      version: 1,
      global: { ...this.global },
      levels,
      storyBeats: [...this.storyBeats],
      customBosses: Object.fromEntries(this.customBosses),
    };
  }

  /**
   * Import configuration from JSON
   */
  import(data) {
    if (data.version !== 1) {
      throw new Error(`Unsupported config version: ${data.version}`);
    }

    // Import global settings
    if (data.global) {
      this.global = { ...this.global, ...data.global };
    }

    // Import level configurations
    if (data.levels) {
      for (const [level, config] of Object.entries(data.levels)) {
        this.setLevelConfig(parseInt(level), config);
      }
    }

    // Import story beats
    if (data.storyBeats) {
      this.storyBeats = data.storyBeats;
    }

    // Import custom bosses
    if (data.customBosses) {
      this.customBosses = new Map(Object.entries(data.customBosses));
    }

    this.emit('configImported', data);
    return this;
  }

  /**
   * Reset to defaults
   */
  reset() {
    for (let i = 1; i <= 16; i++) {
      this.levels.set(i, createDefaultLevelConfig(i));
    }

    this.global = {
      difficultyPreset: 'NORMAL',
      difficultyMultiplier: 1.0,
      xpMultiplier: 1.0,
      goldMultiplier: 1.0,
      itemQualityBonus: 0,
      monsterDensityMultiplier: 1.0,
      allowUniqueMonsters: true,
      allowChampionMonsters: true,
    };

    this.storyBeats = [];
    this.customBosses.clear();

    this.emit('configReset');
    return this;
  }

  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[DungeonConfig] Event error (${event}):`, err);
        }
      }
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get summary of all configurations
   */
  getSummary() {
    const summary = {
      global: this.global,
      levelSummaries: [],
      totalBosses: 0,
      totalStoryBeats: this.storyBeats.length,
      customBossCount: this.customBosses.size,
    };

    for (let level = 1; level <= 16; level++) {
      const config = this.getLevelConfig(level);
      const effective = this.getEffectiveDifficulty(level);

      summary.levelSummaries.push({
        level,
        theme: config.themeOverride || config.theme,
        difficulty: effective.level,
        monsterCount: config.allowedMonsters.length,
        hasBoss: !!this.getBoss(level),
        isQuestLevel: config.isQuestLevel,
        storyBeatCount: config.storyBeats.length + config.questTriggers.length,
      });

      if (this.getBoss(level)) {
        summary.totalBosses++;
      }
    }

    return summary;
  }

  /**
   * Validate configuration for errors
   */
  validate() {
    const errors = [];
    const warnings = [];

    for (let level = 1; level <= 16; level++) {
      const config = this.getLevelConfig(level);

      // Check monster list
      if (config.allowedMonsters.length === 0 && !config.noMonsters) {
        warnings.push(`Level ${level}: No monsters configured`);
      }

      // Check boss level progression
      if (config.isBossLevel && !this.getBoss(level)) {
        errors.push(`Level ${level}: Marked as boss level but no boss configured`);
      }

      // Check required quests reference valid quests
      for (const questId of config.requiredQuests) {
        // This would need integration with quest system to fully validate
        if (!questId) {
          errors.push(`Level ${level}: Empty quest ID in requirements`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const dungeonConfig = new DungeonConfig();

export default dungeonConfig;

// Named exports for direct access
export {
  createDefaultLevelConfig,
};
