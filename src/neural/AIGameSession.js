/**
 * AI Game Session
 *
 * Manages an AI-augmented game session by overlaying AI-generated content
 * on top of the base Diablo game. This includes:
 * - Quest objectives and progress tracking
 * - AI-generated dialogue when talking to NPCs
 * - Story events and narrative progression
 * - Campaign progress persistence
 */

import React from 'react';
import narrativeEngine from './NarrativeEngine';
import GameStorage from './GameStorage';
import './AIGameSession.scss';

// NPC ID mappings (based on game character positions/interactions)
const NPC_NAMES = {
  CAIN: 'Deckard Cain',
  OGDEN: 'Ogden the Tavern Owner',
  GRISWOLD: 'Griswold the Blacksmith',
  PEPIN: 'Pepin the Healer',
  ADRIA: 'Adria the Witch',
  WIRT: 'Wirt the Peg-legged Boy',
  FARNHAM: 'Farnham the Drunk',
  GILLIAN: 'Gillian the Barmaid',
};

// Game events we track
const GAME_EVENTS = {
  LEVEL_ENTER: 'level_enter',
  LEVEL_EXIT: 'level_exit',
  BOSS_KILL: 'boss_kill',
  NPC_TALK: 'npc_talk',
  QUEST_UPDATE: 'quest_update',
  PLAYER_DEATH: 'player_death',
  ITEM_PICKUP: 'item_pickup',
};

export class AIGameSession {
  constructor(campaign, world, progress = null) {
    this.campaign = campaign;
    this.world = world;
    this.progress = progress || this.createInitialProgress();
    this.narrativeEngine = narrativeEngine;
    this.eventListeners = new Map();
    this.isActive = false;
    this.currentLevel = 0;
    this.playerState = {
      class: 'warrior',
      level: 1,
      health: 100,
      maxHealth: 100,
    };

    // UI state
    this.showingDialogue = false;
    this.currentDialogue = null;
    this.showingQuest = false;
    this.questNotification = null;
  }

  createInitialProgress() {
    return {
      campaignId: this.campaign.id,
      currentAct: 0,
      currentLevel: 0,
      completedQuests: [],
      activeQuests: this.campaign.quests?.filter(q => q.type === 'main').slice(0, 1).map(q => q.id) || [],
      bossKills: [],
      totalKills: 0,
      deaths: 0,
      playtime: 0,
      lastPlayed: Date.now(),
    };
  }

  /**
   * Start the AI game session
   */
  start() {
    this.isActive = true;
    this.startTime = Date.now();

    // Ensure progress has required arrays
    if (!this.progress.activeQuests) {
      this.progress.activeQuests = [];
    }
    if (!this.progress.completedQuests) {
      this.progress.completedQuests = [];
    }
    if (!this.progress.bossKills) {
      this.progress.bossKills = [];
    }

    // Show initial quest
    if (this.progress.activeQuests.length > 0) {
      const quest = this.campaign.quests?.find(q => q.id === this.progress.activeQuests[0]);
      if (quest) {
        this.showQuestNotification({
          type: 'active',
          quest: quest,
        });
      }
    }

    console.log('[AIGameSession] Started campaign:', this.campaign.name);
    return this;
  }

  /**
   * Stop the AI game session and save progress
   */
  async stop() {
    this.isActive = false;

    // Update playtime
    if (this.startTime) {
      this.progress.playtime += Date.now() - this.startTime;
    }
    this.progress.lastPlayed = Date.now();

    // Save progress
    await this.saveProgress();

    console.log('[AIGameSession] Stopped, progress saved');
  }

  /**
   * Save current progress to storage
   */
  async saveProgress() {
    try {
      await GameStorage.saveProgress(this.progress);
    } catch (error) {
      console.error('[AIGameSession] Failed to save progress:', error);
    }
  }

  /**
   * Handle game events from the WASM engine
   */
  handleGameEvent(event, data = {}) {
    if (!this.isActive) return;

    switch (event) {
      case GAME_EVENTS.LEVEL_ENTER:
        this.onLevelEnter(data.level);
        break;
      case GAME_EVENTS.LEVEL_EXIT:
        this.onLevelExit(data.level);
        break;
      case GAME_EVENTS.BOSS_KILL:
        this.onBossKill(data.bossName);
        break;
      case GAME_EVENTS.NPC_TALK:
        this.onNPCTalk(data.npcId);
        break;
      case GAME_EVENTS.PLAYER_DEATH:
        this.onPlayerDeath();
        break;
    }

    // Notify listeners
    const listeners = this.eventListeners.get(event) || [];
    listeners.forEach(cb => cb(data));
  }

  /**
   * Register an event listener
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove an event listener
   */
  off(event, callback) {
    const listeners = this.eventListeners.get(event) || [];
    const index = listeners.indexOf(callback);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  /**
   * Handle entering a new level
   */
  onLevelEnter(level) {
    this.currentLevel = level;
    this.progress.currentLevel = level;

    // Get area info from world
    const area = this.world?.areas?.[level];
    if (area) {
      console.log('[AIGameSession] Entered:', area.name);

      // Show area notification
      this.showAreaNotification(area);
    }
  }

  /**
   * Handle exiting a level
   */
  onLevelExit(level) {
    // Could trigger events or save progress
  }

  /**
   * Handle boss kills
   */
  onBossKill(bossName) {
    if (!this.progress.bossKills.includes(bossName)) {
      this.progress.bossKills.push(bossName);
    }

    // Check if this completes a quest
    this.checkQuestProgress();

    // Check act progression
    this.checkActProgression(bossName);

    this.saveProgress();
  }

  /**
   * Handle talking to NPCs - generate AI dialogue
   */
  async onNPCTalk(npcId) {
    const npcKey = npcId.toUpperCase();

    // Generate contextual dialogue
    const context = {
      playerClass: this.playerState.class,
      playerLevel: this.playerState.level,
      recentBossKills: this.progress.bossKills.slice(-3),
      currentQuest: this.getCurrentQuestName(),
      campaignContext: this.campaign.description,
      playerWounded: this.playerState.health < this.playerState.maxHealth * 0.5,
    };

    try {
      const dialogue = await this.narrativeEngine.generateDialogue(npcKey, context);
      this.showDialogue(npcKey, dialogue);
    } catch (error) {
      console.warn('[AIGameSession] Failed to generate dialogue:', error);
      // Fall back to showing nothing (let original game dialogue show)
    }
  }

  /**
   * Handle player death
   */
  onPlayerDeath() {
    this.progress.deaths++;
    this.saveProgress();
  }

  /**
   * Get current active quest name
   */
  getCurrentQuestName() {
    if (this.progress.activeQuests.length === 0) return null;
    const quest = this.campaign.quests?.find(q => q.id === this.progress.activeQuests[0]);
    return quest?.name || null;
  }

  /**
   * Check if any quests were completed
   */
  checkQuestProgress() {
    const activeQuests = [...this.progress.activeQuests];

    for (const questId of activeQuests) {
      const quest = this.campaign.quests?.find(q => q.id === questId);
      if (!quest) continue;

      // Check completion conditions
      let completed = false;

      if (quest.objectives) {
        completed = quest.objectives.every(obj => {
          if (obj.type === 'kill_boss' && this.progress.bossKills.includes(obj.target)) {
            return true;
          }
          if (obj.type === 'reach_level' && this.currentLevel >= obj.level) {
            return true;
          }
          return false;
        });
      }

      if (completed) {
        this.completeQuest(questId);
      }
    }
  }

  /**
   * Complete a quest
   */
  completeQuest(questId) {
    const quest = this.campaign.quests?.find(q => q.id === questId);
    if (!quest) return;

    // Move from active to completed
    this.progress.activeQuests = this.progress.activeQuests.filter(id => id !== questId);
    if (!this.progress.completedQuests.includes(questId)) {
      this.progress.completedQuests.push(questId);
    }

    // Show completion notification
    this.showQuestNotification({
      type: 'complete',
      quest: quest,
    });

    // Activate next quest if available
    const nextQuest = this.campaign.quests?.find(q =>
      !this.progress.completedQuests.includes(q.id) &&
      !this.progress.activeQuests.includes(q.id)
    );

    if (nextQuest) {
      this.progress.activeQuests.push(nextQuest.id);
      setTimeout(() => {
        this.showQuestNotification({
          type: 'new',
          quest: nextQuest,
        });
      }, 3000);
    }

    this.saveProgress();
  }

  /**
   * Check if we should progress to next act
   */
  checkActProgression(bossName) {
    const currentAct = this.campaign.acts?.[this.progress.currentAct];
    if (!currentAct) return;

    // Check if this boss unlocks next act
    if (currentAct.boss?.name === bossName) {
      const nextAct = this.campaign.acts?.[this.progress.currentAct + 1];
      if (nextAct) {
        this.progress.currentAct++;
        this.showActNotification(nextAct);
      }
    }
  }

  /**
   * Show dialogue overlay
   */
  showDialogue(npcId, dialogue) {
    this.currentDialogue = {
      npcId,
      npcName: NPC_NAMES[npcId] || npcId,
      text: dialogue.dialogue,
      options: dialogue.options || [],
    };
    this.showingDialogue = true;
    this.notifyUIUpdate();
  }

  /**
   * Dismiss dialogue
   */
  dismissDialogue() {
    this.showingDialogue = false;
    this.currentDialogue = null;
    this.notifyUIUpdate();
  }

  /**
   * Show quest notification
   */
  showQuestNotification(notification) {
    this.questNotification = notification;
    this.showingQuest = true;
    this.notifyUIUpdate();

    // Auto-dismiss after delay
    setTimeout(() => {
      if (this.questNotification === notification) {
        this.showingQuest = false;
        this.questNotification = null;
        this.notifyUIUpdate();
      }
    }, 5000);
  }

  /**
   * Show area notification
   */
  showAreaNotification(area) {
    this.areaNotification = {
      name: area.name,
      description: area.description,
    };
    this.notifyUIUpdate();

    setTimeout(() => {
      this.areaNotification = null;
      this.notifyUIUpdate();
    }, 3000);
  }

  /**
   * Show act progression notification
   */
  showActNotification(act) {
    this.actNotification = {
      number: act.number,
      name: act.name,
      theme: act.theme,
    };
    this.notifyUIUpdate();

    setTimeout(() => {
      this.actNotification = null;
      this.notifyUIUpdate();
    }, 5000);
  }

  /**
   * Notify UI of state changes
   */
  notifyUIUpdate() {
    const listeners = this.eventListeners.get('ui_update') || [];
    listeners.forEach(cb => cb(this.getUIState()));
  }

  /**
   * Get current UI state for rendering
   */
  getUIState() {
    return {
      campaign: this.campaign,
      progress: this.progress,
      showingDialogue: this.showingDialogue,
      currentDialogue: this.currentDialogue,
      showingQuest: this.showingQuest,
      questNotification: this.questNotification,
      areaNotification: this.areaNotification,
      actNotification: this.actNotification,
      activeQuests: this.progress.activeQuests.map(id =>
        this.campaign.quests?.find(q => q.id === id)
      ).filter(Boolean),
    };
  }

  /**
   * Update player state from game
   */
  updatePlayerState(state) {
    this.playerState = { ...this.playerState, ...state };
  }
}

/**
 * React component for AI Game Session overlay
 */
export class AIGameOverlay extends React.Component {
  state = {
    uiState: null,
    minimized: false,
  };

  componentDidMount() {
    const { session } = this.props;
    if (session) {
      this.unsubscribe = session.on('ui_update', this.handleUIUpdate);
      this.setState({ uiState: session.getUIState() });
    }
  }

  componentWillUnmount() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  handleUIUpdate = (uiState) => {
    this.setState({ uiState });
  };

  toggleMinimize = () => {
    this.setState(prev => ({ minimized: !prev.minimized }));
  };

  dismissDialogue = () => {
    if (this.props.session) {
      this.props.session.dismissDialogue();
    }
  };

  render() {
    const { uiState, minimized } = this.state;
    if (!uiState) return null;

    const {
      campaign,
      progress,
      showingDialogue,
      currentDialogue,
      showingQuest,
      questNotification,
      areaNotification,
      actNotification,
      activeQuests,
    } = uiState;

    return (
      <div className={`ai-game-overlay ${minimized ? 'minimized' : ''}`}>
        {/* Campaign info bar */}
        <div className="campaign-bar" onClick={this.toggleMinimize}>
          <span className="campaign-name">{campaign.name}</span>
          <span className="campaign-act">Act {progress.currentAct + 1}</span>
          <span className="toggle-btn">{minimized ? '+' : '-'}</span>
        </div>

        {!minimized && (
          <>
            {/* Active quests */}
            {activeQuests.length > 0 && (
              <div className="quest-tracker">
                <div className="quest-header">Active Quests</div>
                {activeQuests.map(quest => (
                  <div key={quest.id} className="quest-item">
                    <span className="quest-name">{quest.name}</span>
                    {quest.objectives && (
                      <ul className="quest-objectives">
                        {quest.objectives.slice(0, 2).map((obj, i) => (
                          <li key={i}>{obj.description || obj.type}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Dialogue overlay */}
        {showingDialogue && currentDialogue && (
          <div className="dialogue-overlay" onClick={this.dismissDialogue}>
            <div className="dialogue-box" onClick={e => e.stopPropagation()}>
              <div className="dialogue-speaker">{currentDialogue.npcName}</div>
              <div className="dialogue-text">{currentDialogue.text}</div>
              {currentDialogue.options.length > 0 && (
                <div className="dialogue-options">
                  {currentDialogue.options.map((opt, i) => (
                    <button key={i} className="dialogue-option" onClick={this.dismissDialogue}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <button className="dialogue-dismiss" onClick={this.dismissDialogue}>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Quest notification */}
        {showingQuest && questNotification && (
          <div className={`quest-notification ${questNotification.type}`}>
            <div className="quest-notification-type">
              {questNotification.type === 'complete' ? 'Quest Complete!' :
               questNotification.type === 'new' ? 'New Quest!' : 'Active Quest'}
            </div>
            <div className="quest-notification-name">{questNotification.quest.name}</div>
            {questNotification.quest.description && (
              <div className="quest-notification-desc">{questNotification.quest.description}</div>
            )}
          </div>
        )}

        {/* Area notification */}
        {areaNotification && (
          <div className="area-notification">
            <div className="area-name">{areaNotification.name}</div>
            {areaNotification.description && (
              <div className="area-desc">{areaNotification.description}</div>
            )}
          </div>
        )}

        {/* Act notification */}
        {actNotification && (
          <div className="act-notification">
            <div className="act-label">Act {actNotification.number}</div>
            <div className="act-name">{actNotification.name}</div>
            <div className="act-theme">{actNotification.theme}</div>
          </div>
        )}
      </div>
    );
  }
}

export default AIGameSession;
