/**
 * QuestMapper - High-Level Tool for AI Quest Creation
 *
 * Maps AI-generated quests to Diablo's 24 hardcoded quest slots.
 * Provides an abstraction layer that:
 *   - Translates AI quest concepts to game mechanics
 *   - Manages quest slot allocation
 *   - Tracks custom quest metadata
 *   - Generates trigger configurations
 *
 * IMPORTANT: Diablo has exactly 24 quest slots (Q_ROCK through Q_JERSEY)
 * We "repurpose" these slots for custom quests.
 */

// Original Diablo quest slot IDs
export const QUEST_SLOTS = {
  Q_ROCK: 0,
  Q_MUSHROOM: 1,
  Q_GARBUD: 2,
  Q_ZHAR: 3,
  Q_VEIL: 4,
  Q_DIABLO: 5,
  Q_BUTCHER: 6,
  Q_LTBANNER: 7,
  Q_BLIND: 8,
  Q_BLOOD: 9,
  Q_ANVIL: 10,
  Q_WARLORD: 11,
  Q_SKELKING: 12,
  Q_PWATER: 13,
  Q_SCHAMB: 14,
  Q_BETRAYER: 15,
  Q_GRAVE: 16,
  Q_FARMER: 17,
  Q_GIRL: 18,
  Q_TRADER: 19,
  Q_DEFILER: 20,
  Q_NAKRUL: 21,
  Q_CORNSTN: 22,
  Q_JERSEY: 23,
};

// Quest states
export const QUEST_STATE = {
  NOTAVAIL: 0,
  INIT: 1,
  ACTIVE: 2,
  DONE: 3,
};

// Quest type templates for AI to use
export const QUEST_TYPES = {
  KILL_BOSS: 'kill_boss',
  KILL_COUNT: 'kill_count',
  EXPLORE: 'explore',
  FETCH_ITEM: 'fetch_item',
  TALK_NPC: 'talk_npc',
  CLEAR_LEVEL: 'clear_level',
  ESCORT: 'escort',
  SURVIVE: 'survive',
};

// Reward types
export const REWARD_TYPES = {
  GOLD: 'gold',
  EXPERIENCE: 'experience',
  ITEM: 'item',
  UNLOCK_AREA: 'unlock_area',
};

/**
 * QuestMapper class
 */
export class QuestMapper {
  constructor() {
    // Track slot allocations
    this.allocatedSlots = new Map();
    this.questMetadata = new Map();

    // Available slots for custom quests (prioritize less important original quests)
    this.prioritySlots = [
      QUEST_SLOTS.Q_ROCK,      // Magic Rock - minor fetch quest
      QUEST_SLOTS.Q_MUSHROOM,  // Black Mushroom - minor fetch quest
      QUEST_SLOTS.Q_GARBUD,    // Gharbad - minor NPC quest
      QUEST_SLOTS.Q_ZHAR,      // Zhar the Mad - minor boss
      QUEST_SLOTS.Q_LTBANNER,  // Ogden's Sign - fetch quest
      QUEST_SLOTS.Q_BLIND,     // Halls of the Blind - minor dungeon
      QUEST_SLOTS.Q_BLOOD,     // Valor - minor dungeon
      QUEST_SLOTS.Q_ANVIL,     // Anvil of Fury - fetch quest
      QUEST_SLOTS.Q_WARLORD,   // Warlord of Blood - minor boss
      QUEST_SLOTS.Q_PWATER,    // Poisoned Water - fetch quest
      QUEST_SLOTS.Q_SCHAMB,    // Chamber of Bone - minor dungeon
      QUEST_SLOTS.Q_GRAVE,     // Grave Matters (Hellfire)
      QUEST_SLOTS.Q_FARMER,    // Farmer's Orchard (Hellfire)
      QUEST_SLOTS.Q_GIRL,      // Little Girl (Hellfire)
      QUEST_SLOTS.Q_TRADER,    // Wandering Trader (Hellfire)
      QUEST_SLOTS.Q_CORNSTN,   // Cornerstone (Hellfire)
      QUEST_SLOTS.Q_JERSEY,    // Jersey's Jersey (Hellfire)
      // Save important story quests for last
      QUEST_SLOTS.Q_VEIL,      // Lachdanan - story quest
      QUEST_SLOTS.Q_BUTCHER,   // Butcher - iconic boss
      QUEST_SLOTS.Q_SKELKING,  // Skeleton King - iconic boss
      QUEST_SLOTS.Q_BETRAYER,  // Archbishop Lazarus - story
      QUEST_SLOTS.Q_DEFILER,   // Defiler (Hellfire)
      QUEST_SLOTS.Q_NAKRUL,    // Na-Krul (Hellfire)
      QUEST_SLOTS.Q_DIABLO,    // Diablo - final boss
    ];
  }

  /**
   * Allocate a quest slot for a custom quest
   * @param {object} quest - Quest definition from AI
   * @returns {number} Allocated slot ID or -1 if none available
   */
  allocateSlot(quest) {
    // Find first available slot
    for (const slotId of this.prioritySlots) {
      if (!this.allocatedSlots.has(slotId)) {
        this.allocatedSlots.set(slotId, quest.id || `quest_${slotId}`);
        return slotId;
      }
    }
    return -1; // No slots available
  }

  /**
   * Create a quest from AI specification
   * @param {object} spec - Quest specification
   * @returns {object} Quest configuration for game
   */
  createQuest(spec) {
    const {
      id,
      name,
      description,
      type = QUEST_TYPES.KILL_BOSS,
      level = 1,
      stages = [],
      rewards = {},
      triggerMonsterType = null,
      triggerPosition = null,
    } = spec;

    // Allocate slot
    const slotId = this.allocateSlot({ id });
    if (slotId === -1) {
      throw new Error('No quest slots available');
    }

    // Store metadata
    this.questMetadata.set(slotId, {
      id,
      name,
      description,
      type,
      stages,
      rewards,
      originalSlot: slotId,
    });

    // Create game-compatible quest object
    const quest = {
      slotId,
      id,
      name,
      description,
      level,
      state: QUEST_STATE.NOTAVAIL,

      // Trigger configuration
      trigger: this.createTrigger(type, { triggerMonsterType, triggerPosition, stages }),

      // Reward configuration
      rewards: this.normalizeRewards(rewards),

      // For QuestTriggerSystem
      stages: stages.map((stage, idx) => this.normalizeStage(stage, idx)),

      // Completion callback ID
      onComplete: `quest_${slotId}_complete`,
    };

    return quest;
  }

  /**
   * Create trigger configuration based on quest type
   */
  createTrigger(type, options) {
    switch (type) {
      case QUEST_TYPES.KILL_BOSS:
        return {
          type: 'kill',
          monsterType: options.triggerMonsterType || 101, // Default Skeleton King
          count: 1,
          isBoss: true,
        };

      case QUEST_TYPES.KILL_COUNT:
        return {
          type: 'kill_count',
          monsterType: options.triggerMonsterType || 1,
          count: options.stages?.[0]?.count || 10,
        };

      case QUEST_TYPES.EXPLORE:
        return {
          type: 'enter_level',
          level: options.stages?.[0]?.level || 1,
        };

      case QUEST_TYPES.FETCH_ITEM:
        return {
          type: 'collect_item',
          itemId: options.stages?.[0]?.itemId || 1,
        };

      case QUEST_TYPES.TALK_NPC:
        return {
          type: 'talk',
          npcType: options.stages?.[0]?.npcType || 0,
        };

      case QUEST_TYPES.CLEAR_LEVEL:
        return {
          type: 'clear_level',
          level: options.stages?.[0]?.level || 1,
        };

      default:
        return { type: 'manual' };
    }
  }

  /**
   * Normalize rewards to game format
   */
  normalizeRewards(rewards) {
    const normalized = {};

    if (rewards.gold) {
      normalized.gold = typeof rewards.gold === 'number' ? rewards.gold : 100;
    }

    if (rewards.experience || rewards.xp) {
      normalized.experience = rewards.experience || rewards.xp || 500;
    }

    if (rewards.item || rewards.items) {
      normalized.items = Array.isArray(rewards.items)
        ? rewards.items
        : rewards.item
        ? [rewards.item]
        : [];
    }

    if (rewards.unlockArea || rewards.unlockLevel) {
      normalized.unlockArea = rewards.unlockArea || rewards.unlockLevel;
    }

    return normalized;
  }

  /**
   * Normalize stage to internal format
   */
  normalizeStage(stage, index) {
    return {
      index,
      type: stage.type || 'objective',
      description: stage.description || `Stage ${index + 1}`,
      target: stage.target || stage.count || 1,
      progress: 0,
      completed: false,
      ...stage,
    };
  }

  /**
   * Create a quest chain (multiple connected quests)
   * @param {object} spec - Chain specification
   * @returns {Array} Array of quest configurations
   */
  createQuestChain(spec) {
    const { name, quests = [] } = spec;
    const chain = [];

    for (let i = 0; i < quests.length; i++) {
      const questSpec = quests[i];
      const quest = this.createQuest({
        ...questSpec,
        id: questSpec.id || `${name}_${i}`,
        name: questSpec.name || `${name} - Part ${i + 1}`,
      });

      // Link to next quest
      if (i < quests.length - 1) {
        quest.nextQuest = `${name}_${i + 1}`;
      }

      // Link from previous
      if (i > 0) {
        quest.requiresQuest = `${name}_${i - 1}`;
      }

      chain.push(quest);
    }

    return chain;
  }

  /**
   * Get WhiteBoxAPI commands to set up a quest
   * @param {object} quest - Quest from createQuest()
   * @returns {Array} Array of API commands
   */
  getSetupCommands(quest) {
    const commands = [];

    // Set quest to available/init state
    commands.push({
      method: 'setQuestState',
      args: [quest.slotId, QUEST_STATE.INIT],
    });

    // Set quest level
    if (quest.level !== undefined) {
      // Note: quest level is typically set in the Quest struct,
      // but we track it in metadata
    }

    // Set trigger position if specified
    if (quest.trigger?.position) {
      commands.push({
        method: 'setQuestPosition',
        args: [quest.slotId, quest.trigger.position.x, quest.trigger.position.y],
      });
    }

    return commands;
  }

  /**
   * Get commands to activate a quest
   */
  getActivationCommands(quest) {
    return [
      {
        method: 'activateQuest',
        args: [quest.slotId, quest.level || -1],
      },
    ];
  }

  /**
   * Get commands to complete a quest
   */
  getCompletionCommands(quest) {
    const commands = [
      {
        method: 'completeQuest',
        args: [quest.slotId],
      },
    ];

    // Add reward commands
    if (quest.rewards.gold) {
      commands.push({
        method: 'givePlayerGold',
        args: [0, quest.rewards.gold], // playerId 0
      });
    }

    if (quest.rewards.experience) {
      commands.push({
        method: 'givePlayerExperience',
        args: [0, quest.rewards.experience],
      });
    }

    if (quest.rewards.items) {
      for (const item of quest.rewards.items) {
        commands.push({
          method: 'givePlayerItem',
          args: [0, item.id || item, item.quality || 0],
        });
      }
    }

    return commands;
  }

  /**
   * Export all quests for campaign
   */
  exportAll() {
    const quests = [];
    for (const [slotId, metadata] of this.questMetadata) {
      quests.push({
        slotId,
        ...metadata,
      });
    }
    return quests;
  }

  /**
   * Get slot usage summary
   */
  getSummary() {
    return {
      allocated: this.allocatedSlots.size,
      available: 24 - this.allocatedSlots.size,
      slots: Array.from(this.allocatedSlots.entries()).map(([id, questId]) => ({
        slotId: id,
        questId,
        metadata: this.questMetadata.get(id),
      })),
    };
  }

  /**
   * Reset all allocations
   */
  reset() {
    this.allocatedSlots.clear();
    this.questMetadata.clear();
  }
}

export default QuestMapper;
