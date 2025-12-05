/**
 * Game Event Emitter
 *
 * Main thread event system that receives game events from the worker
 * and dispatches them to subscribers (AI, quest system, UI, etc.)
 *
 * Usage:
 *   gameEventEmitter.on('monster_killed', (event) => { ... });
 *   gameEventEmitter.on('*', (event) => { ... }); // All events
 */

import { GameEventType } from './GameEventDetector';

class GameEventEmitter {
  constructor() {
    this.listeners = new Map();
    this.allListeners = []; // Listeners for all events (*)
    this.eventHistory = []; // Keep last N events for debugging
    this.maxHistory = 100;
    this.stats = {
      totalReceived: 0,
      byType: {},
    };
  }

  /**
   * Subscribe to an event type
   * @param {string} eventType - Event type or '*' for all events
   * @param {Function} callback - Function to call with event data
   * @returns {Function} Unsubscribe function
   */
  on(eventType, callback) {
    if (eventType === '*') {
      this.allListeners.push(callback);
      return () => {
        const index = this.allListeners.indexOf(callback);
        if (index > -1) this.allListeners.splice(index, 1);
      };
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to an event type for a single occurrence
   * @param {string} eventType - Event type
   * @param {Function} callback - Function to call with event data
   */
  once(eventType, callback) {
    const unsubscribe = this.on(eventType, (event) => {
      unsubscribe();
      callback(event);
    });
  }

  /**
   * Remove all listeners for an event type
   * @param {string} eventType - Event type or '*' for all
   */
  off(eventType) {
    if (eventType === '*') {
      this.allListeners = [];
    } else {
      this.listeners.delete(eventType);
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {Object} event - Event object with type and data
   */
  emit(event) {
    this.stats.totalReceived++;
    this.stats.byType[event.type] = (this.stats.byType[event.type] || 0) + 1;

    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Notify type-specific listeners
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('[GameEventEmitter] Listener error:', e);
        }
      }
    }

    // Notify wildcard listeners
    for (const callback of this.allListeners) {
      try {
        callback(event);
      } catch (e) {
        console.error('[GameEventEmitter] Wildcard listener error:', e);
      }
    }
  }

  /**
   * Process a batch of events from the worker
   * @param {Array} events - Array of event objects
   */
  processBatch(events) {
    for (const event of events) {
      this.emit(event);
    }
  }

  /**
   * Get event history
   * @param {string} [eventType] - Optional filter by type
   * @returns {Array} Event history
   */
  getHistory(eventType = null) {
    if (eventType) {
      return this.eventHistory.filter(e => e.type === eventType);
    }
    return [...this.eventHistory];
  }

  /**
   * Get statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear history and reset stats
   */
  reset() {
    this.eventHistory = [];
    this.stats = {
      totalReceived: 0,
      byType: {},
    };
  }
}

// Export singleton
export const gameEventEmitter = new GameEventEmitter();

// Re-export event types for convenience
export { GameEventType };

export default gameEventEmitter;
