/**
 * Neural Worker Integration
 *
 * This module provides hooks for integrating the Neural Augmentation system
 * into the game worker. It intercepts and enhances game events.
 */

import NeuralConfig from './config';

/**
 * Neural state in worker context
 */
const NeuralState = {
  initialized: false,
  enabled: true,
  frameCount: 0,
  lastStateSync: 0,

  // Game state cache
  playerState: null,
  monsters: new Map(),
  dungeonGrid: null,
  currentLevel: 0,
  levelType: 0,

  // AI state cache
  pendingDialogue: null,
  pendingLevelData: null,
  tacticalOrders: [],

  // Configuration
  config: NeuralConfig,
};

/**
 * Initialize neural hooks in worker
 */
export function initializeNeuralWorker(wasm, DApi) {
  if (NeuralState.initialized) {
    console.warn('[NeuralWorker] Already initialized');
    return;
  }

  NeuralState.wasm = wasm;
  NeuralState.DApi = DApi;
  NeuralState.initialized = true;

  console.log('[NeuralWorker] Initialized');

  return {
    onFrame: createFrameHook(wasm),
    onLevelGeneration: createLevelHook(wasm),
    onNPCInteraction: createNPCHook(wasm),
    onMonsterThink: createMonsterHook(wasm),
  };
}

/**
 * Create frame update hook
 */
function createFrameHook(wasm) {
  return function onFrame(timestamp) {
    if (!NeuralState.enabled) return;

    NeuralState.frameCount++;

    // Periodic state extraction
    if (NeuralState.frameCount % 60 === 0) {
      extractGameState(wasm);
    }

    // Apply pending AI decisions
    applyPendingDecisions(wasm);
  };
}

/**
 * Create level generation hook
 */
function createLevelHook(wasm) {
  return function onLevelGeneration(levelType, depth) {
    if (!NeuralState.enabled) return null;
    if (!NeuralConfig.levelGeneration.enabled) return null;

    console.log(`[NeuralWorker] Level generation hook: type=${levelType}, depth=${depth}`);

    // Check if we have pending AI level data
    if (NeuralState.pendingLevelData) {
      const levelData = NeuralState.pendingLevelData;
      NeuralState.pendingLevelData = null;

      // Apply the AI-generated level
      return applyLevelData(wasm, levelData);
    }

    // Request AI generation (will be applied on next generation)
    postMessage({
      action: 'neural_request',
      type: 'generate_level',
      params: { levelType, depth },
    });

    return null; // Use default generation for now
  };
}

/**
 * Create NPC interaction hook
 */
function createNPCHook(wasm) {
  return function onNPCInteraction(npcId, interactionType) {
    if (!NeuralState.enabled) return null;
    if (!NeuralConfig.narrative.enabled) return null;

    console.log(`[NeuralWorker] NPC interaction: npc=${npcId}, type=${interactionType}`);

    // Check if we have pending dialogue
    if (NeuralState.pendingDialogue?.npcId === npcId) {
      const dialogue = NeuralState.pendingDialogue.text;
      NeuralState.pendingDialogue = null;
      return dialogue;
    }

    // Request AI dialogue
    postMessage({
      action: 'neural_request',
      type: 'generate_dialogue',
      params: {
        npcId,
        interactionType,
        context: getContextSummary(),
      },
    });

    return null; // Use default dialogue
  };
}

/**
 * Create monster think hook
 */
function createMonsterHook(wasm) {
  return function onMonsterThink(monsterId, monsterData) {
    if (!NeuralState.enabled) return null;
    if (!NeuralConfig.commander.enabled) return null;

    // Check for tactical orders for this monster
    const order = NeuralState.tacticalOrders.find(o => o.monsterId === monsterId);
    if (order) {
      return {
        targetX: order.targetX,
        targetY: order.targetY,
        action: order.action,
      };
    }

    return null; // Use default AI
  };
}

/**
 * Extract game state from WASM memory
 */
function extractGameState(wasm) {
  if (!wasm || !wasm.HEAPU8) return;

  // This would read actual game state from memory
  // For now, emit a state sync request
  postMessage({
    action: 'neural_state_sync',
    frameCount: NeuralState.frameCount,
    timestamp: Date.now(),
  });

  NeuralState.lastStateSync = NeuralState.frameCount;
}

/**
 * Get context summary for AI requests
 */
function getContextSummary() {
  return {
    player: NeuralState.playerState,
    currentLevel: NeuralState.currentLevel,
    levelType: NeuralState.levelType,
    frameCount: NeuralState.frameCount,
  };
}

/**
 * Apply pending AI decisions
 */
function applyPendingDecisions(wasm) {
  // Clear old tactical orders
  if (NeuralState.tacticalOrders.length > 0) {
    const currentFrame = NeuralState.frameCount;
    NeuralState.tacticalOrders = NeuralState.tacticalOrders.filter(
      o => currentFrame - o.frameIssued < 120 // Keep orders for ~6 seconds
    );
  }
}

/**
 * Apply AI-generated level data
 */
function applyLevelData(wasm, levelData) {
  if (!levelData || !levelData.grid) return null;

  // The grid would be written to WASM memory
  // This is a placeholder for the actual implementation
  console.log('[NeuralWorker] Applying AI level data');

  return levelData;
}

/**
 * Handle incoming neural messages
 */
export function handleNeuralMessage(data) {
  switch (data.type) {
    case 'set_enabled':
      NeuralState.enabled = data.enabled;
      console.log(`[NeuralWorker] ${data.enabled ? 'Enabled' : 'Disabled'}`);
      break;

    case 'level_data':
      NeuralState.pendingLevelData = data.levelData;
      console.log('[NeuralWorker] Received level data');
      break;

    case 'dialogue':
      NeuralState.pendingDialogue = {
        npcId: data.npcId,
        text: data.text,
      };
      console.log('[NeuralWorker] Received dialogue');
      break;

    case 'tactical_orders':
      NeuralState.tacticalOrders = data.orders.map(o => ({
        ...o,
        frameIssued: NeuralState.frameCount,
      }));
      console.log(`[NeuralWorker] Received ${data.orders.length} tactical orders`);
      break;

    case 'update_state':
      if (data.playerState) NeuralState.playerState = data.playerState;
      if (data.currentLevel !== undefined) NeuralState.currentLevel = data.currentLevel;
      if (data.levelType !== undefined) NeuralState.levelType = data.levelType;
      break;

    default:
      console.warn(`[NeuralWorker] Unknown message type: ${data.type}`);
  }
}

/**
 * Get neural state (for debugging)
 */
export function getNeuralState() {
  return {
    initialized: NeuralState.initialized,
    enabled: NeuralState.enabled,
    frameCount: NeuralState.frameCount,
    tacticalOrderCount: NeuralState.tacticalOrders.length,
    hasPendingLevel: !!NeuralState.pendingLevelData,
    hasPendingDialogue: !!NeuralState.pendingDialogue,
  };
}

// Reference to postMessage - will be set when worker initializes
let postMessage = () => {
  console.warn('[NeuralWorker] postMessage not initialized');
};

/**
 * Set the postMessage function
 */
export function setPostMessage(fn) {
  postMessage = fn;
}

export default {
  initializeNeuralWorker,
  handleNeuralMessage,
  getNeuralState,
  setPostMessage,
  NeuralState,
};
