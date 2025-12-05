/**
 * Quest Schema System
 *
 * Comprehensive quest definition format with:
 * - Multi-stage quest structure
 * - Flexible trigger conditions
 * - Branching objectives
 * - Reward distribution
 * - Prerequisites and dependencies
 * - Dialogue integration
 *
 * This provides the data structures and validation for AI-generated quests.
 */

// ============================================================================
// QUEST STATUS CONSTANTS
// ============================================================================

export const QuestStatus = {
  LOCKED: 'locked',          // Prerequisites not met
  AVAILABLE: 'available',    // Can be started
  ACTIVE: 'active',          // Currently in progress
  COMPLETED: 'completed',    // Successfully finished
  FAILED: 'failed',          // Failed (optional)
  ABANDONED: 'abandoned',    // Player abandoned
};

export const ObjectiveStatus = {
  HIDDEN: 'hidden',          // Not revealed yet
  ACTIVE: 'active',          // Currently tracking
  COMPLETED: 'completed',    // Objective done
  FAILED: 'failed',          // Failed (optional)
  OPTIONAL: 'optional',      // Optional objective
};

// ============================================================================
// TRIGGER TYPES
// ============================================================================

export const TriggerType = {
  // Location triggers
  LOCATION: 'location',           // Enter specific area
  PROXIMITY: 'proximity',         // Get close to target
  ZONE_ENTER: 'zone_enter',       // Enter named zone
  ZONE_EXIT: 'zone_exit',         // Leave named zone

  // Combat triggers
  KILL: 'kill',                   // Kill specific monster(s)
  KILL_TYPE: 'kill_type',         // Kill monster type
  KILL_COUNT: 'kill_count',       // Kill N monsters
  BOSS_KILLED: 'boss_killed',     // Kill named boss

  // Interaction triggers
  INTERACT: 'interact',           // Interact with object
  COLLECT: 'collect',             // Collect item(s)
  USE_ITEM: 'use_item',           // Use specific item
  TALK_NPC: 'talk_npc',           // Talk to NPC

  // Progress triggers
  LEVEL_ENTER: 'level_enter',     // Enter dungeon level
  LEVEL_CLEAR: 'level_clear',     // Clear all monsters
  GOLD_AMOUNT: 'gold_amount',     // Have gold threshold
  PLAYER_LEVEL: 'player_level',   // Reach player level

  // Quest triggers
  QUEST_COMPLETE: 'quest_complete', // Complete another quest
  STAGE_COMPLETE: 'stage_complete', // Complete quest stage

  // Time triggers
  TIME_ELAPSED: 'time_elapsed',   // Time passed
  TIME_LIMIT: 'time_limit',       // Within time limit

  // Custom/scripted
  CUSTOM: 'custom',               // Custom condition
  DIALOGUE_CHOICE: 'dialogue_choice', // Specific dialogue option chosen
};

// ============================================================================
// REWARD TYPES
// ============================================================================

export const RewardType = {
  EXPERIENCE: 'experience',
  GOLD: 'gold',
  ITEM: 'item',
  SKILL_POINT: 'skill_point',
  UNLOCK: 'unlock',              // Unlock content
  REPUTATION: 'reputation',      // Faction reputation
  STAT_BOOST: 'stat_boost',      // Permanent stat increase
  ABILITY: 'ability',            // New ability
};

// ============================================================================
// QUEST DIFFICULTY
// ============================================================================

export const QuestDifficulty = {
  TUTORIAL: 'tutorial',
  EASY: 'easy',
  NORMAL: 'normal',
  HARD: 'hard',
  LEGENDARY: 'legendary',
};

// ============================================================================
// QUEST CATEGORY
// ============================================================================

export const QuestCategory = {
  MAIN: 'main',                  // Main storyline
  SIDE: 'side',                  // Side quests
  BOUNTY: 'bounty',              // Kill quests
  COLLECTION: 'collection',      // Gather items
  EXPLORATION: 'exploration',    // Discover areas
  ESCORT: 'escort',              // Protect NPC
  DELIVERY: 'delivery',          // Deliver item
  RESCUE: 'rescue',              // Rescue NPC
  BOSS: 'boss',                  // Boss encounter
};

// ============================================================================
// QUEST SCHEMA DEFINITION
// ============================================================================

/**
 * Complete quest definition schema
 */
export class Quest {
  constructor(config) {
    // Core identity
    this.id = config.id || `quest_${Date.now()}`;
    this.name = config.name || 'Unnamed Quest';
    this.description = config.description || '';
    this.shortDescription = config.shortDescription || '';

    // Classification
    this.category = config.category || QuestCategory.SIDE;
    this.difficulty = config.difficulty || QuestDifficulty.NORMAL;
    this.level = config.level || 1;
    this.tags = config.tags || [];

    // Structure
    this.stages = (config.stages || []).map((s, i) => new QuestStage(s, i));
    this.currentStage = 0;

    // Status
    this.status = QuestStatus.LOCKED;
    this.startTime = null;
    this.completedTime = null;
    this.failedTime = null;

    // Prerequisites
    this.prerequisites = config.prerequisites || [];
    this.requiredLevel = config.requiredLevel || 1;
    this.requiredQuests = config.requiredQuests || [];

    // Rewards
    this.rewards = new QuestRewards(config.rewards || {});
    this.bonusRewards = config.bonusRewards || null; // For optional objectives

    // Dialogue
    this.dialogueStart = config.dialogueStart || null;
    this.dialogueComplete = config.dialogueComplete || null;
    this.dialogueActive = config.dialogueActive || null;

    // NPCs
    this.questGiver = config.questGiver || null;
    this.turnInNPC = config.turnInNPC || config.questGiver;

    // Timing
    this.timeLimit = config.timeLimit || null; // In milliseconds
    this.repeatable = config.repeatable || false;
    this.cooldown = config.cooldown || 0; // For repeatable quests

    // Tracking
    this.progress = {};
    this.metadata = config.metadata || {};
  }

  // ==========================================================================
  // STATUS MANAGEMENT
  // ==========================================================================

  /**
   * Check if quest can be started
   */
  canStart(playerState) {
    if (this.status !== QuestStatus.AVAILABLE) return false;

    // Check level requirement
    if (playerState.level < this.requiredLevel) return false;

    // Check required quests
    for (const questId of this.requiredQuests) {
      if (!playerState.completedQuests?.includes(questId)) return false;
    }

    return true;
  }

  /**
   * Start the quest
   */
  start() {
    if (this.status !== QuestStatus.AVAILABLE) return false;

    this.status = QuestStatus.ACTIVE;
    this.startTime = Date.now();
    this.currentStage = 0;

    // Initialize progress tracking
    this.progress = {
      stageProgress: {},
      killCounts: {},
      itemsCollected: {},
      objectivesCompleted: 0,
    };

    // Activate first stage
    if (this.stages.length > 0) {
      this.stages[0].activate();
    }

    return true;
  }

  /**
   * Advance to next stage
   */
  advanceStage() {
    if (this.status !== QuestStatus.ACTIVE) return false;

    const current = this.getCurrentStage();
    if (current) {
      current.complete();
    }

    this.currentStage++;

    if (this.currentStage >= this.stages.length) {
      return this.complete();
    }

    // Activate next stage
    this.stages[this.currentStage].activate();
    return true;
  }

  /**
   * Complete the quest
   */
  complete() {
    if (this.status !== QuestStatus.ACTIVE) return false;

    this.status = QuestStatus.COMPLETED;
    this.completedTime = Date.now();

    return true;
  }

  /**
   * Fail the quest
   */
  fail(reason = '') {
    if (this.status !== QuestStatus.ACTIVE) return false;

    this.status = QuestStatus.FAILED;
    this.failedTime = Date.now();
    this.failReason = reason;

    return true;
  }

  /**
   * Abandon the quest
   */
  abandon() {
    if (this.status !== QuestStatus.ACTIVE) return false;

    this.status = QuestStatus.ABANDONED;
    return true;
  }

  /**
   * Reset quest (for repeatable quests)
   */
  reset() {
    this.status = QuestStatus.AVAILABLE;
    this.startTime = null;
    this.completedTime = null;
    this.failedTime = null;
    this.currentStage = 0;
    this.progress = {};

    for (const stage of this.stages) {
      stage.reset();
    }
  }

  // ==========================================================================
  // STAGE MANAGEMENT
  // ==========================================================================

  /**
   * Get current stage
   */
  getCurrentStage() {
    return this.stages[this.currentStage] || null;
  }

  /**
   * Get stage by index
   */
  getStage(index) {
    return this.stages[index] || null;
  }

  /**
   * Check if current stage is complete
   */
  isStageComplete() {
    const stage = this.getCurrentStage();
    return stage ? stage.isComplete() : false;
  }

  // ==========================================================================
  // PROGRESS TRACKING
  // ==========================================================================

  /**
   * Update progress for a trigger type
   */
  updateProgress(triggerType, data) {
    if (this.status !== QuestStatus.ACTIVE) return false;

    const stage = this.getCurrentStage();
    if (!stage) return false;

    const advanced = stage.updateProgress(triggerType, data);

    if (stage.isComplete()) {
      this.advanceStage();
    }

    return advanced;
  }

  /**
   * Get progress summary
   */
  getProgressSummary() {
    const stage = this.getCurrentStage();

    return {
      questId: this.id,
      name: this.name,
      status: this.status,
      currentStage: this.currentStage,
      totalStages: this.stages.length,
      stageProgress: stage ? stage.getProgress() : null,
      timeElapsed: this.startTime ? Date.now() - this.startTime : 0,
      timeRemaining: this.timeLimit ? Math.max(0, this.timeLimit - (Date.now() - this.startTime)) : null,
    };
  }

  // ==========================================================================
  // SERIALIZATION
  // ==========================================================================

  /**
   * Export quest state
   */
  export() {
    return {
      id: this.id,
      status: this.status,
      currentStage: this.currentStage,
      startTime: this.startTime,
      completedTime: this.completedTime,
      progress: this.progress,
      stages: this.stages.map(s => s.export()),
    };
  }

  /**
   * Import quest state
   */
  import(state) {
    this.status = state.status || this.status;
    this.currentStage = state.currentStage || 0;
    this.startTime = state.startTime;
    this.completedTime = state.completedTime;
    this.progress = state.progress || {};

    if (state.stages) {
      for (let i = 0; i < state.stages.length && i < this.stages.length; i++) {
        this.stages[i].import(state.stages[i]);
      }
    }
  }

  /**
   * Export full definition (for saving quest templates)
   */
  exportDefinition() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      shortDescription: this.shortDescription,
      category: this.category,
      difficulty: this.difficulty,
      level: this.level,
      tags: this.tags,
      stages: this.stages.map(s => s.exportDefinition()),
      prerequisites: this.prerequisites,
      requiredLevel: this.requiredLevel,
      requiredQuests: this.requiredQuests,
      rewards: this.rewards.export(),
      dialogueStart: this.dialogueStart,
      dialogueComplete: this.dialogueComplete,
      dialogueActive: this.dialogueActive,
      questGiver: this.questGiver,
      turnInNPC: this.turnInNPC,
      timeLimit: this.timeLimit,
      repeatable: this.repeatable,
      cooldown: this.cooldown,
      metadata: this.metadata,
    };
  }
}

// ============================================================================
// QUEST STAGE
// ============================================================================

/**
 * Individual quest stage with objectives
 */
export class QuestStage {
  constructor(config, index = 0) {
    this.id = config.id || `stage_${index}`;
    this.index = index;
    this.name = config.name || `Stage ${index + 1}`;
    this.description = config.description || '';
    this.objective = config.objective || '';

    // Trigger definition
    this.trigger = config.trigger ? new QuestTrigger(config.trigger) : null;

    // Sub-objectives (optional)
    this.objectives = (config.objectives || []).map((o, i) => new QuestObjective(o, i));

    // Dialogue on stage start
    this.dialogue = config.dialogue || null;

    // Status
    this.status = ObjectiveStatus.HIDDEN;
    this.startTime = null;
    this.completedTime = null;

    // Progress
    this.progress = 0;
    this.target = config.target || 1;
  }

  /**
   * Activate this stage
   */
  activate() {
    this.status = ObjectiveStatus.ACTIVE;
    this.startTime = Date.now();

    // Activate objectives
    for (const obj of this.objectives) {
      if (!obj.isOptional) {
        obj.activate();
      }
    }
  }

  /**
   * Complete this stage
   */
  complete() {
    this.status = ObjectiveStatus.COMPLETED;
    this.completedTime = Date.now();
  }

  /**
   * Reset stage
   */
  reset() {
    this.status = ObjectiveStatus.HIDDEN;
    this.startTime = null;
    this.completedTime = null;
    this.progress = 0;

    for (const obj of this.objectives) {
      obj.reset();
    }
  }

  /**
   * Update progress based on event
   */
  updateProgress(triggerType, data) {
    if (this.status !== ObjectiveStatus.ACTIVE) return false;

    // Check main trigger
    if (this.trigger && this.trigger.check(triggerType, data)) {
      this.progress++;
      if (this.progress >= this.target) {
        return true;
      }
    }

    // Check sub-objectives
    for (const obj of this.objectives) {
      obj.updateProgress(triggerType, data);
    }

    return this.isComplete();
  }

  /**
   * Check if stage is complete
   */
  isComplete() {
    // Main trigger satisfied
    if (this.trigger && this.progress < this.target) return false;

    // All required objectives complete
    for (const obj of this.objectives) {
      if (!obj.isOptional && obj.status !== ObjectiveStatus.COMPLETED) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get progress info
   */
  getProgress() {
    return {
      id: this.id,
      name: this.name,
      objective: this.objective,
      status: this.status,
      progress: this.progress,
      target: this.target,
      percentage: Math.min(100, (this.progress / this.target) * 100),
      objectives: this.objectives.map(o => o.getProgress()),
    };
  }

  /**
   * Export state
   */
  export() {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
      objectives: this.objectives.map(o => o.export()),
    };
  }

  /**
   * Import state
   */
  import(state) {
    this.status = state.status || this.status;
    this.progress = state.progress || 0;

    if (state.objectives) {
      for (let i = 0; i < state.objectives.length && i < this.objectives.length; i++) {
        this.objectives[i].import(state.objectives[i]);
      }
    }
  }

  /**
   * Export definition
   */
  exportDefinition() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      objective: this.objective,
      trigger: this.trigger ? this.trigger.export() : null,
      objectives: this.objectives.map(o => o.exportDefinition()),
      dialogue: this.dialogue,
      target: this.target,
    };
  }
}

// ============================================================================
// QUEST OBJECTIVE
// ============================================================================

/**
 * Individual objective within a stage
 */
export class QuestObjective {
  constructor(config, index = 0) {
    this.id = config.id || `objective_${index}`;
    this.description = config.description || '';
    this.trigger = config.trigger ? new QuestTrigger(config.trigger) : null;

    this.isOptional = config.optional || false;
    this.isHidden = config.hidden || false;

    this.status = ObjectiveStatus.HIDDEN;
    this.progress = 0;
    this.target = config.target || 1;

    // Bonus reward for optional objectives
    this.bonusReward = config.bonusReward || null;
  }

  activate() {
    this.status = ObjectiveStatus.ACTIVE;
  }

  reset() {
    this.status = ObjectiveStatus.HIDDEN;
    this.progress = 0;
  }

  updateProgress(triggerType, data) {
    if (this.status !== ObjectiveStatus.ACTIVE) return false;

    if (this.trigger && this.trigger.check(triggerType, data)) {
      this.progress++;
      if (this.progress >= this.target) {
        this.status = ObjectiveStatus.COMPLETED;
        return true;
      }
    }

    return false;
  }

  getProgress() {
    return {
      id: this.id,
      description: this.description,
      status: this.status,
      progress: this.progress,
      target: this.target,
      percentage: Math.min(100, (this.progress / this.target) * 100),
      isOptional: this.isOptional,
      isHidden: this.isHidden,
    };
  }

  export() {
    return {
      id: this.id,
      status: this.status,
      progress: this.progress,
    };
  }

  import(state) {
    this.status = state.status || this.status;
    this.progress = state.progress || 0;
  }

  exportDefinition() {
    return {
      id: this.id,
      description: this.description,
      trigger: this.trigger ? this.trigger.export() : null,
      optional: this.isOptional,
      hidden: this.isHidden,
      target: this.target,
      bonusReward: this.bonusReward,
    };
  }
}

// ============================================================================
// QUEST TRIGGER
// ============================================================================

/**
 * Trigger condition for objectives
 */
export class QuestTrigger {
  constructor(config) {
    this.type = config.type || TriggerType.CUSTOM;
    this.target = config.target || null;
    this.conditions = config.conditions || {};
    this.count = config.count || 1;
  }

  /**
   * Check if trigger condition is met
   */
  check(eventType, data) {
    // Event type must match trigger type
    if (!this.matchesType(eventType)) return false;

    // Check target match
    if (this.target && !this.matchesTarget(data)) return false;

    // Check additional conditions
    return this.matchesConditions(data);
  }

  matchesType(eventType) {
    // Map event types to trigger types
    const typeMap = {
      'monster_killed': [TriggerType.KILL, TriggerType.KILL_TYPE, TriggerType.KILL_COUNT],
      'boss_killed': [TriggerType.BOSS_KILLED],
      'level_entered': [TriggerType.LEVEL_ENTER, TriggerType.ZONE_ENTER],
      'level_cleared': [TriggerType.LEVEL_CLEAR],
      'location': [TriggerType.LOCATION, TriggerType.PROXIMITY],
      'item_collected': [TriggerType.COLLECT],
      'npc_talked': [TriggerType.TALK_NPC],
      'object_activated': [TriggerType.INTERACT],
      'dialogue_choice': [TriggerType.DIALOGUE_CHOICE],
    };

    const validTypes = typeMap[eventType] || [];
    return validTypes.includes(this.type) || this.type === TriggerType.CUSTOM;
  }

  matchesTarget(data) {
    if (!this.target) return true;

    // Check various target fields
    return data.target === this.target ||
           data.monsterId === this.target ||
           data.monsterType === this.target ||
           data.npcId === this.target ||
           data.objectId === this.target ||
           data.levelId === this.target ||
           data.locationId === this.target;
  }

  matchesConditions(data) {
    for (const [key, expected] of Object.entries(this.conditions)) {
      const actual = data[key];

      if (typeof expected === 'object' && expected !== null) {
        // Range check
        if ('min' in expected && actual < expected.min) return false;
        if ('max' in expected && actual > expected.max) return false;
      } else if (actual !== expected) {
        return false;
      }
    }

    return true;
  }

  export() {
    return {
      type: this.type,
      target: this.target,
      conditions: this.conditions,
      count: this.count,
    };
  }
}

// ============================================================================
// QUEST REWARDS
// ============================================================================

/**
 * Quest rewards container
 */
export class QuestRewards {
  constructor(config) {
    this.experience = config.experience || 0;
    this.gold = config.gold || 0;
    this.items = config.items || [];
    this.skillPoints = config.skillPoints || 0;
    this.unlocks = config.unlocks || [];
    this.reputation = config.reputation || {};
    this.statBoosts = config.statBoosts || {};
    this.abilities = config.abilities || [];
  }

  /**
   * Get all rewards as list
   */
  getRewardsList() {
    const rewards = [];

    if (this.experience > 0) {
      rewards.push({ type: RewardType.EXPERIENCE, amount: this.experience });
    }

    if (this.gold > 0) {
      rewards.push({ type: RewardType.GOLD, amount: this.gold });
    }

    for (const item of this.items) {
      rewards.push({ type: RewardType.ITEM, item });
    }

    if (this.skillPoints > 0) {
      rewards.push({ type: RewardType.SKILL_POINT, amount: this.skillPoints });
    }

    for (const unlock of this.unlocks) {
      rewards.push({ type: RewardType.UNLOCK, unlock });
    }

    return rewards;
  }

  /**
   * Check if has any rewards
   */
  hasRewards() {
    return this.experience > 0 ||
           this.gold > 0 ||
           this.items.length > 0 ||
           this.skillPoints > 0 ||
           this.unlocks.length > 0;
  }

  export() {
    return {
      experience: this.experience,
      gold: this.gold,
      items: this.items,
      skillPoints: this.skillPoints,
      unlocks: this.unlocks,
      reputation: this.reputation,
      statBoosts: this.statBoosts,
      abilities: this.abilities,
    };
  }
}

// ============================================================================
// QUEST BUILDER
// ============================================================================

/**
 * Fluent builder for creating quests
 */
export class QuestBuilder {
  constructor(id) {
    this.config = {
      id,
      stages: [],
      rewards: {},
    };
    this.currentStage = null;
  }

  name(name) {
    this.config.name = name;
    return this;
  }

  description(desc) {
    this.config.description = desc;
    return this;
  }

  category(cat) {
    this.config.category = cat;
    return this;
  }

  difficulty(diff) {
    this.config.difficulty = diff;
    return this;
  }

  level(lvl) {
    this.config.level = lvl;
    return this;
  }

  questGiver(npcId) {
    this.config.questGiver = npcId;
    return this;
  }

  turnIn(npcId) {
    this.config.turnInNPC = npcId;
    return this;
  }

  requiresLevel(lvl) {
    this.config.requiredLevel = lvl;
    return this;
  }

  requiresQuest(...questIds) {
    this.config.requiredQuests = questIds;
    return this;
  }

  timeLimit(ms) {
    this.config.timeLimit = ms;
    return this;
  }

  repeatable(cooldownMs = 0) {
    this.config.repeatable = true;
    this.config.cooldown = cooldownMs;
    return this;
  }

  /**
   * Add a stage
   */
  stage(id) {
    this.currentStage = {
      id,
      objectives: [],
    };
    this.config.stages.push(this.currentStage);
    return this;
  }

  /**
   * Set stage objective text
   */
  objective(text) {
    if (this.currentStage) {
      this.currentStage.objective = text;
    }
    return this;
  }

  /**
   * Set stage trigger
   */
  trigger(type, target, conditions = {}) {
    if (this.currentStage) {
      this.currentStage.trigger = { type, target, conditions };
    }
    return this;
  }

  /**
   * Kill trigger shorthand
   */
  killTarget(target, count = 1) {
    return this.trigger(TriggerType.KILL, target, { count });
  }

  /**
   * Boss trigger shorthand
   */
  killBoss(bossId) {
    return this.trigger(TriggerType.BOSS_KILLED, bossId);
  }

  /**
   * Location trigger shorthand
   */
  reachLocation(locationId) {
    return this.trigger(TriggerType.LOCATION, locationId);
  }

  /**
   * NPC talk trigger shorthand
   */
  talkTo(npcId) {
    return this.trigger(TriggerType.TALK_NPC, npcId);
  }

  /**
   * Add stage dialogue
   */
  dialogue(dialogueId) {
    if (this.currentStage) {
      this.currentStage.dialogue = dialogueId;
    }
    return this;
  }

  /**
   * Add start dialogue
   */
  startDialogue(dialogueId) {
    this.config.dialogueStart = dialogueId;
    return this;
  }

  /**
   * Add completion dialogue
   */
  completeDialogue(dialogueId) {
    this.config.dialogueComplete = dialogueId;
    return this;
  }

  /**
   * Add experience reward
   */
  rewardXP(amount) {
    this.config.rewards.experience = amount;
    return this;
  }

  /**
   * Add gold reward
   */
  rewardGold(amount) {
    this.config.rewards.gold = amount;
    return this;
  }

  /**
   * Add item reward
   */
  rewardItem(itemId, quantity = 1) {
    if (!this.config.rewards.items) {
      this.config.rewards.items = [];
    }
    this.config.rewards.items.push({ itemId, quantity });
    return this;
  }

  /**
   * Add unlock reward
   */
  unlock(unlockId) {
    if (!this.config.rewards.unlocks) {
      this.config.rewards.unlocks = [];
    }
    this.config.rewards.unlocks.push(unlockId);
    return this;
  }

  /**
   * Build the quest
   */
  build() {
    return new Quest(this.config);
  }
}

// ============================================================================
// TEMPLATE QUESTS
// ============================================================================

/**
 * Pre-built quest templates
 */
export const QuestTemplates = {
  /**
   * Simple kill quest
   */
  killQuest(id, name, monsterType, count, rewards = {}) {
    return new QuestBuilder(id)
      .name(name)
      .description(`Kill ${count} ${monsterType}s`)
      .category(QuestCategory.BOUNTY)
      .stage('kill')
      .objective(`Kill ${count} ${monsterType}(s)`)
      .trigger(TriggerType.KILL_TYPE, monsterType, { count })
      .rewardXP(rewards.experience || 100)
      .rewardGold(rewards.gold || 50)
      .build();
  },

  /**
   * Boss kill quest
   */
  bossQuest(id, name, bossId, rewards = {}) {
    return new QuestBuilder(id)
      .name(name)
      .description(`Defeat the mighty ${bossId}`)
      .category(QuestCategory.BOSS)
      .difficulty(QuestDifficulty.HARD)
      .stage('find')
      .objective('Locate the boss lair')
      .reachLocation(`${bossId}_lair`)
      .stage('kill')
      .objective('Defeat the boss')
      .killBoss(bossId)
      .rewardXP(rewards.experience || 500)
      .rewardGold(rewards.gold || 250)
      .build();
  },

  /**
   * Explore location quest
   */
  exploreQuest(id, name, locationId, rewards = {}) {
    return new QuestBuilder(id)
      .name(name)
      .description(`Explore and discover ${locationId}`)
      .category(QuestCategory.EXPLORATION)
      .stage('explore')
      .objective(`Reach ${locationId}`)
      .reachLocation(locationId)
      .rewardXP(rewards.experience || 75)
      .build();
  },

  /**
   * Multi-stage dungeon quest
   */
  dungeonQuest(id, name, dungeonId, levels, bossId, rewards = {}) {
    const builder = new QuestBuilder(id)
      .name(name)
      .description(`Clear the ${dungeonId} dungeon`)
      .category(QuestCategory.MAIN);

    // Add stage for each level
    for (let i = 1; i <= levels; i++) {
      builder
        .stage(`level_${i}`)
        .objective(`Clear level ${i}`)
        .trigger(TriggerType.LEVEL_CLEAR, `${dungeonId}_${i}`);
    }

    // Final boss stage
    builder
      .stage('boss')
      .objective(`Defeat ${bossId}`)
      .killBoss(bossId)
      .rewardXP(rewards.experience || 1000)
      .rewardGold(rewards.gold || 500);

    return builder.build();
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default Quest;
