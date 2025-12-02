/**
 * Dynamic Narrative Engine
 *
 * Provides AI-driven dialogue, quest generation, and story continuity.
 * Virtualizes the static text tables for context-aware content.
 */

import NeuralConfig from './config';
import neuralInterop from './NeuralInterop';

const { narrative: config } = NeuralConfig;

/**
 * Story context manager for maintaining narrative continuity
 */
class StoryContext {
  constructor() {
    this.history = [];
    this.worldState = {
      bossesDefeated: new Set(),
      questsCompleted: new Set(),
      itemsFound: new Set(),
      npcInteractions: new Map(),
      playerDeaths: 0,
      currentDepth: 0,
      timeInGame: 0,
    };
    this.playerState = {
      class: null,
      level: 1,
      hp: 100,
      maxHp: 100,
      gold: 0,
    };
  }

  /**
   * Add an event to history
   */
  addEvent(event) {
    this.history.push({
      ...event,
      timestamp: Date.now(),
    });

    // Trim history to context window
    if (this.history.length > config.contextWindowSize) {
      this.history = this.history.slice(-config.contextWindowSize);
    }
  }

  /**
   * Update world state
   */
  updateWorld(updates) {
    Object.assign(this.worldState, updates);
  }

  /**
   * Update player state
   */
  updatePlayer(updates) {
    Object.assign(this.playerState, updates);
  }

  /**
   * Record boss defeat
   */
  defeatBoss(bossName) {
    this.worldState.bossesDefeated.add(bossName);
    this.addEvent({
      type: 'BOSS_DEFEATED',
      boss: bossName,
    });
  }

  /**
   * Record quest completion
   */
  completeQuest(questId) {
    this.worldState.questsCompleted.add(questId);
    this.addEvent({
      type: 'QUEST_COMPLETED',
      questId,
    });
  }

  /**
   * Record NPC interaction
   */
  interactWithNPC(npcId, dialogueId) {
    const interactions = this.worldState.npcInteractions.get(npcId) || [];
    interactions.push(dialogueId);
    this.worldState.npcInteractions.set(npcId, interactions);
  }

  /**
   * Get context summary for AI prompts
   */
  getSummary() {
    const classNames = ['Warrior', 'Rogue', 'Sorcerer'];
    const bosses = Array.from(this.worldState.bossesDefeated);
    const quests = Array.from(this.worldState.questsCompleted);

    return {
      player: {
        class: classNames[this.playerState.class] || 'Unknown',
        level: this.playerState.level,
        health: `${this.playerState.hp}/${this.playerState.maxHp}`,
        gold: this.playerState.gold,
        isWounded: this.playerState.hp < this.playerState.maxHp * 0.5,
        isCritical: this.playerState.hp < this.playerState.maxHp * 0.2,
      },
      world: {
        currentDepth: this.worldState.currentDepth,
        bossesDefeated: bosses,
        questsCompleted: quests,
        deaths: this.worldState.playerDeaths,
      },
      recentEvents: this.history.slice(-5).map(e => e.type),
    };
  }

  /**
   * Serialize context to JSON
   */
  toJSON() {
    return {
      history: this.history,
      worldState: {
        ...this.worldState,
        bossesDefeated: Array.from(this.worldState.bossesDefeated),
        questsCompleted: Array.from(this.worldState.questsCompleted),
        itemsFound: Array.from(this.worldState.itemsFound),
        npcInteractions: Object.fromEntries(this.worldState.npcInteractions),
      },
      playerState: this.playerState,
    };
  }

  /**
   * Restore context from JSON
   */
  fromJSON(data) {
    this.history = data.history || [];
    this.playerState = data.playerState || this.playerState;

    if (data.worldState) {
      this.worldState = {
        ...data.worldState,
        bossesDefeated: new Set(data.worldState.bossesDefeated || []),
        questsCompleted: new Set(data.worldState.questsCompleted || []),
        itemsFound: new Set(data.worldState.itemsFound || []),
        npcInteractions: new Map(Object.entries(data.worldState.npcInteractions || {})),
      };
    }
  }
}

/**
 * Dialogue cache with LRU eviction
 */
class DialogueCache {
  constructor(maxSize = config.cache.maxEntries) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    const entry = this.cache.get(key);

    // Check TTL
    if (config.cache.ttlSeconds && Date.now() - entry.timestamp > config.cache.ttlSeconds * 1000) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key, value) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Quest manager for dynamic quest generation
 */
class QuestManager {
  constructor() {
    this.activeQuests = [];
    this.completedQuests = [];
  }

  /**
   * Generate a new quest
   */
  async generateQuest(context, npcId) {
    if (this.activeQuests.length >= config.quests.maxActiveQuests) {
      return null;
    }

    const questType = config.quests.questTypes[
      Math.floor(Math.random() * config.quests.questTypes.length)
    ];

    const quest = {
      id: `quest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: questType,
      givenBy: npcId,
      title: '',
      description: '',
      objectives: [],
      rewards: {},
      status: 'ACTIVE',
      createdAt: Date.now(),
    };

    // Generate quest details based on type
    switch (questType) {
      case 'KILL_MONSTER':
        quest.title = 'Monster Slayer';
        quest.description = 'Defeat the monsters threatening the town.';
        quest.objectives = [{
          type: 'KILL',
          target: 'SKELETON',
          count: 5,
          progress: 0,
        }];
        quest.rewards = { gold: 100, experience: 50 };
        break;

      case 'FIND_ITEM':
        quest.title = 'Lost Artifact';
        quest.description = 'Recover the ancient artifact from the depths.';
        quest.objectives = [{
          type: 'FIND',
          target: 'ARTIFACT',
          count: 1,
          progress: 0,
        }];
        quest.rewards = { gold: 200, item: 'MAGIC_RING' };
        break;

      case 'EXPLORE_AREA':
        quest.title = 'Cartographer';
        quest.description = 'Explore the dungeon depths.';
        quest.objectives = [{
          type: 'REACH_DEPTH',
          target: context.worldState.currentDepth + 2,
          progress: context.worldState.currentDepth,
        }];
        quest.rewards = { gold: 150, experience: 75 };
        break;

      case 'BOSS_FIGHT':
        quest.title = 'Champion\'s Challenge';
        quest.description = 'Defeat the boss lurking in the depths.';
        quest.objectives = [{
          type: 'KILL_BOSS',
          target: 'SKELETON_KING',
          count: 1,
          progress: 0,
        }];
        quest.rewards = { gold: 500, experience: 200, item: 'LEGENDARY_WEAPON' };
        break;

      default:
        quest.title = 'Adventure';
        quest.description = 'Complete this task for the town.';
        break;
    }

    this.activeQuests.push(quest);

    return quest;
  }

  /**
   * Update quest progress
   */
  updateProgress(eventType, eventData) {
    for (const quest of this.activeQuests) {
      for (const objective of quest.objectives) {
        if (this.matchesObjective(objective, eventType, eventData)) {
          objective.progress++;

          if (objective.progress >= (objective.count || 1)) {
            this.checkQuestCompletion(quest);
          }
        }
      }
    }
  }

  matchesObjective(objective, eventType, eventData) {
    switch (objective.type) {
      case 'KILL':
        return eventType === 'MONSTER_KILLED' && eventData.type === objective.target;
      case 'KILL_BOSS':
        return eventType === 'BOSS_KILLED' && eventData.name === objective.target;
      case 'FIND':
        return eventType === 'ITEM_FOUND' && eventData.type === objective.target;
      case 'REACH_DEPTH':
        return eventType === 'DEPTH_CHANGED' && eventData.depth >= objective.target;
      default:
        return false;
    }
  }

  checkQuestCompletion(quest) {
    const allComplete = quest.objectives.every(o => o.progress >= (o.count || 1));

    if (allComplete) {
      quest.status = 'COMPLETED';
      quest.completedAt = Date.now();

      const index = this.activeQuests.indexOf(quest);
      if (index !== -1) {
        this.activeQuests.splice(index, 1);
        this.completedQuests.push(quest);
      }

      neuralInterop.emit('questCompleted', quest);
    }
  }

  getActiveQuests() {
    return [...this.activeQuests];
  }

  getCompletedQuests() {
    return [...this.completedQuests];
  }
}

/**
 * Mock dialogue generator for when AI API is unavailable
 */
class MockDialogueGenerator {
  static dialogues = {
    OGDEN: [
      "Welcome, traveler! Rest your weary bones at my tavern.",
      "Dark times have befallen Tristram. The cathedral holds unspeakable evil.",
      "Be careful in those depths, friend. Many have not returned.",
    ],
    GRISWOLD: [
      "Looking for new equipment? I've got the finest weapons in Tristram.",
      "That blade won't last long against the demons below. Let me forge you something stronger.",
      "The Butcher's cleaver... I've seen what it can do. Terrifying.",
    ],
    PEPIN: [
      "Let me tend to your wounds. The corruption below takes its toll.",
      "The sickness spreading through town... it's connected to the cathedral.",
      "Ancient texts speak of healing magic, but against this evil, prayer may not be enough.",
    ],
    CAIN: [
      "Stay a while and listen. The prophecies speak of a hero...",
      "Diablo, the Lord of Terror... his influence grows stronger.",
      "The Horadrim knew this day would come. We must be prepared.",
    ],
    ADRIA: [
      "The spirits whisper of your deeds. You have potential.",
      "Magic flows through these lands, corrupted by darkness.",
      "I sense great power in you, but also great danger.",
    ],
    WIRT: [
      "Hey, you! Looking for something special? I got connections.",
      "This leg... the demons took it. But I survived. That's worth something.",
      "Gold talks. Got any?",
    ],
    FARNHAM: [
      "*hic* The horrors... you can't imagine what we saw down there...",
      "They came at night... so many of them...",
      "Another drink... just one more...",
    ],
    GILLIAN: [
      "Oh, hello! Ogden keeps me busy, but I always have time for heroes.",
      "Have you heard the latest? They say the dead walk in the cathedral.",
      "Please be careful. Tristram needs people like you.",
    ],
  };

  static generate(npcId, context) {
    const npcDialogues = MockDialogueGenerator.dialogues[npcId] || [
      "Greetings, adventurer.",
      "May fortune favor your quest.",
      "Be careful in the depths below.",
    ];

    return npcDialogues[Math.floor(Math.random() * npcDialogues.length)];
  }
}

/**
 * Main Narrative Engine
 */
class NarrativeEngine {
  constructor() {
    this.context = new StoryContext();
    this.cache = new DialogueCache();
    this.questManager = new QuestManager();
    this.textOverrides = new Map();
    this.generating = false;
  }

  /**
   * Initialize the narrative engine
   */
  initialize() {
    // Subscribe to game events
    neuralInterop.on('stateUpdate', state => this.onGameStateUpdate(state));

    console.log('[NarrativeEngine] Initialized');
  }

  /**
   * Handle game state updates
   */
  onGameStateUpdate(state) {
    if (state.player) {
      this.context.updatePlayer({
        class: state.player.class,
        level: state.player.level,
        hp: state.player.hp,
        maxHp: state.player.maxHp,
        gold: state.player.gold,
      });
    }

    if (state.level) {
      this.context.updateWorld({
        currentDepth: state.level.depth,
      });
    }
  }

  /**
   * Generate dialogue for an NPC
   */
  async generateDialogue(npcId, triggerContext = {}) {
    if (!config.enabled) {
      return MockDialogueGenerator.generate(npcId, this.context);
    }

    // Check cache
    const cacheKey = `${npcId}-${JSON.stringify(this.context.getSummary())}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    this.generating = true;

    try {
      const personality = config.personalities[npcId];
      if (!personality) {
        return MockDialogueGenerator.generate(npcId, this.context);
      }

      const prompt = this.buildDialoguePrompt(npcId, personality, triggerContext);

      let dialogue;

      if (NeuralConfig.debug.mockAPIResponses || !NeuralConfig.provider.apiKey) {
        dialogue = MockDialogueGenerator.generate(npcId, this.context);
      } else {
        dialogue = await this.callAI(prompt);
      }

      // Truncate if too long
      if (dialogue.length > config.maxDialogueLength) {
        dialogue = dialogue.substring(0, config.maxDialogueLength - 3) + '...';
      }

      // Cache the result
      this.cache.set(cacheKey, dialogue);

      // Record interaction
      this.context.interactWithNPC(npcId, dialogue.substring(0, 50));

      return dialogue;
    } catch (error) {
      console.error('[NarrativeEngine] Dialogue generation failed:', error);
      return MockDialogueGenerator.generate(npcId, this.context);
    } finally {
      this.generating = false;
    }
  }

  /**
   * Build AI prompt for dialogue generation
   */
  buildDialoguePrompt(npcId, personality, triggerContext) {
    const contextSummary = this.context.getSummary();

    return `You are ${npcId}, the ${personality.role} in the town of Tristram from Diablo 1.

Character traits:
- Tone: ${personality.tone}
- Knowledge: ${personality.knowledge}

Current situation:
- Player is a ${contextSummary.player.class} at level ${contextSummary.player.level}
- Player health: ${contextSummary.player.health}${contextSummary.player.isWounded ? ' (wounded)' : ''}${contextSummary.player.isCritical ? ' (CRITICAL!)' : ''}
- Current dungeon depth: ${contextSummary.world.currentDepth}
- Bosses defeated: ${contextSummary.world.bossesDefeated.join(', ') || 'None'}
- Recent events: ${contextSummary.recentEvents.join(', ') || 'None'}

${triggerContext.event ? `Trigger event: ${triggerContext.event}` : ''}

Generate a single in-character dialogue line (1-2 sentences max) that:
1. Reflects your personality and role
2. Acknowledges the player's current state if relevant
3. Fits the dark fantasy setting of Diablo
4. Moves the story forward or provides useful information

Output only the dialogue, no quotes or attribution.`;
  }

  /**
   * Call AI API for dialogue generation
   */
  async callAI(prompt) {
    const response = await fetch(`${NeuralConfig.provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NeuralConfig.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: NeuralConfig.provider.model,
        messages: [
          { role: 'system', content: 'You are a dialogue generator for Diablo 1. Output only dialogue, no quotes.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  /**
   * Override a specific text entry
   */
  setTextOverride(textId, text) {
    this.textOverrides.set(textId, text);
  }

  /**
   * Get text (with override support)
   */
  getText(textId, fallback = '') {
    if (this.textOverrides.has(textId)) {
      return this.textOverrides.get(textId);
    }
    return fallback;
  }

  /**
   * Clear all text overrides
   */
  clearOverrides() {
    this.textOverrides.clear();
  }

  /**
   * Record a game event for context
   */
  recordEvent(eventType, eventData = {}) {
    this.context.addEvent({
      type: eventType,
      ...eventData,
    });

    // Update quest progress
    this.questManager.updateProgress(eventType, eventData);

    // Emit for other systems
    neuralInterop.emit('narrativeEvent', { eventType, eventData });
  }

  /**
   * Record boss defeat
   */
  defeatBoss(bossName) {
    this.context.defeatBoss(bossName);
  }

  /**
   * Get the current story context
   */
  getContext() {
    return this.context;
  }

  /**
   * Get quest manager
   */
  getQuestManager() {
    return this.questManager;
  }

  /**
   * Save narrative state
   */
  saveState() {
    return {
      context: this.context.toJSON(),
      overrides: Object.fromEntries(this.textOverrides),
      quests: {
        active: this.questManager.activeQuests,
        completed: this.questManager.completedQuests,
      },
    };
  }

  /**
   * Load narrative state
   */
  loadState(state) {
    if (state.context) {
      this.context.fromJSON(state.context);
    }

    if (state.overrides) {
      this.textOverrides = new Map(Object.entries(state.overrides));
    }

    if (state.quests) {
      this.questManager.activeQuests = state.quests.active || [];
      this.questManager.completedQuests = state.quests.completed || [];
    }
  }
}

// Singleton instance
const narrativeEngine = new NarrativeEngine();

export {
  NarrativeEngine,
  StoryContext,
  DialogueCache,
  QuestManager,
  MockDialogueGenerator,
};

export default narrativeEngine;
