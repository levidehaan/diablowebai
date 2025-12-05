/**
 * AI Debug Panel
 *
 * User visibility component for AI decision-making and system state.
 * Shows real-time events, quest progress, configuration, and pipeline status.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gameEventEmitter, GameEventType } from './GameEventEmitter';
import { questTriggerSystem, QuestStatus } from './QuestTriggerSystem';
import { dataFlowPipeline, PipelineStage, PipelineStatus } from './DataFlowPipeline';
import dungeonConfig from './DungeonConfig';

import './AIDebugPanel.scss';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Event Log Panel - shows real-time game events
 */
const EventLogPanel = ({ maxEvents = 50 }) => {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('all');
  const logRef = useRef(null);

  useEffect(() => {
    const unsubscribe = gameEventEmitter.on('*', (event) => {
      setEvents((prev) => {
        const newEvents = [
          { ...event, id: Date.now(), timestamp: new Date().toLocaleTimeString() },
          ...prev,
        ].slice(0, maxEvents);
        return newEvents;
      });
    });

    return () => unsubscribe();
  }, [maxEvents]);

  const filteredEvents =
    filter === 'all' ? events : events.filter((e) => e.type === filter);

  const eventTypes = Object.values(GameEventType);

  const getEventColor = (type) => {
    const colors = {
      monster_killed: '#ff6b6b',
      boss_killed: '#ff0000',
      player_damaged: '#ffa500',
      player_healed: '#00ff00',
      player_leveled: '#ffd700',
      level_entered: '#4169e1',
      level_cleared: '#9932cc',
      gold_gained: '#ffd700',
    };
    return colors[type] || '#888888';
  };

  return (
    <div className="debug-section event-log">
      <div className="section-header">
        <h3>📜 Event Log</h3>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All Events</option>
          {eventTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="event-list" ref={logRef}>
        {filteredEvents.length === 0 ? (
          <div className="empty-state">No events yet...</div>
        ) : (
          filteredEvents.map((event) => (
            <div
              key={event.id}
              className="event-item"
              style={{ borderLeftColor: getEventColor(event.type) }}
            >
              <span className="event-time">{event.timestamp}</span>
              <span className="event-type">{event.type}</span>
              {event.data && (
                <span className="event-data">{JSON.stringify(event.data)}</span>
              )}
            </div>
          ))
        )}
      </div>
      <div className="section-footer">
        <span>{events.length} events</span>
        <button onClick={() => setEvents([])}>Clear</button>
      </div>
    </div>
  );
};

/**
 * Quest Status Panel - shows active quests and progress
 */
const QuestStatusPanel = () => {
  const [quests, setQuests] = useState({
    active: [],
    completed: [],
    killCounts: { total: 0, byType: {} },
  });

  useEffect(() => {
    const updateQuests = () => {
      setQuests({
        active: questTriggerSystem.getActiveQuests(),
        completed: questTriggerSystem.getCompletedQuests(),
        killCounts: questTriggerSystem.getKillCounts(),
      });
    };

    // Update on events
    const unsub1 = gameEventEmitter.on(GameEventType.MONSTER_KILLED, updateQuests);
    const unsub2 = gameEventEmitter.on(GameEventType.BOSS_KILLED, updateQuests);
    const unsub3 = gameEventEmitter.on(GameEventType.LEVEL_ENTERED, updateQuests);

    // Initial update
    updateQuests();

    // Periodic refresh
    const interval = setInterval(updateQuests, 2000);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      clearInterval(interval);
    };
  }, []);

  const getStatusIcon = (status) => {
    const icons = {
      [QuestStatus.NOT_STARTED]: '⬜',
      [QuestStatus.IN_PROGRESS]: '🔄',
      [QuestStatus.COMPLETED]: '✅',
      [QuestStatus.FAILED]: '❌',
    };
    return icons[status] || '❓';
  };

  return (
    <div className="debug-section quest-status">
      <div className="section-header">
        <h3>📋 Quest Status</h3>
      </div>

      <div className="kill-stats">
        <span>Total Kills: {quests.killCounts.total}</span>
        {Object.entries(quests.killCounts.byType)
          .slice(0, 5)
          .map(([type, count]) => (
            <span key={type} className="kill-type">
              {type}: {count}
            </span>
          ))}
      </div>

      <div className="quest-list">
        <h4>Active Quests ({quests.active.length})</h4>
        {quests.active.length === 0 ? (
          <div className="empty-state">No active quests</div>
        ) : (
          quests.active.map((quest) => (
            <div key={quest.id} className="quest-item active">
              <span className="quest-icon">{getStatusIcon(quest.status)}</span>
              <div className="quest-info">
                <span className="quest-name">{quest.name}</span>
                <span className="quest-stage">
                  Stage {quest.currentStage + 1}/{quest.stages.length}
                </span>
                {quest.stages[quest.currentStage] && (
                  <span className="quest-objective">
                    {quest.stages[quest.currentStage].objective ||
                      quest.stages[quest.currentStage].description}
                  </span>
                )}
              </div>
            </div>
          ))
        )}

        {quests.completed.length > 0 && (
          <>
            <h4>Completed ({quests.completed.length})</h4>
            {quests.completed.slice(0, 3).map((quest) => (
              <div key={quest.id} className="quest-item completed">
                <span className="quest-icon">{getStatusIcon(quest.status)}</span>
                <span className="quest-name">{quest.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Pipeline Status Panel - shows data flow pipeline state
 */
const PipelineStatusPanel = () => {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const updateStatus = () => {
      setStatus(dataFlowPipeline.getStatus());
      setHistory(dataFlowPipeline.getHistory().slice(0, 5));
    };

    const unsub1 = dataFlowPipeline.on('stageStart', updateStatus);
    const unsub2 = dataFlowPipeline.on('complete', updateStatus);
    const unsub3 = dataFlowPipeline.on('error', updateStatus);
    const unsub4 = dataFlowPipeline.on('progress', updateStatus);

    updateStatus();

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, []);

  const getStageColor = (stage) => {
    const colors = {
      [PipelineStage.IDLE]: '#888',
      [PipelineStage.INTENT]: '#4169e1',
      [PipelineStage.CONFIGURE]: '#ffa500',
      [PipelineStage.VALIDATE]: '#9932cc',
      [PipelineStage.BUILD]: '#00ced1',
      [PipelineStage.LOAD]: '#32cd32',
      [PipelineStage.COMPLETE]: '#00ff00',
      [PipelineStage.ERROR]: '#ff0000',
    };
    return colors[stage] || '#888';
  };

  const getStatusIcon = (pipelineStatus) => {
    const icons = {
      [PipelineStatus.PENDING]: '⏳',
      [PipelineStatus.IN_PROGRESS]: '🔄',
      [PipelineStatus.COMPLETED]: '✅',
      [PipelineStatus.FAILED]: '❌',
      [PipelineStatus.ROLLED_BACK]: '↩️',
    };
    return icons[pipelineStatus] || '❓';
  };

  if (!status) return null;

  return (
    <div className="debug-section pipeline-status">
      <div className="section-header">
        <h3>🔄 Pipeline Status</h3>
      </div>

      <div className="pipeline-info">
        <div className="pipeline-flags">
          <span className={status.hasBuilder ? 'active' : 'inactive'}>
            Builder: {status.hasBuilder ? '✓' : '✗'}
          </span>
          <span className={status.hasLoader ? 'active' : 'inactive'}>
            Loader: {status.hasLoader ? '✓' : '✗'}
          </span>
        </div>

        {status.currentState && (
          <div className="current-state">
            <div
              className="stage-indicator"
              style={{ backgroundColor: getStageColor(status.currentState.stage) }}
            >
              {status.currentState.stage}
            </div>
            <span className="status-icon">
              {getStatusIcon(status.currentState.status)}
            </span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${status.currentState.progress}%` }}
              />
            </div>
            <span className="progress-text">{status.currentState.progress}%</span>
          </div>
        )}

        <div className="cache-stats">
          Cache: {status.cacheStats?.size || 0}/{status.cacheStats?.maxSize || 0}
        </div>

        {status.registeredQuests?.length > 0 && (
          <div className="registered-quests">
            Registered Quests: {status.registeredQuests.join(', ')}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div className="pipeline-history">
          <h4>Recent Runs</h4>
          {history.map((run, i) => (
            <div key={run.id || i} className="history-item">
              <span className="history-status">{getStatusIcon(run.status)}</span>
              <span className="history-stage">{run.stage}</span>
              <span className="history-duration">{run.duration}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Dungeon Config Panel - shows current dungeon configuration
 */
const DungeonConfigPanel = () => {
  const [summary, setSummary] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const updateSummary = () => {
      setSummary(dungeonConfig.getSummary());
    };

    const unsub = dungeonConfig.on('levelConfigChanged', updateSummary);
    updateSummary();

    return () => unsub();
  }, []);

  if (!summary) return null;

  const getThemeColor = (theme) => {
    const colors = {
      CATHEDRAL: '#808080',
      CATACOMBS: '#8b4513',
      CAVES: '#2f4f4f',
      HELL: '#8b0000',
    };
    return colors[theme] || '#444';
  };

  return (
    <div className="debug-section dungeon-config">
      <div className="section-header">
        <h3>🏰 Dungeon Config</h3>
        <button onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      <div className="config-summary">
        <div className="config-stat">
          <span className="stat-label">Difficulty:</span>
          <span className="stat-value">{summary.global.difficultyPreset}</span>
        </div>
        <div className="config-stat">
          <span className="stat-label">Bosses:</span>
          <span className="stat-value">{summary.totalBosses}</span>
        </div>
        <div className="config-stat">
          <span className="stat-label">Story Beats:</span>
          <span className="stat-value">{summary.totalStoryBeats}</span>
        </div>
        <div className="config-stat">
          <span className="stat-label">Custom Bosses:</span>
          <span className="stat-value">{summary.customBossCount}</span>
        </div>
      </div>

      {expanded && (
        <div className="level-grid">
          {summary.levelSummaries.map((level) => (
            <div
              key={level.level}
              className={`level-cell ${level.isQuestLevel ? 'quest-level' : ''} ${
                level.hasBoss ? 'boss-level' : ''
              }`}
              style={{ backgroundColor: getThemeColor(level.theme) }}
              title={`Level ${level.level}: ${level.theme}, ${level.monsterCount} monsters${
                level.hasBoss ? ', BOSS' : ''
              }`}
            >
              <span className="level-num">{level.level}</span>
              {level.hasBoss && <span className="boss-marker">👹</span>}
            </div>
          ))}
        </div>
      )}

      <div className="global-multipliers">
        <span>XP: {summary.global.xpMultiplier}x</span>
        <span>Gold: {summary.global.goldMultiplier}x</span>
        <span>Density: {summary.global.monsterDensityMultiplier}x</span>
      </div>
    </div>
  );
};

/**
 * Stats Panel - quick statistics overview
 */
const StatsPanel = () => {
  const [stats, setStats] = useState({
    events: 0,
    quests: 0,
    completed: 0,
  });

  useEffect(() => {
    const updateStats = () => {
      setStats({
        events: gameEventEmitter.getStats().totalReceived,
        quests: questTriggerSystem.getActiveQuests().length,
        completed: questTriggerSystem.getCompletedQuests().length,
      });
    };

    const unsub = gameEventEmitter.on('*', updateStats);
    updateStats();
    const interval = setInterval(updateStats, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-value">{stats.events}</span>
        <span className="stat-label">Events</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{stats.quests}</span>
        <span className="stat-label">Active</span>
      </div>
      <div className="stat-item">
        <span className="stat-value">{stats.completed}</span>
        <span className="stat-label">Done</span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * AI Debug Panel - Main container
 */
export const AIDebugPanel = ({ isOpen, onClose, position = 'right' }) => {
  const [activeTab, setActiveTab] = useState('events');
  const [isMinimized, setIsMinimized] = useState(false);

  const tabs = [
    { id: 'events', label: '📜 Events', component: EventLogPanel },
    { id: 'quests', label: '📋 Quests', component: QuestStatusPanel },
    { id: 'pipeline', label: '🔄 Pipeline', component: PipelineStatusPanel },
    { id: 'config', label: '🏰 Config', component: DungeonConfigPanel },
  ];

  if (!isOpen) return null;

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || EventLogPanel;

  return (
    <div className={`ai-debug-panel ${position} ${isMinimized ? 'minimized' : ''}`}>
      <div className="panel-header">
        <h2>🤖 AI Debug</h2>
        <div className="header-controls">
          <button
            className="minimize-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '⬆' : '⬇'}
          </button>
          <button className="close-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          <StatsPanel />

          <div className="tab-bar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="panel-content">
            <ActiveComponent />
          </div>
        </>
      )}
    </div>
  );
};

/**
 * Debug Panel Toggle Button
 */
export const AIDebugButton = ({ onClick, isActive }) => {
  return (
    <button
      className={`ai-debug-button ${isActive ? 'active' : ''}`}
      onClick={onClick}
      title="Toggle AI Debug Panel"
    >
      🤖
    </button>
  );
};

export default AIDebugPanel;
