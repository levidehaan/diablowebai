/**
 * Error Boundary Components
 *
 * Comprehensive error handling for the Neural Augmentation system:
 * - React error boundaries for component crashes
 * - Error recovery strategies
 * - User-friendly error displays
 * - Error reporting/logging
 */

import React, { Component } from 'react';

// ============================================================================
// ERROR TYPES
// ============================================================================

export const ErrorType = {
  RENDER: 'render',           // React render error
  ASYNC: 'async',             // Promise/async error
  NETWORK: 'network',         // API/fetch error
  MPQ: 'mpq',                 // MPQ loading/parsing error
  WASM: 'wasm',               // WASM/game engine error
  CONFIG: 'config',           // Configuration error
  VALIDATION: 'validation',   // Data validation error
  UNKNOWN: 'unknown',
};

export const ErrorSeverity = {
  LOW: 'low',           // Informational, continue normally
  MEDIUM: 'medium',     // Degraded functionality
  HIGH: 'high',         // Feature unavailable
  CRITICAL: 'critical', // App crash
};

// ============================================================================
// ERROR INFO CLASS
// ============================================================================

/**
 * Structured error information
 */
export class ErrorInfo {
  constructor(error, type = ErrorType.UNKNOWN, severity = ErrorSeverity.HIGH) {
    this.id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = Date.now();
    this.type = type;
    this.severity = severity;

    // Error details
    if (error instanceof Error) {
      this.name = error.name;
      this.message = error.message;
      this.stack = error.stack;
    } else if (typeof error === 'string') {
      this.name = 'Error';
      this.message = error;
      this.stack = new Error().stack;
    } else {
      this.name = 'UnknownError';
      this.message = String(error);
      this.stack = null;
    }

    // Context
    this.componentStack = null;
    this.context = {};

    // Recovery
    this.recoverable = true;
    this.recoveryAction = null;
  }

  /**
   * Set component stack (from React error boundary)
   */
  setComponentStack(componentStack) {
    this.componentStack = componentStack;
    return this;
  }

  /**
   * Add context information
   */
  addContext(key, value) {
    this.context[key] = value;
    return this;
  }

  /**
   * Set recovery action
   */
  setRecoveryAction(action) {
    this.recoveryAction = action;
    this.recoverable = true;
    return this;
  }

  /**
   * Mark as non-recoverable
   */
  setNonRecoverable() {
    this.recoverable = false;
    this.recoveryAction = null;
    return this;
  }

  /**
   * Get user-friendly message
   */
  getUserMessage() {
    const messages = {
      [ErrorType.MPQ]: 'Failed to load game data. The MPQ file may be corrupted or incompatible.',
      [ErrorType.NETWORK]: 'Network error. Please check your connection and try again.',
      [ErrorType.WASM]: 'Game engine error. Try refreshing the page.',
      [ErrorType.CONFIG]: 'Configuration error. Please check your settings.',
      [ErrorType.VALIDATION]: 'Invalid data encountered. Some features may not work correctly.',
    };

    return messages[this.type] || this.message;
  }

  /**
   * Export for logging
   */
  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      type: this.type,
      severity: this.severity,
      name: this.name,
      message: this.message,
      stack: this.stack,
      componentStack: this.componentStack,
      context: this.context,
      recoverable: this.recoverable,
    };
  }
}

// ============================================================================
// ERROR REPORTER
// ============================================================================

/**
 * Centralized error reporting
 */
class ErrorReporter {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.listeners = [];
    this.reportEndpoint = null;
  }

  /**
   * Report an error
   */
  report(errorInfo) {
    if (!(errorInfo instanceof ErrorInfo)) {
      errorInfo = new ErrorInfo(errorInfo);
    }

    // Add to history
    this.errors.push(errorInfo);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    // Log to console
    this.logToConsole(errorInfo);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(errorInfo);
      } catch (e) {
        console.error('[ErrorReporter] Listener error:', e);
      }
    }

    // Send to reporting endpoint if configured
    if (this.reportEndpoint) {
      this.sendToEndpoint(errorInfo);
    }

    return errorInfo;
  }

  /**
   * Log error to console with formatting
   */
  logToConsole(errorInfo) {
    const style = {
      [ErrorSeverity.LOW]: 'color: #888',
      [ErrorSeverity.MEDIUM]: 'color: #f0ad4e',
      [ErrorSeverity.HIGH]: 'color: #d9534f',
      [ErrorSeverity.CRITICAL]: 'color: #fff; background: #d9534f; padding: 2px 4px',
    };

    console.group(`%c[${errorInfo.severity.toUpperCase()}] ${errorInfo.type}: ${errorInfo.name}`, style[errorInfo.severity]);
    console.error(errorInfo.message);

    if (errorInfo.stack) {
      console.log('%cStack:', 'color: #888');
      console.log(errorInfo.stack);
    }

    if (errorInfo.componentStack) {
      console.log('%cComponent Stack:', 'color: #888');
      console.log(errorInfo.componentStack);
    }

    if (Object.keys(errorInfo.context).length > 0) {
      console.log('%cContext:', 'color: #888');
      console.log(errorInfo.context);
    }

    console.groupEnd();
  }

  /**
   * Send error to reporting endpoint
   */
  async sendToEndpoint(errorInfo) {
    try {
      await fetch(this.reportEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorInfo.toJSON()),
      });
    } catch (e) {
      // Silent fail for error reporting
    }
  }

  /**
   * Subscribe to errors
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 10) {
    return this.errors.slice(-limit);
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type) {
    return this.errors.filter(e => e.type === type);
  }

  /**
   * Clear error history
   */
  clear() {
    this.errors = [];
  }

  /**
   * Configure reporting endpoint
   */
  setEndpoint(url) {
    this.reportEndpoint = url;
  }
}

export const errorReporter = new ErrorReporter();

// ============================================================================
// REACT ERROR BOUNDARY
// ============================================================================

/**
 * React Error Boundary component
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      errorInfo: null,
      isRecovering: false,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, reactErrorInfo) {
    const errorInfo = new ErrorInfo(error, ErrorType.RENDER, ErrorSeverity.HIGH)
      .setComponentStack(reactErrorInfo.componentStack)
      .addContext('component', this.props.name || 'Unknown');

    // Check if recoverable based on error type
    if (this.props.onError) {
      this.props.onError(errorInfo);
    }

    errorReporter.report(errorInfo);

    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorInfo: null, isRecovering: true });

    // Give React time to remount
    setTimeout(() => {
      this.setState({ isRecovering: false });
    }, 100);
  };

  handleDismiss = () => {
    if (this.props.onDismiss) {
      this.props.onDismiss();
    }
  };

  render() {
    if (this.state.isRecovering) {
      return this.props.loadingFallback || null;
    }

    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Render prop for custom error display
      if (this.props.renderError) {
        return this.props.renderError({
          error: this.state.errorInfo,
          retry: this.handleRetry,
          dismiss: this.handleDismiss,
        });
      }

      // Default error display
      return (
        <ErrorDisplay
          error={this.state.errorInfo}
          onRetry={this.handleRetry}
          onDismiss={this.props.dismissable ? this.handleDismiss : null}
          compact={this.props.compact}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// ERROR DISPLAY COMPONENTS
// ============================================================================

/**
 * Default error display component
 */
export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  compact = false,
  showDetails = false,
}) {
  const [detailsVisible, setDetailsVisible] = React.useState(showDetails);

  if (compact) {
    return (
      <div style={styles.errorCompact}>
        <span style={styles.errorIcon}>⚠</span>
        <span style={styles.errorMessage}>{error?.getUserMessage() || 'An error occurred'}</span>
        {onRetry && (
          <button onClick={onRetry} style={styles.retryButtonSmall}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={styles.errorContainer}>
      <div style={styles.errorHeader}>
        <span style={styles.errorIconLarge}>⚠</span>
        <h3 style={styles.errorTitle}>Something went wrong</h3>
      </div>

      <p style={styles.errorDescription}>
        {error?.getUserMessage() || 'An unexpected error occurred. Please try again.'}
      </p>

      <div style={styles.errorActions}>
        {onRetry && (
          <button onClick={onRetry} style={styles.retryButton}>
            Try Again
          </button>
        )}
        {onDismiss && (
          <button onClick={onDismiss} style={styles.dismissButton}>
            Dismiss
          </button>
        )}
      </div>

      {error && (
        <div style={styles.errorDetails}>
          <button
            onClick={() => setDetailsVisible(!detailsVisible)}
            style={styles.detailsToggle}
          >
            {detailsVisible ? '▼' : '▶'} Technical Details
          </button>

          {detailsVisible && (
            <div style={styles.detailsContent}>
              <div style={styles.detailRow}>
                <strong>Error:</strong> {error.name}
              </div>
              <div style={styles.detailRow}>
                <strong>Message:</strong> {error.message}
              </div>
              <div style={styles.detailRow}>
                <strong>Type:</strong> {error.type}
              </div>
              <div style={styles.detailRow}>
                <strong>ID:</strong> {error.id}
              </div>
              {error.stack && (
                <pre style={styles.stackTrace}>{error.stack}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Inline error message
 */
export function ErrorMessage({ message, type = 'error', onDismiss }) {
  const colors = {
    error: { bg: '#ffebee', border: '#f44336', text: '#c62828' },
    warning: { bg: '#fff3e0', border: '#ff9800', text: '#e65100' },
    info: { bg: '#e3f2fd', border: '#2196f3', text: '#1565c0' },
  };

  const style = colors[type] || colors.error;

  return (
    <div style={{
      ...styles.inlineError,
      backgroundColor: style.bg,
      borderColor: style.border,
      color: style.text,
    }}>
      <span>{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={styles.inlineDismiss}>×</button>
      )}
    </div>
  );
}

// ============================================================================
// ERROR HANDLING UTILITIES
// ============================================================================

/**
 * Wrap async function with error handling
 */
export function withErrorHandling(fn, options = {}) {
  const { type = ErrorType.ASYNC, severity = ErrorSeverity.MEDIUM, context = {} } = options;

  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorInfo = new ErrorInfo(error, type, severity);
      for (const [key, value] of Object.entries(context)) {
        errorInfo.addContext(key, value);
      }
      errorReporter.report(errorInfo);

      if (options.rethrow) {
        throw error;
      }

      if (options.fallback !== undefined) {
        return options.fallback;
      }

      return null;
    }
  };
}

/**
 * Create error-safe fetch wrapper
 */
export function safeFetch(url, options = {}) {
  return withErrorHandling(
    async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    },
    {
      type: ErrorType.NETWORK,
      context: { url },
      ...options.errorOptions,
    }
  )();
}

/**
 * MPQ-specific error handler
 */
export function handleMPQError(error, context = {}) {
  const errorInfo = new ErrorInfo(error, ErrorType.MPQ, ErrorSeverity.HIGH);

  // Add helpful context for common errors
  if (error.message.includes('Invalid MPQ')) {
    errorInfo.addContext('suggestion', 'The file may not be a valid MPQ archive');
  } else if (error.message.includes('size')) {
    errorInfo.addContext('suggestion', 'The file may be corrupted or incomplete');
  } else if (error.message.includes('buffer')) {
    errorInfo.addContext('suggestion', 'Memory issue - try refreshing the page');
  }

  for (const [key, value] of Object.entries(context)) {
    errorInfo.addContext(key, value);
  }

  return errorReporter.report(errorInfo);
}

/**
 * WASM-specific error handler
 */
export function handleWASMError(error, context = {}) {
  const errorInfo = new ErrorInfo(error, ErrorType.WASM, ErrorSeverity.CRITICAL);

  if (error.message.includes('memory')) {
    errorInfo.addContext('suggestion', 'Out of memory - try refreshing or closing other tabs');
  } else if (error.message.includes('unreachable')) {
    errorInfo.addContext('suggestion', 'Game engine crashed - page refresh required');
  }

  for (const [key, value] of Object.entries(context)) {
    errorInfo.addContext(key, value);
  }

  errorInfo.setNonRecoverable();

  return errorReporter.report(errorInfo);
}

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  errorContainer: {
    padding: '24px',
    backgroundColor: '#1a1a24',
    borderRadius: '8px',
    border: '1px solid #ff4444',
    maxWidth: '500px',
    margin: '20px auto',
    fontFamily: 'system-ui, sans-serif',
    color: '#fff',
  },
  errorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  errorIconLarge: {
    fontSize: '32px',
  },
  errorTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#ff6b6b',
  },
  errorDescription: {
    color: '#ccc',
    lineHeight: '1.5',
    marginBottom: '20px',
  },
  errorActions: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  retryButton: {
    padding: '10px 20px',
    backgroundColor: '#4a9eff',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
  },
  dismissButton: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid #666',
    borderRadius: '4px',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '14px',
  },
  errorDetails: {
    borderTop: '1px solid #333',
    paddingTop: '12px',
  },
  detailsToggle: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '4px 0',
  },
  detailsContent: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: '4px',
    fontSize: '12px',
  },
  detailRow: {
    marginBottom: '8px',
    color: '#aaa',
  },
  stackTrace: {
    marginTop: '12px',
    padding: '8px',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '10px',
    color: '#888',
    maxHeight: '200px',
  },
  errorCompact: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    border: '1px solid rgba(255, 68, 68, 0.3)',
    borderRadius: '4px',
    color: '#ff6b6b',
    fontSize: '13px',
  },
  errorIcon: {
    fontSize: '16px',
  },
  errorMessage: {
    flex: 1,
  },
  retryButtonSmall: {
    padding: '4px 8px',
    backgroundColor: 'rgba(74, 158, 255, 0.2)',
    border: '1px solid rgba(74, 158, 255, 0.4)',
    borderRadius: '3px',
    color: '#4a9eff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  inlineError: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '4px',
    borderLeft: '4px solid',
    marginBottom: '12px',
    fontSize: '14px',
  },
  inlineDismiss: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    opacity: 0.7,
    color: 'inherit',
  },
};

export default ErrorBoundary;
