/**
 * Quest Trigger System
 *
 * Manages quests and their triggers based on game events.
 * Works with the GameEventEmitter to advance quest stages.
 *
 * Quest Stages:
 * - not_started: Quest not yet given to player
 * - in_progress: Quest is active
 * - completed: Quest finished successfully
 * - failed: Quest failed (optional)
 *
 * Trigger Types:
 * - monster_killed: Kill a specific monster type or ID
 * - boss_killed: Kill a boss monster
 * - level_entered: Enter a specific dungeon level
 * - level_cleared: Clear all monsters on a level
 * - gold_gained: Collect gold threshold
 * - player_leveled: Reach a player level
 * - item_collected: (future) Collect specific item
 * - npc_talked: (future) Talk to NPC
 */

import { gameEventEmitter, GameEventType } from './GameEventEmitter';

/**
 * Quest status constants
 */
export const QuestStatus = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Trigger type constants
 */
export const TriggerType = {
  MONSTER_KILLED: 'monster_killed',
  BOSS_KILLED: 'boss_killed',
  LEVEL_ENTERED: 'level_entered',
  LEVEL_CLEARED: 'level_cleared',
  GOLD_GAINED: 'gold_gained',
  PLAYER_LEVELED: 'player_leveled',
  KILL_COUNT: 'kill_count',
  PLAYER_DAMAGED: 'player_damaged',
  PLAYER_HEALED: 'player_healed',
};

/**
 * Quest Trigger System - manages quests and event-based triggers
 */
class QuestTriggerSystem {
  constructor() {
    this.quests = new Map(); // questId -> Quest object
    this.activeQuests = new Set(); // Set of active quest IDs
    this.completedQuests = new Set(); // Set of completed quest IDs
    this.questProgress = new Map(); // questId -> progress data

    // Kill counters for kill_count triggers
    this.killCounts = {
      total: 0,
      byType: {},
    };

    // Gold tracking
    this.totalGoldGained = 0;

    // Event listeners
    this.unsubscribers = [];

    // Callbacks
    this.onQuestStarted = null;
    this.onQuestAdvanced = null;
    this.onQuestCompleted = null;
    this.onQuestFailed = null;
  }

  /**
   * Initialize the quest system and subscribe to game events
   */
  initialize() {
    // Subscribe to all relevant game events
    this.unsubscribers.push(
      gameEventEmitter.on(GameEventType.MONSTER_KILLED, (e) => this.handleMonsterKilled(e)),
      gameEventEmitter.on(GameEventType.BOSS_KILLED, (e) => this.handleBossKilled(e)),
      gameEventEmitter.on(GameEventType.LEVEL_ENTERED, (e) => this.handleLevelEntered(e)),
      gameEventEmitter.on(GameEventType.LEVEL_CLEARED, (e) => this.handleLevelCleared(e)),
      gameEventEmitter.on(GameEventType.GOLD_GAINED, (e) => this.handleGoldGained(e)),
      gameEventEmitter.on(GameEventType.PLAYER_LEVELED, (e) => this.handlePlayerLeveled(e)),
      gameEventEmitter.on(GameEventType.PLAYER_DAMAGED, (e) => this.handlePlayerDamaged(e)),
    );

    console.log('[QuestTriggerSystem] Initialized with event listeners');
  }

  /**
   * Cleanup event subscriptions
   */
  destroy() {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  /**
   * Register a quest definition
   * @param {Object} quest - Quest definition
   */
  registerQuest(quest) {
    if (!quest.id) {
      console.error('[QuestTriggerSystem] Quest must have an id');
      return;
    }

    // Normalize quest structure
    const normalizedQuest = {
      id: quest.id,
      name: quest.name || 'Unnamed Quest',
      description: quest.description || '',
      stages: quest.stages || [],
      rewards: quest.rewards || {},
      status: QuestStatus.NOT_STARTED,
      currentStage: 0,
    };

    this.quests.set(quest.id, normalizedQuest);
    this.questProgress.set(quest.id, {
      killCount: 0,
      goldCollected: 0,
      stageData: {},
    });

    console.log(`[QuestTriggerSystem] Registered quest: ${quest.id}`);
  }

  /**
   * Start a quest
   * @param {string} questId - Quest ID
   */
  startQuest(questId) {
    const quest = this.quests.get(questId);
    if (!quest) {
      console.error(`[QuestTriggerSystem] Quest not found: ${questId}`);
      return false;
    }

    if (quest.status !== QuestStatus.NOT_STARTED) {
      console.warn(`[QuestTriggerSystem] Quest already started: ${questId}`);
      return false;
    }

    quest.status = QuestStatus.IN_PROGRESS;
    quest.currentStage = 0;
    this.activeQuests.add(questId);

    console.log(`[QuestTriggerSystem] Started quest: ${quest.name}`);

    if (this.onQuestStarted) {
      this.onQuestStarted(quest);
    }

    return true;
  }

  /**
   * Advance a quest to the next stage
   * @param {string} questId - Quest ID
   */
  advanceQuest(questId) {
    const quest = this.quests.get(questId);
    if (!quest || quest.status !== QuestStatus.IN_PROGRESS) return;

    quest.currentStage++;

    // Check if quest is complete
    if (quest.currentStage >= quest.stages.length) {
      this.completeQuest(questId);
      return;
    }

    console.log(`[QuestTriggerSystem] Advanced quest: ${quest.name} to stage ${quest.currentStage}`);

    if (this.onQuestAdvanced) {
      this.onQuestAdvanced(quest, quest.stages[quest.currentStage]);
    }
  }

  /**
   * Complete a quest
   * @param {string} questId - Quest ID
   */
  completeQuest(questId) {
    const quest = this.quests.get(questId);
    if (!quest) return;

    quest.status = QuestStatus.COMPLETED;
    this.activeQuests.delete(questId);
    this.completedQuests.add(questId);

    console.log(`[QuestTriggerSystem] Completed quest: ${quest.name}`);

    if (this.onQuestCompleted) {
      this.onQuestCompleted(quest);
    }
  }

  /**
   * Fail a quest
   * @param {string} questId - Quest ID
   */
  failQuest(questId) {
    const quest = this.quests.get(questId);
    if (!quest) return;

    quest.status = QuestStatus.FAILED;
    this.activeQuests.delete(questId);

    console.log(`[QuestTriggerSystem] Failed quest: ${quest.name}`);

    if (this.onQuestFailed) {
      this.onQuestFailed(quest);
    }
  }

  /**
   * Check if a trigger condition is met
   * @param {Object} trigger - Trigger definition
   * @param {Object} event - Game event
   * @returns {boolean}
   */
  checkTrigger(trigger, event) {
    switch (trigger.type) {
      case TriggerType.MONSTER_KILLED:
        if (trigger.monsterType) {
          return event.data?.monsterType === trigger.monsterType;
        }
        if (trigger.monsterId) {
          return event.data?.monsterId === trigger.monsterId;
        }
        return true;

      case TriggerType.BOSS_KILLED:
        if (trigger.bossType) {
          return event.data?.monsterType === trigger.bossType;
        }
        return true;

      case TriggerType.LEVEL_ENTERED:
        return event.data?.level === trigger.level;

      case TriggerType.LEVEL_CLEARED:
        return event.data?.level === trigger.level;

      case TriggerType.GOLD_GAINED:
        return this.totalGoldGained >= trigger.threshold;

      case TriggerType.PLAYER_LEVELED:
        return event.data?.newLevel >= trigger.level;

      case TriggerType.KILL_COUNT:
        const progress = this.questProgress.get(trigger.questId);
        return progress?.killCount >= trigger.count;

      default:
        return false;
    }
  }

  /**
   * Process active quests against an event
   * @param {Object} event - Game event
   * @param {string} triggerType - Type of trigger to check
   */
  processEvent(event, triggerType) {
    for (const questId of this.activeQuests) {
      const quest = this.quests.get(questId);
      if (!quest || quest.status !== QuestStatus.IN_PROGRESS) continue;

      const currentStage = quest.stages[quest.currentStage];
      if (!currentStage || !currentStage.trigger) continue;

      // Check if trigger type matches
      if (currentStage.trigger.type !== triggerType) continue;

      // Check if trigger condition is met
      if (this.checkTrigger(currentStage.trigger, event)) {
        this.advanceQuest(questId);
      }
    }
  }

  // Event handlers

  handleMonsterKilled(event) {
    this.killCounts.total++;
    const type = event.data?.monsterType;
    if (type) {
      this.killCounts.byType[type] = (this.killCounts.byType[type] || 0) + 1;
    }

    // Update kill count progress for active quests
    for (const questId of this.activeQuests) {
      const progress = this.questProgress.get(questId);
      if (progress) {
        progress.killCount++;
      }
    }

    this.processEvent(event, TriggerType.MONSTER_KILLED);
    this.processEvent(event, TriggerType.KILL_COUNT);
  }

  handleBossKilled(event) {
    this.processEvent(event, TriggerType.BOSS_KILLED);
  }

  handleLevelEntered(event) {
    this.processEvent(event, TriggerType.LEVEL_ENTERED);
  }

  handleLevelCleared(event) {
    this.processEvent(event, TriggerType.LEVEL_CLEARED);
  }

  handleGoldGained(event) {
    this.totalGoldGained += event.data?.amount || 0;
    this.processEvent(event, TriggerType.GOLD_GAINED);
  }

  handlePlayerLeveled(event) {
    this.processEvent(event, TriggerType.PLAYER_LEVELED);
  }

  handlePlayerDamaged(event) {
    // Could be used for "take X damage" type quests
    this.processEvent(event, TriggerType.PLAYER_DAMAGED);
  }

  // Query methods

  /**
   * Get all registered quests
   * @returns {Array}
   */
  getAllQuests() {
    return Array.from(this.quests.values());
  }

  /**
   * Get active quests
   * @returns {Array}
   */
  getActiveQuests() {
    return Array.from(this.activeQuests).map(id => this.quests.get(id)).filter(Boolean);
  }

  /**
   * Get completed quests
   * @returns {Array}
   */
  getCompletedQuests() {
    return Array.from(this.completedQuests).map(id => this.quests.get(id)).filter(Boolean);
  }

  /**
   * Get quest by ID
   * @param {string} questId
   * @returns {Object|null}
   */
  getQuest(questId) {
    return this.quests.get(questId) || null;
  }

  /**
   * Get quest progress
   * @param {string} questId
   * @returns {Object|null}
   */
  getQuestProgress(questId) {
    return this.questProgress.get(questId) || null;
  }

  /**
   * Get kill counts
   * @returns {Object}
   */
  getKillCounts() {
    return { ...this.killCounts };
  }

  /**
   * Reset quest system (for new game)
   */
  reset() {
    for (const quest of this.quests.values()) {
      quest.status = QuestStatus.NOT_STARTED;
      quest.currentStage = 0;
    }
    this.activeQuests.clear();
    this.completedQuests.clear();
    this.questProgress.clear();
    this.killCounts = { total: 0, byType: {} };
    this.totalGoldGained = 0;
  }

  /**
   * Export state for saving
   * @returns {Object}
   */
  exportState() {
    return {
      activeQuests: Array.from(this.activeQuests),
      completedQuests: Array.from(this.completedQuests),
      questStates: Array.from(this.quests.entries()).map(([id, quest]) => ({
        id,
        status: quest.status,
        currentStage: quest.currentStage,
      })),
      progress: Object.fromEntries(this.questProgress),
      killCounts: this.killCounts,
      totalGoldGained: this.totalGoldGained,
    };
  }

  /**
   * Import state from save
   * @param {Object} state
   */
  importState(state) {
    if (!state) return;

    this.activeQuests = new Set(state.activeQuests || []);
    this.completedQuests = new Set(state.completedQuests || []);
    this.killCounts = state.killCounts || { total: 0, byType: {} };
    this.totalGoldGained = state.totalGoldGained || 0;

    // Restore quest states
    if (state.questStates) {
      for (const { id, status, currentStage } of state.questStates) {
        const quest = this.quests.get(id);
        if (quest) {
          quest.status = status;
          quest.currentStage = currentStage;
        }
      }
    }

    // Restore progress
    if (state.progress) {
      for (const [id, progress] of Object.entries(state.progress)) {
        this.questProgress.set(id, progress);
      }
    }
  }
}

// Export singleton
export const questTriggerSystem = new QuestTriggerSystem();

export default questTriggerSystem;
