/**
 * Query-Response Feedback Loops with Local Simulation
 *
 * Provides a local simulator that AI can "query" via short iterative calls:
 * - "place @house:3 at [10,10]; simulate collisions"
 * - JS runs sim, returns conflicts/summaries
 * - AI adjusts in 1-2 token-light loops before finalizing
 *
 * Features:
 * - Collision detection for placed objects
 * - Pathfinding validation
 * - Connectivity analysis
 * - Visual preview generation (ASCII/Canvas)
 * - State caching using IndexedDB
 */

import DUNParser from './DUNParser';
import { BINARY_MARKERS } from './TileMapper';
import { TOWN_TILES } from './TownGenerator';
import { AStarPathfinder } from './PathWeaver';
import { SeededRandom } from './PresetLibrary';

// ============================================================================
// SIMULATION STATE
// ============================================================================

/**
 * SimulationState - Tracks the current state of the level being simulated
 */
export class SimulationState {
  constructor(width = 40, height = 40) {
    this.width = width;
    this.height = height;
    this.tiles = [];
    this.objects = [];
    this.monsters = [];
    this.placedItems = [];
    this.collisions = [];
    this.validationErrors = [];
    this.history = [];

    // Initialize grids
    this.reset();
  }

  reset() {
    this.tiles = [];
    this.objects = [];
    this.monsters = [];

    for (let y = 0; y < this.height; y++) {
      this.tiles[y] = new Array(this.width).fill(0);
      this.objects[y] = new Array(this.width * 2).fill(0);
      this.monsters[y] = new Array(this.width * 2).fill(0);
    }

    // Double height for sub-layers
    for (let y = this.height; y < this.height * 2; y++) {
      this.objects[y] = new Array(this.width * 2).fill(0);
      this.monsters[y] = new Array(this.width * 2).fill(0);
    }

    this.placedItems = [];
    this.collisions = [];
    this.validationErrors = [];
    this.history = [];
  }

  /**
   * Save current state to history
   */
  checkpoint(label = '') {
    this.history.push({
      label,
      timestamp: Date.now(),
      tiles: this.tiles.map(row => [...row]),
      placedItems: [...this.placedItems],
    });
  }

  /**
   * Restore to a previous checkpoint
   */
  restore(index = -1) {
    const checkpoint = index < 0
      ? this.history[this.history.length + index]
      : this.history[index];

    if (checkpoint) {
      this.tiles = checkpoint.tiles.map(row => [...row]);
      this.placedItems = [...checkpoint.placedItems];
      return true;
    }
    return false;
  }

  /**
   * Create grid object for preset engine compatibility
   */
  toGrid() {
    return {
      width: this.width,
      height: this.height,
      tiles: this.tiles,
      monsters: this.monsters,
      objects: this.objects,
      hasMonsters: this.monsters.some(row => row.some(v => v > 0)),
      hasObjects: this.objects.some(row => row.some(v => v > 0)),
    };
  }

  /**
   * Create DUN data from state
   */
  toDUN() {
    return {
      width: this.width,
      height: this.height,
      baseTiles: this.tiles,
      items: null,
      monsters: this.monsters.length > this.height ? this.monsters : null,
      objects: this.objects.length > this.height ? this.objects : null,
      hasItems: false,
      hasMonsters: this.monsters.some(row => row.some(v => v > 0)),
      hasObjects: this.objects.some(row => row.some(v => v > 0)),
    };
  }
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

/**
 * CollisionDetector - Detects and reports conflicts
 */
export class CollisionDetector {
  constructor(state) {
    this.state = state;
  }

  /**
   * Check if a position is occupied
   */
  isOccupied(x, y, ignoreFloor = false) {
    if (x < 0 || x >= this.state.width || y < 0 || y >= this.state.height) {
      return { occupied: true, reason: 'out_of_bounds' };
    }

    const tile = this.state.tiles[y]?.[x];

    // Check walls
    if (tile === BINARY_MARKERS.WALL ||
        TOWN_TILES.wall_stone?.includes(tile) ||
        TOWN_TILES.wall_wood?.includes(tile)) {
      return { occupied: true, reason: 'wall', tile };
    }

    // Check water
    if (TOWN_TILES.water?.includes(tile)) {
      return { occupied: true, reason: 'water', tile };
    }

    // Check trees
    if (TOWN_TILES.tree?.includes(tile)) {
      return { occupied: true, reason: 'tree', tile };
    }

    // Check objects at position (2x resolution)
    const ox = x * 2;
    const oy = y * 2;
    if (this.state.objects[oy]?.[ox] > 0) {
      return { occupied: true, reason: 'object', objectId: this.state.objects[oy][ox] };
    }

    // Check monsters
    if (this.state.monsters[oy]?.[ox] > 0) {
      return { occupied: true, reason: 'monster', monsterId: this.state.monsters[oy][ox] };
    }

    return { occupied: false };
  }

  /**
   * Check if an area is clear for placement
   * @returns {Object} - {clear: boolean, conflicts: Array}
   */
  checkArea(x, y, width, height, options = {}) {
    const { allowOverlap = false, ignoreTypes = [] } = options;
    const conflicts = [];

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;

        const check = this.isOccupied(px, py);
        if (check.occupied && !ignoreTypes.includes(check.reason)) {
          conflicts.push({
            x: px,
            y: py,
            ...check,
          });
        }
      }
    }

    return {
      clear: conflicts.length === 0,
      conflicts,
      areaSize: width * height,
      conflictCount: conflicts.length,
      conflictPercent: (conflicts.length / (width * height)) * 100,
    };
  }

  /**
   * Find the nearest clear position to a target
   */
  findNearestClear(targetX, targetY, minWidth = 1, minHeight = 1, maxRadius = 10) {
    for (let r = 0; r <= maxRadius; r++) {
      // Check positions in expanding rings
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only check ring edges

          const x = targetX + dx;
          const y = targetY + dy;

          const check = this.checkArea(x, y, minWidth, minHeight);
          if (check.clear) {
            return {
              found: true,
              x,
              y,
              distance: r,
              offset: { dx, dy },
            };
          }
        }
      }
    }

    return { found: false, nearestDistance: maxRadius };
  }

  /**
   * Check for overlapping placed items
   */
  checkPlacedItemOverlaps() {
    const overlaps = [];
    const items = this.state.placedItems;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        // Check AABB overlap
        const overlapX = a.x < b.x + (b.width || 1) && a.x + (a.width || 1) > b.x;
        const overlapY = a.y < b.y + (b.height || 1) && a.y + (a.height || 1) > b.y;

        if (overlapX && overlapY) {
          overlaps.push({
            item1: a,
            item2: b,
            item1Index: i,
            item2Index: j,
          });
        }
      }
    }

    return overlaps;
  }
}

// ============================================================================
// CONNECTIVITY ANALYZER
// ============================================================================

/**
 * ConnectivityAnalyzer - Analyzes level connectivity
 */
export class ConnectivityAnalyzer {
  constructor(state) {
    this.state = state;
    this.pathfinder = null;
  }

  /**
   * Check if all floor tiles are connected
   */
  analyzeConnectivity() {
    const floorTiles = this._findFloorTiles();

    if (floorTiles.length === 0) {
      return {
        connected: true,
        regions: 0,
        message: 'No floor tiles found',
      };
    }

    // Flood fill to find connected regions
    const visited = new Set();
    const regions = [];

    for (const tile of floorTiles) {
      const key = `${tile.x},${tile.y}`;
      if (visited.has(key)) continue;

      const region = this._floodFill(tile.x, tile.y, visited);
      regions.push(region);
    }

    return {
      connected: regions.length === 1,
      regionCount: regions.length,
      regions: regions.map((r, i) => ({
        index: i,
        size: r.length,
        bounds: this._getBounds(r),
      })),
      largestRegion: regions.reduce((a, b) => a.length > b.length ? a : b, []).length,
      isolatedTiles: floorTiles.length - regions.reduce((a, b) => a + b.length, 0),
    };
  }

  /**
   * Check if there's a path between two points
   */
  canReach(fromX, fromY, toX, toY) {
    if (!this.pathfinder) {
      this.pathfinder = new AStarPathfinder({
        width: this.state.width,
        height: this.state.height,
        tiles: this.state.tiles,
      });
    }

    const path = this.pathfinder.findPath(fromX, fromY, toX, toY);
    return {
      reachable: path !== null,
      pathLength: path?.length || 0,
      path: path?.slice(0, 10), // Only return first 10 points
    };
  }

  /**
   * Find stairs and check they're accessible from each other
   */
  validateStairs() {
    const stairsUp = [];
    const stairsDown = [];

    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const tile = this.state.tiles[y]?.[x];
        if (tile === BINARY_MARKERS.STAIRS_UP || tile === 36) {
          stairsUp.push({ x, y });
        }
        if (tile === BINARY_MARKERS.STAIRS_DOWN || tile === 37) {
          stairsDown.push({ x, y });
        }
      }
    }

    const result = {
      stairsUp,
      stairsDown,
      hasStairsUp: stairsUp.length > 0,
      hasStairsDown: stairsDown.length > 0,
      stairsConnected: null,
    };

    if (stairsUp.length > 0 && stairsDown.length > 0) {
      const reachable = this.canReach(
        stairsUp[0].x, stairsUp[0].y,
        stairsDown[0].x, stairsDown[0].y
      );
      result.stairsConnected = reachable.reachable;
      result.stairsPathLength = reachable.pathLength;
    }

    return result;
  }

  /**
   * Find all floor tiles
   */
  _findFloorTiles() {
    const floors = [];
    const floorTiles = [0, BINARY_MARKERS.FLOOR, ...TOWN_TILES.grass, ...TOWN_TILES.dirt, ...TOWN_TILES.cobblestone];

    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const tile = this.state.tiles[y]?.[x];
        if (floorTiles.includes(tile)) {
          floors.push({ x, y });
        }
      }
    }

    return floors;
  }

  /**
   * Flood fill from a starting point
   */
  _floodFill(startX, startY, visited) {
    const region = [];
    const queue = [{ x: startX, y: startY }];
    const floorTiles = [0, BINARY_MARKERS.FLOOR, ...TOWN_TILES.grass, ...TOWN_TILES.dirt, ...TOWN_TILES.cobblestone];

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      if (x < 0 || x >= this.state.width || y < 0 || y >= this.state.height) continue;

      const tile = this.state.tiles[y]?.[x];
      if (!floorTiles.includes(tile)) continue;

      visited.add(key);
      region.push({ x, y });

      // Add neighbors
      queue.push(
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 }
      );
    }

    return region;
  }

  /**
   * Get bounding box of a region
   */
  _getBounds(region) {
    if (region.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const { x, y } of region) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
}

// ============================================================================
// LOCAL SIMULATOR
// ============================================================================

/**
 * LocalSimulator - Main simulation interface
 *
 * Provides query-response interface for AI to test placements
 */
export class LocalSimulator {
  constructor(width = 40, height = 40) {
    this.state = new SimulationState(width, height);
    this.collisionDetector = new CollisionDetector(this.state);
    this.connectivityAnalyzer = new ConnectivityAnalyzer(this.state);
    this.queryHistory = [];
  }

  /**
   * Initialize with existing level data
   */
  loadFromDUN(dunData) {
    this.state.width = dunData.width;
    this.state.height = dunData.height;
    this.state.tiles = dunData.baseTiles.map(row => [...row]);

    if (dunData.monsters) {
      this.state.monsters = dunData.monsters.map(row => [...row]);
    }
    if (dunData.objects) {
      this.state.objects = dunData.objects.map(row => [...row]);
    }

    return this._summarize('Loaded DUN data');
  }

  /**
   * Reset to empty state
   */
  reset(width, height) {
    this.state = new SimulationState(width || this.state.width, height || this.state.height);
    this.collisionDetector = new CollisionDetector(this.state);
    this.connectivityAnalyzer = new ConnectivityAnalyzer(this.state);
    this.queryHistory = [];

    return { success: true, message: 'Simulator reset' };
  }

  // ==========================================================================
  // QUERY INTERFACE
  // ==========================================================================

  /**
   * Execute a query command
   * @param {string} query - Query string like "place @house at [10,10]; check collision"
   * @returns {Object} - Query result
   */
  query(query) {
    const result = {
      query,
      timestamp: Date.now(),
      results: [],
    };

    // Parse and execute commands
    const commands = query.split(';').map(c => c.trim()).filter(c => c);

    for (const cmd of commands) {
      try {
        const cmdResult = this._executeCommand(cmd);
        result.results.push(cmdResult);
      } catch (e) {
        result.results.push({
          command: cmd,
          success: false,
          error: e.message,
        });
      }
    }

    // Add to history
    this.queryHistory.push(result);

    return result;
  }

  /**
   * Execute a single command
   */
  _executeCommand(command) {
    const cmd = command.toLowerCase();

    // Place command: "place @type at [x,y]" or "place type at x,y"
    const placeMatch = cmd.match(/place\s+(?:@)?(\w+)(?::(\w+))?\s+at\s+\[?(\d+),\s*(\d+)\]?(?:\s+size\s+(\d+)x(\d+))?/);
    if (placeMatch) {
      const [, type, variant, x, y, w, h] = placeMatch;
      return this.placeThing(type, parseInt(x), parseInt(y), {
        variant,
        width: w ? parseInt(w) : undefined,
        height: h ? parseInt(h) : undefined,
      });
    }

    // Check collision: "check collision at [x,y]" or "check area [x,y,w,h]"
    const collisionMatch = cmd.match(/check\s+(?:collision|area)\s+(?:at\s+)?\[?(\d+),\s*(\d+)(?:,\s*(\d+),\s*(\d+))?\]?/);
    if (collisionMatch) {
      const [, x, y, w, h] = collisionMatch;
      if (w && h) {
        return this.checkArea(parseInt(x), parseInt(y), parseInt(w), parseInt(h));
      }
      return this.checkCollision(parseInt(x), parseInt(y));
    }

    // Validate: "validate connectivity" or "validate stairs"
    if (cmd.includes('validate')) {
      if (cmd.includes('connectivity') || cmd.includes('connect')) {
        return this.validateConnectivity();
      }
      if (cmd.includes('stair')) {
        return this.validateStairs();
      }
      return this.validate();
    }

    // Preview: "preview" or "show"
    if (cmd.includes('preview') || cmd.includes('show')) {
      return this.getPreview();
    }

    // Suggest: "suggest position for house" or "find clear area 5x5"
    const suggestMatch = cmd.match(/(?:suggest|find)\s+(?:position|clear\s+area|spot)\s+(?:for\s+)?(\w+)?(?:\s+(\d+)x(\d+))?/);
    if (suggestMatch) {
      const [, type, w, h] = suggestMatch;
      return this.suggestPosition(parseInt(w) || 4, parseInt(h) || 4, type);
    }

    // Undo: "undo"
    if (cmd.includes('undo')) {
      return this.undo();
    }

    // Summary: "summary" or "status"
    if (cmd.includes('summary') || cmd.includes('status')) {
      return this._summarize('Current state');
    }

    return {
      command,
      success: false,
      error: 'Unknown command',
      help: 'Try: place @house at [x,y], check collision at [x,y], validate, preview, suggest position',
    };
  }

  // ==========================================================================
  // PLACEMENT OPERATIONS
  // ==========================================================================

  /**
   * Place something at a position with collision check
   */
  placeThing(type, x, y, options = {}) {
    const { variant, width = 4, height = 4, force = false } = options;

    // Checkpoint before modification
    this.state.checkpoint(`Before placing ${type} at ${x},${y}`);

    // Check for collisions
    const collisionCheck = this.collisionDetector.checkArea(x, y, width, height);

    if (!collisionCheck.clear && !force) {
      // Try to find alternative position
      const suggestion = this.collisionDetector.findNearestClear(x, y, width, height);

      return {
        success: false,
        type,
        requestedPosition: { x, y },
        conflicts: collisionCheck.conflicts.slice(0, 5), // First 5 conflicts
        conflictCount: collisionCheck.conflictCount,
        suggestion: suggestion.found ? {
          x: suggestion.x,
          y: suggestion.y,
          offset: suggestion.offset,
          message: `Suggest offset +${suggestion.offset.dx},+${suggestion.offset.dy}`,
        } : null,
        message: `Overlaps ${collisionCheck.conflictCount} tiles. ${suggestion.found ? 'Try suggested position.' : 'No clear area nearby.'}`,
      };
    }

    // Place the thing
    this._placeArea(x, y, width, height, type, variant);

    this.state.placedItems.push({
      type,
      variant,
      x,
      y,
      width,
      height,
      timestamp: Date.now(),
    });

    return {
      success: true,
      type,
      position: { x, y },
      size: { width, height },
      message: `Placed ${type}${variant ? ':' + variant : ''} at [${x},${y}]`,
    };
  }

  /**
   * Internal: Place an area with tiles
   */
  _placeArea(x, y, width, height, type, variant) {
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const px = x + dx;
        const py = y + dy;

        if (py >= 0 && py < this.state.height && px >= 0 && px < this.state.width) {
          const isEdge = dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1;

          if (type === 'house' || type === 'building') {
            this.state.tiles[py][px] = isEdge
              ? TOWN_TILES.wall_stone[0]
              : TOWN_TILES.cobblestone[0];
          } else if (type === 'floor' || type === 'clear') {
            this.state.tiles[py][px] = BINARY_MARKERS.FLOOR;
          } else if (type === 'wall') {
            this.state.tiles[py][px] = BINARY_MARKERS.WALL;
          } else if (type === 'tree' || type === 'forest') {
            this.state.tiles[py][px] = TOWN_TILES.tree[0];
          } else if (type === 'water') {
            this.state.tiles[py][px] = TOWN_TILES.water[0];
          } else {
            this.state.tiles[py][px] = TOWN_TILES.grass[0];
          }
        }
      }
    }
  }

  // ==========================================================================
  // VALIDATION OPERATIONS
  // ==========================================================================

  /**
   * Check collision at a single point
   */
  checkCollision(x, y) {
    const result = this.collisionDetector.isOccupied(x, y);
    return {
      x,
      y,
      ...result,
    };
  }

  /**
   * Check an area for collisions
   */
  checkArea(x, y, width, height) {
    return {
      ...this.collisionDetector.checkArea(x, y, width, height),
      area: { x, y, width, height },
    };
  }

  /**
   * Validate connectivity
   */
  validateConnectivity() {
    return {
      type: 'connectivity',
      ...this.connectivityAnalyzer.analyzeConnectivity(),
    };
  }

  /**
   * Validate stairs
   */
  validateStairs() {
    return {
      type: 'stairs',
      ...this.connectivityAnalyzer.validateStairs(),
    };
  }

  /**
   * Full validation
   */
  validate() {
    const connectivity = this.connectivityAnalyzer.analyzeConnectivity();
    const stairs = this.connectivityAnalyzer.validateStairs();
    const overlaps = this.collisionDetector.checkPlacedItemOverlaps();

    const issues = [];

    if (!connectivity.connected) {
      issues.push(`Level has ${connectivity.regionCount} disconnected regions`);
    }

    if (stairs.hasStairsUp && stairs.hasStairsDown && !stairs.stairsConnected) {
      issues.push('Stairs up and down are not connected');
    }

    if (overlaps.length > 0) {
      issues.push(`${overlaps.length} placed items overlap`);
    }

    return {
      valid: issues.length === 0,
      issues,
      connectivity,
      stairs,
      overlaps: overlaps.length,
    };
  }

  // ==========================================================================
  // SUGGESTION OPERATIONS
  // ==========================================================================

  /**
   * Suggest a clear position for placement
   */
  suggestPosition(width = 4, height = 4, forType = null) {
    const rng = new SeededRandom(Date.now());

    // Try random positions
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = rng.nextInt(2, this.state.width - width - 2);
      const y = rng.nextInt(2, this.state.height - height - 2);

      const check = this.collisionDetector.checkArea(x, y, width, height);
      if (check.clear) {
        return {
          found: true,
          position: { x, y },
          size: { width, height },
          forType,
          attempt,
        };
      }
    }

    return {
      found: false,
      message: 'Could not find clear area after 50 attempts',
      size: { width, height },
    };
  }

  // ==========================================================================
  // PREVIEW & STATE
  // ==========================================================================

  /**
   * Get ASCII preview of current state
   */
  getPreview() {
    const preview = DUNParser.visualize(this.state.toDUN());
    const stats = this._getStats();

    return {
      preview,
      stats,
      size: { width: this.state.width, height: this.state.height },
    };
  }

  /**
   * Undo last modification
   */
  undo() {
    const restored = this.state.restore(-1);
    return {
      success: restored,
      message: restored ? 'Restored previous state' : 'No checkpoint to restore',
    };
  }

  /**
   * Get summary of current state
   */
  _summarize(message = '') {
    const stats = this._getStats();

    return {
      message,
      size: { width: this.state.width, height: this.state.height },
      placedItems: this.state.placedItems.length,
      checkpoints: this.state.history.length,
      stats,
    };
  }

  /**
   * Get statistics about current state
   */
  _getStats() {
    let floorCount = 0;
    let wallCount = 0;
    let otherCount = 0;

    for (let y = 0; y < this.state.height; y++) {
      for (let x = 0; x < this.state.width; x++) {
        const tile = this.state.tiles[y]?.[x] || 0;

        if (tile === 0 || tile === BINARY_MARKERS.FLOOR) {
          floorCount++;
        } else if (tile === BINARY_MARKERS.WALL ||
                   TOWN_TILES.wall_stone?.includes(tile) ||
                   TOWN_TILES.wall_wood?.includes(tile)) {
          wallCount++;
        } else {
          otherCount++;
        }
      }
    }

    return {
      totalTiles: this.state.width * this.state.height,
      floorCount,
      wallCount,
      otherCount,
      floorPercent: Math.round((floorCount / (this.state.width * this.state.height)) * 100),
    };
  }

  /**
   * Export current state as DUN
   */
  exportDUN() {
    return this.state.toDUN();
  }

  /**
   * Export as buffer
   */
  exportBuffer() {
    return DUNParser.write(this.state.toDUN());
  }
}

// ============================================================================
// SIMULATION CACHE (IndexedDB)
// ============================================================================

/**
 * SimulationCache - Persists simulation states using IndexedDB
 */
export class SimulationCache {
  constructor(dbName = 'diablowebai_sim_cache') {
    this.dbName = dbName;
    this.storeName = 'simulations';
    this.db = null;
  }

  async open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('name', 'name', { unique: false });
        }
      };
    });
  }

  async save(id, name, state) {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      const data = {
        id,
        name,
        timestamp: Date.now(),
        width: state.width,
        height: state.height,
        tiles: state.tiles,
        placedItems: state.placedItems,
        history: state.history.slice(-10), // Keep last 10 checkpoints
      };

      const request = store.put(data);
      request.onsuccess = () => resolve(id);
      request.onerror = () => reject(request.error);
    });
  }

  async load(id) {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async list() {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onsuccess = () => {
        const results = request.result.map(r => ({
          id: r.id,
          name: r.name,
          timestamp: r.timestamp,
          size: `${r.width}x${r.height}`,
        }));
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id) {
    if (!this.db) await this.open();

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton instances
export const simulator = new LocalSimulator();
export const simulationCache = new SimulationCache();

export default {
  LocalSimulator,
  SimulationState,
  CollisionDetector,
  ConnectivityAnalyzer,
  SimulationCache,
  simulator,
  simulationCache,
};
