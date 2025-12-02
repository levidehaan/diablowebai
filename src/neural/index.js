/**
 * Neural Augmentation System
 *
 * Main entry point for the AI-driven enhancements to the Diablo Web engine.
 * This module provides a unified interface to all neural subsystems.
 */

import NeuralConfig from './config';
import neuralInterop from './NeuralInterop';
import levelGenerator from './LevelGenerator';
import narrativeEngine from './NarrativeEngine';
import commanderAI from './CommanderAI';
import assetPipeline from './AssetPipeline';
import { providerManager, PROVIDERS, PROVIDER_CONFIGS, createProvider } from './providers';

// Re-export individual modules
export { default as NeuralConfig } from './config';
export { default as neuralInterop } from './NeuralInterop';
export { default as levelGenerator } from './LevelGenerator';
export { default as narrativeEngine } from './NarrativeEngine';
export { default as commanderAI } from './CommanderAI';
export { default as assetPipeline } from './AssetPipeline';

// Export provider system
export { providerManager, PROVIDERS, PROVIDER_CONFIGS, createProvider } from './providers';

// Export UI components
export { AIConfigPanel, AISettingsButton, loadSavedConfig, saveConfig, needsConfiguration } from './AIConfigPanel';

// Export utilities from each module
export * from './NeuralInterop';
export * from './LevelGenerator';
export * from './NarrativeEngine';
export * from './CommanderAI';
export * from './AssetPipeline';

/**
 * Neural Augmentation System status
 */
const NeuralStatus = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error',
};

/**
 * Main Neural Augmentation Controller
 */
class NeuralAugmentation {
  constructor() {
    this.status = NeuralStatus.UNINITIALIZED;
    this.error = null;
    this.wasmModule = null;
    this.workerBridge = null;
    this.eventListeners = new Map();
  }

  /**
   * Initialize the Neural Augmentation system
   */
  async initialize(wasmModule, options = {}) {
    if (this.status === NeuralStatus.READY) {
      console.warn('[Neural] Already initialized');
      return true;
    }

    if (this.status === NeuralStatus.INITIALIZING) {
      console.warn('[Neural] Initialization in progress');
      return false;
    }

    this.status = NeuralStatus.INITIALIZING;
    console.log('[Neural] Initializing Neural Augmentation System...');

    try {
      this.wasmModule = wasmModule;

      // Initialize core interop layer
      neuralInterop.initialize(wasmModule);

      // Initialize subsystems
      narrativeEngine.initialize();
      commanderAI.initialize();
      assetPipeline.initialize();

      // Setup cross-module event handlers
      this.setupEventHandlers();

      this.status = NeuralStatus.READY;
      console.log('[Neural] Initialization complete');

      this.emit('initialized');
      return true;
    } catch (error) {
      this.status = NeuralStatus.ERROR;
      this.error = error;
      console.error('[Neural] Initialization failed:', error);

      this.emit('error', error);
      return false;
    }
  }

  /**
   * Setup cross-module event handlers
   */
  setupEventHandlers() {
    // Level generation events
    neuralInterop.on('levelGenerated', (levelData) => {
      console.log('[Neural] Level generated:', levelData);
      // Could trigger narrative updates based on level type
    });

    // Quest completion events
    neuralInterop.on('questCompleted', (quest) => {
      console.log('[Neural] Quest completed:', quest.title);
      narrativeEngine.recordEvent('QUEST_COMPLETED', { quest });
    });

    // Boss defeated events
    neuralInterop.on('monsterRemoved', ({ monsterId }) => {
      // Check if it was a boss
      const boss = commanderAI.bosses?.get(monsterId);
      if (boss) {
        narrativeEngine.defeatBoss(boss.bossType);
      }
    });

    // Frame updates
    neuralInterop.on('frame', (data) => {
      // Propagate to other systems as needed
    });
  }

  /**
   * Generate a new level using AI
   */
  async generateLevel(levelType, depth, seed = null) {
    if (this.status !== NeuralStatus.READY) {
      console.warn('[Neural] Not initialized');
      return null;
    }

    return levelGenerator.generate(levelType, depth, seed);
  }

  /**
   * Generate NPC dialogue
   */
  async generateDialogue(npcId, context = {}) {
    if (this.status !== NeuralStatus.READY) {
      console.warn('[Neural] Not initialized');
      return null;
    }

    return narrativeEngine.generateDialogue(npcId, context);
  }

  /**
   * Get the current story context
   */
  getStoryContext() {
    return narrativeEngine.getContext().getSummary();
  }

  /**
   * Record a game event for narrative tracking
   */
  recordEvent(eventType, eventData = {}) {
    narrativeEngine.recordEvent(eventType, eventData);
  }

  /**
   * Get active quests
   */
  getActiveQuests() {
    return narrativeEngine.getQuestManager().getActiveQuests();
  }

  /**
   * Get Commander AI status
   */
  getCommanderStatus() {
    return commanderAI.getStatus();
  }

  /**
   * Enable/disable Commander AI
   */
  setCommanderEnabled(enabled) {
    commanderAI.setEnabled(enabled);
  }

  /**
   * Generate a monster sprite
   */
  async generateMonsterSprite(description, options = {}) {
    return assetPipeline.generateMonsterSprite(description, options);
  }

  /**
   * Event system
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
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (err) {
          console.error(`[Neural] Error in event listener:`, err);
        }
      }
    }
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      status: this.status,
      error: this.error?.message,
      config: {
        levelGeneration: NeuralConfig.levelGeneration.enabled,
        narrative: NeuralConfig.narrative.enabled,
        commander: NeuralConfig.commander.enabled,
        assets: NeuralConfig.assets.enabled,
      },
      subsystems: {
        interop: neuralInterop.initialized,
        commander: commanderAI.getStatus(),
      },
    };
  }

  /**
   * Save state for persistence
   */
  saveState() {
    return {
      narrative: narrativeEngine.saveState(),
      timestamp: Date.now(),
    };
  }

  /**
   * Load saved state
   */
  loadState(state) {
    if (state.narrative) {
      narrativeEngine.loadState(state.narrative);
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    commanderAI.clear();
    levelGenerator.clearCache();
    narrativeEngine.clearOverrides();
    assetPipeline.clearCache();
    neuralInterop.destroy();

    this.status = NeuralStatus.UNINITIALIZED;
    this.wasmModule = null;
    this.eventListeners.clear();

    console.log('[Neural] Destroyed');
  }
}

// Singleton instance
const neuralAugmentation = new NeuralAugmentation();

// Export status enum
export { NeuralStatus };

// Default export
export default neuralAugmentation;

/**
 * Worker bridge for communication between main thread and game worker
 */
export class NeuralWorkerBridge {
  constructor() {
    this.messageHandlers = new Map();
    this.pendingRequests = new Map();
    this.requestId = 0;
  }

  /**
   * Initialize the bridge with a worker reference
   */
  initialize(worker) {
    this.worker = worker;

    // Listen for neural messages from worker
    worker.addEventListener('message', this.handleMessage.bind(this));
  }

  /**
   * Handle incoming messages
   */
  handleMessage(event) {
    const { action, requestId, data } = event.data;

    if (!action?.startsWith('neural_')) return;

    // Handle responses to pending requests
    if (requestId && this.pendingRequests.has(requestId)) {
      const { resolve, reject } = this.pendingRequests.get(requestId);
      this.pendingRequests.delete(requestId);

      if (data.error) {
        reject(new Error(data.error));
      } else {
        resolve(data);
      }
      return;
    }

    // Handle incoming requests/events
    const handler = this.messageHandlers.get(action);
    if (handler) {
      try {
        const result = handler(data);
        if (requestId && result !== undefined) {
          this.sendResponse(requestId, result);
        }
      } catch (error) {
        if (requestId) {
          this.sendError(requestId, error);
        }
      }
    }
  }

  /**
   * Register a message handler
   */
  on(action, handler) {
    this.messageHandlers.set(action, handler);
  }

  /**
   * Send a request and wait for response
   */
  request(action, data = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++this.requestId;
      this.pendingRequests.set(requestId, { resolve, reject });

      this.worker.postMessage({
        action,
        requestId,
        data,
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Send a one-way message
   */
  send(action, data = {}) {
    this.worker.postMessage({ action, data });
  }

  /**
   * Send a response
   */
  sendResponse(requestId, data) {
    this.worker.postMessage({
      action: 'neural_response',
      requestId,
      data,
    });
  }

  /**
   * Send an error response
   */
  sendError(requestId, error) {
    this.worker.postMessage({
      action: 'neural_response',
      requestId,
      data: { error: error.message },
    });
  }
}
