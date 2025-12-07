/**
 * NeuralGameController - Unified AI-to-Game Integration Layer
 *
 * This controller bridges the gap between AI campaign generation and
 * actual game execution. It wires together:
 * - WhiteBoxAPI (80 DApi exports for game state read/write)
 * - CustomAPIBridge (high-level operations like ghost town injection)
 * - LevelInjector (queued level replacement)
 * - QuestTriggerSystem (event detection → quest advancement)
 * - GameEventDetector (WASM memory polling → event emission)
 *
 * LIFECYCLE:
 * 1. WASM loads → initialize() called
 * 2. WhiteBoxAPI instantiated with WASM module
 * 3. Game starts → onGameStart() triggered
 * 4. Custom town injected (if campaign queued)
 * 5. Player plays → events detected → quests advance
 * 6. Quest rewards executed via DApi
 * 7. Boss killed → next area unlocked via DApi
 */

import { WhiteBoxAPI, LevelType } from './WhiteBoxAPI';
import CustomAPIBridge, {
  initCustomAPI,
  isCustomAPIAvailable,
  ghostTownInjection,
  injectCompleteLevel,
  setDungeonGeometry,
  clearMonsters,
  clearObjects,
  injectMonster,
  injectObject,
  setPlayerPos,
  getCurrentLevel,
  pauseGameLogic,
} from './CustomAPIBridge';
import levelInjector, { INJECTION_STATE } from './LevelInjector';
import { questTriggerSystem, QuestStatus, TriggerType } from './QuestTriggerSystem';
import { gameEventEmitter, GameEventType } from './GameEventEmitter';
import { gameEventDetector } from './GameEventDetector';

// Controller states
export const ControllerState = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  GAME_ACTIVE: 'game_active',
  INJECTING: 'injecting',
  ERROR: 'error',
};

// Reward types that can be executed
export const RewardType = {
  GOLD: 'gold',
  EXPERIENCE: 'experience',
  ITEM: 'item',
  UNLOCK_AREA: 'unlock_area',
  SPAWN_NPC: 'spawn_npc',
  TELEPORT_PLAYER: 'teleport_player',
  TRIGGER_DIALOGUE: 'trigger_dialogue',
};

// Boss IDs and their unlock targets
const BOSS_UNLOCK_MAP = {
  101: { name: 'Skeleton King', unlocksLevel: 5 },   // Unlocks Catacombs
  102: { name: 'Butcher', unlocksLevel: 3 },         // Side area
  107: { name: 'Diablo', unlocksLevel: null },       // Game complete
  108: { name: 'Lazarus', unlocksLevel: 15 },        // Unlocks path to Diablo
};

/**
 * NeuralGameController - Main orchestration class
 */
class NeuralGameController {
  constructor() {
    this.state = ControllerState.UNINITIALIZED;
    this.wasmModule = null;
    this.whiteBoxAPI = null;
    this.worker = null;

    // Pending campaign for injection
    this.pendingCampaign = null;
    this.activeCampaign = null;

    // Startup injection config
    this.startupConfig = {
      replaceTown: false,
      customTown: null,
      startLevel: 0,
      playerSpawn: null,
    };

    // Unlocked areas tracking
    this.unlockedAreas = new Set([0, 1, 2, 3, 4]); // Default: Town + Cathedral

    // Event listeners
    this.listeners = new Map();
    this.unsubscribers = [];

    // Bind methods
    this.onGameEvent = this.onGameEvent.bind(this);
    this.onQuestCompleted = this.onQuestCompleted.bind(this);
    this.onBossKilled = this.onBossKilled.bind(this);
    this.onLevelEntered = this.onLevelEntered.bind(this);
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the controller with WASM module and worker
   * @param {Object} wasmModule - The loaded WASM module
   * @param {Worker} worker - The game worker
   */
  async initialize(wasmModule, worker) {
    if (this.state !== ControllerState.UNINITIALIZED) {
      console.warn('[NeuralGameController] Already initialized');
      return this.state === ControllerState.READY;
    }

    this.state = ControllerState.INITIALIZING;
    console.log('[NeuralGameController] Initializing...');

    try {
      this.wasmModule = wasmModule;
      this.worker = worker;

      // 1. Create WhiteBoxAPI instance
      this.whiteBoxAPI = this.createWhiteBoxAPI(wasmModule);

      // 2. Initialize CustomAPIBridge
      await initCustomAPI(worker);
      const hasCustomAPI = isCustomAPIAvailable();
      console.log(`[NeuralGameController] CustomAPI available: ${hasCustomAPI}`);

      // 3. Initialize LevelInjector
      await levelInjector.init(worker);

      // 4. Initialize Quest system
      questTriggerSystem.initialize();

      // 5. Wire up event handlers
      this.wireEventHandlers();

      // 6. Setup quest reward execution
      this.setupRewardExecution();

      this.state = ControllerState.READY;
      console.log('[NeuralGameController] Initialization complete');

      this.emit('initialized', { hasCustomAPI });
      return true;

    } catch (err) {
      this.state = ControllerState.ERROR;
      console.error('[NeuralGameController] Initialization failed:', err);
      this.emit('error', err);
      return false;
    }
  }

  /**
   * Create WhiteBoxAPI instance (with fallback for missing exports)
   */
  createWhiteBoxAPI(wasmModule) {
    try {
      const api = new WhiteBoxAPI(wasmModule);
      console.log('[NeuralGameController] WhiteBoxAPI created successfully');
      return api;
    } catch (err) {
      console.warn('[NeuralGameController] WhiteBoxAPI creation failed, using null:', err.message);
      return null;
    }
  }

  /**
   * Wire up all event handlers for game → quest → reward flow
   */
  wireEventHandlers() {
    // Listen to game events
    this.unsubscribers.push(
      gameEventEmitter.on(GameEventType.BOSS_KILLED, this.onBossKilled),
      gameEventEmitter.on(GameEventType.LEVEL_ENTERED, this.onLevelEntered),
      gameEventEmitter.on(GameEventType.MONSTER_KILLED, this.onGameEvent),
      gameEventEmitter.on(GameEventType.LEVEL_CLEARED, this.onGameEvent),
      gameEventEmitter.on(GameEventType.GOLD_GAINED, this.onGameEvent),
    );

    // Listen to quest completions
    questTriggerSystem.onQuestCompleted = this.onQuestCompleted;

    // Listen for level transitions from LevelInjector
    levelInjector.on('levelTransition', ({ from, to }) => {
      this.emit('levelTransition', { from, to });
    });

    console.log('[NeuralGameController] Event handlers wired');
  }

  /**
   * Setup reward execution callbacks
   */
  setupRewardExecution() {
    // Override quest completion handler to execute rewards
    const originalOnComplete = questTriggerSystem.onQuestCompleted;
    questTriggerSystem.onQuestCompleted = async (quest) => {
      // Execute rewards
      if (quest.rewards) {
        await this.executeRewards(quest.rewards, quest);
      }

      // Call original handler if exists
      if (originalOnComplete) {
        originalOnComplete(quest);
      }

      // Emit our own event
      this.emit('questCompleted', quest);
    };
  }

  // ============================================================================
  // CAMPAIGN LOADING
  // ============================================================================

  /**
   * Load a campaign for injection
   * @param {Object} campaign - Campaign data from CampaignBuilder
   */
  async loadCampaign(campaign) {
    if (!campaign) {
      throw new Error('No campaign provided');
    }

    console.log('[NeuralGameController] Loading campaign:', campaign.name || campaign.id);

    this.pendingCampaign = campaign;
    this.activeCampaign = null;

    // Register quests
    if (campaign.quests) {
      for (const quest of campaign.quests) {
        questTriggerSystem.registerQuest(quest);
      }
      console.log(`[NeuralGameController] Registered ${campaign.quests.length} quests`);
    }

    // Queue levels for injection
    if (campaign.levels) {
      const levelMap = new Map();
      for (const [levelId, levelData] of Object.entries(campaign.levels)) {
        levelMap.set(parseInt(levelId), levelData);
      }
      levelInjector.queueCampaign(levelMap);
      console.log(`[NeuralGameController] Queued ${levelMap.size} levels`);
    }

    // Configure startup
    if (campaign.startingArea) {
      this.startupConfig = {
        replaceTown: true,
        customTown: campaign.startingArea,
        startLevel: campaign.startLevel || 0,
        playerSpawn: campaign.playerSpawn || { x: 25, y: 29 },
      };
    }

    this.emit('campaignLoaded', campaign);
    return true;
  }

  /**
   * Called when game actually starts (after character selection)
   * This is where we inject the custom town if configured
   */
  async onGameStart() {
    if (this.state !== ControllerState.READY) {
      console.warn('[NeuralGameController] Not ready for game start');
      return;
    }

    this.state = ControllerState.GAME_ACTIVE;
    console.log('[NeuralGameController] Game starting...');

    // Check if we have a custom town to inject
    if (this.startupConfig.replaceTown && this.startupConfig.customTown) {
      console.log('[NeuralGameController] Injecting custom starting area...');

      // Wait a moment for the game to fully load Tristram
      await this.delay(500);

      try {
        await this.injectStartingArea(this.startupConfig.customTown);
        console.log('[NeuralGameController] Starting area injected successfully');
      } catch (err) {
        console.error('[NeuralGameController] Starting area injection failed:', err);
        this.emit('injectionFailed', { phase: 'startup', error: err.message });
      }
    }

    // Activate pending campaign
    if (this.pendingCampaign) {
      this.activeCampaign = this.pendingCampaign;
      this.pendingCampaign = null;

      // Start initial quests
      if (this.activeCampaign.initialQuests) {
        for (const questId of this.activeCampaign.initialQuests) {
          questTriggerSystem.startQuest(questId);
        }
      }
    }

    this.emit('gameStarted');
  }

  /**
   * Inject custom starting area (replaces Tristram)
   */
  async injectStartingArea(townData) {
    this.state = ControllerState.INJECTING;

    try {
      // Use CustomAPIBridge if available, otherwise fall back to LevelInjector
      if (isCustomAPIAvailable()) {
        await ghostTownInjection({
          grid: townData.grid,
          npcs: townData.npcs || [],
          objects: townData.objects || [],
          playerSpawn: this.startupConfig.playerSpawn,
        });
      } else {
        // Fallback: Use WASMBridge via LevelInjector
        await levelInjector.injectNow({
          grid: townData.grid,
          monsters: townData.npcs,
          objects: townData.objects,
        }, 0);

        // Try to set player position if we have WhiteBoxAPI
        if (this.whiteBoxAPI && this.startupConfig.playerSpawn) {
          try {
            this.whiteBoxAPI.setPlayerPosition(
              0,
              this.startupConfig.playerSpawn.x,
              this.startupConfig.playerSpawn.y
            );
          } catch (e) {
            console.warn('[NeuralGameController] Could not set player position:', e);
          }
        }
      }

      this.state = ControllerState.GAME_ACTIVE;
      this.emit('startingAreaInjected', townData);

    } catch (err) {
      this.state = ControllerState.GAME_ACTIVE; // Recover to active state
      throw err;
    }
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle generic game events
   */
  onGameEvent(event) {
    // Forward to quest system (it will check triggers)
    // Already handled by questTriggerSystem subscription
    this.emit('gameEvent', event);
  }

  /**
   * Handle boss killed - unlock new areas
   */
  async onBossKilled(event) {
    const { monsterType, monsterId } = event.data || event;

    console.log(`[NeuralGameController] Boss killed: ${monsterType}`);

    // Check if this boss unlocks a new area
    const unlock = BOSS_UNLOCK_MAP[monsterType];
    if (unlock && unlock.unlocksLevel !== null) {
      console.log(`[NeuralGameController] Unlocking area: ${unlock.unlocksLevel} (${unlock.name})`);

      this.unlockedAreas.add(unlock.unlocksLevel);

      // Execute unlock via DApi if available
      await this.executeUnlockArea(unlock.unlocksLevel);

      this.emit('areaUnlocked', { level: unlock.unlocksLevel, boss: unlock.name });
    }

    // Check campaign-specific boss triggers
    if (this.activeCampaign?.bossUnlocks) {
      const campaignUnlock = this.activeCampaign.bossUnlocks[monsterType];
      if (campaignUnlock) {
        await this.executeRewards(campaignUnlock.rewards);
      }
    }

    this.emit('bossKilled', { monsterType, unlock });
  }

  /**
   * Handle level entered - inject queued levels
   */
  async onLevelEntered(event) {
    const { level: levelId } = event.data || event;

    console.log(`[NeuralGameController] Entered level: ${levelId}`);

    // Check if we have campaign data for this level
    if (this.activeCampaign?.levels?.[levelId]) {
      const levelData = this.activeCampaign.levels[levelId];

      // Inject level-specific monsters and objects
      if (levelData.monsters?.length || levelData.objects?.length) {
        await this.injectLevelEntities(levelId, levelData);
      }
    }

    this.emit('levelEntered', { level: levelId });
  }

  /**
   * Handle quest completed - execute rewards
   */
  async onQuestCompleted(quest) {
    console.log(`[NeuralGameController] Quest completed: ${quest.name}`);

    // Rewards are executed in setupRewardExecution()
    // This is just for additional handling

    this.emit('questCompleted', quest);
  }

  // ============================================================================
  // REWARD EXECUTION
  // ============================================================================

  /**
   * Execute quest rewards via DApi
   * @param {Object} rewards - Reward configuration
   * @param {Object} quest - Quest that triggered the reward
   */
  async executeRewards(rewards, quest = null) {
    if (!rewards) return;

    console.log('[NeuralGameController] Executing rewards:', rewards);

    try {
      // Gold reward
      if (rewards.gold) {
        await this.giveGold(rewards.gold);
      }

      // Experience reward
      if (rewards.experience) {
        await this.giveExperience(rewards.experience);
      }

      // Item reward
      if (rewards.items) {
        for (const item of rewards.items) {
          await this.giveItem(item);
        }
      }

      // Unlock area
      if (rewards.unlockArea) {
        await this.executeUnlockArea(rewards.unlockArea);
      }

      // Spawn NPC
      if (rewards.spawnNpc) {
        await this.spawnNPC(rewards.spawnNpc);
      }

      // Teleport player
      if (rewards.teleport) {
        await this.teleportPlayer(rewards.teleport.x, rewards.teleport.y);
      }

      // Trigger dialogue
      if (rewards.dialogue) {
        this.emit('triggerDialogue', rewards.dialogue);
      }

      this.emit('rewardsExecuted', { rewards, quest });

    } catch (err) {
      console.error('[NeuralGameController] Reward execution failed:', err);
      this.emit('rewardsFailed', { rewards, error: err.message });
    }
  }

  /**
   * Give gold to player
   */
  async giveGold(amount) {
    if (this.whiteBoxAPI) {
      try {
        const playerId = this.whiteBoxAPI.getMyPlayerIndex();
        const currentGold = this.whiteBoxAPI.getPlayerGold(playerId);
        this.whiteBoxAPI.givePlayerGold(playerId, amount);
        console.log(`[NeuralGameController] Gave ${amount} gold (was: ${currentGold}, now: ${currentGold + amount})`);
      } catch (e) {
        console.warn('[NeuralGameController] Gold reward failed:', e);
      }
    }

    // Emit event for UI notification
    this.emit('goldRewarded', { amount });
  }

  /**
   * Give experience to player
   */
  async giveExperience(amount) {
    if (this.whiteBoxAPI) {
      try {
        const playerId = this.whiteBoxAPI.getMyPlayerIndex();
        this.whiteBoxAPI.givePlayerExperience(playerId, amount);
        console.log(`[NeuralGameController] Gave ${amount} experience`);
      } catch (e) {
        console.warn('[NeuralGameController] Experience reward failed:', e);
      }
    }

    this.emit('experienceRewarded', { amount });
  }

  /**
   * Give item to player (in inventory or on ground)
   */
  async giveItem(item) {
    const { itemId, quality = 0, position } = item;

    if (this.whiteBoxAPI) {
      try {
        const playerId = this.whiteBoxAPI.getMyPlayerIndex();

        // Try to add to inventory first
        const slot = this.whiteBoxAPI.givePlayerItem(playerId, itemId, quality);

        if (slot >= 0) {
          console.log(`[NeuralGameController] Gave item ${itemId} to inventory slot ${slot}`);
        } else if (position) {
          // No inventory space, place on ground
          const itemSlot = this.whiteBoxAPI.placeGroundItem(itemId, position.x, position.y);
          console.log(`[NeuralGameController] Placed item ${itemId} on ground at (${position.x}, ${position.y})`);
        } else {
          // No inventory space and no position, place near player
          const playerPos = this.whiteBoxAPI.getPlayerPosition(playerId);
          const itemSlot = this.whiteBoxAPI.placeGroundItem(itemId, playerPos.x + 1, playerPos.y);
          console.log(`[NeuralGameController] Placed item ${itemId} near player`);
        }
      } catch (e) {
        console.warn('[NeuralGameController] Item reward failed:', e);
      }
    }

    this.emit('itemRewarded', { item });
  }

  /**
   * Unlock a game area
   */
  async executeUnlockArea(levelId) {
    this.unlockedAreas.add(levelId);

    // If we have pending level data, ensure it's queued
    if (this.activeCampaign?.levels?.[levelId]) {
      const levelData = this.activeCampaign.levels[levelId];
      levelInjector.queueLevel(levelId, levelData);
    }

    console.log(`[NeuralGameController] Unlocked area: ${levelId}`);
    this.emit('areaUnlocked', { level: levelId });
  }

  /**
   * Spawn an NPC at location
   */
  async spawnNPC(npcData) {
    const { x, y, typeId, hp = 999999, isBoss = false } = npcData;

    if (isCustomAPIAvailable()) {
      await injectMonster(x, y, typeId, hp, 0);
      console.log(`[NeuralGameController] Spawned NPC via CustomAPI at (${x}, ${y})`);
    } else if (this.whiteBoxAPI) {
      // Use WhiteBoxAPI.injectMonster
      const slot = this.whiteBoxAPI.injectMonster(typeId, x, y, hp, isBoss);
      if (slot >= 0) {
        console.log(`[NeuralGameController] Spawned NPC via WhiteBoxAPI at (${x}, ${y}), slot ${slot}`);
      } else {
        console.warn('[NeuralGameController] NPC spawn failed - no available slots');
      }
    }

    this.emit('npcSpawned', npcData);
  }

  /**
   * Teleport player to location
   */
  async teleportPlayer(x, y) {
    if (isCustomAPIAvailable()) {
      await setPlayerPos(x, y);
    } else if (this.whiteBoxAPI) {
      const playerId = this.whiteBoxAPI.getMyPlayerIndex();
      this.whiteBoxAPI.setPlayerPosition(playerId, x, y);
    }

    console.log(`[NeuralGameController] Teleported player to (${x}, ${y})`);
    this.emit('playerTeleported', { x, y });
  }

  /**
   * Inject level-specific monsters and objects
   */
  async injectLevelEntities(levelId, levelData) {
    console.log(`[NeuralGameController] Injecting entities for level ${levelId}`);

    try {
      if (isCustomAPIAvailable()) {
        // Clear existing and inject new
        await clearMonsters();
        await clearObjects();

        for (const m of levelData.monsters || []) {
          await injectMonster(m.x, m.y, m.typeId, m.hp || -1, m.flags || 0);
        }

        for (const o of levelData.objects || []) {
          await injectObject(o.x, o.y, o.typeId);
        }
      }

      this.emit('entitiesInjected', { levelId, monsters: levelData.monsters?.length, objects: levelData.objects?.length });

    } catch (err) {
      console.error('[NeuralGameController] Entity injection failed:', err);
    }
  }

  // ============================================================================
  // STATE QUERIES
  // ============================================================================

  /**
   * Get full game state via WhiteBoxAPI
   */
  getGameState() {
    if (!this.whiteBoxAPI) {
      return null;
    }

    try {
      return this.whiteBoxAPI.getGameState();
    } catch (err) {
      console.warn('[NeuralGameController] Could not get game state:', err);
      return null;
    }
  }

  /**
   * Get player state
   */
  getPlayerState() {
    if (!this.whiteBoxAPI) return null;

    try {
      const playerId = this.whiteBoxAPI.getMyPlayerIndex();
      return this.whiteBoxAPI.getPlayerState(playerId);
    } catch (err) {
      return null;
    }
  }

  /**
   * Get all active monsters
   */
  getActiveMonsters() {
    if (!this.whiteBoxAPI) return [];

    try {
      return this.whiteBoxAPI.getAllActiveMonsters();
    } catch (err) {
      return [];
    }
  }

  /**
   * Check if an area is unlocked
   */
  isAreaUnlocked(levelId) {
    return this.unlockedAreas.has(levelId);
  }

  /**
   * Get controller status
   */
  getStatus() {
    return {
      state: this.state,
      hasWhiteBoxAPI: !!this.whiteBoxAPI,
      hasCustomAPI: isCustomAPIAvailable(),
      hasCampaign: !!this.activeCampaign,
      pendingCampaign: !!this.pendingCampaign,
      unlockedAreas: Array.from(this.unlockedAreas),
      activeQuests: questTriggerSystem.getActiveQuests().length,
      completedQuests: questTriggerSystem.getCompletedQuests().length,
      startupConfig: { ...this.startupConfig },
    };
  }

  // ============================================================================
  // EVENT SYSTEM
  // ============================================================================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const cb of listeners) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[NeuralGameController] Event listener error (${event}):`, err);
        }
      }
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset controller state (for new game)
   */
  reset() {
    this.activeCampaign = null;
    this.pendingCampaign = null;
    this.unlockedAreas = new Set([0, 1, 2, 3, 4]);
    this.startupConfig = {
      replaceTown: false,
      customTown: null,
      startLevel: 0,
      playerSpawn: null,
    };

    questTriggerSystem.reset();
    levelInjector.clearPending();

    this.state = ControllerState.READY;
    console.log('[NeuralGameController] Reset complete');
  }

  /**
   * Cleanup
   */
  destroy() {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];

    questTriggerSystem.destroy();

    this.state = ControllerState.UNINITIALIZED;
    this.wasmModule = null;
    this.whiteBoxAPI = null;
    this.worker = null;

    console.log('[NeuralGameController] Destroyed');
  }
}

// Singleton instance
const neuralGameController = new NeuralGameController();

// Export class (ControllerState and RewardType already exported at top)
export { NeuralGameController };
export default neuralGameController;
