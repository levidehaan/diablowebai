/**
 * Campaign Package System
 *
 * Creates self-contained campaign packages (.dcpk format) that include:
 * - Campaign metadata (campaign.json)
 * - World structure (world.json)
 * - DUN binary files for all levels
 * - Quest triggers and configurations
 *
 * Format: Single compressed JSON with embedded binary data (base64)
 * Uses pako for compression (available in project)
 *
 * These packages can be:
 * - Downloaded for sharing/backup
 * - Loaded at game startup to inject custom content
 * - Stored in IndexedDB for quick access
 */

import pako from 'pako';
import DUNParser from './DUNParser';

// ============================================================================
// CONSTANTS
// ============================================================================

const PACKAGE_VERSION = 1;
const PACKAGE_MAGIC = 'DCPK'; // Diablo Campaign Package

// Level ID to DUN path mapping (matches what the game engine expects)
export const LEVEL_PATHS = {
  0: 'levels/towndata/town.dun',
  1: 'levels/l1data/quest1.dun',
  2: 'levels/l1data/quest2.dun',
  3: 'levels/l1data/quest3.dun',
  4: 'levels/l1data/quest4.dun',
  5: 'levels/l2data/quest1.dun',
  6: 'levels/l2data/quest2.dun',
  7: 'levels/l2data/quest3.dun',
  8: 'levels/l2data/quest4.dun',
  9: 'levels/l3data/quest1.dun',
  10: 'levels/l3data/quest2.dun',
  11: 'levels/l3data/quest3.dun',
  12: 'levels/l3data/quest4.dun',
  13: 'levels/l4data/quest1.dun',
  14: 'levels/l4data/quest2.dun',
  15: 'levels/l4data/quest3.dun',
  16: 'levels/l4data/diab1.dun',
};

// Theme to level range mapping
export const THEME_LEVEL_RANGES = {
  town: [0, 0],
  cathedral: [1, 4],
  catacombs: [5, 8],
  caves: [9, 12],
  hell: [13, 16],
};

// Default tile IDs by theme (floor, wall)
const THEME_TILES = {
  town: { floor: 13, wall: 1 },
  cathedral: { floor: 13, wall: 1 },
  catacombs: { floor: 13, wall: 1 },
  caves: { floor: 13, wall: 1 },
  hell: { floor: 13, wall: 1 },
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert Uint8Array to base64 string
 */
function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert a grid (2D array of 0/1 or tile IDs) to proper DUN format
 * @param {number[][]} grid - 2D array of tile values
 * @param {string} theme - Theme for tile mapping (cathedral, catacombs, etc.)
 * @param {Object} options - Additional options
 * @returns {Uint8Array} Binary DUN data
 */
export function gridToDUN(grid, theme = 'cathedral', options = {}) {
  const {
    width = grid[0]?.length || 40,
    height = grid.length || 40,
    monsters = null,
    objects = null,
  } = options;

  // Get tile IDs for theme
  const tiles = THEME_TILES[theme] || THEME_TILES.cathedral;

  // Create base tile layer
  const baseTiles = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const cell = grid[y]?.[x] ?? 1;

      // If cell is already a tile ID (> 1), use it directly
      // Otherwise, map 0 = floor, 1 = wall
      let tileId;
      if (cell > 1) {
        tileId = cell;
      } else if (cell === 0) {
        tileId = tiles.floor || 13;
      } else {
        tileId = tiles.wall || 1;
      }

      row.push(tileId);
    }
    baseTiles.push(row);
  }

  // Create DUN data structure
  const dunData = {
    width,
    height,
    baseTiles,
    monsters: monsters || null,
    objects: objects || null,
    items: null,
    hasMonsters: monsters !== null,
    hasObjects: objects !== null,
    hasItems: false,
  };

  // Convert to binary DUN format
  return DUNParser.write(dunData);
}

/**
 * Create empty sub-layer for monsters/objects (2x resolution)
 */
export function createEmptySubLayer(width, height) {
  const subWidth = width * 2;
  const subHeight = height * 2;
  const layer = [];

  for (let y = 0; y < subHeight; y++) {
    layer.push(new Array(subWidth).fill(0));
  }

  return layer;
}

// ============================================================================
// CAMPAIGN PACKAGE BUILDER
// ============================================================================

/**
 * Build a complete campaign package from campaign and world data
 */
export class CampaignPackageBuilder {
  constructor() {
    this.package = {
      magic: PACKAGE_MAGIC,
      version: PACKAGE_VERSION,
      created: null,
      campaign: null,
      world: null,
      triggers: [],
      dunFiles: {}, // levelId -> { path, data: base64 }
      mpqData: null, // Base64-encoded modified MPQ (optional, for self-contained packages)
    };
    this.errors = [];
    this.warnings = [];
    this.mpqBuffer = null; // Raw MPQ buffer before encoding
  }

  /**
   * Set the modified MPQ data to include in the package
   * This makes the package self-contained and playable without a base MPQ
   * @param {Uint8Array|ArrayBuffer} mpqData - The modified MPQ data
   */
  setMPQ(mpqData) {
    if (!mpqData) return;

    // Convert to Uint8Array if needed
    const buffer = mpqData instanceof Uint8Array ? mpqData : new Uint8Array(mpqData);
    this.mpqBuffer = buffer;
    console.log(`[CampaignPackage] MPQ data set: ${buffer.length} bytes`);
  }

  /**
   * Build package from campaign and world data
   * @param {Object} campaign - Campaign data from CampaignGenerator
   * @param {Object} world - World data from WorldBuilder
   * @returns {Promise<Blob>} Compressed package as Blob
   */
  async build(campaign, world) {
    console.log('[CampaignPackage] Building package for:', campaign?.name || 'Unknown Campaign');

    this.package.created = new Date().toISOString();

    // Step 1: Store campaign metadata
    this.package.campaign = this.sanitizeCampaign(campaign);

    // Step 2: Store world data
    if (world) {
      this.package.world = typeof world.export === 'function' ? world.export() : world;
    }

    // Step 3: Generate DUN files for all levels
    await this.generateDUNFiles(campaign, world);

    // Step 4: Generate quest triggers
    this.package.triggers = this.generateTriggers(campaign);

    // Step 5: Include modified MPQ if set
    if (this.mpqBuffer) {
      // Convert MPQ buffer to base64
      let binary = '';
      const bytes = this.mpqBuffer;
      const len = bytes.length;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.package.mpqData = btoa(binary);
      console.log(`[CampaignPackage] Included MPQ data: ${this.mpqBuffer.length} bytes -> ${this.package.mpqData.length} chars base64`);
    }

    console.log('[CampaignPackage] Package built with', Object.keys(this.package.dunFiles).length, 'DUN files');
    if (this.package.mpqData) {
      console.log('[CampaignPackage] Package includes modified MPQ');
    }
    console.log('[CampaignPackage] Warnings:', this.warnings.length, 'Errors:', this.errors.length);

    // Step 6: Compress and return as Blob
    const json = JSON.stringify(this.package);
    const compressed = pako.gzip(json);

    return new Blob([compressed], { type: 'application/x-dcpk' });
  }

  /**
   * Sanitize campaign data for storage (remove circular refs, functions, etc.)
   */
  sanitizeCampaign(campaign) {
    if (!campaign) return null;

    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      template: campaign.template,
      acts: (campaign.acts || []).map(act => ({
        id: act.id,
        name: act.name,
        theme: act.theme,
        boss: act.boss ? {
          id: act.boss.id,
          name: act.boss.name,
          typeId: act.boss.typeId,
          difficulty: act.boss.difficulty,
        } : null,
        levels: (act.levels || []).map(level => ({
          id: level.id,
          name: level.name,
          difficulty: level.difficulty,
          objectives: level.objectives,
          spawnAreas: level.spawnAreas,
          grid: level.grid, // Include grid if present
        })),
      })),
      quests: campaign.quests || [],
      settings: campaign.settings || {},
    };
  }

  /**
   * Generate DUN files for all campaign levels
   */
  async generateDUNFiles(campaign, world) {
    let levelIndex = 1; // Start at 1 (0 is town)

    // Generate town DUN if we have town data
    const townArea = this.findArea(world, 'tristram');

    if (townArea?.grid) {
      this.addDUN(0, townArea.grid, 'town', {
        name: 'Tristram',
        source: 'world.tristram',
      });
    }

    // Process each act
    for (const act of campaign?.acts || []) {
      const theme = act.theme?.toLowerCase() || 'cathedral';
      const levelRange = THEME_LEVEL_RANGES[theme] || [1, 4];

      console.log(`[CampaignPackage] Processing Act: ${act.name}, Theme: ${theme}, Levels: ${act.levels?.length || 0}`);

      // Process each level in the act
      for (const level of act.levels || []) {
        // Determine the level ID based on theme and position
        const positionInRange = (levelIndex - 1) % 4;
        const levelId = Math.min(levelRange[0] + positionInRange, levelRange[1]);

        // Get grid from level or world
        let grid = level.grid;
        if (!grid && world) {
          const worldArea = this.findArea(world, level.id);
          grid = worldArea?.grid;
        }

        if (!grid) {
          // Generate a basic grid if none exists
          console.warn(`[CampaignPackage] No grid for level ${level.id}, generating default`);
          grid = this.generateDefaultGrid(40, 40, theme);
        }

        // Create DUN file
        this.addDUN(levelId, grid, theme, {
          name: level.name,
          source: level.id,
          difficulty: level.difficulty,
          actId: act.id,
        });

        levelIndex++;
      }
    }

    console.log(`[CampaignPackage] Generated ${Object.keys(this.package.dunFiles).length} DUN files`);
  }

  /**
   * Find an area in the world object (handles various data structures)
   */
  findArea(world, areaId) {
    if (!world) return null;

    // Try Map.get
    if (world.areas?.get) {
      const area = world.areas.get(areaId);
      if (area) return area;
    }

    // Try getArea method
    if (typeof world.getArea === 'function') {
      const area = world.getArea(areaId);
      if (area) return area;
    }

    // Try direct object access
    if (world.areas && typeof world.areas === 'object') {
      // Array format
      if (Array.isArray(world.areas)) {
        return world.areas.find(a => a.id === areaId);
      }
      // Object format
      return world.areas[areaId];
    }

    return null;
  }

  /**
   * Generate a default dungeon grid
   */
  generateDefaultGrid(width, height, theme) {
    const grid = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Create walls around edges
        const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;

        // Create some internal structure
        const isWall = isBorder ||
                      (x % 8 === 0 && y > 5 && y < height - 5 && Math.random() > 0.3) ||
                      (y % 8 === 0 && x > 5 && x < width - 5 && Math.random() > 0.3);

        row.push(isWall ? 1 : 0);
      }
      grid.push(row);
    }

    // Ensure entrance/exit areas are clear
    for (let y = height - 5; y < height - 2; y++) {
      for (let x = 18; x < 22; x++) {
        if (grid[y]) grid[y][x] = 0;
      }
    }
    for (let y = 2; y < 5; y++) {
      for (let x = 18; x < 22; x++) {
        if (grid[y]) grid[y][x] = 0;
      }
    }

    return grid;
  }

  /**
   * Add a DUN file to the package
   */
  addDUN(levelId, grid, theme, metadata = {}) {
    const path = LEVEL_PATHS[levelId];
    if (!path) {
      this.warnings.push(`Unknown level ID: ${levelId}`);
      return;
    }

    try {
      // Convert grid to DUN binary
      const dunBuffer = gridToDUN(grid, theme, {
        width: grid[0]?.length || 40,
        height: grid.length || 40,
      });

      // Store as base64
      this.package.dunFiles[levelId] = {
        path,
        data: uint8ArrayToBase64(dunBuffer),
        size: dunBuffer.length,
        theme,
        ...metadata,
      };

      console.log(`[CampaignPackage] Added DUN: ${path} (${dunBuffer.length} bytes)`);
    } catch (err) {
      this.errors.push(`Failed to create DUN for level ${levelId}: ${err.message}`);
      console.error(`[CampaignPackage] DUN creation failed for level ${levelId}:`, err);
    }
  }

  /**
   * Generate quest triggers from campaign
   */
  generateTriggers(campaign) {
    const triggers = [];

    // Main quest start trigger
    triggers.push({
      id: 'main_quest_start',
      type: 'level_entered',
      levelId: 1,
      action: 'start_quest',
      questId: 'main_quest',
      oneShot: true,
    });

    // Boss defeat triggers for each act
    for (const act of campaign?.acts || []) {
      if (act.boss) {
        triggers.push({
          id: `boss_defeat_${act.id}`,
          type: 'boss_killed',
          bossId: act.boss.id || act.boss.typeId,
          action: 'complete_objective',
          questId: 'main_quest',
          objectiveId: `defeat_${act.boss.id}`,
          oneShot: true,
        });
      }
    }

    // Quest completion triggers
    for (const quest of campaign?.quests || []) {
      for (const objective of quest.objectives || []) {
        if (objective.type === 'kill') {
          triggers.push({
            id: `quest_${quest.id}_${objective.id}`,
            type: objective.isBoss ? 'boss_killed' : 'monster_killed',
            target: objective.target,
            count: objective.count || 1,
            action: 'update_objective',
            questId: quest.id,
            objectiveId: objective.id,
          });
        }
      }
    }

    return triggers;
  }

  /**
   * Get build results
   */
  getResults() {
    return {
      dunCount: Object.keys(this.package.dunFiles).length,
      errors: this.errors,
      warnings: this.warnings,
    };
  }
}

// ============================================================================
// CAMPAIGN PACKAGE LOADER
// ============================================================================

/**
 * Load and extract a campaign package
 */
export class CampaignPackageLoader {
  constructor() {
    this.package = null;
  }

  /**
   * Load a campaign package from a file or Blob
   * @param {File|Blob|ArrayBuffer} source - Package data
   * @returns {Promise<Object>} Loaded campaign data
   */
  async load(source) {
    console.log('[CampaignPackage] Loading package...');

    // Get ArrayBuffer from source
    let buffer;
    if (source instanceof Blob) {
      buffer = await source.arrayBuffer();
    } else if (source instanceof ArrayBuffer) {
      buffer = source;
    } else {
      throw new Error('Invalid source type');
    }

    // Decompress
    const compressed = new Uint8Array(buffer);
    let json;
    try {
      const decompressed = pako.ungzip(compressed, { to: 'string' });
      json = decompressed;
    } catch (e) {
      // Try parsing as uncompressed JSON
      const decoder = new TextDecoder();
      json = decoder.decode(buffer);
    }

    // Parse JSON
    this.package = JSON.parse(json);

    // Validate
    if (this.package.magic !== PACKAGE_MAGIC) {
      throw new Error('Invalid package format');
    }

    console.log(`[CampaignPackage] Package loaded: ${Object.keys(this.package.dunFiles || {}).length} DUN files`);

    return {
      campaign: this.package.campaign,
      world: this.package.world,
      triggers: this.package.triggers,
      dunFiles: this.getDUNFilesAsBuffers(),
      manifest: {
        version: this.package.version,
        created: this.package.created,
      },
    };
  }

  /**
   * Get DUN files as Map of levelId -> Uint8Array
   */
  getDUNFilesAsBuffers() {
    const files = new Map();

    for (const [levelId, dunInfo] of Object.entries(this.package.dunFiles || {})) {
      files.set(parseInt(levelId), {
        path: dunInfo.path,
        buffer: base64ToUint8Array(dunInfo.data),
        size: dunInfo.size,
        theme: dunInfo.theme,
        name: dunInfo.name,
      });
    }

    return files;
  }

  /**
   * Get files ready for injection into game filesystem
   * @returns {Map<string, Uint8Array>} Map of MPQ-style paths to binary data
   */
  getFilesForInjection() {
    const files = new Map();

    for (const [levelId, dunInfo] of Object.entries(this.package.dunFiles || {})) {
      const buffer = base64ToUint8Array(dunInfo.data);
      files.set(dunInfo.path.toLowerCase(), buffer);
    }

    return files;
  }

  /**
   * Get campaign data in format for NeuralGameController
   */
  toPlayableFormat() {
    return {
      id: this.package.campaign?.id || `campaign_${Date.now()}`,
      name: this.package.campaign?.name || 'Loaded Campaign',

      // Level grids (parse DUN back to grids for runtime injection)
      levels: this.dunFilesToLevelData(),

      // Quests from campaign
      quests: this.package.campaign?.quests || [],
      initialQuests: ['main_quest'],

      // Triggers
      triggers: this.package.triggers || [],

      // Boss unlocks
      bossUnlocks: this.extractBossUnlocks(),
    };
  }

  /**
   * Convert DUN files to level data for runtime injection
   */
  dunFilesToLevelData() {
    const levels = {};

    for (const [levelId, dunInfo] of Object.entries(this.package.dunFiles || {})) {
      try {
        const buffer = base64ToUint8Array(dunInfo.data);
        const dunData = DUNParser.parse(buffer);
        levels[levelId] = {
          grid: dunData.baseTiles,
          width: dunData.width,
          height: dunData.height,
          monsters: dunData.monsters || [],
          objects: dunData.objects || [],
          source: dunInfo.path,
          theme: dunInfo.theme,
        };
      } catch (err) {
        console.error(`[CampaignPackage] Failed to parse DUN for level ${levelId}:`, err);
      }
    }

    return levels;
  }

  /**
   * Extract boss unlock configuration
   */
  extractBossUnlocks() {
    const unlocks = {};

    for (const act of this.package.campaign?.acts || []) {
      if (act.boss) {
        const bossId = act.boss.id || act.boss.typeId;
        unlocks[bossId] = {
          name: act.boss.name,
          rewards: {
            unlockArea: this.getNextActStartLevel(act),
          },
        };
      }
    }

    return unlocks;
  }

  getNextActStartLevel(currentAct) {
    const acts = this.package.campaign?.acts || [];
    const currentIndex = acts.findIndex(a => a.id === currentAct.id);

    if (currentIndex >= 0 && currentIndex < acts.length - 1) {
      const nextAct = acts[currentIndex + 1];
      const theme = nextAct.theme?.toLowerCase() || 'catacombs';
      return THEME_LEVEL_RANGES[theme]?.[0] || 5;
    }

    return null;
  }

  /**
   * Check if the package contains an embedded MPQ
   * @returns {boolean}
   */
  hasMPQ() {
    return !!this.package?.mpqData;
  }

  /**
   * Get the embedded MPQ data as a Uint8Array
   * @returns {Uint8Array|null} MPQ data or null if not included
   */
  getMPQ() {
    if (!this.package?.mpqData) return null;

    // Decode base64 to Uint8Array
    const binary = atob(this.package.mpqData);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    console.log(`[CampaignPackage] Extracted MPQ: ${bytes.length} bytes`);
    return bytes;
  }

  /**
   * Get the MPQ size without decoding
   * @returns {number} Approximate original size in bytes
   */
  getMPQSize() {
    if (!this.package?.mpqData) return 0;
    // Base64 inflates size by ~33%, so original is ~75% of base64 length
    return Math.floor(this.package.mpqData.length * 0.75);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create and download a campaign package
 */
export async function downloadCampaignPackage(campaign, world, filename = null) {
  const builder = new CampaignPackageBuilder();
  const blob = await builder.build(campaign, world);

  const safeName = (campaign?.name || 'campaign').replace(/[^a-zA-Z0-9]/g, '_');
  const name = filename || `${safeName}-${Date.now()}.dcpk`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return builder.getResults();
}

/**
 * Load a campaign package from user file input
 */
export async function loadCampaignPackage(file) {
  const loader = new CampaignPackageLoader();
  return loader.load(file);
}

/**
 * Inject loaded campaign files into game filesystem
 * @param {Map} files - Game filesystem (from loader.js)
 * @param {CampaignPackageLoader} loader - Loaded campaign package
 */
export function injectCampaignIntoFilesystem(files, loader) {
  const campaignFiles = loader.getFilesForInjection();

  for (const [path, buffer] of campaignFiles) {
    files.set(path, buffer);
    console.log(`[CampaignPackage] Injected: ${path}`);
  }

  return campaignFiles.size;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PACKAGE_VERSION,
};

export default {
  CampaignPackageBuilder,
  CampaignPackageLoader,
  downloadCampaignPackage,
  loadCampaignPackage,
  injectCampaignIntoFilesystem,
  gridToDUN,
  createEmptySubLayer,
  LEVEL_PATHS,
  THEME_LEVEL_RANGES,
};
