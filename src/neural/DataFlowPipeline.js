/**
 * Data Flow Pipeline
 *
 * Unified pipeline for: AI Intent → Parameters → MPQ Build → Game Load
 *
 * This orchestrates the flow from AI-generated campaign/world data
 * through dungeon configuration, MPQ building, and game loading.
 *
 * Pipeline Stages:
 * 1. INTENT: AI generates campaign/world blueprint
 * 2. CONFIGURE: Convert intent to DungeonConfig parameters
 * 3. VALIDATE: Verify configuration is valid
 * 4. BUILD: Generate MPQ files from configuration
 * 5. LOAD: Load game with modified MPQ
 *
 * Features:
 * - Rollback mechanism for failed builds
 * - Configuration caching
 * - Progress tracking and events
 * - Validation at each stage
 */

import dungeonConfig, { DungeonConfig, DUNGEON_THEMES, DIFFICULTY_PRESETS } from './DungeonConfig';
import { questTriggerSystem } from './QuestTriggerSystem';
import { gameEventEmitter } from './GameEventEmitter';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Pipeline stages
 */
export const PipelineStage = {
  IDLE: 'idle',
  INTENT: 'intent',
  CONFIGURE: 'configure',
  VALIDATE: 'validate',
  BUILD: 'build',
  LOAD: 'load',
  COMPLETE: 'complete',
  ERROR: 'error',
};

/**
 * Pipeline status
 */
export const PipelineStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
};

// ============================================================================
// CONFIGURATION CACHE
// ============================================================================

/**
 * Simple LRU cache for configurations
 */
class ConfigCache {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Generate cache key from config
   */
  generateKey(config) {
    // Create a hash from config essential properties
    const essential = {
      global: config.global,
      levels: Object.fromEntries(
        Array.from(config.levels || []).map(([k, v]) => [
          k,
          { theme: v.theme, monsterDensity: v.monsterDensity, boss: v.boss?.type },
        ])
      ),
    };
    return JSON.stringify(essential);
  }

  /**
   * Get cached build result
   */
  get(config) {
    const key = this.generateKey(config);
    const cached = this.cache.get(key);
    if (cached) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    return null;
  }

  /**
   * Store build result
   */
  set(config, result) {
    const key = this.generateKey(config);

    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      entries: Array.from(this.cache.keys()).map((k) => ({
        key: k.substring(0, 50) + '...',
        timestamp: this.cache.get(k).timestamp,
      })),
    };
  }
}

// ============================================================================
// PIPELINE STATE
// ============================================================================

/**
 * Represents the state of a pipeline execution
 */
class PipelineState {
  constructor() {
    this.id = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.stage = PipelineStage.IDLE;
    this.status = PipelineStatus.PENDING;
    this.progress = 0;
    this.startTime = null;
    this.endTime = null;

    // Data at each stage
    this.intent = null; // AI-generated blueprint
    this.config = null; // DungeonConfig
    this.validation = null; // Validation results
    this.buildResult = null; // MPQ build output
    this.loadResult = null; // Game load result

    // Rollback data
    this.previousConfig = null;
    this.previousMpq = null;

    // Error tracking
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Create snapshot for rollback
   */
  createSnapshot() {
    return {
      config: this.config ? this.config.export() : null,
      mpq: this.previousMpq,
      timestamp: Date.now(),
    };
  }

  /**
   * Get duration in ms
   */
  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Export state for debugging/logging
   */
  export() {
    return {
      id: this.id,
      stage: this.stage,
      status: this.status,
      progress: this.progress,
      duration: this.getDuration(),
      errors: this.errors,
      warnings: this.warnings,
      hasIntent: !!this.intent,
      hasConfig: !!this.config,
      hasValidation: !!this.validation,
      hasBuildResult: !!this.buildResult,
    };
  }
}

// ============================================================================
// DATA FLOW PIPELINE
// ============================================================================

/**
 * Main Data Flow Pipeline class
 */
class DataFlowPipeline {
  constructor() {
    this.cache = new ConfigCache(10);
    this.currentState = null;
    this.history = []; // Past pipeline runs
    this.maxHistory = 20;

    // Event listeners
    this.listeners = new Map();

    // Builder and loader references (set externally)
    this.mpqBuilder = null;
    this.gameLoader = null;

    // Active quest registrations
    this.registeredQuests = new Map();
  }

  // ==========================================================================
  // PIPELINE EXECUTION
  // ==========================================================================

  /**
   * Execute the full pipeline
   * @param {Object} intent - AI-generated intent/blueprint
   * @param {Object} options - Pipeline options
   * @returns {Promise<PipelineState>}
   */
  async execute(intent, options = {}) {
    const state = new PipelineState();
    this.currentState = state;
    state.startTime = Date.now();

    try {
      // Stage 1: Process Intent
      state.stage = PipelineStage.INTENT;
      state.status = PipelineStatus.IN_PROGRESS;
      this.emit('stageStart', { stage: PipelineStage.INTENT, state });

      state.intent = this.processIntent(intent);
      state.progress = 20;
      this.emit('progress', { progress: 20, stage: PipelineStage.INTENT });

      // Stage 2: Configure
      state.stage = PipelineStage.CONFIGURE;
      this.emit('stageStart', { stage: PipelineStage.CONFIGURE, state });

      // Save current config for rollback
      state.previousConfig = dungeonConfig.export();

      state.config = this.configureFromIntent(state.intent, options);
      state.progress = 40;
      this.emit('progress', { progress: 40, stage: PipelineStage.CONFIGURE });

      // Stage 3: Validate
      state.stage = PipelineStage.VALIDATE;
      this.emit('stageStart', { stage: PipelineStage.VALIDATE, state });

      state.validation = this.validate(state.config);
      if (!state.validation.valid && !options.ignoreValidationErrors) {
        throw new Error(`Validation failed: ${state.validation.errors.join(', ')}`);
      }
      state.warnings.push(...state.validation.warnings);
      state.progress = 60;
      this.emit('progress', { progress: 60, stage: PipelineStage.VALIDATE });

      // Stage 4: Build (if builder available)
      if (this.mpqBuilder && !options.skipBuild) {
        state.stage = PipelineStage.BUILD;
        this.emit('stageStart', { stage: PipelineStage.BUILD, state });

        // Check cache first
        const cached = this.cache.get(state.config);
        if (cached && !options.skipCache) {
          state.buildResult = cached.result;
          console.log('[Pipeline] Using cached build result');
        } else {
          state.buildResult = await this.build(state.config, options);
          this.cache.set(state.config, state.buildResult);
        }
        state.progress = 80;
        this.emit('progress', { progress: 80, stage: PipelineStage.BUILD });
      }

      // Stage 5: Load (if loader available)
      if (this.gameLoader && !options.skipLoad && state.buildResult) {
        state.stage = PipelineStage.LOAD;
        this.emit('stageStart', { stage: PipelineStage.LOAD, state });

        state.loadResult = await this.load(state.buildResult, options);
        state.progress = 100;
        this.emit('progress', { progress: 100, stage: PipelineStage.LOAD });
      }

      // Register quests from intent
      if (state.intent.quests) {
        this.registerQuests(state.intent.quests);
      }

      // Complete
      state.stage = PipelineStage.COMPLETE;
      state.status = PipelineStatus.COMPLETED;
      state.endTime = Date.now();

      this.emit('complete', { state });
      this.addToHistory(state);

      return state;
    } catch (error) {
      state.stage = PipelineStage.ERROR;
      state.status = PipelineStatus.FAILED;
      state.errors.push(error.message);
      state.endTime = Date.now();

      this.emit('error', { error, state });
      this.addToHistory(state);

      // Attempt rollback if configured
      if (options.rollbackOnError && state.previousConfig) {
        await this.rollback(state);
      }

      throw error;
    }
  }

  /**
   * Execute only the configuration stage (no build/load)
   */
  async configure(intent, options = {}) {
    return this.execute(intent, { ...options, skipBuild: true, skipLoad: true });
  }

  /**
   * Build from existing configuration
   */
  async buildFromConfig(config, options = {}) {
    const state = new PipelineState();
    state.config = config;

    state.validation = this.validate(config);
    if (!state.validation.valid && !options.ignoreValidationErrors) {
      throw new Error(`Validation failed: ${state.validation.errors.join(', ')}`);
    }

    if (this.mpqBuilder) {
      state.buildResult = await this.build(config, options);
    }

    return state;
  }

  // ==========================================================================
  // INTENT PROCESSING
  // ==========================================================================

  /**
   * Process AI-generated intent into normalized format
   */
  processIntent(intent) {
    // Normalize different intent formats
    const normalized = {
      type: intent.type || 'campaign',
      name: intent.name || 'Unnamed Campaign',
      difficulty: intent.difficulty || 'NORMAL',
      levels: [],
      quests: [],
      storyBeats: [],
      globalSettings: {},
    };

    // Process campaign blueprint format
    if (intent.story?.acts) {
      normalized.levels = this.extractLevelsFromStory(intent.story);
      normalized.quests = this.extractQuestsFromStory(intent.story);
      normalized.storyBeats = this.extractStoryBeats(intent.story);
    }

    // Process direct level configuration
    if (intent.levels) {
      normalized.levels = intent.levels.map((l, i) => ({
        level: l.level || i + 1,
        theme: l.theme || 'CATHEDRAL',
        monsterDensity: l.monsterDensity || 0.4,
        monsterTypes: l.monsterTypes || [],
        boss: l.boss || null,
        treasureDensity: l.treasureDensity || 0.3,
        storyBeats: l.storyBeats || [],
      }));
    }

    // Process quest definitions
    if (intent.quests) {
      normalized.quests = intent.quests;
    }

    // Process global settings
    if (intent.global) {
      normalized.globalSettings = intent.global;
    }

    return normalized;
  }

  /**
   * Extract level configurations from story structure
   */
  extractLevelsFromStory(story) {
    const levels = [];
    let levelIndex = 1;

    for (const act of story.acts || []) {
      for (const chapter of act.chapters || []) {
        for (const scene of chapter.scenes || []) {
          if (scene.location?.type === 'dungeon') {
            levels.push({
              level: levelIndex++,
              theme: this.mapLocationToTheme(scene.location),
              monsterTypes: scene.enemies || [],
              boss: scene.boss || null,
              storyBeats: scene.storyMoments || [],
              name: scene.name,
            });
          }
        }
      }
    }

    return levels;
  }

  /**
   * Extract quest definitions from story
   */
  extractQuestsFromStory(story) {
    const quests = [];

    for (const act of story.acts || []) {
      for (const chapter of act.chapters || []) {
        if (chapter.quest) {
          quests.push({
            id: chapter.quest.id || `quest_${quests.length + 1}`,
            name: chapter.quest.name || chapter.name,
            description: chapter.quest.description || '',
            stages: chapter.quest.stages || [],
            rewards: chapter.quest.rewards || {},
          });
        }
      }
    }

    return quests;
  }

  /**
   * Extract story beats
   */
  extractStoryBeats(story) {
    const beats = [];

    for (const act of story.acts || []) {
      for (const chapter of act.chapters || []) {
        for (const scene of chapter.scenes || []) {
          for (const moment of scene.storyMoments || []) {
            beats.push({
              id: moment.id || `beat_${beats.length + 1}`,
              trigger: moment.trigger,
              dialogue: moment.dialogue,
              actions: moment.actions,
            });
          }
        }
      }
    }

    return beats;
  }

  /**
   * Map location type to dungeon theme
   */
  mapLocationToTheme(location) {
    const themeMap = {
      cathedral: 'CATHEDRAL',
      church: 'CATHEDRAL',
      crypt: 'CATACOMBS',
      tomb: 'CATACOMBS',
      cave: 'CAVES',
      cavern: 'CAVES',
      hell: 'HELL',
      demonic: 'HELL',
    };

    const locType = (location.theme || location.type || '').toLowerCase();
    return themeMap[locType] || 'CATHEDRAL';
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Convert normalized intent to DungeonConfig
   */
  configureFromIntent(intent, options = {}) {
    // Create fresh config or use existing
    const config = options.useExisting ? dungeonConfig : new DungeonConfig();

    // Apply global settings
    if (intent.difficulty) {
      config.setDifficultyPreset(intent.difficulty);
    }

    if (intent.globalSettings) {
      Object.assign(config.global, intent.globalSettings);
    }

    // Apply level configurations
    for (const levelIntent of intent.levels || []) {
      const level = levelIntent.level;

      config.configureLevelPartial(level, {
        theme: levelIntent.theme,
        monsterDensity: levelIntent.monsterDensity,
        treasureDensity: levelIntent.treasureDensity,
      });

      if (levelIntent.monsterTypes?.length > 0) {
        config.setAllowedMonsters(level, levelIntent.monsterTypes);
      }

      if (levelIntent.boss) {
        config.setBoss(level, levelIntent.boss);
      }

      // Add story beats
      for (const beat of levelIntent.storyBeats || []) {
        config.addStoryBeat(level, beat);
      }
    }

    // Apply story beats
    for (const beat of intent.storyBeats || []) {
      if (beat.level) {
        config.addStoryBeat(beat.level, beat);
      }
    }

    return config;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate configuration
   */
  validate(config) {
    const errors = [];
    const warnings = [];

    // Use DungeonConfig's built-in validation
    if (config.validate) {
      const result = config.validate();
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }

    // Additional pipeline-specific validation
    const summary = config.getSummary ? config.getSummary() : null;
    if (summary) {
      // Check for reasonable monster counts
      for (const level of summary.levelSummaries) {
        if (level.monsterCount === 0 && !level.isQuestLevel) {
          warnings.push(`Level ${level.level} has no monsters configured`);
        }
      }

      // Check boss progression
      const bossLevels = summary.levelSummaries.filter((l) => l.hasBoss).map((l) => l.level);
      if (bossLevels.length === 0) {
        warnings.push('No boss encounters configured');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // BUILD
  // ==========================================================================

  /**
   * Build MPQ from configuration
   */
  async build(config, options = {}) {
    if (!this.mpqBuilder) {
      throw new Error('MPQ builder not configured');
    }

    const buildOptions = {
      config: config.export ? config.export() : config,
      ...options,
    };

    const result = await this.mpqBuilder.build(buildOptions);

    return {
      mpq: result.mpq,
      files: result.files,
      stats: result.stats,
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // LOAD
  // ==========================================================================

  /**
   * Load game with built MPQ
   */
  async load(buildResult, options = {}) {
    if (!this.gameLoader) {
      throw new Error('Game loader not configured');
    }

    const result = await this.gameLoader.load(buildResult.mpq, options);

    return {
      success: result.success,
      gameSession: result.session,
      timestamp: Date.now(),
    };
  }

  // ==========================================================================
  // ROLLBACK
  // ==========================================================================

  /**
   * Rollback to previous configuration
   */
  async rollback(state) {
    if (!state.previousConfig) {
      console.warn('[Pipeline] No previous config to rollback to');
      return false;
    }

    try {
      dungeonConfig.import(state.previousConfig);
      state.status = PipelineStatus.ROLLED_BACK;
      this.emit('rollback', { state });
      console.log('[Pipeline] Rolled back to previous configuration');
      return true;
    } catch (error) {
      console.error('[Pipeline] Rollback failed:', error);
      return false;
    }
  }

  // ==========================================================================
  // QUEST REGISTRATION
  // ==========================================================================

  /**
   * Register quests with the quest trigger system
   */
  registerQuests(quests) {
    for (const quest of quests) {
      try {
        questTriggerSystem.registerQuest(quest);
        this.registeredQuests.set(quest.id, quest);
        console.log(`[Pipeline] Registered quest: ${quest.id}`);
      } catch (error) {
        console.error(`[Pipeline] Failed to register quest ${quest.id}:`, error);
      }
    }
  }

  /**
   * Start a registered quest
   */
  startQuest(questId) {
    if (!this.registeredQuests.has(questId)) {
      console.warn(`[Pipeline] Quest not registered: ${questId}`);
      return false;
    }

    return questTriggerSystem.startQuest(questId);
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Set the MPQ builder instance
   */
  setMpqBuilder(builder) {
    this.mpqBuilder = builder;
  }

  /**
   * Set the game loader instance
   */
  setGameLoader(loader) {
    this.gameLoader = loader;
  }

  // ==========================================================================
  // HISTORY & STATE
  // ==========================================================================

  /**
   * Add state to history
   */
  addToHistory(state) {
    this.history.unshift(state.export());

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /**
   * Get pipeline history
   */
  getHistory() {
    return [...this.history];
  }

  /**
   * Get current state
   */
  getCurrentState() {
    return this.currentState ? this.currentState.export() : null;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Clear build cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
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
          console.error(`[Pipeline] Event error (${event}):`, err);
        }
      }
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get pipeline status
   */
  getStatus() {
    return {
      hasBuilder: !!this.mpqBuilder,
      hasLoader: !!this.gameLoader,
      currentState: this.getCurrentState(),
      cacheStats: this.getCacheStats(),
      historyCount: this.history.length,
      registeredQuests: Array.from(this.registeredQuests.keys()),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const dataFlowPipeline = new DataFlowPipeline();

export default dataFlowPipeline;
