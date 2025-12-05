/**
 * Dialogue System
 *
 * Comprehensive branching dialogue system with:
 * - Branching conversation trees
 * - Condition-based dialogue options
 * - Variable substitution (player name, quest progress, etc.)
 * - Dialogue history tracking
 * - Voice line placeholders
 * - NPC personality/mood system
 * - Quest integration
 */

// ============================================================================
// DIALOGUE TYPES
// ============================================================================

export const DialogueNodeType = {
  TEXT: 'text',              // Regular dialogue text
  CHOICE: 'choice',          // Player choice
  BRANCH: 'branch',          // Conditional branch
  ACTION: 'action',          // Trigger action
  QUEST: 'quest',            // Quest-related
  TRADE: 'trade',            // Open trade
  EXIT: 'exit',              // End conversation
};

export const ConditionType = {
  // Player state
  PLAYER_LEVEL: 'player_level',
  PLAYER_CLASS: 'player_class',
  PLAYER_GOLD: 'player_gold',
  PLAYER_STAT: 'player_stat',

  // Quest state
  QUEST_STATUS: 'quest_status',
  QUEST_STAGE: 'quest_stage',
  QUEST_COMPLETE: 'quest_complete',
  QUEST_AVAILABLE: 'quest_available',

  // NPC state
  NPC_RELATIONSHIP: 'npc_relationship',
  NPC_TALKED_BEFORE: 'npc_talked_before',
  NPC_MOOD: 'npc_mood',

  // Item/inventory
  HAS_ITEM: 'has_item',
  ITEM_COUNT: 'item_count',
  ITEM_EQUIPPED: 'item_equipped',

  // Flags
  FLAG_SET: 'flag_set',
  FLAG_VALUE: 'flag_value',

  // Game state
  DUNGEON_CLEARED: 'dungeon_cleared',
  BOSS_KILLED: 'boss_killed',
  TIME_OF_DAY: 'time_of_day',

  // Custom
  CUSTOM: 'custom',
};

export const ActionType = {
  START_QUEST: 'start_quest',
  COMPLETE_QUEST: 'complete_quest',
  ADVANCE_QUEST: 'advance_quest',
  GIVE_ITEM: 'give_item',
  TAKE_ITEM: 'take_item',
  GIVE_GOLD: 'give_gold',
  TAKE_GOLD: 'take_gold',
  SET_FLAG: 'set_flag',
  ADD_RELATIONSHIP: 'add_relationship',
  OPEN_TRADE: 'open_trade',
  TELEPORT: 'teleport',
  SPAWN_MONSTER: 'spawn_monster',
  PLAY_SOUND: 'play_sound',
  TRIGGER_EVENT: 'trigger_event',
};

// ============================================================================
// DIALOGUE NODE
// ============================================================================

/**
 * Single node in a dialogue tree
 */
export class DialogueNode {
  constructor(config) {
    this.id = config.id || `node_${Date.now()}`;
    this.type = config.type || DialogueNodeType.TEXT;

    // Speaker info
    this.speaker = config.speaker || null;
    this.portrait = config.portrait || null;
    this.emotion = config.emotion || 'neutral';

    // Content
    this.text = config.text || '';
    this.voiceLine = config.voiceLine || null;

    // Choices (for CHOICE type)
    this.choices = config.choices || [];

    // Next node(s)
    this.next = config.next || null;
    this.branches = config.branches || [];

    // Conditions to show this node
    this.conditions = config.conditions || [];

    // Actions to execute
    this.actions = config.actions || [];

    // Metadata
    this.tags = config.tags || [];
    this.metadata = config.metadata || {};
  }

  /**
   * Check if node conditions are met
   */
  checkConditions(context) {
    for (const condition of this.conditions) {
      if (!evaluateCondition(condition, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get text with variables substituted
   */
  getText(context) {
    return substituteVariables(this.text, context);
  }

  /**
   * Get available choices (filtered by conditions)
   */
  getAvailableChoices(context) {
    return this.choices.filter(choice => {
      if (!choice.conditions || choice.conditions.length === 0) {
        return true;
      }
      return choice.conditions.every(c => evaluateCondition(c, context));
    });
  }

  /**
   * Execute node actions
   */
  executeActions(context, actionHandler) {
    for (const action of this.actions) {
      if (actionHandler) {
        actionHandler(action, context);
      }
    }
  }
}

// ============================================================================
// DIALOGUE TREE
// ============================================================================

/**
 * Complete dialogue tree for an NPC or conversation
 */
export class DialogueTree {
  constructor(config) {
    this.id = config.id || `dialogue_${Date.now()}`;
    this.name = config.name || 'Dialogue';
    this.description = config.description || '';

    // NPC info
    this.npcId = config.npcId || null;
    this.npcName = config.npcName || 'Unknown';
    this.defaultPortrait = config.defaultPortrait || null;

    // Nodes
    this.nodes = new Map();
    this.startNode = config.startNode || 'start';

    // Load nodes
    if (config.nodes) {
      for (const nodeDef of config.nodes) {
        this.addNode(new DialogueNode(nodeDef));
      }
    }

    // Conditional start points
    this.conditionalStarts = config.conditionalStarts || [];

    // Metadata
    this.metadata = config.metadata || {};
  }

  /**
   * Add a node to the tree
   */
  addNode(node) {
    this.nodes.set(node.id, node);
    return this;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId) {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Get the starting node based on context
   */
  getStartNode(context) {
    // Check conditional starts
    for (const cs of this.conditionalStarts) {
      const conditionsMet = cs.conditions.every(c => evaluateCondition(c, context));
      if (conditionsMet) {
        return this.getNode(cs.nodeId);
      }
    }

    // Fall back to default start
    return this.getNode(this.startNode);
  }

  /**
   * Get next node based on choice
   */
  getNextNode(currentNode, choiceIndex, context) {
    if (!currentNode) return null;

    // If it's a choice node, use the selected choice
    if (currentNode.type === DialogueNodeType.CHOICE && currentNode.choices[choiceIndex]) {
      const choice = currentNode.choices[choiceIndex];
      return this.getNode(choice.next);
    }

    // If it's a branch node, evaluate conditions
    if (currentNode.type === DialogueNodeType.BRANCH) {
      for (const branch of currentNode.branches) {
        const conditionsMet = branch.conditions.every(c => evaluateCondition(c, context));
        if (conditionsMet) {
          return this.getNode(branch.next);
        }
      }
      // Fall through to default next
    }

    // Default next
    return currentNode.next ? this.getNode(currentNode.next) : null;
  }

  /**
   * Export tree definition
   */
  export() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      npcId: this.npcId,
      npcName: this.npcName,
      defaultPortrait: this.defaultPortrait,
      startNode: this.startNode,
      nodes: Array.from(this.nodes.values()).map(n => ({
        id: n.id,
        type: n.type,
        speaker: n.speaker,
        portrait: n.portrait,
        emotion: n.emotion,
        text: n.text,
        voiceLine: n.voiceLine,
        choices: n.choices,
        next: n.next,
        branches: n.branches,
        conditions: n.conditions,
        actions: n.actions,
        tags: n.tags,
      })),
      conditionalStarts: this.conditionalStarts,
      metadata: this.metadata,
    };
  }
}

// ============================================================================
// DIALOGUE MANAGER
// ============================================================================

/**
 * Manages all dialogues and conversation state
 */
export class DialogueManager {
  constructor() {
    // Registered dialogue trees
    this.dialogues = new Map();

    // Active conversation state
    this.activeDialogue = null;
    this.activeNode = null;
    this.conversationHistory = [];

    // Global dialogue history (persisted)
    this.history = new DialogueHistory();

    // Context for variable substitution
    this.context = {};

    // Action handler
    this.actionHandler = null;

    // Event callbacks
    this.onDialogueStart = null;
    this.onDialogueNode = null;
    this.onDialogueChoice = null;
    this.onDialogueEnd = null;
    this.onAction = null;
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register a dialogue tree
   */
  registerDialogue(dialogue) {
    if (!(dialogue instanceof DialogueTree)) {
      dialogue = new DialogueTree(dialogue);
    }
    this.dialogues.set(dialogue.id, dialogue);
    console.log(`[DialogueManager] Registered dialogue: ${dialogue.id}`);
    return this;
  }

  /**
   * Register multiple dialogues
   */
  registerDialogues(dialogues) {
    for (const d of dialogues) {
      this.registerDialogue(d);
    }
    return this;
  }

  /**
   * Get dialogue by ID
   */
  getDialogue(dialogueId) {
    return this.dialogues.get(dialogueId) || null;
  }

  /**
   * Set action handler
   */
  setActionHandler(handler) {
    this.actionHandler = handler;
    return this;
  }

  // ==========================================================================
  // CONTEXT MANAGEMENT
  // ==========================================================================

  /**
   * Update context
   */
  setContext(context) {
    this.context = { ...this.context, ...context };
    return this;
  }

  /**
   * Set player info in context
   */
  setPlayer(playerData) {
    this.context.player = playerData;
    return this;
  }

  /**
   * Set quest state in context
   */
  setQuestState(questState) {
    this.context.quests = questState;
    return this;
  }

  /**
   * Set flags in context
   */
  setFlags(flags) {
    this.context.flags = { ...(this.context.flags || {}), ...flags };
    return this;
  }

  /**
   * Set a single flag
   */
  setFlag(key, value) {
    if (!this.context.flags) this.context.flags = {};
    this.context.flags[key] = value;
    return this;
  }

  /**
   * Get a flag value
   */
  getFlag(key) {
    return this.context.flags?.[key];
  }

  // ==========================================================================
  // CONVERSATION CONTROL
  // ==========================================================================

  /**
   * Start a dialogue
   */
  startDialogue(dialogueId, additionalContext = {}) {
    const dialogue = this.getDialogue(dialogueId);
    if (!dialogue) {
      console.error(`[DialogueManager] Dialogue not found: ${dialogueId}`);
      return null;
    }

    // Merge context
    const context = { ...this.context, ...additionalContext };

    // Set active dialogue
    this.activeDialogue = dialogue;
    this.conversationHistory = [];

    // Get starting node
    this.activeNode = dialogue.getStartNode(context);

    if (!this.activeNode) {
      console.error(`[DialogueManager] No start node for dialogue: ${dialogueId}`);
      return null;
    }

    // Record history
    this.history.recordConversationStart(dialogueId, dialogue.npcId);

    // Callback
    if (this.onDialogueStart) {
      this.onDialogueStart(dialogue, this.activeNode);
    }

    return this.processCurrentNode(context);
  }

  /**
   * Process the current node
   */
  processCurrentNode(context = null) {
    if (!this.activeNode) return null;

    context = context || this.context;

    // Execute node actions
    this.activeNode.executeActions(context, (action, ctx) => {
      this.executeAction(action, ctx);
    });

    // Build node data for display
    const nodeData = {
      nodeId: this.activeNode.id,
      type: this.activeNode.type,
      speaker: this.activeNode.speaker || this.activeDialogue?.npcName,
      portrait: this.activeNode.portrait || this.activeDialogue?.defaultPortrait,
      emotion: this.activeNode.emotion,
      text: this.activeNode.getText(context),
      voiceLine: this.activeNode.voiceLine,
      choices: this.activeNode.type === DialogueNodeType.CHOICE
        ? this.activeNode.getAvailableChoices(context).map((c, i) => ({
            index: i,
            text: substituteVariables(c.text, context),
            tooltip: c.tooltip,
          }))
        : null,
      isEnd: this.activeNode.type === DialogueNodeType.EXIT || !this.activeNode.next,
    };

    // Record in conversation history
    this.conversationHistory.push({
      nodeId: this.activeNode.id,
      speaker: nodeData.speaker,
      text: nodeData.text,
      timestamp: Date.now(),
    });

    // Callback
    if (this.onDialogueNode) {
      this.onDialogueNode(nodeData);
    }

    // Auto-advance non-choice nodes
    if (this.activeNode.type === DialogueNodeType.EXIT) {
      this.endDialogue();
    }

    return nodeData;
  }

  /**
   * Select a dialogue choice
   */
  selectChoice(choiceIndex) {
    if (!this.activeDialogue || !this.activeNode) return null;

    const choices = this.activeNode.getAvailableChoices(this.context);
    if (choiceIndex < 0 || choiceIndex >= choices.length) {
      console.error(`[DialogueManager] Invalid choice index: ${choiceIndex}`);
      return null;
    }

    const choice = choices[choiceIndex];

    // Record choice
    this.history.recordChoice(
      this.activeDialogue.id,
      this.activeNode.id,
      choiceIndex,
      choice.text
    );

    // Add to conversation history
    this.conversationHistory.push({
      nodeId: this.activeNode.id,
      speaker: this.context.player?.name || 'Player',
      text: substituteVariables(choice.text, this.context),
      isPlayerChoice: true,
      timestamp: Date.now(),
    });

    // Execute choice actions
    if (choice.actions) {
      for (const action of choice.actions) {
        this.executeAction(action, this.context);
      }
    }

    // Callback
    if (this.onDialogueChoice) {
      this.onDialogueChoice(choiceIndex, choice);
    }

    // Move to next node
    this.activeNode = this.activeDialogue.getNextNode(
      this.activeNode,
      choiceIndex,
      this.context
    );

    if (this.activeNode) {
      return this.processCurrentNode();
    } else {
      this.endDialogue();
      return null;
    }
  }

  /**
   * Advance to next node (for non-choice nodes)
   */
  advance() {
    if (!this.activeDialogue || !this.activeNode) return null;

    if (this.activeNode.type === DialogueNodeType.CHOICE) {
      console.warn('[DialogueManager] Cannot auto-advance choice node');
      return null;
    }

    this.activeNode = this.activeDialogue.getNextNode(
      this.activeNode,
      -1,
      this.context
    );

    if (this.activeNode) {
      return this.processCurrentNode();
    } else {
      this.endDialogue();
      return null;
    }
  }

  /**
   * End the current dialogue
   */
  endDialogue() {
    if (!this.activeDialogue) return;

    // Record in history
    this.history.recordConversationEnd(this.activeDialogue.id);

    // Callback
    if (this.onDialogueEnd) {
      this.onDialogueEnd(this.activeDialogue, this.conversationHistory);
    }

    this.activeDialogue = null;
    this.activeNode = null;
  }

  /**
   * Cancel dialogue without proper ending
   */
  cancelDialogue() {
    this.activeDialogue = null;
    this.activeNode = null;
    this.conversationHistory = [];
  }

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  /**
   * Execute a dialogue action
   */
  executeAction(action, context) {
    console.log(`[DialogueManager] Executing action: ${action.type}`, action);

    // Callback first
    if (this.onAction) {
      this.onAction(action, context);
    }

    // Use registered handler
    if (this.actionHandler) {
      this.actionHandler(action, context);
      return;
    }

    // Default handling
    switch (action.type) {
      case ActionType.SET_FLAG:
        this.setFlag(action.key, action.value);
        break;

      case ActionType.TRIGGER_EVENT:
        console.log(`[DialogueManager] Event triggered: ${action.eventId}`);
        break;

      default:
        console.log(`[DialogueManager] Unhandled action: ${action.type}`);
    }
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Check if a dialogue is active
   */
  isActive() {
    return this.activeDialogue !== null;
  }

  /**
   * Get current dialogue state
   */
  getState() {
    return {
      isActive: this.isActive(),
      dialogueId: this.activeDialogue?.id,
      nodeId: this.activeNode?.id,
      npcId: this.activeDialogue?.npcId,
      npcName: this.activeDialogue?.npcName,
    };
  }

  /**
   * Check if player has talked to NPC
   */
  hasTalkedTo(npcId) {
    return this.history.hasTalkedTo(npcId);
  }

  /**
   * Get conversation count with NPC
   */
  getConversationCount(npcId) {
    return this.history.getConversationCount(npcId);
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Export state for saving
   */
  exportState() {
    return {
      context: this.context,
      history: this.history.export(),
    };
  }

  /**
   * Import saved state
   */
  importState(state) {
    if (state.context) {
      this.context = state.context;
    }
    if (state.history) {
      this.history.import(state.history);
    }
  }
}

// ============================================================================
// DIALOGUE HISTORY
// ============================================================================

/**
 * Tracks dialogue history for persistence
 */
export class DialogueHistory {
  constructor() {
    this.conversations = [];
    this.npcCounts = {};
    this.choices = [];
    this.flags = {};
  }

  recordConversationStart(dialogueId, npcId) {
    this.conversations.push({
      dialogueId,
      npcId,
      startTime: Date.now(),
      endTime: null,
    });

    if (npcId) {
      this.npcCounts[npcId] = (this.npcCounts[npcId] || 0) + 1;
    }
  }

  recordConversationEnd(dialogueId) {
    const conv = this.conversations.find(
      c => c.dialogueId === dialogueId && !c.endTime
    );
    if (conv) {
      conv.endTime = Date.now();
    }
  }

  recordChoice(dialogueId, nodeId, choiceIndex, choiceText) {
    this.choices.push({
      dialogueId,
      nodeId,
      choiceIndex,
      choiceText,
      timestamp: Date.now(),
    });
  }

  hasTalkedTo(npcId) {
    return (this.npcCounts[npcId] || 0) > 0;
  }

  getConversationCount(npcId) {
    return this.npcCounts[npcId] || 0;
  }

  getRecentConversations(limit = 10) {
    return this.conversations.slice(-limit);
  }

  getChoicesForDialogue(dialogueId) {
    return this.choices.filter(c => c.dialogueId === dialogueId);
  }

  export() {
    return {
      conversations: this.conversations,
      npcCounts: this.npcCounts,
      choices: this.choices,
      flags: this.flags,
    };
  }

  import(data) {
    this.conversations = data.conversations || [];
    this.npcCounts = data.npcCounts || {};
    this.choices = data.choices || [];
    this.flags = data.flags || {};
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Evaluate a condition against context
 */
export function evaluateCondition(condition, context) {
  switch (condition.type) {
    // Player conditions
    case ConditionType.PLAYER_LEVEL:
      return compare(context.player?.level, condition.value, condition.operator);

    case ConditionType.PLAYER_CLASS:
      return context.player?.class === condition.value;

    case ConditionType.PLAYER_GOLD:
      return compare(context.player?.gold, condition.value, condition.operator);

    // Quest conditions
    case ConditionType.QUEST_STATUS:
      const quest = context.quests?.find(q => q.id === condition.questId);
      return quest?.status === condition.status;

    case ConditionType.QUEST_COMPLETE:
      return context.quests?.some(q => q.id === condition.questId && q.status === 'completed');

    case ConditionType.QUEST_AVAILABLE:
      return context.quests?.some(q => q.id === condition.questId && q.status === 'available');

    // NPC conditions
    case ConditionType.NPC_TALKED_BEFORE:
      return (context.npcCounts?.[condition.npcId] || 0) > 0;

    // Item conditions
    case ConditionType.HAS_ITEM:
      return context.player?.inventory?.some(i => i.id === condition.itemId);

    case ConditionType.ITEM_COUNT:
      const itemCount = context.player?.inventory?.filter(i => i.id === condition.itemId).length || 0;
      return compare(itemCount, condition.value, condition.operator);

    // Flag conditions
    case ConditionType.FLAG_SET:
      return context.flags?.[condition.flag] !== undefined;

    case ConditionType.FLAG_VALUE:
      return context.flags?.[condition.flag] === condition.value;

    // Game state
    case ConditionType.BOSS_KILLED:
      return context.killedBosses?.includes(condition.bossId);

    case ConditionType.DUNGEON_CLEARED:
      return context.clearedDungeons?.includes(condition.dungeonId);

    // Custom
    case ConditionType.CUSTOM:
      if (typeof condition.evaluate === 'function') {
        return condition.evaluate(context);
      }
      return false;

    default:
      console.warn(`[Dialogue] Unknown condition type: ${condition.type}`);
      return true;
  }
}

/**
 * Compare values with operator
 */
function compare(actual, expected, operator = 'eq') {
  switch (operator) {
    case 'eq':
    case '==':
      return actual === expected;
    case 'neq':
    case '!=':
      return actual !== expected;
    case 'gt':
    case '>':
      return actual > expected;
    case 'gte':
    case '>=':
      return actual >= expected;
    case 'lt':
    case '<':
      return actual < expected;
    case 'lte':
    case '<=':
      return actual <= expected;
    default:
      return actual === expected;
  }
}

/**
 * Substitute variables in text
 */
export function substituteVariables(text, context) {
  if (!text) return '';

  return text.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, path) => {
    const value = getNestedValue(context, path);
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Get nested value from object by path
 */
function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }

  return current;
}

// ============================================================================
// DIALOGUE BUILDER
// ============================================================================

/**
 * Fluent builder for dialogue trees
 */
export class DialogueBuilder {
  constructor(id) {
    this.config = {
      id,
      nodes: [],
    };
    this.currentNode = null;
  }

  npc(npcId, npcName) {
    this.config.npcId = npcId;
    this.config.npcName = npcName;
    return this;
  }

  portrait(portrait) {
    this.config.defaultPortrait = portrait;
    return this;
  }

  /**
   * Add a text node
   */
  say(text, speaker = null) {
    const node = {
      id: `node_${this.config.nodes.length}`,
      type: DialogueNodeType.TEXT,
      text,
      speaker,
    };
    this.config.nodes.push(node);
    this.currentNode = node;
    return this;
  }

  /**
   * Set emotion for current node
   */
  emotion(emotion) {
    if (this.currentNode) {
      this.currentNode.emotion = emotion;
    }
    return this;
  }

  /**
   * Add a choice node
   */
  choices() {
    const node = {
      id: `node_${this.config.nodes.length}`,
      type: DialogueNodeType.CHOICE,
      choices: [],
    };
    this.config.nodes.push(node);
    this.currentNode = node;
    return this;
  }

  /**
   * Add a choice option
   */
  choice(text, nextNodeId) {
    if (this.currentNode && this.currentNode.type === DialogueNodeType.CHOICE) {
      this.currentNode.choices.push({ text, next: nextNodeId });
    }
    return this;
  }

  /**
   * Add conditional choice
   */
  choiceIf(text, nextNodeId, conditions) {
    if (this.currentNode && this.currentNode.type === DialogueNodeType.CHOICE) {
      this.currentNode.choices.push({ text, next: nextNodeId, conditions });
    }
    return this;
  }

  /**
   * Link current node to next
   */
  then(nextNodeId) {
    if (this.currentNode) {
      this.currentNode.next = nextNodeId;
    }
    return this;
  }

  /**
   * Add action to current node
   */
  action(type, params = {}) {
    if (this.currentNode) {
      if (!this.currentNode.actions) this.currentNode.actions = [];
      this.currentNode.actions.push({ type, ...params });
    }
    return this;
  }

  /**
   * Start quest action shorthand
   */
  startQuest(questId) {
    return this.action(ActionType.START_QUEST, { questId });
  }

  /**
   * Give item action shorthand
   */
  giveItem(itemId, quantity = 1) {
    return this.action(ActionType.GIVE_ITEM, { itemId, quantity });
  }

  /**
   * Set flag action shorthand
   */
  setFlag(key, value = true) {
    return this.action(ActionType.SET_FLAG, { key, value });
  }

  /**
   * Add exit node
   */
  exit() {
    const node = {
      id: `node_${this.config.nodes.length}`,
      type: DialogueNodeType.EXIT,
    };
    this.config.nodes.push(node);
    this.currentNode = node;
    return this;
  }

  /**
   * Set start node
   */
  startAt(nodeId) {
    this.config.startNode = nodeId;
    return this;
  }

  /**
   * Build the dialogue tree
   */
  build() {
    // Link sequential nodes if no explicit next
    for (let i = 0; i < this.config.nodes.length - 1; i++) {
      const node = this.config.nodes[i];
      if (!node.next && node.type === DialogueNodeType.TEXT) {
        node.next = this.config.nodes[i + 1].id;
      }
    }

    return new DialogueTree(this.config);
  }
}

// ============================================================================
// PRESET DIALOGUES
// ============================================================================

/**
 * Common dialogue patterns
 */
export const DialoguePresets = {
  /**
   * Simple greeting
   */
  greeting(npcId, npcName, greetingText) {
    return new DialogueBuilder(`${npcId}_greeting`)
      .npc(npcId, npcName)
      .say(greetingText)
      .exit()
      .build();
  },

  /**
   * Quest giver dialogue
   */
  questGiver(npcId, npcName, questId, questName, questDescription, acceptText, declineText) {
    return new DialogueBuilder(`${npcId}_quest_${questId}`)
      .npc(npcId, npcName)
      .say(`I have a task for you. ${questDescription}`)
      .choices()
      .choice(acceptText || 'I accept this task.', 'accept')
      .choice(declineText || 'Perhaps another time.', 'decline')
      .say('Excellent! Return to me when the task is complete.').then('accept')
      .action(ActionType.START_QUEST, { questId })
      .exit()
      .say('Very well. Come back if you change your mind.').then('decline')
      .exit()
      .build();
  },

  /**
   * Shop keeper
   */
  shopkeeper(npcId, npcName, shopType) {
    return new DialogueBuilder(`${npcId}_shop`)
      .npc(npcId, npcName)
      .say(`Welcome to my ${shopType}! What can I do for you?`)
      .choices()
      .choice('Show me your wares.', 'trade')
      .choice('Just browsing. Farewell.', 'exit')
      .say('Take a look at what I have to offer.').then('trade')
      .action(ActionType.OPEN_TRADE, { npcId, shopType })
      .exit()
      .say('Safe travels!').then('exit')
      .exit()
      .build();
  },
};

// ============================================================================
// SINGLETON
// ============================================================================

export const dialogueManager = new DialogueManager();

export default dialogueManager;
