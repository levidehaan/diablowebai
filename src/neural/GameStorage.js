/**
 * Game Storage System
 *
 * Client-side storage using IndexedDB for:
 * - Generated campaigns
 * - World data
 * - Custom assets
 * - Player progress
 * - Export/Import functionality for sharing
 */

const DB_NAME = 'DiabloNeuralDB';
const DB_VERSION = 1;

/**
 * Store definitions
 */
const STORES = {
  CAMPAIGNS: 'campaigns',
  WORLDS: 'worlds',
  ASSETS: 'assets',
  PROGRESS: 'progress',
  SETTINGS: 'settings',
};

/**
 * IndexedDB wrapper with promise support
 */
class GameStorageDB {
  constructor() {
    this.db = null;
    this.initPromise = null;
  }

  /**
   * Initialize the database
   */
  async init() {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[GameStorage] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[GameStorage] Database initialized');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Campaigns store
        if (!db.objectStoreNames.contains(STORES.CAMPAIGNS)) {
          const campaignStore = db.createObjectStore(STORES.CAMPAIGNS, { keyPath: 'id' });
          campaignStore.createIndex('name', 'name', { unique: false });
          campaignStore.createIndex('createdAt', 'createdAt', { unique: false });
          campaignStore.createIndex('template', 'template', { unique: false });
        }

        // Worlds store
        if (!db.objectStoreNames.contains(STORES.WORLDS)) {
          const worldStore = db.createObjectStore(STORES.WORLDS, { keyPath: 'id' });
          worldStore.createIndex('campaignId', 'campaignId', { unique: false });
        }

        // Assets store
        if (!db.objectStoreNames.contains(STORES.ASSETS)) {
          const assetStore = db.createObjectStore(STORES.ASSETS, { keyPath: 'id' });
          assetStore.createIndex('type', 'type', { unique: false });
          assetStore.createIndex('campaignId', 'campaignId', { unique: false });
        }

        // Progress store
        if (!db.objectStoreNames.contains(STORES.PROGRESS)) {
          const progressStore = db.createObjectStore(STORES.PROGRESS, { keyPath: 'id' });
          progressStore.createIndex('campaignId', 'campaignId', { unique: false });
        }

        // Settings store
        if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
          db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Get a transaction for the specified stores
   */
  async getTransaction(storeNames, mode = 'readonly') {
    await this.init();
    return this.db.transaction(storeNames, mode);
  }

  /**
   * Get an object store
   */
  async getStore(storeName, mode = 'readonly') {
    const transaction = await this.getTransaction(storeName, mode);
    return transaction.objectStore(storeName);
  }

  /**
   * Generic put operation
   */
  async put(storeName, data) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic get operation
   */
  async get(storeName, key) {
    const store = await this.getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic getAll operation
   */
  async getAll(storeName) {
    const store = await this.getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generic delete operation
   */
  async delete(storeName, key) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get items by index
   */
  async getByIndex(storeName, indexName, value) {
    const store = await this.getStore(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear a store
   */
  async clearStore(storeName) {
    const store = await this.getStore(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Database singleton
const db = new GameStorageDB();

/**
 * Campaign Storage API
 */
const CampaignStorage = {
  async save(campaign) {
    const data = {
      ...campaign,
      savedAt: new Date().toISOString(),
    };
    await db.put(STORES.CAMPAIGNS, data);
    console.log(`[GameStorage] Campaign saved: ${campaign.id}`);
    return campaign.id;
  },

  async load(campaignId) {
    return db.get(STORES.CAMPAIGNS, campaignId);
  },

  async loadAll() {
    return db.getAll(STORES.CAMPAIGNS);
  },

  async delete(campaignId) {
    // Also delete associated worlds, assets, and progress
    await WorldStorage.deleteByCampaign(campaignId);
    await AssetStorage.deleteByCampaign(campaignId);
    await ProgressStorage.deleteByCampaign(campaignId);
    await db.delete(STORES.CAMPAIGNS, campaignId);
    console.log(`[GameStorage] Campaign deleted: ${campaignId}`);
  },

  async getByTemplate(template) {
    return db.getByIndex(STORES.CAMPAIGNS, 'template', template);
  },
};

/**
 * World Storage API
 */
const WorldStorage = {
  async save(worldData, campaignId) {
    const data = {
      id: `world_${campaignId}`,
      campaignId,
      ...worldData,
      savedAt: new Date().toISOString(),
    };
    await db.put(STORES.WORLDS, data);
    console.log(`[GameStorage] World saved for campaign: ${campaignId}`);
    return data.id;
  },

  async load(worldId) {
    return db.get(STORES.WORLDS, worldId);
  },

  async loadByCampaign(campaignId) {
    const worlds = await db.getByIndex(STORES.WORLDS, 'campaignId', campaignId);
    return worlds[0] || null;
  },

  async deleteByCampaign(campaignId) {
    const worlds = await db.getByIndex(STORES.WORLDS, 'campaignId', campaignId);
    for (const world of worlds) {
      await db.delete(STORES.WORLDS, world.id);
    }
  },
};

/**
 * Asset Storage API
 */
const AssetStorage = {
  async save(asset, campaignId = null) {
    const data = {
      id: asset.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      campaignId,
      ...asset,
      savedAt: new Date().toISOString(),
    };
    await db.put(STORES.ASSETS, data);
    console.log(`[GameStorage] Asset saved: ${data.id}`);
    return data.id;
  },

  async load(assetId) {
    return db.get(STORES.ASSETS, assetId);
  },

  async loadAll() {
    return db.getAll(STORES.ASSETS);
  },

  async loadByCampaign(campaignId) {
    return db.getByIndex(STORES.ASSETS, 'campaignId', campaignId);
  },

  async loadByType(type) {
    return db.getByIndex(STORES.ASSETS, 'type', type);
  },

  async delete(assetId) {
    await db.delete(STORES.ASSETS, assetId);
  },

  async deleteByCampaign(campaignId) {
    const assets = await db.getByIndex(STORES.ASSETS, 'campaignId', campaignId);
    for (const asset of assets) {
      await db.delete(STORES.ASSETS, asset.id);
    }
  },
};

/**
 * Progress Storage API
 */
const ProgressStorage = {
  async save(progress, campaignId) {
    const data = {
      id: `progress_${campaignId}`,
      campaignId,
      ...progress,
      savedAt: new Date().toISOString(),
    };
    await db.put(STORES.PROGRESS, data);
    console.log(`[GameStorage] Progress saved for campaign: ${campaignId}`);
    return data.id;
  },

  async load(campaignId) {
    const progressList = await db.getByIndex(STORES.PROGRESS, 'campaignId', campaignId);
    return progressList[0] || null;
  },

  async deleteByCampaign(campaignId) {
    const progressList = await db.getByIndex(STORES.PROGRESS, 'campaignId', campaignId);
    for (const progress of progressList) {
      await db.delete(STORES.PROGRESS, progress.id);
    }
  },
};

/**
 * Settings Storage API
 */
const SettingsStorage = {
  async save(key, value) {
    await db.put(STORES.SETTINGS, { key, value, savedAt: new Date().toISOString() });
  },

  async load(key) {
    const result = await db.get(STORES.SETTINGS, key);
    return result?.value;
  },

  async delete(key) {
    await db.delete(STORES.SETTINGS, key);
  },
};

/**
 * Export/Import functionality
 */
const GameExporter = {
  /**
   * Export a complete campaign package (campaign, world, assets, progress)
   */
  async exportCampaign(campaignId) {
    const campaign = await CampaignStorage.load(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const world = await WorldStorage.loadByCampaign(campaignId);
    const assets = await AssetStorage.loadByCampaign(campaignId);
    const progress = await ProgressStorage.load(campaignId);

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      campaign,
      world,
      assets,
      progress,
    };

    return exportData;
  },

  /**
   * Export to downloadable JSON file
   */
  async exportToFile(campaignId, filename = null) {
    const data = await this.exportCampaign(campaignId);

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    const defaultFilename = `diablo-campaign-${data.campaign.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`;
    const finalFilename = filename || defaultFilename;

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = finalFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    console.log(`[GameStorage] Exported campaign to: ${finalFilename}`);
    return finalFilename;
  },

  /**
   * Export to compressed format (for larger campaigns)
   */
  async exportCompressed(campaignId) {
    const data = await this.exportCampaign(campaignId);
    const jsonString = JSON.stringify(data);

    // Use CompressionStream if available
    if (typeof CompressionStream !== 'undefined') {
      const encoder = new TextEncoder();
      const stream = new Blob([encoder.encode(jsonString)]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const compressedBlob = await new Response(compressedStream).blob();

      const filename = `diablo-campaign-${data.campaign.id}.json.gz`;
      const url = URL.createObjectURL(compressedBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return filename;
    }

    // Fallback to uncompressed
    return this.exportToFile(campaignId);
  },
};

/**
 * Import functionality
 */
const GameImporter = {
  /**
   * Import a campaign from exported data
   */
  async importCampaign(exportData, options = {}) {
    const { overwrite = false, generateNewId = false } = options;

    if (exportData.version !== 1) {
      throw new Error(`Unsupported export version: ${exportData.version}`);
    }

    let campaign = { ...exportData.campaign };

    // Generate new ID if requested or if campaign exists and no overwrite
    if (generateNewId) {
      campaign.id = `campaign_${Date.now()}`;
    } else if (!overwrite) {
      const existing = await CampaignStorage.load(campaign.id);
      if (existing) {
        campaign.id = `campaign_${Date.now()}`;
      }
    }

    campaign.importedAt = new Date().toISOString();
    campaign.originalId = exportData.campaign.id;

    // Save campaign
    await CampaignStorage.save(campaign);

    // Save world if present
    if (exportData.world) {
      const world = { ...exportData.world };
      world.campaignId = campaign.id;
      await WorldStorage.save(world, campaign.id);
    }

    // Save assets if present
    if (exportData.assets && Array.isArray(exportData.assets)) {
      for (const asset of exportData.assets) {
        const assetCopy = { ...asset };
        assetCopy.campaignId = campaign.id;
        assetCopy.id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await AssetStorage.save(assetCopy, campaign.id);
      }
    }

    // Optionally import progress
    if (exportData.progress && options.importProgress) {
      const progress = { ...exportData.progress };
      progress.campaignId = campaign.id;
      await ProgressStorage.save(progress, campaign.id);
    }

    console.log(`[GameStorage] Imported campaign: ${campaign.id}`);
    return campaign;
  },

  /**
   * Import from file
   */
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          let jsonString = event.target.result;

          // Check if compressed
          if (file.name.endsWith('.gz')) {
            // Decompress
            const blob = new Blob([event.target.result]);
            const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
            const decompressedBlob = await new Response(stream).blob();
            jsonString = await decompressedBlob.text();
          }

          const data = JSON.parse(jsonString);
          const campaign = await this.importCampaign(data);
          resolve(campaign);
        } catch (error) {
          reject(new Error(`Failed to import: ${error.message}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));

      if (file.name.endsWith('.gz')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    });
  },

  /**
   * Validate import data
   */
  validateImportData(data) {
    const errors = [];

    if (!data.version) {
      errors.push('Missing version field');
    }

    if (!data.campaign) {
      errors.push('Missing campaign data');
    } else {
      if (!data.campaign.id) errors.push('Campaign missing id');
      if (!data.campaign.name) errors.push('Campaign missing name');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Main GameStorage API
 */
const GameStorage = {
  // Storage APIs
  campaigns: CampaignStorage,
  worlds: WorldStorage,
  assets: AssetStorage,
  progress: ProgressStorage,
  settings: SettingsStorage,

  // Export/Import
  exporter: GameExporter,
  importer: GameImporter,

  /**
   * Initialize storage
   */
  async init() {
    await db.init();
  },

  /**
   * Save complete game state
   */
  async saveGameState(campaign, world, progress) {
    await CampaignStorage.save(campaign);
    if (world) {
      await WorldStorage.save(world, campaign.id);
    }
    if (progress) {
      await ProgressStorage.save(progress, campaign.id);
    }
    console.log('[GameStorage] Game state saved');
  },

  /**
   * Load complete game state
   */
  async loadGameState(campaignId) {
    const campaign = await CampaignStorage.load(campaignId);
    if (!campaign) {
      return null;
    }

    const world = await WorldStorage.loadByCampaign(campaignId);
    const progress = await ProgressStorage.load(campaignId);
    const assets = await AssetStorage.loadByCampaign(campaignId);

    return {
      campaign,
      world,
      progress,
      assets,
    };
  },

  /**
   * Get list of saved campaigns
   */
  async getSavedCampaigns() {
    const campaigns = await CampaignStorage.loadAll();
    return campaigns.sort((a, b) =>
      new Date(b.savedAt || b.createdAt) - new Date(a.savedAt || a.createdAt)
    );
  },

  /**
   * Delete all data
   */
  async clearAll() {
    await db.clearStore(STORES.CAMPAIGNS);
    await db.clearStore(STORES.WORLDS);
    await db.clearStore(STORES.ASSETS);
    await db.clearStore(STORES.PROGRESS);
    console.log('[GameStorage] All data cleared');
  },

  /**
   * Get storage statistics
   */
  async getStats() {
    const campaigns = await CampaignStorage.loadAll();
    const assets = await AssetStorage.loadAll();

    // Estimate storage size
    let totalSize = 0;
    for (const campaign of campaigns) {
      totalSize += JSON.stringify(campaign).length;
    }
    for (const asset of assets) {
      totalSize += JSON.stringify(asset).length;
    }

    return {
      campaignCount: campaigns.length,
      assetCount: assets.length,
      estimatedSize: totalSize,
      estimatedSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
    };
  },
};

export {
  GameStorage,
  CampaignStorage,
  WorldStorage,
  AssetStorage,
  ProgressStorage,
  SettingsStorage,
  GameExporter,
  GameImporter,
  STORES,
};

export default GameStorage;
