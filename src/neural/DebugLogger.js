/**
 * DebugLogger - Comprehensive logging for AI-to-Game pipeline
 *
 * Provides detailed tracing of:
 * - Campaign generation and level creation
 * - DUN file conversion
 * - MPQ building and file injection
 * - Game loading and MPQ source verification
 * - WASM initialization and DApi calls
 * - Runtime level injection
 *
 * All logs are stored in memory and can be exported for debugging.
 */

// Log categories
export const LogCategory = {
  CAMPAIGN: 'campaign',
  LEVEL_GEN: 'level_gen',
  DUN: 'dun',
  MPQ: 'mpq',
  GAME_LOAD: 'game_load',
  WASM: 'wasm',
  DAPI: 'dapi',
  INJECTION: 'injection',
  QUEST: 'quest',
  EVENT: 'event',
  ERROR: 'error',
  AI_PROVIDER: 'ai_provider',
  PROGRESS: 'progress',
};

// Log levels
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Colors for console output
const CATEGORY_COLORS = {
  [LogCategory.CAMPAIGN]: '#4CAF50',
  [LogCategory.LEVEL_GEN]: '#2196F3',
  [LogCategory.DUN]: '#9C27B0',
  [LogCategory.MPQ]: '#FF9800',
  [LogCategory.GAME_LOAD]: '#00BCD4',
  [LogCategory.WASM]: '#E91E63',
  [LogCategory.DAPI]: '#FF5722',
  [LogCategory.INJECTION]: '#795548',
  [LogCategory.QUEST]: '#607D8B',
  [LogCategory.EVENT]: '#009688',
  [LogCategory.ERROR]: '#F44336',
  [LogCategory.AI_PROVIDER]: '#FFD700',  // Gold for AI calls - makes them stand out
  [LogCategory.PROGRESS]: '#00E5FF',      // Cyan for progress updates
};

class DebugLogger {
  constructor() {
    this.logs = [];
    this.enabled = true;
    this.minLevel = LogLevel.DEBUG;
    this.maxLogs = 10000;
    this.sessionId = Date.now().toString(36);
    this.startTime = Date.now();

    // Category-specific counters
    this.counters = {};
    Object.values(LogCategory).forEach(cat => {
      this.counters[cat] = 0;
    });

    // Pipeline state tracking
    this.pipelineState = {
      campaignName: null,
      campaignLevels: [],
      dunFilesCreated: [],
      mpqFilesInjected: [],
      mpqBuildResult: null,
      gameLoadSource: null,
      wasmInitialized: false,
      dapiCallCount: 0,
      dapiCalls: [],
      injectionAttempts: [],
    };
  }

  /**
   * Core logging method
   */
  log(category, level, message, data = null) {
    if (!this.enabled || level < this.minLevel) return;

    const timestamp = Date.now();
    const elapsed = timestamp - this.startTime;

    const entry = {
      timestamp,
      elapsed,
      category,
      level,
      message,
      data,
      id: this.logs.length,
    };

    this.logs.push(entry);
    this.counters[category]++;

    // Trim old logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs / 2);
    }

    // Console output with styling
    const levelName = Object.keys(LogLevel).find(k => LogLevel[k] === level) || 'INFO';
    const color = CATEGORY_COLORS[category] || '#888';
    const prefix = `[${category.toUpperCase()}]`;

    const consoleArgs = [
      `%c${prefix}%c [${elapsed}ms] ${message}`,
      `color: ${color}; font-weight: bold`,
      'color: inherit',
    ];

    if (data !== null && data !== undefined) {
      consoleArgs.push(data);
    }

    switch (level) {
      case LogLevel.ERROR:
        console.error(...consoleArgs);
        break;
      case LogLevel.WARN:
        console.warn(...consoleArgs);
        break;
      case LogLevel.DEBUG:
        console.debug(...consoleArgs);
        break;
      default:
        console.log(...consoleArgs);
    }

    return entry;
  }

  // Convenience methods
  debug(category, message, data) {
    return this.log(category, LogLevel.DEBUG, message, data);
  }

  info(category, message, data) {
    return this.log(category, LogLevel.INFO, message, data);
  }

  warn(category, message, data) {
    return this.log(category, LogLevel.WARN, message, data);
  }

  error(category, message, data) {
    return this.log(category, LogLevel.ERROR, message, data);
  }

  // ============================================================================
  // CAMPAIGN LOGGING
  // ============================================================================

  logCampaignStart(campaign) {
    this.pipelineState.campaignName = campaign.name;
    this.pipelineState.campaignLevels = [];

    this.info(LogCategory.CAMPAIGN, `Campaign generation started: "${campaign.name}"`, {
      acts: campaign.acts?.length || 0,
      template: campaign.template,
      theme: campaign.theme,
    });
  }

  logCampaignLevel(level, actIndex, levelIndex) {
    const levelInfo = {
      name: level.name,
      actIndex,
      levelIndex,
      gridSize: level.grid ? `${level.grid[0]?.length}x${level.grid.length}` : 'no grid',
      spawns: level.spawns?.length || 0,
      objects: level.objects?.length || 0,
      hasStairsUp: !!level.stairsUp,
      hasStairsDown: !!level.stairsDown,
    };

    this.pipelineState.campaignLevels.push(levelInfo);

    this.info(LogCategory.LEVEL_GEN, `Level ${levelIndex}: "${level.name}"`, levelInfo);
  }

  logCampaignComplete(campaign) {
    this.info(LogCategory.CAMPAIGN, `Campaign generation complete`, {
      name: campaign.name,
      totalLevels: this.pipelineState.campaignLevels.length,
      levels: this.pipelineState.campaignLevels,
    });
  }

  // ============================================================================
  // DUN FILE LOGGING
  // ============================================================================

  logDunConversion(level, path, dunData) {
    const dunInfo = {
      path,
      width: dunData.width,
      height: dunData.height,
      hasTiles: !!dunData.baseTiles,
      hasMonsters: dunData.monsters?.length || 0,
      hasObjects: dunData.objects?.length || 0,
    };

    this.pipelineState.dunFilesCreated.push(dunInfo);

    this.info(LogCategory.DUN, `DUN file created: ${path}`, dunInfo);
  }

  logDunValidation(path, validation) {
    const status = validation.valid ? 'VALID' : 'INVALID';
    this.log(
      LogCategory.DUN,
      validation.valid ? LogLevel.INFO : LogLevel.WARN,
      `DUN validation ${status}: ${path}`,
      {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        stats: validation.stats,
      }
    );
  }

  // ============================================================================
  // MPQ LOGGING
  // ============================================================================

  logMpqStart(originalSize) {
    this.pipelineState.mpqFilesInjected = [];
    this.info(LogCategory.MPQ, `MPQ build started`, { originalSize });
  }

  logMpqFileInject(path, size, compressed) {
    const fileInfo = { path, size, compressed };
    this.pipelineState.mpqFilesInjected.push(fileInfo);

    this.info(LogCategory.MPQ, `File injected: ${path}`, {
      size,
      compressed,
      compressionRatio: compressed ? `${Math.round(compressed / size * 100)}%` : 'N/A',
    });
  }

  logMpqBuild(result) {
    this.pipelineState.mpqBuildResult = result;

    this.info(LogCategory.MPQ, `MPQ build complete`, {
      totalSize: result.totalSize,
      filesModified: result.filesModified,
      hashTableOffset: result.hashTableOffset,
      blockTableOffset: result.blockTableOffset,
    });
  }

  // ============================================================================
  // GAME LOAD LOGGING
  // ============================================================================

  logGameLoadStart(options) {
    this.info(LogCategory.GAME_LOAD, `Game loading started`, options);
  }

  logMpqSource(source, size, isModded) {
    this.pipelineState.gameLoadSource = { source, size, isModded };

    const level = isModded ? LogLevel.INFO : LogLevel.WARN;
    this.log(LogCategory.GAME_LOAD, level, `MPQ source: ${source}`, {
      size,
      isModded,
      expectedSizes: isModded ? 'N/A (modded)' : [50274091, 25830791],
    });
  }

  logGameLoadComplete() {
    this.info(LogCategory.GAME_LOAD, `Game loaded successfully`, {
      source: this.pipelineState.gameLoadSource,
    });
  }

  // ============================================================================
  // WASM LOGGING
  // ============================================================================

  logWasmInit(exports) {
    this.pipelineState.wasmInitialized = true;

    this.info(LogCategory.WASM, `WASM initialized`, {
      totalExports: exports.length,
      dapiExports: exports.filter(e => e.includes('DApi')).length,
    });
  }

  logWasmExports(exports) {
    const dapiExports = exports.filter(e => e.includes('DApi'));

    this.debug(LogCategory.WASM, `WASM exports discovered`, {
      total: exports.length,
      dapi: dapiExports.length,
      dapiList: dapiExports,
    });
  }

  // ============================================================================
  // DApi LOGGING
  // ============================================================================

  logDapiCall(funcName, args, result, success = true) {
    this.pipelineState.dapiCallCount++;

    const callInfo = {
      funcName,
      args,
      result,
      success,
      callNumber: this.pipelineState.dapiCallCount,
    };

    this.pipelineState.dapiCalls.push(callInfo);

    // Keep only last 100 DApi calls
    if (this.pipelineState.dapiCalls.length > 100) {
      this.pipelineState.dapiCalls = this.pipelineState.dapiCalls.slice(-100);
    }

    const level = success ? LogLevel.DEBUG : LogLevel.ERROR;
    this.log(LogCategory.DAPI, level, `${funcName}(${JSON.stringify(args)}) => ${JSON.stringify(result)}`, callInfo);
  }

  logDapiProbe(available, exports) {
    this.info(LogCategory.DAPI, `DApi probe result`, {
      available,
      exportCount: exports.length,
      exports,
    });
  }

  // ============================================================================
  // INJECTION LOGGING
  // ============================================================================

  logInjectionAttempt(levelId, method, data) {
    const attemptInfo = {
      levelId,
      method,
      timestamp: Date.now(),
      gridSize: data.grid ? `${data.grid[0]?.length}x${data.grid.length}` : null,
      monsters: data.monsters?.length || 0,
      objects: data.objects?.length || 0,
    };

    this.pipelineState.injectionAttempts.push(attemptInfo);

    this.info(LogCategory.INJECTION, `Injection attempt: Level ${levelId} via ${method}`, attemptInfo);
  }

  logInjectionResult(levelId, success, details) {
    const level = success ? LogLevel.INFO : LogLevel.ERROR;
    this.log(LogCategory.INJECTION, level, `Injection ${success ? 'SUCCESS' : 'FAILED'}: Level ${levelId}`, details);
  }

  logMemoryScan(success, pointer, stats) {
    const level = success ? LogLevel.INFO : LogLevel.WARN;
    this.log(LogCategory.INJECTION, level, `Memory scan ${success ? 'found' : 'failed'}`, {
      success,
      pointer,
      stats,
    });
  }

  // ============================================================================
  // EXPORT & UTILITY
  // ============================================================================

  /**
   * Get summary of pipeline state
   */
  getPipelineSummary() {
    return {
      sessionId: this.sessionId,
      elapsed: Date.now() - this.startTime,
      ...this.pipelineState,
      logCounts: { ...this.counters },
      totalLogs: this.logs.length,
    };
  }

  /**
   * Export all logs as JSON
   */
  exportLogs() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      exportTime: Date.now(),
      pipelineState: this.pipelineState,
      counters: this.counters,
      logs: this.logs,
    };
  }

  /**
   * Export logs as downloadable file
   */
  downloadLogs() {
    const data = this.exportLogs();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diablowebai-debug-${this.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Clear logs
   */
  clear() {
    this.logs = [];
    this.startTime = Date.now();
    Object.values(LogCategory).forEach(cat => {
      this.counters[cat] = 0;
    });
    this.pipelineState = {
      campaignName: null,
      campaignLevels: [],
      dunFilesCreated: [],
      mpqFilesInjected: [],
      mpqBuildResult: null,
      gameLoadSource: null,
      wasmInitialized: false,
      dapiCallCount: 0,
      dapiCalls: [],
      injectionAttempts: [],
    };
  }

  /**
   * Get logs filtered by category
   */
  getLogsByCategory(category) {
    return this.logs.filter(l => l.category === category);
  }

  /**
   * Get error logs
   */
  getErrors() {
    return this.logs.filter(l => l.level === LogLevel.ERROR);
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const summary = this.getPipelineSummary();

    console.group('%c[DEBUG SUMMARY]', 'color: #FF5722; font-weight: bold; font-size: 14px');

    console.log('%cSession:', 'font-weight: bold', summary.sessionId);
    console.log('%cElapsed:', 'font-weight: bold', `${summary.elapsed}ms`);

    console.group('Campaign');
    console.log('Name:', summary.campaignName || 'None');
    console.log('Levels:', summary.campaignLevels.length);
    console.table(summary.campaignLevels);
    console.groupEnd();

    console.group('DUN Files');
    console.log('Created:', summary.dunFilesCreated.length);
    console.table(summary.dunFilesCreated);
    console.groupEnd();

    console.group('MPQ');
    console.log('Files Injected:', summary.mpqFilesInjected.length);
    console.table(summary.mpqFilesInjected);
    console.log('Build Result:', summary.mpqBuildResult);
    console.groupEnd();

    console.group('Game Load');
    console.log('Source:', summary.gameLoadSource);
    console.groupEnd();

    console.group('WASM/DApi');
    console.log('Initialized:', summary.wasmInitialized);
    console.log('DApi Calls:', summary.dapiCallCount);
    if (summary.dapiCalls.length > 0) {
      console.table(summary.dapiCalls.slice(-20));
    }
    console.groupEnd();

    console.group('Injection');
    console.log('Attempts:', summary.injectionAttempts.length);
    console.table(summary.injectionAttempts);
    console.groupEnd();

    console.group('Log Counts');
    console.table(summary.logCounts);
    console.groupEnd();

    const errors = this.getErrors();
    if (errors.length > 0) {
      console.group('%cErrors', 'color: red; font-weight: bold');
      errors.forEach(e => console.error(`[${e.category}] ${e.message}`, e.data));
      console.groupEnd();
    }

    console.groupEnd();
  }
}

// Singleton instance
const debugLogger = new DebugLogger();

// Expose to window for console access
if (typeof window !== 'undefined') {
  window.debugLogger = debugLogger;
  window.printDebugSummary = () => debugLogger.printSummary();
  window.downloadDebugLogs = () => debugLogger.downloadLogs();
}

// ============================================================================
// STARTUP BANNER - Prints immediately when this module is loaded
// ============================================================================
(function printStartupBanner() {
  const banner = `
%c╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🎮 DIABLO WEB AI - DEBUG LOGGING SYSTEM ACTIVE                            ║
║                                                                              ║
║   Version: ${new Date().toISOString().split('T')[0]}                                                      ║
║   Session: ${debugLogger.sessionId}                                                    ║
║                                                                              ║
║   Available Commands:                                                        ║
║     window.printDebugSummary()  - Print pipeline summary                     ║
║     window.downloadDebugLogs() - Download full debug log                     ║
║     window.debugLogger         - Access logger directly                      ║
║                                                                              ║
║   Categories Tracked:                                                        ║
║     CAMPAIGN | LEVEL_GEN | DUN | MPQ | GAME_LOAD                            ║
║     WASM | DAPI | INJECTION | QUEST | EVENT | AI_PROVIDER                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;

  console.log(banner, 'color: #4CAF50; font-weight: bold; font-size: 12px; font-family: monospace');

  // Also log a simple confirmation
  console.log('%c[DEBUG LOGGER] ✓ Initialized and ready to capture pipeline events',
    'color: #4CAF50; font-weight: bold; padding: 4px 8px; background: #1a1a1a; border-radius: 4px');

  // Verify we can log
  debugLogger.info(LogCategory.EVENT, 'Debug logging system initialized', {
    sessionId: debugLogger.sessionId,
    categories: Object.keys(LogCategory),
    startTime: new Date(debugLogger.startTime).toISOString(),
  });
})();

export default debugLogger;
export { DebugLogger };
