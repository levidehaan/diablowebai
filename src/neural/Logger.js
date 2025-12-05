/**
 * Logger System
 *
 * Comprehensive logging utility for the Neural Augmentation system:
 * - Multiple log levels (debug, info, warn, error)
 * - Categorized logging by module
 * - Performance timing
 * - Log history with filtering
 * - Console formatting with colors
 * - Log export for debugging
 */

// ============================================================================
// LOG LEVELS
// ============================================================================

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
};

const LOG_LEVEL_NAMES = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LOG_LEVEL_COLORS = {
  [LogLevel.DEBUG]: '#888888',
  [LogLevel.INFO]: '#4a9eff',
  [LogLevel.WARN]: '#ffcc00',
  [LogLevel.ERROR]: '#ff4444',
};

// ============================================================================
// LOG ENTRY
// ============================================================================

/**
 * Single log entry
 */
export class LogEntry {
  constructor(level, category, message, data = null) {
    this.id = Date.now() + Math.random();
    this.timestamp = Date.now();
    this.level = level;
    this.category = category;
    this.message = message;
    this.data = data;
  }

  /**
   * Format timestamp
   */
  getFormattedTime() {
    const date = new Date(this.timestamp);
    return date.toISOString().split('T')[1].slice(0, -1);
  }

  /**
   * Get level name
   */
  getLevelName() {
    return LOG_LEVEL_NAMES[this.level] || 'UNKNOWN';
  }

  /**
   * Format for console
   */
  toConsoleArgs() {
    const time = this.getFormattedTime();
    const level = this.getLevelName().padEnd(5);
    const color = LOG_LEVEL_COLORS[this.level];

    const args = [
      `%c${time} %c[${level}] %c[${this.category}] %c${this.message}`,
      'color: #666',
      `color: ${color}; font-weight: bold`,
      'color: #888',
      'color: inherit',
    ];

    if (this.data !== null && this.data !== undefined) {
      args.push(this.data);
    }

    return args;
  }

  /**
   * Export as JSON
   */
  toJSON() {
    return {
      timestamp: this.timestamp,
      level: this.getLevelName(),
      category: this.category,
      message: this.message,
      data: this.data,
    };
  }

  /**
   * Export as string
   */
  toString() {
    const time = this.getFormattedTime();
    const level = this.getLevelName().padEnd(5);
    let str = `${time} [${level}] [${this.category}] ${this.message}`;
    if (this.data !== null) {
      str += ` ${JSON.stringify(this.data)}`;
    }
    return str;
  }
}

// ============================================================================
// CATEGORY LOGGER
// ============================================================================

/**
 * Logger for a specific category
 */
export class CategoryLogger {
  constructor(category, parentLogger) {
    this.category = category;
    this.parent = parentLogger;
  }

  debug(message, data = null) {
    this.parent.log(LogLevel.DEBUG, this.category, message, data);
  }

  info(message, data = null) {
    this.parent.log(LogLevel.INFO, this.category, message, data);
  }

  warn(message, data = null) {
    this.parent.log(LogLevel.WARN, this.category, message, data);
  }

  error(message, data = null) {
    this.parent.log(LogLevel.ERROR, this.category, message, data);
  }

  /**
   * Time an operation
   */
  time(label) {
    return this.parent.time(this.category, label);
  }

  /**
   * Group logs
   */
  group(label) {
    console.group(`[${this.category}] ${label}`);
    return () => console.groupEnd();
  }

  /**
   * Create a child logger
   */
  child(subCategory) {
    return new CategoryLogger(`${this.category}:${subCategory}`, this.parent);
  }
}

// ============================================================================
// MAIN LOGGER
// ============================================================================

/**
 * Main Logger class
 */
class Logger {
  constructor() {
    this.level = LogLevel.INFO;
    this.history = [];
    this.maxHistory = 1000;
    this.listeners = [];
    this.timers = new Map();
    this.categoryLoggers = new Map();

    // Category-specific levels
    this.categoryLevels = new Map();

    // Initialize from environment
    this.initFromEnv();
  }

  /**
   * Initialize from environment
   */
  initFromEnv() {
    // Check for debug mode
    if (process.env.NODE_ENV === 'development') {
      this.level = LogLevel.DEBUG;
    }

    // Check localStorage for overrides
    if (typeof localStorage !== 'undefined') {
      const savedLevel = localStorage.getItem('neural_log_level');
      if (savedLevel !== null) {
        this.level = parseInt(savedLevel, 10);
      }
    }
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Set global log level
   */
  setLevel(level) {
    this.level = level;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('neural_log_level', String(level));
    }
    return this;
  }

  /**
   * Set level for specific category
   */
  setCategoryLevel(category, level) {
    this.categoryLevels.set(category, level);
    return this;
  }

  /**
   * Get effective level for category
   */
  getEffectiveLevel(category) {
    // Check for exact match
    if (this.categoryLevels.has(category)) {
      return this.categoryLevels.get(category);
    }

    // Check for parent category
    const parts = category.split(':');
    while (parts.length > 1) {
      parts.pop();
      const parent = parts.join(':');
      if (this.categoryLevels.has(parent)) {
        return this.categoryLevels.get(parent);
      }
    }

    return this.level;
  }

  /**
   * Enable debug mode
   */
  enableDebug() {
    return this.setLevel(LogLevel.DEBUG);
  }

  /**
   * Disable all logging
   */
  silence() {
    return this.setLevel(LogLevel.SILENT);
  }

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  /**
   * Main log method
   */
  log(level, category, message, data = null) {
    const effectiveLevel = this.getEffectiveLevel(category);

    if (level < effectiveLevel) {
      return;
    }

    const entry = new LogEntry(level, category, message, data);

    // Add to history
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Output to console
    this.outputToConsole(entry);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (e) {
        // Ignore listener errors
      }
    }

    return entry;
  }

  /**
   * Output log entry to console
   */
  outputToConsole(entry) {
    const args = entry.toConsoleArgs();

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(...args);
        break;
      case LogLevel.INFO:
        console.info(...args);
        break;
      case LogLevel.WARN:
        console.warn(...args);
        break;
      case LogLevel.ERROR:
        console.error(...args);
        break;
      default:
        console.log(...args);
    }
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  debug(category, message, data = null) {
    return this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category, message, data = null) {
    return this.log(LogLevel.INFO, category, message, data);
  }

  warn(category, message, data = null) {
    return this.log(LogLevel.WARN, category, message, data);
  }

  error(category, message, data = null) {
    return this.log(LogLevel.ERROR, category, message, data);
  }

  // ==========================================================================
  // CATEGORY LOGGERS
  // ==========================================================================

  /**
   * Get or create a category logger
   */
  getLogger(category) {
    if (!this.categoryLoggers.has(category)) {
      this.categoryLoggers.set(category, new CategoryLogger(category, this));
    }
    return this.categoryLoggers.get(category);
  }

  // ==========================================================================
  // PERFORMANCE TIMING
  // ==========================================================================

  /**
   * Start a timer
   */
  time(category, label) {
    const key = `${category}:${label}`;
    const start = performance.now();
    this.timers.set(key, start);

    // Return a function to end the timer
    return () => {
      const end = performance.now();
      const duration = end - start;
      this.timers.delete(key);
      this.debug(category, `${label} completed`, { duration: `${duration.toFixed(2)}ms` });
      return duration;
    };
  }

  /**
   * End a timer by key
   */
  timeEnd(category, label) {
    const key = `${category}:${label}`;
    const start = this.timers.get(key);

    if (!start) {
      this.warn(category, `Timer "${label}" not found`);
      return 0;
    }

    const end = performance.now();
    const duration = end - start;
    this.timers.delete(key);
    this.debug(category, `${label} completed`, { duration: `${duration.toFixed(2)}ms` });
    return duration;
  }

  // ==========================================================================
  // HISTORY & EXPORT
  // ==========================================================================

  /**
   * Get log history
   */
  getHistory(options = {}) {
    let entries = this.history;

    // Filter by level
    if (options.level !== undefined) {
      entries = entries.filter(e => e.level >= options.level);
    }

    // Filter by category
    if (options.category) {
      entries = entries.filter(e =>
        e.category === options.category || e.category.startsWith(`${options.category}:`)
      );
    }

    // Filter by time range
    if (options.since) {
      entries = entries.filter(e => e.timestamp >= options.since);
    }

    // Limit
    if (options.limit) {
      entries = entries.slice(-options.limit);
    }

    return entries;
  }

  /**
   * Export history as JSON
   */
  exportJSON(options = {}) {
    const entries = this.getHistory(options);
    return JSON.stringify(entries.map(e => e.toJSON()), null, 2);
  }

  /**
   * Export history as text
   */
  exportText(options = {}) {
    const entries = this.getHistory(options);
    return entries.map(e => e.toString()).join('\n');
  }

  /**
   * Download logs as file
   */
  download(format = 'json') {
    const content = format === 'json' ? this.exportJSON() : this.exportText();
    const mimeType = format === 'json' ? 'application/json' : 'text/plain';
    const filename = `neural_logs_${Date.now()}.${format === 'json' ? 'json' : 'txt'}`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }

  // ==========================================================================
  // LISTENERS
  // ==========================================================================

  /**
   * Subscribe to log entries
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  // ==========================================================================
  // CONSOLE COMMANDS
  // ==========================================================================

  /**
   * Print help to console
   */
  help() {
    console.log(`
Neural Logger Commands:
-----------------------
logger.setLevel(LogLevel.DEBUG)  - Set log level
logger.enableDebug()             - Enable debug logging
logger.silence()                 - Disable all logging
logger.getLogger('Category')     - Get category logger
logger.getHistory()              - Get log history
logger.download('json')          - Download logs
logger.clearHistory()            - Clear log history

Log Levels:
-----------
LogLevel.DEBUG = 0
LogLevel.INFO = 1
LogLevel.WARN = 2
LogLevel.ERROR = 3
LogLevel.SILENT = 4
    `);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const logger = new Logger();

// ============================================================================
// PRE-CONFIGURED CATEGORY LOGGERS
// ============================================================================

export const loggers = {
  mpq: logger.getLogger('MPQ'),
  quest: logger.getLogger('Quest'),
  dialogue: logger.getLogger('Dialogue'),
  ai: logger.getLogger('AI'),
  wasm: logger.getLogger('WASM'),
  config: logger.getLogger('Config'),
  render: logger.getLogger('Render'),
  event: logger.getLogger('Event'),
  build: logger.getLogger('Build'),
  network: logger.getLogger('Network'),
};

// ============================================================================
// EXPOSE TO WINDOW FOR DEBUGGING
// ============================================================================

if (typeof window !== 'undefined') {
  window.neuralLogger = logger;
  window.LogLevel = LogLevel;
}

export default logger;
