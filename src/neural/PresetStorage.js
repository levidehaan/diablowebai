/**
 * PresetStorage.js - IndexedDB-based storage system for custom presets
 *
 * Provides persistent storage for:
 * - Custom preset definitions
 * - Saved compositions/blueprints
 * - User-created templates
 * - Macro libraries
 * - Seed configurations
 */

const DB_NAME = 'diablowebai_presets';
const DB_VERSION = 1;

// Store names for different data types
const STORES = {
  PRESETS: 'presets',           // Custom preset definitions
  BLUEPRINTS: 'blueprints',     // Saved compositions
  TEMPLATES: 'templates',       // User-created templates
  MACROS: 'macros',             // Custom macro definitions
  SEEDS: 'seeds',               // Saved seed configurations
  HISTORY: 'history'            // Generation history for undo/redo
};

/**
 * IndexedDB wrapper for preset storage
 */
export class PresetStorage {
  constructor() {
    this.db = null;
    this.isOpen = false;
  }

  /**
   * Open the database connection
   */
  async open() {
    if (this.isOpen && this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isOpen = true;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create presets store with indexes
        if (!db.objectStoreNames.contains(STORES.PRESETS)) {
          const presetStore = db.createObjectStore(STORES.PRESETS, { keyPath: 'id' });
          presetStore.createIndex('name', 'name', { unique: false });
          presetStore.createIndex('category', 'category', { unique: false });
          presetStore.createIndex('createdAt', 'createdAt', { unique: false });
          presetStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
        }

        // Create blueprints store
        if (!db.objectStoreNames.contains(STORES.BLUEPRINTS)) {
          const blueprintStore = db.createObjectStore(STORES.BLUEPRINTS, { keyPath: 'id' });
          blueprintStore.createIndex('name', 'name', { unique: false });
          blueprintStore.createIndex('seed', 'seed', { unique: false });
          blueprintStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create templates store
        if (!db.objectStoreNames.contains(STORES.TEMPLATES)) {
          const templateStore = db.createObjectStore(STORES.TEMPLATES, { keyPath: 'id' });
          templateStore.createIndex('name', 'name', { unique: false });
          templateStore.createIndex('type', 'type', { unique: false });
        }

        // Create macros store
        if (!db.objectStoreNames.contains(STORES.MACROS)) {
          const macroStore = db.createObjectStore(STORES.MACROS, { keyPath: 'id' });
          macroStore.createIndex('shorthand', 'shorthand', { unique: true });
          macroStore.createIndex('category', 'category', { unique: false });
        }

        // Create seeds store
        if (!db.objectStoreNames.contains(STORES.SEEDS)) {
          const seedStore = db.createObjectStore(STORES.SEEDS, { keyPath: 'id' });
          seedStore.createIndex('name', 'name', { unique: false });
          seedStore.createIndex('template', 'template', { unique: false });
        }

        // Create history store for undo/redo
        if (!db.objectStoreNames.contains(STORES.HISTORY)) {
          const historyStore = db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
          historyStore.createIndex('sessionId', 'sessionId', { unique: false });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isOpen = false;
    }
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================================
  // PRESET OPERATIONS
  // ============================================================

  /**
   * Save a custom preset
   */
  async savePreset(preset) {
    await this.open();

    const presetData = {
      id: preset.id || this.generateId(),
      name: preset.name,
      category: preset.category || 'custom',
      description: preset.description || '',
      tags: preset.tags || [],
      defaults: preset.defaults || {},
      generate: preset.generate ? preset.generate.toString() : null,
      generatorType: preset.generatorType || 'custom',
      createdAt: preset.createdAt || Date.now(),
      updatedAt: Date.now(),
      metadata: preset.metadata || {}
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.PRESETS, 'readwrite');
      const store = tx.objectStore(STORES.PRESETS);
      const request = store.put(presetData);

      request.onsuccess = () => resolve(presetData);
      request.onerror = () => reject(new Error(`Failed to save preset: ${request.error}`));
    });
  }

  /**
   * Load a preset by ID
   */
  async loadPreset(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.PRESETS, 'readonly');
      const store = tx.objectStore(STORES.PRESETS);
      const request = store.get(id);

      request.onsuccess = () => {
        const preset = request.result;
        if (preset && preset.generate) {
          // Reconstruct the generate function
          try {
            preset.generate = new Function('return ' + preset.generate)();
          } catch (e) {
            console.warn('Could not reconstruct generate function:', e);
          }
        }
        resolve(preset);
      };
      request.onerror = () => reject(new Error(`Failed to load preset: ${request.error}`));
    });
  }

  /**
   * List all presets with optional filtering
   */
  async listPresets(filter = {}) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.PRESETS, 'readonly');
      const store = tx.objectStore(STORES.PRESETS);
      const presets = [];

      let request;
      if (filter.category) {
        const index = store.index('category');
        request = index.openCursor(IDBKeyRange.only(filter.category));
      } else if (filter.tag) {
        const index = store.index('tags');
        request = index.openCursor(IDBKeyRange.only(filter.tag));
      } else {
        request = store.openCursor();
      }

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const preset = cursor.value;
          // Apply additional filters
          if (!filter.name || preset.name.toLowerCase().includes(filter.name.toLowerCase())) {
            presets.push({
              id: preset.id,
              name: preset.name,
              category: preset.category,
              description: preset.description,
              tags: preset.tags,
              createdAt: preset.createdAt
            });
          }
          cursor.continue();
        } else {
          resolve(presets);
        }
      };

      request.onerror = () => reject(new Error(`Failed to list presets: ${request.error}`));
    });
  }

  /**
   * Delete a preset
   */
  async deletePreset(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.PRESETS, 'readwrite');
      const store = tx.objectStore(STORES.PRESETS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error(`Failed to delete preset: ${request.error}`));
    });
  }

  // ============================================================
  // BLUEPRINT OPERATIONS
  // ============================================================

  /**
   * Save a composed blueprint
   */
  async saveBlueprint(blueprint) {
    await this.open();

    const blueprintData = {
      id: blueprint.id || this.generateId(),
      name: blueprint.name,
      description: blueprint.description || '',
      width: blueprint.width,
      height: blueprint.height,
      seed: blueprint.seed,
      layers: blueprint.layers || [],
      metadata: blueprint.metadata || {},
      thumbnail: blueprint.thumbnail || null,
      createdAt: blueprint.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.BLUEPRINTS, 'readwrite');
      const store = tx.objectStore(STORES.BLUEPRINTS);
      const request = store.put(blueprintData);

      request.onsuccess = () => resolve(blueprintData);
      request.onerror = () => reject(new Error(`Failed to save blueprint: ${request.error}`));
    });
  }

  /**
   * Load a blueprint by ID
   */
  async loadBlueprint(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.BLUEPRINTS, 'readonly');
      const store = tx.objectStore(STORES.BLUEPRINTS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to load blueprint: ${request.error}`));
    });
  }

  /**
   * List all blueprints
   */
  async listBlueprints(filter = {}) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.BLUEPRINTS, 'readonly');
      const store = tx.objectStore(STORES.BLUEPRINTS);
      const blueprints = [];

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const bp = cursor.value;
          if (!filter.name || bp.name.toLowerCase().includes(filter.name.toLowerCase())) {
            blueprints.push({
              id: bp.id,
              name: bp.name,
              description: bp.description,
              width: bp.width,
              height: bp.height,
              seed: bp.seed,
              createdAt: bp.createdAt
            });
          }
          cursor.continue();
        } else {
          resolve(blueprints);
        }
      };

      request.onerror = () => reject(new Error(`Failed to list blueprints: ${request.error}`));
    });
  }

  /**
   * Delete a blueprint
   */
  async deleteBlueprint(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.BLUEPRINTS, 'readwrite');
      const store = tx.objectStore(STORES.BLUEPRINTS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error(`Failed to delete blueprint: ${request.error}`));
    });
  }

  // ============================================================
  // TEMPLATE OPERATIONS
  // ============================================================

  /**
   * Save a user template
   */
  async saveTemplate(template) {
    await this.open();

    const templateData = {
      id: template.id || this.generateId(),
      name: template.name,
      type: template.type || 'custom',
      description: template.description || '',
      config: template.config || {},
      presets: template.presets || [],
      macros: template.macros || [],
      createdAt: template.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.TEMPLATES, 'readwrite');
      const store = tx.objectStore(STORES.TEMPLATES);
      const request = store.put(templateData);

      request.onsuccess = () => resolve(templateData);
      request.onerror = () => reject(new Error(`Failed to save template: ${request.error}`));
    });
  }

  /**
   * Load a template by ID
   */
  async loadTemplate(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.TEMPLATES, 'readonly');
      const store = tx.objectStore(STORES.TEMPLATES);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to load template: ${request.error}`));
    });
  }

  /**
   * List all templates
   */
  async listTemplates(filter = {}) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.TEMPLATES, 'readonly');
      const store = tx.objectStore(STORES.TEMPLATES);
      const templates = [];

      let request;
      if (filter.type) {
        const index = store.index('type');
        request = index.openCursor(IDBKeyRange.only(filter.type));
      } else {
        request = store.openCursor();
      }

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          templates.push(cursor.value);
          cursor.continue();
        } else {
          resolve(templates);
        }
      };

      request.onerror = () => reject(new Error(`Failed to list templates: ${request.error}`));
    });
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.TEMPLATES, 'readwrite');
      const store = tx.objectStore(STORES.TEMPLATES);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error(`Failed to delete template: ${request.error}`));
    });
  }

  // ============================================================
  // MACRO OPERATIONS
  // ============================================================

  /**
   * Save a custom macro
   */
  async saveMacro(macro) {
    await this.open();

    const macroData = {
      id: macro.id || this.generateId(),
      name: macro.name,
      shorthand: macro.shorthand,
      expansion: macro.expansion,
      category: macro.category || 'custom',
      description: macro.description || '',
      createdAt: macro.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.MACROS, 'readwrite');
      const store = tx.objectStore(STORES.MACROS);
      const request = store.put(macroData);

      request.onsuccess = () => resolve(macroData);
      request.onerror = () => reject(new Error(`Failed to save macro: ${request.error}`));
    });
  }

  /**
   * Load a macro by shorthand
   */
  async loadMacroByShorthand(shorthand) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.MACROS, 'readonly');
      const store = tx.objectStore(STORES.MACROS);
      const index = store.index('shorthand');
      const request = index.get(shorthand);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to load macro: ${request.error}`));
    });
  }

  /**
   * List all macros
   */
  async listMacros(filter = {}) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.MACROS, 'readonly');
      const store = tx.objectStore(STORES.MACROS);
      const macros = [];

      let request;
      if (filter.category) {
        const index = store.index('category');
        request = index.openCursor(IDBKeyRange.only(filter.category));
      } else {
        request = store.openCursor();
      }

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          macros.push(cursor.value);
          cursor.continue();
        } else {
          resolve(macros);
        }
      };

      request.onerror = () => reject(new Error(`Failed to list macros: ${request.error}`));
    });
  }

  /**
   * Delete a macro
   */
  async deleteMacro(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.MACROS, 'readwrite');
      const store = tx.objectStore(STORES.MACROS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error(`Failed to delete macro: ${request.error}`));
    });
  }

  // ============================================================
  // SEED CONFIGURATION OPERATIONS
  // ============================================================

  /**
   * Save a seed configuration
   */
  async saveSeed(seedConfig) {
    await this.open();

    const seedData = {
      id: seedConfig.id || this.generateId(),
      name: seedConfig.name,
      seed: seedConfig.seed,
      template: seedConfig.template,
      modifiers: seedConfig.modifiers || {},
      notation: seedConfig.notation || '',
      description: seedConfig.description || '',
      createdAt: seedConfig.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.SEEDS, 'readwrite');
      const store = tx.objectStore(STORES.SEEDS);
      const request = store.put(seedData);

      request.onsuccess = () => resolve(seedData);
      request.onerror = () => reject(new Error(`Failed to save seed config: ${request.error}`));
    });
  }

  /**
   * Load a seed configuration by ID
   */
  async loadSeed(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.SEEDS, 'readonly');
      const store = tx.objectStore(STORES.SEEDS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(`Failed to load seed config: ${request.error}`));
    });
  }

  /**
   * List all seed configurations
   */
  async listSeeds(filter = {}) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.SEEDS, 'readonly');
      const store = tx.objectStore(STORES.SEEDS);
      const seeds = [];

      let request;
      if (filter.template) {
        const index = store.index('template');
        request = index.openCursor(IDBKeyRange.only(filter.template));
      } else {
        request = store.openCursor();
      }

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          seeds.push(cursor.value);
          cursor.continue();
        } else {
          resolve(seeds);
        }
      };

      request.onerror = () => reject(new Error(`Failed to list seeds: ${request.error}`));
    });
  }

  /**
   * Delete a seed configuration
   */
  async deleteSeed(id) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.SEEDS, 'readwrite');
      const store = tx.objectStore(STORES.SEEDS);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(new Error(`Failed to delete seed config: ${request.error}`));
    });
  }

  // ============================================================
  // HISTORY OPERATIONS (for undo/redo)
  // ============================================================

  /**
   * Save a history entry
   */
  async saveHistory(sessionId, state, description = '') {
    await this.open();

    const historyData = {
      id: this.generateId(),
      sessionId,
      state: JSON.stringify(state),
      description,
      timestamp: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.HISTORY, 'readwrite');
      const store = tx.objectStore(STORES.HISTORY);
      const request = store.put(historyData);

      request.onsuccess = () => resolve(historyData);
      request.onerror = () => reject(new Error(`Failed to save history: ${request.error}`));
    });
  }

  /**
   * Get history for a session
   */
  async getHistory(sessionId, limit = 50) {
    await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.HISTORY, 'readonly');
      const store = tx.objectStore(STORES.HISTORY);
      const index = store.index('sessionId');
      const history = [];

      const request = index.openCursor(IDBKeyRange.only(sessionId), 'prev');

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && history.length < limit) {
          const entry = cursor.value;
          entry.state = JSON.parse(entry.state);
          history.push(entry);
          cursor.continue();
        } else {
          resolve(history);
        }
      };

      request.onerror = () => reject(new Error(`Failed to get history: ${request.error}`));
    });
  }

  /**
   * Clear history older than specified age
   */
  async clearOldHistory(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    await this.open();

    const cutoff = Date.now() - maxAgeMs;

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORES.HISTORY, 'readwrite');
      const store = tx.objectStore(STORES.HISTORY);
      const index = store.index('timestamp');
      let deletedCount = 0;

      const request = index.openCursor(IDBKeyRange.upperBound(cutoff));

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };

      request.onerror = () => reject(new Error(`Failed to clear history: ${request.error}`));
    });
  }

  // ============================================================
  // IMPORT/EXPORT OPERATIONS
  // ============================================================

  /**
   * Export all data as JSON
   */
  async exportAll() {
    await this.open();

    const data = {
      version: DB_VERSION,
      exportedAt: Date.now(),
      presets: await this.listPresets(),
      blueprints: await this.listBlueprints(),
      templates: await this.listTemplates(),
      macros: await this.listMacros(),
      seeds: await this.listSeeds()
    };

    // Get full data for each item
    for (let i = 0; i < data.presets.length; i++) {
      data.presets[i] = await this.loadPreset(data.presets[i].id);
    }
    for (let i = 0; i < data.blueprints.length; i++) {
      data.blueprints[i] = await this.loadBlueprint(data.blueprints[i].id);
    }
    for (let i = 0; i < data.seeds.length; i++) {
      data.seeds[i] = await this.loadSeed(data.seeds[i].id);
    }

    return data;
  }

  /**
   * Import data from JSON
   */
  async importAll(data, options = { merge: true }) {
    await this.open();

    const results = {
      presets: { imported: 0, skipped: 0 },
      blueprints: { imported: 0, skipped: 0 },
      templates: { imported: 0, skipped: 0 },
      macros: { imported: 0, skipped: 0 },
      seeds: { imported: 0, skipped: 0 }
    };

    // Import presets
    if (data.presets) {
      for (const preset of data.presets) {
        try {
          if (!options.merge) {
            preset.id = this.generateId();
          }
          await this.savePreset(preset);
          results.presets.imported++;
        } catch (e) {
          results.presets.skipped++;
        }
      }
    }

    // Import blueprints
    if (data.blueprints) {
      for (const blueprint of data.blueprints) {
        try {
          if (!options.merge) {
            blueprint.id = this.generateId();
          }
          await this.saveBlueprint(blueprint);
          results.blueprints.imported++;
        } catch (e) {
          results.blueprints.skipped++;
        }
      }
    }

    // Import templates
    if (data.templates) {
      for (const template of data.templates) {
        try {
          if (!options.merge) {
            template.id = this.generateId();
          }
          await this.saveTemplate(template);
          results.templates.imported++;
        } catch (e) {
          results.templates.skipped++;
        }
      }
    }

    // Import macros
    if (data.macros) {
      for (const macro of data.macros) {
        try {
          if (!options.merge) {
            macro.id = this.generateId();
          }
          await this.saveMacro(macro);
          results.macros.imported++;
        } catch (e) {
          results.macros.skipped++;
        }
      }
    }

    // Import seeds
    if (data.seeds) {
      for (const seed of data.seeds) {
        try {
          if (!options.merge) {
            seed.id = this.generateId();
          }
          await this.saveSeed(seed);
          results.seeds.imported++;
        } catch (e) {
          results.seeds.skipped++;
        }
      }
    }

    return results;
  }

  /**
   * Clear all data
   */
  async clearAll() {
    await this.open();

    const stores = Object.values(STORES);

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');

      let clearedCount = 0;

      for (const storeName of stores) {
        const store = tx.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          clearedCount++;
          if (clearedCount === stores.length) {
            resolve(true);
          }
        };

        request.onerror = () => reject(new Error(`Failed to clear ${storeName}: ${request.error}`));
      }
    });
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    await this.open();

    const stats = {};
    const stores = Object.values(STORES);

    for (const storeName of stores) {
      stats[storeName] = await new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(`Failed to count ${storeName}: ${request.error}`));
      });
    }

    return stats;
  }
}

// Singleton instance
export const presetStorage = new PresetStorage();

// Export store names for external use
export { STORES };

export default presetStorage;
