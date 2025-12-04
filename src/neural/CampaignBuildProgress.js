/**
 * Campaign Build Progress System
 *
 * Provides detailed real-time feedback during AI campaign generation.
 * Shows phase progress, individual task status, and operation logs.
 */

import React, { Component } from 'react';
import { EventEmitter } from 'events';

/**
 * Build status constants
 */
export const BUILD_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  SKIPPED: 'skipped',
  RETRYING: 'retrying',
};

/**
 * Build phases with descriptions
 */
export const BUILD_PHASES = {
  INIT: {
    id: 'init',
    name: 'Initialization',
    description: 'Preparing campaign build environment',
    icon: '...',
  },
  STORY: {
    id: 'story',
    name: 'Story Generation',
    description: 'Creating narrative structure and plot points',
    icon: '...',
  },
  WORLD: {
    id: 'world',
    name: 'World Building',
    description: 'Generating locations and dungeon layouts',
    icon: '...',
  },
  CHARACTERS: {
    id: 'characters',
    name: 'Character Creation',
    description: 'Populating world with NPCs, enemies, and bosses',
    icon: '...',
  },
  QUESTS: {
    id: 'quests',
    name: 'Quest Design',
    description: 'Creating quest objectives and triggers',
    icon: '...',
  },
  LEVELS: {
    id: 'levels',
    name: 'Level Generation',
    description: 'Building dungeon layouts and placing objects',
    icon: '...',
  },
  ASSETS: {
    id: 'assets',
    name: 'Asset Resolution',
    description: 'Resolving or generating custom graphics',
    icon: '...',
  },
  VALIDATION: {
    id: 'validation',
    name: 'Validation',
    description: 'Verifying campaign completeness and playability',
    icon: '...',
  },
};

/**
 * BuildProgressEmitter - Event emitter for build progress updates
 */
export class BuildProgressEmitter extends EventEmitter {
  constructor() {
    super();
    this.status = BUILD_STATUS.IDLE;
    this.currentPhase = null;
    this.phases = {};
    this.tasks = [];
    this.logs = [];
    this.startTime = null;
    this.endTime = null;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Start a new build
   */
  startBuild(campaignId) {
    this.status = BUILD_STATUS.STARTING;
    this.currentPhase = null;
    this.phases = {};
    this.tasks = [];
    this.logs = [];
    this.startTime = Date.now();
    this.endTime = null;
    this.errors = [];
    this.warnings = [];

    // Initialize all phases as pending
    Object.values(BUILD_PHASES).forEach(phase => {
      this.phases[phase.id] = {
        ...phase,
        status: TASK_STATUS.PENDING,
        progress: 0,
        tasks: [],
        startTime: null,
        endTime: null,
      };
    });

    this.log('info', `Starting campaign build: ${campaignId}`);
    this.emit('buildStart', { campaignId, time: this.startTime });
    this.emit('update', this.getState());
  }

  /**
   * Start a build phase
   */
  startPhase(phaseId) {
    this.status = BUILD_STATUS.IN_PROGRESS;
    this.currentPhase = phaseId;

    if (this.phases[phaseId]) {
      this.phases[phaseId].status = TASK_STATUS.IN_PROGRESS;
      this.phases[phaseId].startTime = Date.now();
    }

    const phase = BUILD_PHASES[phaseId.toUpperCase()] || { name: phaseId };
    this.log('phase', `Starting phase: ${phase.name}`);
    this.emit('phaseStart', { phaseId, phase: this.phases[phaseId] });
    this.emit('update', this.getState());
  }

  /**
   * Update phase progress
   */
  updatePhaseProgress(phaseId, progress, message) {
    if (this.phases[phaseId]) {
      this.phases[phaseId].progress = Math.min(100, Math.max(0, progress));
    }

    if (message) {
      this.log('progress', message);
    }

    this.emit('phaseProgress', { phaseId, progress, message });
    this.emit('update', this.getState());
  }

  /**
   * Complete a phase
   */
  completePhase(phaseId, status = TASK_STATUS.SUCCESS) {
    if (this.phases[phaseId]) {
      this.phases[phaseId].status = status;
      this.phases[phaseId].progress = 100;
      this.phases[phaseId].endTime = Date.now();
    }

    const phase = BUILD_PHASES[phaseId.toUpperCase()] || { name: phaseId };
    const statusText = status === TASK_STATUS.SUCCESS ? 'completed' :
                       status === TASK_STATUS.WARNING ? 'completed with warnings' :
                       status === TASK_STATUS.ERROR ? 'failed' : 'finished';

    this.log(status === TASK_STATUS.ERROR ? 'error' : 'success',
      `Phase ${phase.name} ${statusText}`);

    this.emit('phaseComplete', { phaseId, status, phase: this.phases[phaseId] });
    this.emit('update', this.getState());
  }

  /**
   * Add a task
   */
  addTask(taskId, name, phaseId = null) {
    const task = {
      id: taskId,
      name,
      phaseId: phaseId || this.currentPhase,
      status: TASK_STATUS.PENDING,
      startTime: null,
      endTime: null,
      message: null,
      retries: 0,
    };

    this.tasks.push(task);

    if (task.phaseId && this.phases[task.phaseId]) {
      this.phases[task.phaseId].tasks.push(taskId);
    }

    this.emit('taskAdd', { task });
    this.emit('update', this.getState());
    return taskId;
  }

  /**
   * Start a task
   */
  startTask(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = TASK_STATUS.IN_PROGRESS;
      task.startTime = Date.now();
      this.log('task', `Building: ${task.name}...`);
      this.emit('taskStart', { task });
      this.emit('update', this.getState());
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId, status = TASK_STATUS.SUCCESS, message = null) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      task.endTime = Date.now();
      task.message = message;

      const duration = task.endTime - task.startTime;
      const statusIcon = status === TASK_STATUS.SUCCESS ? '[OK]' :
                         status === TASK_STATUS.WARNING ? '[WARN]' :
                         status === TASK_STATUS.ERROR ? '[FAIL]' :
                         status === TASK_STATUS.SKIPPED ? '[SKIP]' : '[?]';

      this.log(
        status === TASK_STATUS.ERROR ? 'error' :
        status === TASK_STATUS.WARNING ? 'warning' : 'success',
        `${statusIcon} ${task.name} (${duration}ms)${message ? ': ' + message : ''}`
      );

      if (status === TASK_STATUS.ERROR) {
        this.errors.push({ taskId, message, time: Date.now() });
      } else if (status === TASK_STATUS.WARNING) {
        this.warnings.push({ taskId, message, time: Date.now() });
      }

      this.emit('taskComplete', { task, status, message });
      this.emit('update', this.getState());
    }
  }

  /**
   * Retry a task
   */
  retryTask(taskId, reason) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = TASK_STATUS.RETRYING;
      task.retries++;
      this.log('warning', `Retrying: ${task.name} (attempt ${task.retries + 1}) - ${reason}`);
      this.emit('taskRetry', { task, reason });
      this.emit('update', this.getState());
    }
  }

  /**
   * Complete the build
   */
  completeBuild(success = true, summary = null) {
    this.status = success ? BUILD_STATUS.COMPLETED : BUILD_STATUS.FAILED;
    this.endTime = Date.now();
    const duration = this.endTime - this.startTime;

    this.log(success ? 'success' : 'error',
      `Build ${success ? 'completed' : 'failed'} in ${(duration / 1000).toFixed(1)}s`);

    if (summary) {
      this.log('info', `Summary: ${summary}`);
    }

    this.emit('buildComplete', {
      success,
      summary,
      duration,
      errors: this.errors,
      warnings: this.warnings,
    });
    this.emit('update', this.getState());
  }

  /**
   * Cancel the build
   */
  cancelBuild(reason) {
    this.status = BUILD_STATUS.CANCELLED;
    this.endTime = Date.now();
    this.log('warning', `Build cancelled: ${reason}`);
    this.emit('buildCancel', { reason });
    this.emit('update', this.getState());
  }

  /**
   * Add a log entry
   */
  log(level, message) {
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      level,
      message,
      time: Date.now(),
      phase: this.currentPhase,
    };
    this.logs.push(entry);

    // Keep only last 200 logs
    if (this.logs.length > 200) {
      this.logs = this.logs.slice(-200);
    }

    this.emit('log', entry);
  }

  /**
   * Get current state
   */
  getState() {
    return {
      status: this.status,
      currentPhase: this.currentPhase,
      phases: { ...this.phases },
      tasks: [...this.tasks],
      logs: [...this.logs],
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? this.endTime - this.startTime :
                this.startTime ? Date.now() - this.startTime : 0,
      errors: [...this.errors],
      warnings: [...this.warnings],
      progress: this.calculateOverallProgress(),
    };
  }

  /**
   * Calculate overall progress
   */
  calculateOverallProgress() {
    const phaseIds = Object.keys(this.phases);
    if (phaseIds.length === 0) return 0;

    const totalProgress = phaseIds.reduce((sum, id) => {
      return sum + (this.phases[id].progress || 0);
    }, 0);

    return Math.round(totalProgress / phaseIds.length);
  }

  /**
   * Reset state
   */
  reset() {
    this.status = BUILD_STATUS.IDLE;
    this.currentPhase = null;
    this.phases = {};
    this.tasks = [];
    this.logs = [];
    this.startTime = null;
    this.endTime = null;
    this.errors = [];
    this.warnings = [];
    this.emit('reset');
    this.emit('update', this.getState());
  }
}

// Singleton instance
export const buildProgress = new BuildProgressEmitter();

/**
 * BuildProgressPanel - React component for displaying build progress
 */
export class BuildProgressPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...buildProgress.getState(),
      expanded: true,
      showLogs: true,
      autoScroll: true,
    };
    this.logEndRef = React.createRef();
  }

  componentDidMount() {
    buildProgress.on('update', this.handleUpdate);
  }

  componentWillUnmount() {
    buildProgress.off('update', this.handleUpdate);
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.state.autoScroll && this.logEndRef.current) {
      this.logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }

  handleUpdate = (state) => {
    this.setState(state);
  };

  getStatusIcon(status) {
    switch (status) {
      case TASK_STATUS.PENDING: return '○';
      case TASK_STATUS.IN_PROGRESS: return '◐';
      case TASK_STATUS.SUCCESS: return '●';
      case TASK_STATUS.WARNING: return '◑';
      case TASK_STATUS.ERROR: return '✗';
      case TASK_STATUS.SKIPPED: return '○';
      case TASK_STATUS.RETRYING: return '↻';
      default: return '○';
    }
  }

  getStatusClass(status) {
    switch (status) {
      case TASK_STATUS.PENDING: return 'pending';
      case TASK_STATUS.IN_PROGRESS: return 'in-progress';
      case TASK_STATUS.SUCCESS: return 'success';
      case TASK_STATUS.WARNING: return 'warning';
      case TASK_STATUS.ERROR: return 'error';
      case TASK_STATUS.SKIPPED: return 'skipped';
      case TASK_STATUS.RETRYING: return 'retrying';
      default: return '';
    }
  }

  getLogIcon(level) {
    switch (level) {
      case 'info': return 'i';
      case 'success': return '✓';
      case 'warning': return '!';
      case 'error': return '✗';
      case 'phase': return '▸';
      case 'task': return '·';
      case 'progress': return '→';
      default: return '·';
    }
  }

  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  }

  render() {
    const {
      status,
      currentPhase,
      phases,
      tasks,
      logs,
      progress,
      duration,
      errors,
      warnings,
      expanded,
      showLogs,
    } = this.state;

    const phaseOrder = ['init', 'story', 'world', 'characters', 'quests', 'levels', 'assets', 'validation'];

    return (
      <div className={`build-progress-panel ${status}`}>
        {/* Header */}
        <div
          className="progress-header"
          onClick={() => this.setState({ expanded: !expanded })}
        >
          <span className="header-icon">{expanded ? '▼' : '▶'}</span>
          <span className="header-title">Build Progress</span>
          <span className={`header-status status-${status}`}>{status}</span>
          {status === BUILD_STATUS.IN_PROGRESS && (
            <span className="header-progress">{progress}%</span>
          )}
          {duration > 0 && (
            <span className="header-duration">{this.formatTime(duration)}</span>
          )}
        </div>

        {expanded && (
          <div className="progress-content">
            {/* Overall Progress Bar */}
            <div className="overall-progress">
              <div
                className="progress-bar"
                style={{ width: `${progress}%` }}
              />
              <span className="progress-text">{progress}% Complete</span>
            </div>

            {/* Phases */}
            <div className="phases-list">
              {phaseOrder.map(phaseId => {
                const phase = phases[phaseId];
                if (!phase) return null;

                const isActive = currentPhase === phaseId;
                const phaseTasks = tasks.filter(t => t.phaseId === phaseId);

                return (
                  <div
                    key={phaseId}
                    className={`phase-item ${this.getStatusClass(phase.status)} ${isActive ? 'active' : ''}`}
                  >
                    <div className="phase-header">
                      <span className="phase-icon">
                        {this.getStatusIcon(phase.status)}
                      </span>
                      <span className="phase-name">{phase.name}</span>
                      <span className="phase-progress">
                        {phase.status === TASK_STATUS.IN_PROGRESS && `${phase.progress}%`}
                        {phase.status === TASK_STATUS.SUCCESS && '✓'}
                        {phase.status === TASK_STATUS.ERROR && '✗'}
                      </span>
                    </div>

                    {/* Phase Tasks */}
                    {isActive && phaseTasks.length > 0 && (
                      <div className="phase-tasks">
                        {phaseTasks.slice(-5).map(task => (
                          <div
                            key={task.id}
                            className={`task-item ${this.getStatusClass(task.status)}`}
                          >
                            <span className="task-icon">
                              {this.getStatusIcon(task.status)}
                            </span>
                            <span className="task-name">{task.name}</span>
                            {task.retries > 0 && (
                              <span className="task-retries">
                                (retry {task.retries})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Errors and Warnings Summary */}
            {(errors.length > 0 || warnings.length > 0) && (
              <div className="issues-summary">
                {errors.length > 0 && (
                  <span className="error-count">
                    {errors.length} error{errors.length !== 1 ? 's' : ''}
                  </span>
                )}
                {warnings.length > 0 && (
                  <span className="warning-count">
                    {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Logs */}
            <div className="logs-section">
              <div
                className="logs-header"
                onClick={() => this.setState({ showLogs: !showLogs })}
              >
                <span>{showLogs ? '▼' : '▶'} Build Log</span>
                <label
                  className="auto-scroll"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={this.state.autoScroll}
                    onChange={e => this.setState({ autoScroll: e.target.checked })}
                  />
                  Auto-scroll
                </label>
              </div>

              {showLogs && (
                <div className="logs-list">
                  {logs.slice(-50).map(log => (
                    <div
                      key={log.id}
                      className={`log-entry log-${log.level}`}
                    >
                      <span className="log-icon">{this.getLogIcon(log.level)}</span>
                      <span className="log-message">{log.message}</span>
                    </div>
                  ))}
                  <div ref={this.logEndRef} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}

/**
 * Compact inline progress indicator
 */
export function BuildProgressIndicator({ className = '' }) {
  const [state, setState] = React.useState(buildProgress.getState());

  React.useEffect(() => {
    const handleUpdate = (newState) => setState(newState);
    buildProgress.on('update', handleUpdate);
    return () => buildProgress.off('update', handleUpdate);
  }, []);

  if (state.status === BUILD_STATUS.IDLE) {
    return null;
  }

  const currentPhaseInfo = state.currentPhase ?
    BUILD_PHASES[state.currentPhase.toUpperCase()] : null;

  return (
    <div className={`build-progress-indicator ${state.status} ${className}`}>
      <span className="indicator-status">
        {state.status === BUILD_STATUS.IN_PROGRESS && '◐'}
        {state.status === BUILD_STATUS.COMPLETED && '●'}
        {state.status === BUILD_STATUS.FAILED && '✗'}
      </span>
      {currentPhaseInfo && (
        <span className="indicator-phase">{currentPhaseInfo.name}</span>
      )}
      <span className="indicator-progress">{state.progress}%</span>
    </div>
  );
}

export default BuildProgressPanel;
