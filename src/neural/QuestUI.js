/**
 * Quest UI Components
 *
 * React components for quest visualization:
 * - QuestLogPanel: Full quest log with categories
 * - QuestTracker: HUD tracker for active quests
 * - QuestNotification: Toast notifications for quest events
 * - RewardPopup: Reward display when completing quests
 * - DialogueBox: NPC dialogue display
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { QuestStatus, QuestCategory, QuestDifficulty } from './QuestSchema';

// ============================================================================
// QUEST LOG PANEL
// ============================================================================

/**
 * Full quest log panel with tabs and details
 */
export function QuestLogPanel({
  quests = [],
  activeQuestId = null,
  onSelectQuest,
  onAbandonQuest,
  onTrackQuest,
  trackedQuestIds = [],
  className = '',
}) {
  const [activeTab, setActiveTab] = useState('active');
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Filter quests by tab
  const filteredQuests = quests.filter(quest => {
    switch (activeTab) {
      case 'active':
        return quest.status === QuestStatus.ACTIVE;
      case 'available':
        return quest.status === QuestStatus.AVAILABLE;
      case 'completed':
        return quest.status === QuestStatus.COMPLETED;
      case 'all':
      default:
        return true;
    }
  });

  // Group by category
  const questsByCategory = {};
  for (const quest of filteredQuests) {
    const cat = quest.category || QuestCategory.SIDE;
    if (!questsByCategory[cat]) {
      questsByCategory[cat] = [];
    }
    questsByCategory[cat].push(quest);
  }

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleSelectQuest = (quest) => {
    setSelectedQuest(quest);
    if (onSelectQuest) onSelectQuest(quest);
  };

  return (
    <div className={`quest-log-panel ${className}`} style={styles.questLogPanel}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        {['active', 'available', 'completed', 'all'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            <span style={styles.tabCount}>
              ({quests.filter(q => {
                if (tab === 'active') return q.status === QuestStatus.ACTIVE;
                if (tab === 'available') return q.status === QuestStatus.AVAILABLE;
                if (tab === 'completed') return q.status === QuestStatus.COMPLETED;
                return true;
              }).length})
            </span>
          </button>
        ))}
      </div>

      <div style={styles.questLogContent}>
        {/* Quest List */}
        <div style={styles.questList}>
          {Object.entries(questsByCategory).map(([category, categoryQuests]) => (
            <div key={category} style={styles.categorySection}>
              <div
                style={styles.categoryHeader}
                onClick={() => toggleCategory(category)}
              >
                <span style={styles.categoryIcon}>
                  {expandedCategories[category] ? '▼' : '▶'}
                </span>
                <span style={styles.categoryName}>
                  {getCategoryLabel(category)}
                </span>
                <span style={styles.categoryCount}>
                  ({categoryQuests.length})
                </span>
              </div>

              {expandedCategories[category] !== false && (
                <div style={styles.categoryQuests}>
                  {categoryQuests.map(quest => (
                    <QuestListItem
                      key={quest.id}
                      quest={quest}
                      isSelected={selectedQuest?.id === quest.id}
                      isTracked={trackedQuestIds.includes(quest.id)}
                      onClick={() => handleSelectQuest(quest)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {filteredQuests.length === 0 && (
            <div style={styles.emptyState}>
              No quests in this category
            </div>
          )}
        </div>

        {/* Quest Details */}
        <div style={styles.questDetails}>
          {selectedQuest ? (
            <QuestDetails
              quest={selectedQuest}
              isTracked={trackedQuestIds.includes(selectedQuest.id)}
              onTrack={() => onTrackQuest?.(selectedQuest.id)}
              onAbandon={() => onAbandonQuest?.(selectedQuest.id)}
            />
          ) : (
            <div style={styles.noSelection}>
              Select a quest to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Single quest item in list
 */
function QuestListItem({ quest, isSelected, isTracked, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        ...styles.questListItem,
        ...(isSelected ? styles.questListItemSelected : {}),
      }}
    >
      <div style={styles.questItemHeader}>
        <span style={styles.questItemName}>{quest.name}</span>
        {isTracked && <span style={styles.trackedIcon}>📍</span>}
      </div>
      <div style={styles.questItemMeta}>
        <span style={{
          ...styles.difficultyBadge,
          backgroundColor: getDifficultyColor(quest.difficulty),
        }}>
          {quest.difficulty || 'Normal'}
        </span>
        <span style={styles.questLevel}>Lv. {quest.level || 1}</span>
      </div>
      {quest.status === QuestStatus.ACTIVE && (
        <QuestProgressBar
          current={quest.currentStage}
          total={quest.stages?.length || 1}
          mini
        />
      )}
    </div>
  );
}

/**
 * Quest details panel
 */
function QuestDetails({ quest, isTracked, onTrack, onAbandon }) {
  const currentStage = quest.stages?.[quest.currentStage];

  return (
    <div style={styles.detailsContainer}>
      <h2 style={styles.questTitle}>{quest.name}</h2>

      <div style={styles.questMeta}>
        <span style={{
          ...styles.difficultyBadge,
          backgroundColor: getDifficultyColor(quest.difficulty),
        }}>
          {quest.difficulty || 'Normal'}
        </span>
        <span style={styles.categoryBadge}>
          {getCategoryLabel(quest.category)}
        </span>
        <span style={styles.levelBadge}>Level {quest.level || 1}</span>
      </div>

      <p style={styles.questDescription}>{quest.description}</p>

      {quest.status === QuestStatus.ACTIVE && currentStage && (
        <div style={styles.objectiveSection}>
          <h3 style={styles.sectionTitle}>Current Objective</h3>
          <p style={styles.objectiveText}>{currentStage.objective}</p>
          <QuestProgressBar
            current={quest.currentStage}
            total={quest.stages?.length || 1}
            showLabels
          />
        </div>
      )}

      {quest.stages && quest.stages.length > 0 && (
        <div style={styles.stagesSection}>
          <h3 style={styles.sectionTitle}>Quest Stages</h3>
          {quest.stages.map((stage, index) => (
            <div
              key={stage.id || index}
              style={{
                ...styles.stageItem,
                opacity: index > quest.currentStage ? 0.5 : 1,
              }}
            >
              <span style={styles.stageIcon}>
                {index < quest.currentStage ? '✓' :
                 index === quest.currentStage ? '►' : '○'}
              </span>
              <span style={styles.stageName}>
                {index <= quest.currentStage ? stage.objective : '???'}
              </span>
            </div>
          ))}
        </div>
      )}

      {quest.rewards && quest.rewards.hasRewards?.() && (
        <div style={styles.rewardsSection}>
          <h3 style={styles.sectionTitle}>Rewards</h3>
          <RewardsList rewards={quest.rewards} compact />
        </div>
      )}

      <div style={styles.actionButtons}>
        {quest.status === QuestStatus.ACTIVE && (
          <>
            <button
              onClick={onTrack}
              style={{
                ...styles.actionButton,
                ...(isTracked ? styles.activeButton : {}),
              }}
            >
              {isTracked ? 'Untrack' : 'Track Quest'}
            </button>
            <button
              onClick={onAbandon}
              style={{ ...styles.actionButton, ...styles.abandonButton }}
            >
              Abandon Quest
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// QUEST TRACKER (HUD)
// ============================================================================

/**
 * HUD quest tracker for active quests
 */
export function QuestTracker({
  quests = [],
  maxDisplayed = 3,
  onQuestClick,
  position = 'right',
  className = '',
}) {
  const activeQuests = quests
    .filter(q => q.status === QuestStatus.ACTIVE)
    .slice(0, maxDisplayed);

  if (activeQuests.length === 0) return null;

  return (
    <div
      className={`quest-tracker ${className}`}
      style={{
        ...styles.questTracker,
        [position]: '20px',
      }}
    >
      {activeQuests.map(quest => (
        <TrackerItem
          key={quest.id}
          quest={quest}
          onClick={() => onQuestClick?.(quest)}
        />
      ))}
    </div>
  );
}

function TrackerItem({ quest, onClick }) {
  const currentStage = quest.stages?.[quest.currentStage];

  return (
    <div style={styles.trackerItem} onClick={onClick}>
      <div style={styles.trackerHeader}>
        <span style={styles.trackerName}>{quest.name}</span>
      </div>
      {currentStage && (
        <div style={styles.trackerObjective}>
          {currentStage.objective}
        </div>
      )}
      <QuestProgressBar
        current={quest.currentStage}
        total={quest.stages?.length || 1}
        mini
      />
    </div>
  );
}

// ============================================================================
// QUEST NOTIFICATIONS
// ============================================================================

/**
 * Quest notification toast system
 */
export function QuestNotificationContainer({
  notifications = [],
  onDismiss,
  position = 'top-right',
}) {
  return (
    <div style={{
      ...styles.notificationContainer,
      ...getPositionStyle(position),
    }}>
      {notifications.map((notification, index) => (
        <QuestNotification
          key={notification.id || index}
          notification={notification}
          onDismiss={() => onDismiss?.(notification.id)}
        />
      ))}
    </div>
  );
}

function QuestNotification({ notification, onDismiss }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (notification.duration) {
      const timer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(onDismiss, 300);
      }, notification.duration);
      return () => clearTimeout(timer);
    }
  }, [notification.duration, onDismiss]);

  const getIcon = () => {
    switch (notification.type) {
      case 'quest_started': return '📜';
      case 'quest_completed': return '🏆';
      case 'quest_failed': return '❌';
      case 'objective_complete': return '✓';
      case 'quest_updated': return '📝';
      default: return '📢';
    }
  };

  const getColor = () => {
    switch (notification.type) {
      case 'quest_started': return '#4a9eff';
      case 'quest_completed': return '#4aff4a';
      case 'quest_failed': return '#ff4a4a';
      case 'objective_complete': return '#ffcc00';
      default: return '#ffffff';
    }
  };

  return (
    <div
      style={{
        ...styles.notification,
        borderLeftColor: getColor(),
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
      }}
      onClick={onDismiss}
    >
      <span style={styles.notificationIcon}>{getIcon()}</span>
      <div style={styles.notificationContent}>
        <div style={styles.notificationTitle}>{notification.title}</div>
        {notification.message && (
          <div style={styles.notificationMessage}>{notification.message}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// REWARD POPUP
// ============================================================================

/**
 * Reward display popup
 */
export function RewardPopup({
  rewards,
  questName,
  onClose,
  isVisible = true,
}) {
  if (!isVisible || !rewards) return null;

  return (
    <div style={styles.rewardOverlay} onClick={onClose}>
      <div style={styles.rewardPopup} onClick={e => e.stopPropagation()}>
        <div style={styles.rewardHeader}>
          <span style={styles.rewardIcon}>🏆</span>
          <h2 style={styles.rewardTitle}>Quest Complete!</h2>
        </div>

        <div style={styles.rewardQuestName}>{questName}</div>

        <div style={styles.rewardList}>
          <RewardsList rewards={rewards} />
        </div>

        <button style={styles.rewardCloseButton} onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}

function RewardsList({ rewards, compact = false }) {
  const rewardItems = [];

  if (rewards.experience > 0) {
    rewardItems.push({ type: 'xp', label: 'Experience', value: rewards.experience, icon: '⭐' });
  }
  if (rewards.gold > 0) {
    rewardItems.push({ type: 'gold', label: 'Gold', value: rewards.gold, icon: '🪙' });
  }
  if (rewards.items?.length > 0) {
    for (const item of rewards.items) {
      rewardItems.push({ type: 'item', label: item.name || item.itemId, value: item.quantity || 1, icon: '📦' });
    }
  }
  if (rewards.skillPoints > 0) {
    rewardItems.push({ type: 'skill', label: 'Skill Points', value: rewards.skillPoints, icon: '💎' });
  }

  return (
    <div style={compact ? styles.rewardsListCompact : styles.rewardsList}>
      {rewardItems.map((reward, index) => (
        <div key={index} style={compact ? styles.rewardItemCompact : styles.rewardItem}>
          <span style={styles.rewardItemIcon}>{reward.icon}</span>
          <span style={styles.rewardItemLabel}>{reward.label}</span>
          <span style={styles.rewardItemValue}>
            {reward.type === 'item' && reward.value > 1 ? `x${reward.value}` : `+${reward.value}`}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DIALOGUE BOX
// ============================================================================

/**
 * NPC dialogue display
 */
export function DialogueBox({
  nodeData,
  onChoice,
  onAdvance,
  onClose,
  isVisible = true,
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const typewriterRef = useRef(null);

  // Typewriter effect
  useEffect(() => {
    if (!nodeData?.text) return;

    setDisplayedText('');
    setIsTyping(true);

    let index = 0;
    const text = nodeData.text;

    typewriterRef.current = setInterval(() => {
      if (index < text.length) {
        setDisplayedText(text.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typewriterRef.current);
        setIsTyping(false);
      }
    }, 30);

    return () => {
      if (typewriterRef.current) {
        clearInterval(typewriterRef.current);
      }
    };
  }, [nodeData?.text, nodeData?.nodeId]);

  const skipTypewriter = () => {
    if (isTyping) {
      clearInterval(typewriterRef.current);
      setDisplayedText(nodeData.text);
      setIsTyping(false);
    } else if (!nodeData.choices && onAdvance) {
      onAdvance();
    }
  };

  if (!isVisible || !nodeData) return null;

  return (
    <div style={styles.dialogueOverlay}>
      <div style={styles.dialogueBox}>
        {/* Close button */}
        <button style={styles.dialogueClose} onClick={onClose}>×</button>

        {/* Portrait and speaker */}
        <div style={styles.dialogueSpeaker}>
          {nodeData.portrait && (
            <div style={styles.dialoguePortrait}>
              <img src={nodeData.portrait} alt={nodeData.speaker} />
            </div>
          )}
          <span style={styles.dialogueSpeakerName}>{nodeData.speaker}</span>
          {nodeData.emotion && nodeData.emotion !== 'neutral' && (
            <span style={styles.dialogueEmotion}>({nodeData.emotion})</span>
          )}
        </div>

        {/* Text */}
        <div style={styles.dialogueText} onClick={skipTypewriter}>
          {displayedText}
          {isTyping && <span style={styles.dialogueCursor}>▌</span>}
        </div>

        {/* Choices or continue prompt */}
        {!isTyping && (
          <div style={styles.dialogueChoices}>
            {nodeData.choices && nodeData.choices.length > 0 ? (
              nodeData.choices.map((choice, index) => (
                <button
                  key={index}
                  style={styles.dialogueChoice}
                  onClick={() => onChoice?.(choice.index)}
                >
                  <span style={styles.choiceNumber}>{index + 1}.</span>
                  {choice.text}
                </button>
              ))
            ) : nodeData.isEnd ? (
              <button style={styles.dialogueContinue} onClick={onClose}>
                End Conversation
              </button>
            ) : (
              <button style={styles.dialogueContinue} onClick={onAdvance}>
                Continue →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// QUEST PROGRESS BAR
// ============================================================================

function QuestProgressBar({ current, total, mini = false, showLabels = false }) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div style={mini ? styles.progressBarMini : styles.progressBar}>
      <div
        style={{
          ...styles.progressFill,
          width: `${percentage}%`,
        }}
      />
      {showLabels && (
        <span style={styles.progressLabel}>{current} / {total}</span>
      )}
    </div>
  );
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook for managing quest notifications
 */
export function useQuestNotifications(duration = 5000) {
  const [notifications, setNotifications] = useState([]);
  const idCounter = useRef(0);

  const addNotification = useCallback((notification) => {
    const id = ++idCounter.current;
    setNotifications(prev => [...prev, { ...notification, id, duration }]);
    return id;
  }, [duration]);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const questStarted = useCallback((questName) => {
    addNotification({
      type: 'quest_started',
      title: 'New Quest',
      message: questName,
    });
  }, [addNotification]);

  const questCompleted = useCallback((questName) => {
    addNotification({
      type: 'quest_completed',
      title: 'Quest Complete!',
      message: questName,
    });
  }, [addNotification]);

  const objectiveComplete = useCallback((objectiveText) => {
    addNotification({
      type: 'objective_complete',
      title: 'Objective Complete',
      message: objectiveText,
    });
  }, [addNotification]);

  return {
    notifications,
    addNotification,
    removeNotification,
    questStarted,
    questCompleted,
    objectiveComplete,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getCategoryLabel(category) {
  const labels = {
    [QuestCategory.MAIN]: 'Main Quest',
    [QuestCategory.SIDE]: 'Side Quest',
    [QuestCategory.BOUNTY]: 'Bounty',
    [QuestCategory.COLLECTION]: 'Collection',
    [QuestCategory.EXPLORATION]: 'Exploration',
    [QuestCategory.ESCORT]: 'Escort',
    [QuestCategory.DELIVERY]: 'Delivery',
    [QuestCategory.RESCUE]: 'Rescue',
    [QuestCategory.BOSS]: 'Boss Battle',
  };
  return labels[category] || category;
}

function getDifficultyColor(difficulty) {
  const colors = {
    [QuestDifficulty.TUTORIAL]: '#888888',
    [QuestDifficulty.EASY]: '#4aff4a',
    [QuestDifficulty.NORMAL]: '#4a9eff',
    [QuestDifficulty.HARD]: '#ffcc00',
    [QuestDifficulty.LEGENDARY]: '#ff4aff',
  };
  return colors[difficulty] || colors[QuestDifficulty.NORMAL];
}

function getPositionStyle(position) {
  const positions = {
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-center': { top: '20px', left: '50%', transform: 'translateX(-50%)' },
    'bottom-center': { bottom: '20px', left: '50%', transform: 'translateX(-50%)' },
  };
  return positions[position] || positions['top-right'];
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  // Quest Log Panel
  questLogPanel: {
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    borderRadius: '8px',
    border: '1px solid #444',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#fff',
  },
  tabBar: {
    display: 'flex',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderBottom: '1px solid #444',
  },
  tab: {
    flex: 1,
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#fff',
    backgroundColor: 'rgba(74, 158, 255, 0.2)',
    borderBottom: '2px solid #4a9eff',
  },
  tabCount: {
    marginLeft: '4px',
    opacity: 0.7,
    fontSize: '12px',
  },
  questLogContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  questList: {
    width: '40%',
    borderRight: '1px solid #444',
    overflowY: 'auto',
  },
  questDetails: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },

  // Category Section
  categorySection: {
    borderBottom: '1px solid #333',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    cursor: 'pointer',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  categoryIcon: {
    marginRight: '8px',
    fontSize: '10px',
    color: '#888',
  },
  categoryName: {
    flex: 1,
    fontWeight: 'bold',
    color: '#ccc',
  },
  categoryCount: {
    color: '#666',
    fontSize: '12px',
  },
  categoryQuests: {
    padding: '4px 0',
  },

  // Quest List Item
  questListItem: {
    padding: '10px 16px',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    transition: 'all 0.15s',
  },
  questListItemSelected: {
    backgroundColor: 'rgba(74, 158, 255, 0.15)',
    borderLeftColor: '#4a9eff',
  },
  questItemHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  questItemName: {
    flex: 1,
    fontSize: '14px',
  },
  trackedIcon: {
    fontSize: '12px',
  },
  questItemMeta: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  difficultyBadge: {
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '10px',
    textTransform: 'uppercase',
    color: '#000',
  },
  questLevel: {
    fontSize: '12px',
    color: '#888',
  },

  // Quest Details
  detailsContainer: {
    padding: '0',
  },
  questTitle: {
    fontSize: '24px',
    margin: '0 0 12px 0',
    color: '#fff',
  },
  questMeta: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  categoryBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ccc',
  },
  levelBadge: {
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#ccc',
  },
  questDescription: {
    color: '#aaa',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  objectiveSection: {
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(74, 158, 255, 0.3)',
  },
  sectionTitle: {
    fontSize: '14px',
    color: '#888',
    margin: '0 0 8px 0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  objectiveText: {
    color: '#fff',
    marginBottom: '12px',
  },
  stagesSection: {
    marginBottom: '20px',
  },
  stageItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 0',
    color: '#ccc',
  },
  stageIcon: {
    width: '20px',
    textAlign: 'center',
  },
  stageName: {
    fontSize: '14px',
  },
  rewardsSection: {
    marginTop: '20px',
    padding: '12px',
    backgroundColor: 'rgba(255, 204, 0, 0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(255, 204, 0, 0.3)',
  },
  actionButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  actionButton: {
    padding: '10px 20px',
    border: '1px solid #4a9eff',
    backgroundColor: 'transparent',
    color: '#4a9eff',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  },
  activeButton: {
    backgroundColor: '#4a9eff',
    color: '#fff',
  },
  abandonButton: {
    borderColor: '#ff4a4a',
    color: '#ff4a4a',
  },

  // Empty/No Selection
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: '#666',
  },
  noSelection: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
  },

  // Quest Tracker
  questTracker: {
    position: 'fixed',
    top: '100px',
    width: '280px',
    zIndex: 100,
  },
  trackerItem: {
    backgroundColor: 'rgba(20, 20, 30, 0.9)',
    borderRadius: '6px',
    padding: '12px',
    marginBottom: '8px',
    border: '1px solid #444',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  trackerHeader: {
    marginBottom: '4px',
  },
  trackerName: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#fff',
  },
  trackerObjective: {
    fontSize: '12px',
    color: '#aaa',
    marginBottom: '8px',
  },

  // Notifications
  notificationContainer: {
    position: 'fixed',
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    pointerEvents: 'none',
  },
  notification: {
    backgroundColor: 'rgba(20, 20, 30, 0.95)',
    borderRadius: '6px',
    padding: '12px 16px',
    borderLeft: '4px solid #fff',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: '280px',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    transition: 'all 0.3s ease',
    pointerEvents: 'auto',
    cursor: 'pointer',
  },
  notificationIcon: {
    fontSize: '24px',
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '2px',
  },
  notificationMessage: {
    fontSize: '13px',
    color: '#aaa',
  },

  // Reward Popup
  rewardOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  rewardPopup: {
    backgroundColor: 'rgba(30, 30, 40, 0.98)',
    borderRadius: '12px',
    padding: '32px',
    minWidth: '400px',
    maxWidth: '500px',
    border: '2px solid #ffcc00',
    boxShadow: '0 0 40px rgba(255, 204, 0, 0.3)',
    textAlign: 'center',
  },
  rewardHeader: {
    marginBottom: '16px',
  },
  rewardIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '8px',
  },
  rewardTitle: {
    fontSize: '28px',
    color: '#ffcc00',
    margin: 0,
  },
  rewardQuestName: {
    fontSize: '18px',
    color: '#fff',
    marginBottom: '24px',
  },
  rewardList: {
    marginBottom: '24px',
  },
  rewardsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  rewardsListCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  rewardItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
  },
  rewardItemCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  rewardItemIcon: {
    fontSize: '24px',
  },
  rewardItemLabel: {
    flex: 1,
    color: '#ccc',
  },
  rewardItemValue: {
    fontWeight: 'bold',
    color: '#ffcc00',
    fontSize: '18px',
  },
  rewardCloseButton: {
    padding: '14px 32px',
    backgroundColor: '#ffcc00',
    border: 'none',
    borderRadius: '6px',
    color: '#000',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  // Progress Bar
  progressBar: {
    height: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarMini: {
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginTop: '6px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4a9eff',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '10px',
    color: '#fff',
  },

  // Dialogue Box
  dialogueOverlay: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1500,
    pointerEvents: 'none',
  },
  dialogueBox: {
    backgroundColor: 'rgba(20, 20, 30, 0.98)',
    borderRadius: '12px',
    padding: '20px',
    maxWidth: '800px',
    width: '100%',
    border: '2px solid #4a9eff',
    boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
    position: 'relative',
    pointerEvents: 'auto',
  },
  dialogueClose: {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '28px',
    height: '28px',
    border: 'none',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    color: '#888',
    fontSize: '18px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  dialogueSpeaker: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  dialoguePortrait: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '2px solid #444',
  },
  dialogueSpeakerName: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#4a9eff',
  },
  dialogueEmotion: {
    fontSize: '14px',
    color: '#888',
    fontStyle: 'italic',
  },
  dialogueText: {
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#fff',
    minHeight: '60px',
    cursor: 'pointer',
  },
  dialogueCursor: {
    animation: 'blink 0.7s infinite',
    color: '#4a9eff',
  },
  dialogueChoices: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  dialogueChoice: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    border: '1px solid rgba(74, 158, 255, 0.3)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s',
  },
  choiceNumber: {
    color: '#4a9eff',
    fontWeight: 'bold',
  },
  dialogueContinue: {
    padding: '12px 24px',
    backgroundColor: '#4a9eff',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    alignSelf: 'flex-end',
  },
};

export default {
  QuestLogPanel,
  QuestTracker,
  QuestNotificationContainer,
  RewardPopup,
  DialogueBox,
  useQuestNotifications,
};
