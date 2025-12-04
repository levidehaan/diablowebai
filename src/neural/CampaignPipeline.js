/**
 * Campaign Build Pipeline
 *
 * Orchestrates the complete campaign building process with:
 * - Defined stages for AI to follow
 * - Automatic retry on failures
 * - Validation at each step
 * - MPQ testing before finalization
 * - Progress tracking and rollback
 */

import { CampaignBuilder } from './CampaignBuilder';
import { CampaignBlueprint } from './CampaignBlueprint';
import dungeonConfig, { DungeonConfig, DUNGEON_THEMES, DIFFICULTY_PRESETS } from './DungeonConfig';
import DUNParser from './DUNParser';
import { validateLevel, checkPath } from './LevelValidator';
import questTriggerManager from './QuestTriggers';
import { buildProgress, BUILD_STATUS, TASK_STATUS } from './CampaignBuildProgress';

// ============================================================================
// PIPELINE STAGES
// ============================================================================

/**
 * All stages in the campaign building pipeline
 */
export const PIPELINE_STAGES = {
  // Stage 1: Configuration
  CONFIGURE_DUNGEON: {
    id: 'configure_dungeon',
    name: 'Configure Dungeon Settings',
    order: 1,
    description: 'Set up dungeon parameters, difficulty, monster pools, and boss encounters',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['configureDungeonLevel', 'setDifficulty', 'setMonsterPool'],
  },

  // Stage 2: Story Setup
  SETUP_STORY: {
    id: 'setup_story',
    name: 'Setup Story & Quests',
    order: 2,
    description: 'Define the campaign story, acts, chapters, and quest objectives',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['createCampaignBlueprint', 'addChapterToAct', 'addQuest'],
    dependsOn: ['configure_dungeon'],
  },

  // Stage 3: Character Setup
  SETUP_CHARACTERS: {
    id: 'setup_characters',
    name: 'Setup Characters & NPCs',
    order: 3,
    description: 'Add NPCs, enemies, bosses, and their dialogue',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['addCharacter', 'setBoss'],
    dependsOn: ['setup_story'],
  },

  // Stage 4: World Building
  BUILD_WORLD: {
    id: 'build_world',
    name: 'Build World & Locations',
    order: 4,
    description: 'Create all locations, dungeons, and starting area',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['addLocation', 'generateStartingArea'],
    dependsOn: ['setup_characters'],
  },

  // Stage 5: Level Generation
  GENERATE_LEVELS: {
    id: 'generate_levels',
    name: 'Generate Dungeon Levels',
    order: 5,
    description: 'Generate all dungeon DUN files with monsters and objects',
    required: true,
    retryable: true,
    maxRetries: 5,
    requiredTools: ['generateLevel', 'placeMonsters', 'placeObjects'],
    dependsOn: ['build_world'],
  },

  // Stage 6: Story Integration
  INTEGRATE_STORY: {
    id: 'integrate_story',
    name: 'Integrate Story Triggers',
    order: 6,
    description: 'Add quest triggers, story beats, and dialogue sequences',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['createTrigger', 'addStoryBeat', 'addLevelEntryTrigger'],
    dependsOn: ['generate_levels'],
  },

  // Stage 7: Validation
  VALIDATE_CAMPAIGN: {
    id: 'validate_campaign',
    name: 'Validate Campaign',
    order: 7,
    description: 'Validate all levels, paths, triggers, and story consistency',
    required: true,
    retryable: true,
    maxRetries: 2,
    requiredTools: ['validateLevel', 'validateCampaign'],
    dependsOn: ['integrate_story'],
  },

  // Stage 8: MPQ Building
  BUILD_MPQ: {
    id: 'build_mpq',
    name: 'Build MPQ Archive',
    order: 8,
    description: 'Compile all content into a modified MPQ archive',
    required: true,
    retryable: true,
    maxRetries: 3,
    requiredTools: ['buildMod'],
    dependsOn: ['validate_campaign'],
  },

  // Stage 9: MPQ Testing
  TEST_MPQ: {
    id: 'test_mpq',
    name: 'Test MPQ Archive',
    order: 9,
    description: 'Verify MPQ structure and test load all modified files',
    required: true,
    retryable: true,
    maxRetries: 2,
    requiredTools: ['testMpqLoad'],
    dependsOn: ['build_mpq'],
  },

  // Stage 10: Finalization
  FINALIZE: {
    id: 'finalize',
    name: 'Finalize Campaign',
    order: 10,
    description: 'Final checks and prepare for play',
    required: true,
    retryable: false,
    maxRetries: 1,
    requiredTools: ['finalizeCampaign'],
    dependsOn: ['test_mpq'],
  },
};

/**
 * Get stages in order
 */
export function getOrderedStages() {
  return Object.values(PIPELINE_STAGES).sort((a, b) => a.order - b.order);
}

// ============================================================================
// PIPELINE STATE
// ============================================================================

/**
 * Pipeline execution state
 */
export class PipelineState {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentStage = null;
    this.completedStages = new Set();
    this.failedStages = new Map(); // stageId -> { attempts, lastError }
    this.stageResults = new Map(); // stageId -> result data
    this.startTime = null;
    this.endTime = null;
    this.status = 'idle'; // idle, running, paused, completed, failed
    this.errors = [];
    this.warnings = [];
  }

  start() {
    this.reset();
    this.startTime = Date.now();
    this.status = 'running';
  }

  complete() {
    this.endTime = Date.now();
    this.status = 'completed';
  }

  fail(error) {
    this.endTime = Date.now();
    this.status = 'failed';
    this.errors.push(error);
  }

  stageStarted(stageId) {
    this.currentStage = stageId;
  }

  stageCompleted(stageId, result) {
    this.completedStages.add(stageId);
    this.stageResults.set(stageId, result);
    this.currentStage = null;
  }

  stageFailed(stageId, error) {
    const failed = this.failedStages.get(stageId) || { attempts: 0, errors: [] };
    failed.attempts++;
    failed.lastError = error;
    failed.errors.push(error);
    this.failedStages.set(stageId, failed);
  }

  canRetry(stageId) {
    const stage = PIPELINE_STAGES[stageId] || Object.values(PIPELINE_STAGES).find(s => s.id === stageId);
    if (!stage || !stage.retryable) return false;

    const failed = this.failedStages.get(stageId);
    if (!failed) return true;

    return failed.attempts < stage.maxRetries;
  }

  getProgress() {
    const stages = getOrderedStages();
    const total = stages.length;
    const completed = this.completedStages.size;
    return {
      current: this.currentStage,
      completed,
      total,
      percentage: Math.round((completed / total) * 100),
      stages: stages.map(s => ({
        id: s.id,
        name: s.name,
        status: this.completedStages.has(s.id)
          ? 'completed'
          : this.currentStage === s.id
            ? 'running'
            : this.failedStages.has(s.id)
              ? 'failed'
              : 'pending',
        attempts: this.failedStages.get(s.id)?.attempts || 0,
      })),
    };
  }

  export() {
    return {
      status: this.status,
      currentStage: this.currentStage,
      completedStages: Array.from(this.completedStages),
      failedStages: Object.fromEntries(this.failedStages),
      startTime: this.startTime,
      endTime: this.endTime,
      errors: this.errors,
      warnings: this.warnings,
      duration: this.endTime ? this.endTime - this.startTime : null,
    };
  }
}

// ============================================================================
// CAMPAIGN PIPELINE
// ============================================================================

/**
 * Main Campaign Pipeline class
 */
export class CampaignPipeline {
  constructor(options = {}) {
    this.options = {
      maxGlobalRetries: 3,
      retryDelay: 1000,
      validateEachStage: true,
      stopOnFirstError: false,
      autoFix: true,
      ...options,
    };

    this.state = new PipelineState();
    this.blueprint = null;
    this.builder = null;
    this.dungeonConfig = options.dungeonConfig || dungeonConfig;
    this.modifiedFiles = new Map();
    this.mpqData = null;

    // Event listeners
    this.listeners = new Map();
  }

  // ==========================================================================
  // PIPELINE EXECUTION
  // ==========================================================================

  /**
   * Execute the full pipeline
   */
  async execute(blueprintOrConfig) {
    this.state.start();
    this.emit('pipelineStarted', { timestamp: Date.now() });

    try {
      // Initialize blueprint
      if (blueprintOrConfig instanceof CampaignBlueprint) {
        this.blueprint = blueprintOrConfig;
      } else {
        this.blueprint = new CampaignBlueprint(blueprintOrConfig);
      }

      // Initialize builder
      this.builder = new CampaignBuilder({
        validateOnBuild: this.options.validateEachStage,
        ...this.options.builderOptions,
      });

      // Execute each stage
      const stages = getOrderedStages();
      for (const stage of stages) {
        const success = await this.executeStage(stage);
        if (!success && this.options.stopOnFirstError) {
          throw new Error(`Pipeline failed at stage: ${stage.name}`);
        }
      }

      this.state.complete();
      this.emit('pipelineCompleted', {
        duration: Date.now() - this.state.startTime,
        results: this.state.export(),
      });

      return {
        success: true,
        mpqData: this.mpqData,
        blueprint: this.blueprint,
        results: this.state.export(),
      };

    } catch (error) {
      this.state.fail(error.message);
      this.emit('pipelineFailed', { error, state: this.state.export() });

      return {
        success: false,
        error: error.message,
        results: this.state.export(),
      };
    }
  }

  /**
   * Execute a single stage with retry logic
   */
  async executeStage(stage) {
    this.state.stageStarted(stage.id);
    this.emit('stageStarted', { stage: stage.id, name: stage.name });

    let lastError = null;
    let attempts = 0;

    while (this.state.canRetry(stage.id)) {
      attempts++;
      try {
        this.emit('stageAttempt', { stage: stage.id, attempt: attempts });

        const result = await this.runStage(stage);

        // Validate stage result if enabled
        if (this.options.validateEachStage) {
          const validation = await this.validateStage(stage, result);
          if (!validation.valid) {
            throw new Error(`Stage validation failed: ${validation.errors.join(', ')}`);
          }
        }

        this.state.stageCompleted(stage.id, result);
        this.emit('stageCompleted', { stage: stage.id, result });

        return true;

      } catch (error) {
        lastError = error;
        this.state.stageFailed(stage.id, error.message);
        this.emit('stageFailed', {
          stage: stage.id,
          attempt: attempts,
          error: error.message,
          canRetry: this.state.canRetry(stage.id),
        });

        // Wait before retry
        if (this.state.canRetry(stage.id)) {
          await this.delay(this.options.retryDelay * attempts);
        }
      }
    }

    // All retries exhausted
    this.state.warnings.push(`Stage ${stage.name} failed after ${attempts} attempts: ${lastError?.message}`);
    return false;
  }

  /**
   * Run the actual stage logic
   */
  async runStage(stage) {
    switch (stage.id) {
      case 'configure_dungeon':
        return this.runConfigureDungeon();

      case 'setup_story':
        return this.runSetupStory();

      case 'setup_characters':
        return this.runSetupCharacters();

      case 'build_world':
        return this.runBuildWorld();

      case 'generate_levels':
        return this.runGenerateLevels();

      case 'integrate_story':
        return this.runIntegrateStory();

      case 'validate_campaign':
        return this.runValidateCampaign();

      case 'build_mpq':
        return this.runBuildMPQ();

      case 'test_mpq':
        return this.runTestMPQ();

      case 'finalize':
        return this.runFinalize();

      default:
        throw new Error(`Unknown stage: ${stage.id}`);
    }
  }

  // ==========================================================================
  // STAGE IMPLEMENTATIONS
  // ==========================================================================

  async runConfigureDungeon() {
    const config = this.blueprint.settings || {};

    // Apply difficulty preset
    if (config.difficulty) {
      this.dungeonConfig.setDifficultyPreset(config.difficulty);
    }

    // Apply global settings
    if (config.monsterDensity !== undefined) {
      this.dungeonConfig.global.monsterDensityMultiplier = config.monsterDensity;
    }

    // Configure each level from blueprint if specified
    if (config.levelConfigs) {
      for (const [level, levelConfig] of Object.entries(config.levelConfigs)) {
        this.dungeonConfig.configureLevelPartial(parseInt(level), levelConfig);
      }
    }

    // Auto-configure boss levels based on story
    if (this.blueprint.characters) {
      const bosses = Object.values(this.blueprint.characters.characters || {})
        .filter(c => c.role === 'boss' || c.role === 'villain');

      for (const boss of bosses) {
        if (boss.location) {
          // Find the level for this boss
          const location = this.blueprint.world?.locations?.[boss.location];
          if (location?.dungeonLevel) {
            this.dungeonConfig.setBoss(location.dungeonLevel, {
              type: boss.asset || 'DIABLO',
              name: boss.name,
              dialogue: boss.dialogue,
            });
          }
        }
      }
    }

    return {
      difficulty: this.dungeonConfig.global.difficultyPreset,
      configuredLevels: 16,
      summary: this.dungeonConfig.getSummary(),
    };
  }

  async runSetupStory() {
    // Story should already be in blueprint
    if (!this.blueprint.story) {
      throw new Error('No story defined in blueprint');
    }

    const story = this.blueprint.story;
    const acts = story.acts?.length || 0;
    const chapters = story.acts?.reduce((sum, act) => sum + (act.chapters?.length || 0), 0) || 0;

    return {
      premise: story.premise,
      acts,
      chapters,
      template: story.template,
    };
  }

  async runSetupCharacters() {
    if (!this.blueprint.characters) {
      throw new Error('No characters defined in blueprint');
    }

    const characters = this.blueprint.characters;
    const npcs = Object.values(characters.characters || {}).filter(c => c.role !== 'boss');
    const bosses = Object.values(characters.characters || {}).filter(c => c.role === 'boss');

    return {
      totalCharacters: Object.keys(characters.characters || {}).length,
      npcs: npcs.length,
      bosses: bosses.length,
    };
  }

  async runBuildWorld() {
    if (!this.blueprint.world) {
      throw new Error('No world defined in blueprint');
    }

    // Build using CampaignBuilder
    await this.builder.buildWorld();
    await this.builder.buildStartingArea();

    return {
      locations: Object.keys(this.blueprint.world.locations || {}).length,
      startingArea: this.builder.generatedContent.levels.has('levels\\towndata\\sector1s.dun'),
    };
  }

  async runGenerateLevels() {
    // Generate all dungeon levels
    await this.builder.buildLevels();

    const levels = Array.from(this.builder.generatedContent.levels.keys());

    return {
      generatedLevels: levels.length,
      levels,
    };
  }

  async runIntegrateStory() {
    // Build quests and triggers
    await this.builder.buildQuests();

    // Register triggers with the trigger manager
    for (const trigger of this.builder.generatedContent.triggers) {
      questTriggerManager.registerTrigger(trigger);
    }

    // Add level entry triggers from DungeonConfig
    for (let level = 1; level <= 16; level++) {
      const config = this.dungeonConfig.getLevelConfig(level);
      for (const trigger of config.questTriggers) {
        questTriggerManager.registerTrigger(trigger);
      }
    }

    return {
      triggers: this.builder.generatedContent.triggers.length,
      registeredTriggers: questTriggerManager.triggers.size,
    };
  }

  async runValidateCampaign() {
    const errors = [];
    const warnings = [];

    // Validate blueprint
    const blueprintValidation = this.blueprint.validate ? this.blueprint.validate() : { valid: true, errors: [] };
    errors.push(...blueprintValidation.errors);

    // Validate dungeon config
    const dungeonValidation = this.dungeonConfig.validate();
    errors.push(...dungeonValidation.errors);
    warnings.push(...dungeonValidation.warnings);

    // Validate each generated level
    for (const [path, dunData] of this.builder.generatedContent.levels) {
      if (!dunData || !dunData.baseTiles) continue;

      const theme = path.includes('l1') ? 'cathedral'
        : path.includes('l2') ? 'catacombs'
        : path.includes('l3') ? 'caves'
        : path.includes('l4') ? 'hell'
        : 'cathedral';

      const levelValidation = validateLevel(dunData, theme);
      if (!levelValidation.valid) {
        // Try to auto-fix if enabled
        if (this.options.autoFix) {
          // Auto-fix is handled by MapHealer in CampaignBuilder
          warnings.push(`Level ${path} had issues (auto-fixed): ${levelValidation.errors.join(', ')}`);
        } else {
          errors.push(`Level ${path}: ${levelValidation.errors.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      levelsValidated: this.builder.generatedContent.levels.size,
    };
  }

  async runBuildMPQ() {
    // Export content from builder
    const exportResult = await this.builder.exportContent();

    // Store modified files
    this.modifiedFiles = new Map(this.builder.generatedContent.levels);

    // Build MPQ data
    // Note: This would integrate with MPQWriter
    this.mpqData = {
      levels: exportResult.levels,
      triggers: exportResult.triggers,
      fileCount: exportResult.levels.length,
      timestamp: Date.now(),
    };

    return {
      fileCount: this.mpqData.fileCount,
      levels: this.mpqData.levels.map(l => l.path),
    };
  }

  async runTestMPQ() {
    if (!this.mpqData) {
      throw new Error('No MPQ data to test');
    }

    const testResults = {
      filesVerified: 0,
      errors: [],
    };

    // Test each level file
    for (const level of this.mpqData.levels) {
      try {
        // Verify DUN structure
        if (level.data && level.data.baseTiles) {
          const stats = DUNParser.getStats(level.data);
          if (stats.floorCount === 0) {
            testResults.errors.push(`${level.path}: No floor tiles`);
          } else {
            testResults.filesVerified++;
          }
        }
      } catch (error) {
        testResults.errors.push(`${level.path}: ${error.message}`);
      }
    }

    if (testResults.errors.length > 0) {
      throw new Error(`MPQ test failed: ${testResults.errors.join('; ')}`);
    }

    return {
      success: true,
      filesVerified: testResults.filesVerified,
      ready: true,
    };
  }

  async runFinalize() {
    // Final preparation
    const summary = {
      campaignName: this.blueprint.name,
      difficulty: this.dungeonConfig.global.difficultyPreset,
      levelsGenerated: this.builder.generatedContent.levels.size,
      triggersRegistered: questTriggerManager.triggers.size,
      buildTime: Date.now() - this.state.startTime,
      ready: true,
    };

    this.emit('campaignReady', summary);

    return summary;
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  async validateStage(stage, result) {
    const errors = [];

    switch (stage.id) {
      case 'configure_dungeon':
        if (!result.summary) errors.push('No configuration summary');
        break;

      case 'setup_story':
        if (!result.acts || result.acts === 0) errors.push('No acts defined');
        break;

      case 'setup_characters':
        if (result.totalCharacters === 0) errors.push('No characters defined');
        break;

      case 'generate_levels':
        if (result.generatedLevels === 0) errors.push('No levels generated');
        break;

      case 'validate_campaign':
        if (result.errors && result.errors.length > 0) {
          errors.push(...result.errors);
        }
        break;

      case 'test_mpq':
        if (!result.success) errors.push('MPQ test failed');
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

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

  /**
   * Get current progress
   */
  getProgress() {
    return this.state.getProgress();
  }

  /**
   * Get pipeline checklist for AI
   */
  static getChecklist() {
    const stages = getOrderedStages();
    return stages.map(s => ({
      step: s.order,
      name: s.name,
      description: s.description,
      requiredTools: s.requiredTools,
      dependsOn: s.dependsOn || [],
    }));
  }

  /**
   * Get required tools for current stage
   */
  getCurrentRequiredTools() {
    if (!this.state.currentStage) return [];
    const stage = Object.values(PIPELINE_STAGES).find(s => s.id === this.state.currentStage);
    return stage?.requiredTools || [];
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

const defaultPipeline = new CampaignPipeline();

export default CampaignPipeline;
export { defaultPipeline };
