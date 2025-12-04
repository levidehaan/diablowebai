/**
 * Quest Triggers System
 *
 * Provides an event-driven trigger system for AI-generated quests.
 * Triggers can respond to game events and activate quest objectives,
 * spawn monsters, play dialogue, or modify the level.
 */

// Trigger types
export const TRIGGER_TYPES = {
  // Location-based triggers
  ENTER_AREA: 'enter_area',
  ENTER_TILE: 'enter_tile',
  PROXIMITY: 'proximity',

  // Combat triggers
  MONSTER_KILLED: 'monster_killed',
  MONSTER_TYPE_KILLED: 'monster_type_killed',
  ALL_MONSTERS_CLEARED: 'all_monsters_cleared',
  BOSS_KILLED: 'boss_killed',
  PLAYER_DAMAGED: 'player_damaged',
  PLAYER_HEALTH_LOW: 'player_health_low',

  // Interaction triggers
  OBJECT_ACTIVATED: 'object_activated',
  SHRINE_USED: 'shrine_used',
  ITEM_PICKED: 'item_picked',
  ITEM_EQUIPPED: 'item_equipped',
  LEVEL_ENTERED: 'level_entered',
  LEVEL_EXITED: 'level_exited',

  // Quest triggers
  QUEST_STARTED: 'quest_started',
  QUEST_COMPLETED: 'quest_completed',
  OBJECTIVE_COMPLETED: 'objective_completed',

  // Time triggers
  TIME_ELAPSED: 'time_elapsed',
  TURN_COUNT: 'turn_count',

  // Custom triggers
  CUSTOM: 'custom',
};

// Action types
export const ACTION_TYPES = {
  // Dialogue
  SHOW_DIALOGUE: 'show_dialogue',
  SHOW_NOTIFICATION: 'show_notification',

  // Quest management
  START_QUEST: 'start_quest',
  COMPLETE_QUEST: 'complete_quest',
  FAIL_QUEST: 'fail_quest',
  UPDATE_OBJECTIVE: 'update_objective',
  ADD_OBJECTIVE: 'add_objective',

  // Spawn actions
  SPAWN_MONSTER: 'spawn_monster',
  SPAWN_MONSTERS: 'spawn_monsters',
  SPAWN_BOSS: 'spawn_boss',
  SPAWN_ITEM: 'spawn_item',
  SPAWN_OBJECT: 'spawn_object',

  // Level modification
  OPEN_DOOR: 'open_door',
  CLOSE_DOOR: 'close_door',
  REVEAL_AREA: 'reveal_area',
  MODIFY_TILE: 'modify_tile',

  // Player effects
  HEAL_PLAYER: 'heal_player',
  DAMAGE_PLAYER: 'damage_player',
  GRANT_EXPERIENCE: 'grant_experience',
  GRANT_GOLD: 'grant_gold',
  GIVE_ITEM: 'give_item',

  // Flow control
  ENABLE_TRIGGER: 'enable_trigger',
  DISABLE_TRIGGER: 'disable_trigger',
  DELAY_ACTION: 'delay_action',
  CHAIN_ACTIONS: 'chain_actions',

  // Audio/Visual
  PLAY_SOUND: 'play_sound',
  SCREEN_SHAKE: 'screen_shake',
  FLASH_SCREEN: 'flash_screen',
};

/**
 * Trigger definition class
 */
export class Trigger {
  constructor(config) {
    this.id = config.id || `trigger_${Date.now()}`;
    this.type = config.type;
    this.conditions = config.conditions || {};
    this.actions = config.actions || [];
    this.enabled = config.enabled !== false;
    this.oneShot = config.oneShot !== false;
    this.fired = false;
    this.priority = config.priority || 0;
    this.cooldown = config.cooldown || 0;
    this.lastFired = 0;
    this.tags = config.tags || [];
    this.description = config.description || '';
  }

  /**
   * Check if trigger can fire based on cooldown
   */
  canFire() {
    if (!this.enabled) return false;
    if (this.oneShot && this.fired) return false;
    if (this.cooldown > 0) {
      const now = Date.now();
      if (now - this.lastFired < this.cooldown) return false;
    }
    return true;
  }

  /**
   * Mark trigger as fired
   */
  fire() {
    this.fired = true;
    this.lastFired = Date.now();
  }

  /**
   * Reset trigger state
   */
  reset() {
    this.fired = false;
    this.lastFired = 0;
  }

  /**
   * Export trigger definition
   */
  export() {
    return {
      id: this.id,
      type: this.type,
      conditions: this.conditions,
      actions: this.actions,
      enabled: this.enabled,
      oneShot: this.oneShot,
      priority: this.priority,
      cooldown: this.cooldown,
      tags: this.tags,
      description: this.description,
    };
  }
}

/**
 * Quest Trigger Manager
 */
export class QuestTriggerManager {
  constructor() {
    this.triggers = new Map();
    this.activeQuests = new Map();
    this.eventListeners = new Map();
    this.actionHandlers = new Map();
    this.gameState = null;
    this.pendingActions = [];

    // Register default action handlers
    this.registerDefaultHandlers();
  }

  /**
   * Initialize with game state reference
   */
  initialize(gameState) {
    this.gameState = gameState;
    console.log('[QuestTriggers] Initialized');
  }

  /**
   * Register default action handlers
   */
  registerDefaultHandlers() {
    // Dialogue actions
    this.actionHandlers.set(ACTION_TYPES.SHOW_DIALOGUE, (action, ctx) => {
      console.log('[Quest Dialogue]', action.speaker || 'Narrator', ':', action.text);
      this.emit('dialogue', {
        speaker: action.speaker,
        text: action.text,
        portrait: action.portrait,
        options: action.options,
      });
      return { success: true };
    });

    this.actionHandlers.set(ACTION_TYPES.SHOW_NOTIFICATION, (action, ctx) => {
      console.log('[Quest Notification]', action.text);
      this.emit('notification', {
        text: action.text,
        type: action.notificationType || 'info',
        duration: action.duration || 3000,
      });
      return { success: true };
    });

    // Quest management
    this.actionHandlers.set(ACTION_TYPES.START_QUEST, (action, ctx) => {
      const quest = {
        id: action.questId,
        name: action.questName,
        description: action.description,
        objectives: action.objectives || [],
        status: 'active',
        startTime: Date.now(),
      };
      this.activeQuests.set(quest.id, quest);
      this.emit('questStarted', quest);
      console.log('[Quest] Started:', quest.name);
      return { success: true, quest };
    });

    this.actionHandlers.set(ACTION_TYPES.COMPLETE_QUEST, (action, ctx) => {
      const quest = this.activeQuests.get(action.questId);
      if (quest) {
        quest.status = 'completed';
        quest.completedTime = Date.now();
        this.emit('questCompleted', quest);
        console.log('[Quest] Completed:', quest.name);
        return { success: true, quest };
      }
      return { success: false, error: 'Quest not found' };
    });

    this.actionHandlers.set(ACTION_TYPES.UPDATE_OBJECTIVE, (action, ctx) => {
      const quest = this.activeQuests.get(action.questId);
      if (quest) {
        const objective = quest.objectives.find(o => o.id === action.objectiveId);
        if (objective) {
          objective.progress = action.progress || (objective.progress || 0) + 1;
          if (action.completed || objective.progress >= objective.target) {
            objective.completed = true;
          }
          this.emit('objectiveUpdated', { quest, objective });
          return { success: true, objective };
        }
      }
      return { success: false, error: 'Objective not found' };
    });

    // Spawn actions
    this.actionHandlers.set(ACTION_TYPES.SPAWN_MONSTER, (action, ctx) => {
      this.emit('spawnMonster', {
        type: action.monsterType,
        x: action.x,
        y: action.y,
        unique: action.unique,
        name: action.name,
      });
      console.log('[Quest] Spawning monster:', action.monsterType, 'at', action.x, action.y);
      return { success: true };
    });

    this.actionHandlers.set(ACTION_TYPES.SPAWN_BOSS, (action, ctx) => {
      this.emit('spawnBoss', {
        type: action.bossType,
        x: action.x,
        y: action.y,
        name: action.name,
        dialogue: action.dialogue,
      });
      console.log('[Quest] Spawning boss:', action.bossType);
      return { success: true };
    });

    // Player effects
    this.actionHandlers.set(ACTION_TYPES.GRANT_EXPERIENCE, (action, ctx) => {
      this.emit('grantExperience', { amount: action.amount });
      console.log('[Quest] Granted experience:', action.amount);
      return { success: true };
    });

    this.actionHandlers.set(ACTION_TYPES.GRANT_GOLD, (action, ctx) => {
      this.emit('grantGold', { amount: action.amount });
      console.log('[Quest] Granted gold:', action.amount);
      return { success: true };
    });

    // Flow control
    this.actionHandlers.set(ACTION_TYPES.ENABLE_TRIGGER, (action, ctx) => {
      const trigger = this.triggers.get(action.triggerId);
      if (trigger) {
        trigger.enabled = true;
        return { success: true };
      }
      return { success: false, error: 'Trigger not found' };
    });

    this.actionHandlers.set(ACTION_TYPES.DISABLE_TRIGGER, (action, ctx) => {
      const trigger = this.triggers.get(action.triggerId);
      if (trigger) {
        trigger.enabled = false;
        return { success: true };
      }
      return { success: false, error: 'Trigger not found' };
    });

    this.actionHandlers.set(ACTION_TYPES.DELAY_ACTION, (action, ctx) => {
      setTimeout(() => {
        this.executeAction(action.delayedAction, ctx);
      }, action.delay || 1000);
      return { success: true };
    });

    this.actionHandlers.set(ACTION_TYPES.CHAIN_ACTIONS, (action, ctx) => {
      for (const chainedAction of action.actions) {
        this.executeAction(chainedAction, ctx);
      }
      return { success: true };
    });
  }

  /**
   * Register a trigger
   */
  registerTrigger(config) {
    const trigger = config instanceof Trigger ? config : new Trigger(config);
    this.triggers.set(trigger.id, trigger);
    console.log('[QuestTriggers] Registered:', trigger.id, trigger.type);
    return trigger;
  }

  /**
   * Unregister a trigger
   */
  unregisterTrigger(triggerId) {
    this.triggers.delete(triggerId);
  }

  /**
   * Register multiple triggers from campaign data
   */
  loadCampaignTriggers(campaign) {
    if (!campaign.triggers) return;

    for (const triggerDef of campaign.triggers) {
      this.registerTrigger(triggerDef);
    }

    console.log(`[QuestTriggers] Loaded ${campaign.triggers.length} triggers from campaign`);
  }

  /**
   * Process a game event and fire matching triggers
   */
  processEvent(eventType, eventData = {}) {
    const matchingTriggers = [];

    // Find all matching triggers
    for (const [id, trigger] of this.triggers) {
      if (!trigger.canFire()) continue;
      if (!this.matchesTriggerType(trigger, eventType)) continue;
      if (!this.matchesConditions(trigger, eventData)) continue;

      matchingTriggers.push(trigger);
    }

    // Sort by priority (higher first)
    matchingTriggers.sort((a, b) => b.priority - a.priority);

    // Execute triggers
    for (const trigger of matchingTriggers) {
      this.executeTrigger(trigger, eventData);
    }

    return matchingTriggers.length;
  }

  /**
   * Check if event type matches trigger type
   */
  matchesTriggerType(trigger, eventType) {
    if (trigger.type === TRIGGER_TYPES.CUSTOM) {
      return trigger.conditions.eventType === eventType;
    }
    return trigger.type === eventType;
  }

  /**
   * Check if event data matches trigger conditions
   */
  matchesConditions(trigger, eventData) {
    const conditions = trigger.conditions;

    for (const [key, expected] of Object.entries(conditions)) {
      if (key === 'eventType') continue; // Already checked

      const actual = eventData[key];

      // Handle different condition types
      if (typeof expected === 'object' && expected !== null) {
        // Range check
        if ('min' in expected || 'max' in expected) {
          if ('min' in expected && actual < expected.min) return false;
          if ('max' in expected && actual > expected.max) return false;
          continue;
        }
        // Array inclusion
        if (Array.isArray(expected)) {
          if (!expected.includes(actual)) return false;
          continue;
        }
      }

      // Exact match
      if (actual !== expected) return false;
    }

    return true;
  }

  /**
   * Execute a trigger and its actions
   */
  executeTrigger(trigger, eventData) {
    console.log('[QuestTriggers] Firing:', trigger.id);
    trigger.fire();

    const context = {
      trigger,
      eventData,
      gameState: this.gameState,
      quests: this.activeQuests,
    };

    for (const action of trigger.actions) {
      this.executeAction(action, context);
    }

    this.emit('triggerFired', { trigger, eventData });
  }

  /**
   * Execute a single action
   */
  executeAction(action, context) {
    const handler = this.actionHandlers.get(action.type);

    if (handler) {
      try {
        const result = handler(action, context);
        if (!result.success) {
          console.warn('[QuestTriggers] Action failed:', action.type, result.error);
        }
        return result;
      } catch (error) {
        console.error('[QuestTriggers] Action error:', action.type, error);
        return { success: false, error: error.message };
      }
    } else {
      console.warn('[QuestTriggers] Unknown action type:', action.type);
      return { success: false, error: 'Unknown action type' };
    }
  }

  /**
   * Register a custom action handler
   */
  registerActionHandler(actionType, handler) {
    this.actionHandlers.set(actionType, handler);
  }

  /**
   * Event emitter methods
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (error) {
          console.error('[QuestTriggers] Event error:', event, error);
        }
      }
    }
  }

  /**
   * Get all active quests
   */
  getActiveQuests() {
    return Array.from(this.activeQuests.values());
  }

  /**
   * Get quest by ID
   */
  getQuest(questId) {
    return this.activeQuests.get(questId);
  }

  /**
   * Get triggers by tag
   */
  getTriggersByTag(tag) {
    const result = [];
    for (const [id, trigger] of this.triggers) {
      if (trigger.tags.includes(tag)) {
        result.push(trigger);
      }
    }
    return result;
  }

  /**
   * Reset all triggers for a new game
   */
  reset() {
    for (const [id, trigger] of this.triggers) {
      trigger.reset();
    }
    this.activeQuests.clear();
    this.pendingActions = [];
  }

  /**
   * Clear all triggers
   */
  clear() {
    this.triggers.clear();
    this.activeQuests.clear();
    this.pendingActions = [];
  }

  /**
   * Export state for save game
   */
  exportState() {
    const triggerStates = {};
    for (const [id, trigger] of this.triggers) {
      triggerStates[id] = {
        fired: trigger.fired,
        enabled: trigger.enabled,
        lastFired: trigger.lastFired,
      };
    }

    return {
      triggers: triggerStates,
      quests: Object.fromEntries(this.activeQuests),
    };
  }

  /**
   * Import state from save game
   */
  importState(state) {
    if (state.triggers) {
      for (const [id, triggerState] of Object.entries(state.triggers)) {
        const trigger = this.triggers.get(id);
        if (trigger) {
          trigger.fired = triggerState.fired;
          trigger.enabled = triggerState.enabled;
          trigger.lastFired = triggerState.lastFired;
        }
      }
    }

    if (state.quests) {
      this.activeQuests.clear();
      for (const [id, quest] of Object.entries(state.quests)) {
        this.activeQuests.set(id, quest);
      }
    }
  }
}

/**
 * Helper function to create common trigger types
 */
export const TriggerBuilder = {
  /**
   * Create a trigger that fires when entering an area
   */
  onEnterArea(areaId, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.ENTER_AREA,
      conditions: { areaId },
      actions,
      ...options,
    });
  },

  /**
   * Create a trigger that fires when a monster type is killed
   */
  onMonsterKilled(monsterType, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.MONSTER_TYPE_KILLED,
      conditions: { monsterType },
      actions,
      ...options,
    });
  },

  /**
   * Create a trigger that fires when all monsters in an area are cleared
   */
  onAreaCleared(areaId, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.ALL_MONSTERS_CLEARED,
      conditions: { areaId },
      actions,
      ...options,
    });
  },

  /**
   * Create a trigger that fires when a boss is killed
   */
  onBossKilled(bossId, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.BOSS_KILLED,
      conditions: { bossId },
      actions,
      ...options,
    });
  },

  /**
   * Create a trigger that fires when an object is activated
   */
  onObjectActivated(objectId, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.OBJECT_ACTIVATED,
      conditions: { objectId },
      actions,
      ...options,
    });
  },

  /**
   * Create a trigger that fires when entering a level
   */
  onLevelEnter(levelId, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.LEVEL_ENTERED,
      conditions: { levelId },
      actions,
      ...options,
    });
  },

  /**
   * Create a multi-kill trigger
   */
  onKillCount(monsterType, count, actions, options = {}) {
    return new Trigger({
      type: TRIGGER_TYPES.MONSTER_TYPE_KILLED,
      conditions: {
        monsterType,
        killCount: { min: count },
      },
      actions,
      ...options,
    });
  },
};

/**
 * Helper function to create common action types
 */
export const ActionBuilder = {
  /**
   * Show dialogue from an NPC or narrator
   */
  dialogue(speaker, text, options = {}) {
    return {
      type: ACTION_TYPES.SHOW_DIALOGUE,
      speaker,
      text,
      ...options,
    };
  },

  /**
   * Show a notification
   */
  notification(text, notificationType = 'info') {
    return {
      type: ACTION_TYPES.SHOW_NOTIFICATION,
      text,
      notificationType,
    };
  },

  /**
   * Start a quest
   */
  startQuest(questId, questName, description, objectives = []) {
    return {
      type: ACTION_TYPES.START_QUEST,
      questId,
      questName,
      description,
      objectives,
    };
  },

  /**
   * Complete a quest
   */
  completeQuest(questId) {
    return {
      type: ACTION_TYPES.COMPLETE_QUEST,
      questId,
    };
  },

  /**
   * Update quest objective
   */
  updateObjective(questId, objectiveId, progress, completed = false) {
    return {
      type: ACTION_TYPES.UPDATE_OBJECTIVE,
      questId,
      objectiveId,
      progress,
      completed,
    };
  },

  /**
   * Spawn a monster
   */
  spawnMonster(monsterType, x, y, options = {}) {
    return {
      type: ACTION_TYPES.SPAWN_MONSTER,
      monsterType,
      x,
      y,
      ...options,
    };
  },

  /**
   * Spawn a boss
   */
  spawnBoss(bossType, x, y, name, options = {}) {
    return {
      type: ACTION_TYPES.SPAWN_BOSS,
      bossType,
      x,
      y,
      name,
      ...options,
    };
  },

  /**
   * Grant experience
   */
  grantXP(amount) {
    return {
      type: ACTION_TYPES.GRANT_EXPERIENCE,
      amount,
    };
  },

  /**
   * Grant gold
   */
  grantGold(amount) {
    return {
      type: ACTION_TYPES.GRANT_GOLD,
      amount,
    };
  },

  /**
   * Enable another trigger
   */
  enableTrigger(triggerId) {
    return {
      type: ACTION_TYPES.ENABLE_TRIGGER,
      triggerId,
    };
  },

  /**
   * Disable another trigger
   */
  disableTrigger(triggerId) {
    return {
      type: ACTION_TYPES.DISABLE_TRIGGER,
      triggerId,
    };
  },

  /**
   * Delay an action
   */
  delay(delayedAction, delay = 1000) {
    return {
      type: ACTION_TYPES.DELAY_ACTION,
      delayedAction,
      delay,
    };
  },

  /**
   * Chain multiple actions
   */
  chain(...actions) {
    return {
      type: ACTION_TYPES.CHAIN_ACTIONS,
      actions,
    };
  },
};

// Singleton instance
const questTriggerManager = new QuestTriggerManager();

export default questTriggerManager;
